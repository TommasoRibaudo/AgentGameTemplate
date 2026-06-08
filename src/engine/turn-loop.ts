import { RunState, NewsItem, NewsItemType } from '../types/run';
import { TurnPhase } from '../types/primitives';
import { VariantManifest } from '../types/manifest';
import { computeMonthlyIncome, computeMonthlyExpenses, applyMoneyDelta, applyReputationDelta, settleObjectivePayouts, evaluateObjectiveConditions } from './resource';
import { refreshClientFog, evaluateArcProgression, generateProspects } from './client';
import { advanceCampaigns } from './campaign';
import { generateEvents, applyEventDefaults } from './event';
import { generateDecisionBoard, applyBoardDefaults, tickBoardItemExpiry } from './decision-queue';
import { serviceDebt, checkFailureCondition, openDebtState, fireLowMoneyWarning } from './failure';

// INVARIANTS (PRD §2.1):
// - Phase order is fixed and must not be skipped.
// - Every unresolved board item fires its default at Resolution phase.
// - Failure is checked ONLY at Turn Close.
// - Career clock advances unconditionally at Turn Close.

export interface PhaseResult {
  state: RunState;
  news: NewsItem[];
}

export type PhaseRunner = (state: RunState, manifest: VariantManifest) => PhaseResult;

const makeNews = (
  state: RunState,
  type: NewsItemType,
  description: string,
  moneyDelta?: number | null,
  repDelta?: number | null,
  clientId?: string | null,
): NewsItem => ({
  id:               `news_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
  turn_number:      state.turn_number,
  type,
  description,
  money_delta:      moneyDelta ?? null,
  reputation_delta: repDelta ?? null,
  client_id:        clientId ?? null,
});

// ─── Phase guard ──────────────────────────────────────────────────────────────

export type AssertPhase = (state: RunState, expected: TurnPhase) => void;

export const assertPhase: AssertPhase = (state, expected) => {
  if (state.phase !== expected) {
    throw new Error(`Phase error: expected "${expected}", got "${state.phase}"`);
  }
};

// ─── Phase 1: Turn Open ───────────────────────────────────────────────────────

export const runTurnOpen: PhaseRunner = (state, _manifest) => {
  assertPhase(state, 'turn_open');
  return { state: { ...state, phase: 'upkeep' }, news: [] };
};

// ─── Phase 2: Upkeep ─────────────────────────────────────────────────────────

export const runUpkeep: PhaseRunner = (state, manifest) => {
  assertPhase(state, 'upkeep');
  const news: NewsItem[] = [];
  let s = state;

  // 1. Deduct expenses
  const expenses = computeMonthlyExpenses(s, manifest);
  s = applyMoneyDelta(s, -expenses);
  news.push(makeNews(s, 'upkeep_summary', `Expenses: -$${expenses.toLocaleString()}`, -expenses));

  // 2. Credit per_month income
  const income = computeMonthlyIncome(s);
  if (income > 0) {
    s = applyMoneyDelta(s, income);
    news.push(makeNews(s, 'income_received', `Monthly income: +$${income.toLocaleString()}`, income));
  }

  // 3. Tick contract timers and expire
  const updatedContracts = s.contracts.map(c => ({
    ...c,
    duration_remaining: Math.max(0, c.duration_remaining - 1),
    turns_active:       c.turns_active + 1,
  }));
  const expiredContracts = updatedContracts.filter(c => c.duration_remaining === 0);
  for (const ec of expiredContracts) {
    news.push(makeNews(s, 'contract_expired', `Contract expired for client`, null, null, ec.client_id));
  }
  s = { ...s, contracts: updatedContracts };

  // 4. Service debt repayment
  if (s.debt.is_active) {
    s = serviceDebt(s, manifest);
  }

  // 5. Open debt state if money dropped to 0 or below
  if (s.money <= 0 && !s.debt.is_active) {
    s = openDebtState(s, manifest);
  }

  // 6. Fire low-money warning immediately if triggered
  s = fireLowMoneyWarning(s);

  // 7. Advance campaigns (one installment per campaign)
  s = advanceCampaigns(s, manifest);

  // 8. Evaluate arc stage progression for all clients
  const updatedRoster = s.roster.map(client => {
    const newStage = evaluateArcProgression(client, manifest);
    const stageChanged = newStage !== client.arc_stage;
    if (stageChanged) {
      news.push(makeNews(s, 'client_milestone',
        `${client.name} has reached ${newStage}`, null, null, client.id));
    }
    const newStats = refreshClientFog(client, s.agent);
    return {
      ...client,
      stats:         newStats,
      arc_stage:     newStage,
      turns_on_roster: client.turns_on_roster + 1,
      turns_at_stage:  stageChanged ? 0 : client.turns_at_stage + 1,
      clients_developed: undefined, // tracked on RunState, not client
    };
  });

  // Track clients_developed (those who reached Peak this turn)
  const newlyPeak = updatedRoster.filter(
    (c, i) => c.arc_stage === 'peak' && s.roster[i]?.arc_stage !== 'peak',
  ).length;

  s = {
    ...s,
    roster:            updatedRoster,
    clients_developed: s.clients_developed + newlyPeak,
    phase:             'decision',
  };

  return { state: { ...s, news_feed: [...s.news_feed, ...news] }, news };
};

// ─── Phase 3: Decision setup ──────────────────────────────────────────────────

const MAX_PROSPECTS = 6;

export const runDecisionPhase: PhaseRunner = (state, manifest) => {
  assertPhase(state, 'decision');

  // Tick expiry on carried-over items first
  let s = tickBoardItemExpiry(state);

  // Refresh prospect pool (add up to 2 new prospects per turn, cap at MAX_PROSPECTS)
  if (s.prospects.length < MAX_PROSPECTS) {
    const usedNames = new Set([
      ...s.roster.map(c => c.name),
      ...s.prospects.map(p => p.name),
    ]);
    const fresh = generateProspects(Math.min(2, MAX_PROSPECTS - s.prospects.length), usedNames);
    s = { ...s, prospects: [...s.prospects, ...fresh] };
  }

  // Generate this turn's board
  const board = generateDecisionBoard(s, manifest);

  // Generate events that will interrupt the board
  const newEvents = generateEvents(s, manifest);

  return {
    state: {
      ...s,
      decision_board: board,
      pending_events:  [...s.pending_events, ...newEvents],
    },
    news: [],
  };
};

// ─── Phase 4: Resolution ──────────────────────────────────────────────────────

export const runResolution: PhaseRunner = (state, manifest) => {
  assertPhase(state, 'decision'); // resolution follows decision; phase guard uses 'decision'

  let s = state;

  // Apply defaults for any unresolved board items
  s = applyBoardDefaults(s, manifest);

  // Apply defaults for any unresolved events
  s = applyEventDefaults(s, manifest);

  // Evaluate objective conditions, then settle any newly-met payouts
  s = evaluateObjectiveConditions(s);
  const { state: settled } = settleObjectivePayouts(s, manifest);
  s = settled;

  return { state: { ...s, phase: 'turn_close' }, news: [] };
};

// ─── Phase 5: Turn Close ──────────────────────────────────────────────────────

export const runTurnClose: PhaseRunner = (state, manifest) => {
  assertPhase(state, 'turn_close');

  let s = state;

  // Check failure condition
  s = checkFailureCondition(s, manifest);
  if (!s.is_active) return { state: s, news: [] };

  // Advance turn counter
  const newTurn = s.turn_number + 1;

  // Check career clock expiry
  if (newTurn > s.career_length) {
    return {
      state: { ...s, turn_number: newTurn, is_active: false, end_condition: 'clock_expired', phase: 'turn_open' },
      news:  [],
    };
  }

  return {
    state: {
      ...s,
      turn_number:        newTurn,
      phase:              'turn_open',
      low_money_warning:  s.money <= 0,   // reset each turn; re-fires in upkeep if still low
    },
    news: [],
  };
};

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface TurnOrchestrator {
  startTurn: (state: RunState, manifest: VariantManifest) => PhaseResult;
  endTurn:   (state: RunState, manifest: VariantManifest) => PhaseResult;
}

export const turnOrchestrator: TurnOrchestrator = {
  startTurn: (state, manifest) => {
    const { state: s1, news: n1 } = runTurnOpen(state, manifest);
    const { state: s2, news: n2 } = runUpkeep(s1, manifest);
    const { state: s3, news: n3 } = runDecisionPhase(s2, manifest);
    return { state: s3, news: [...n1, ...n2, ...n3] };
  },
  endTurn: (state, manifest) => {
    const { state: s1, news: n1 } = runResolution(state, manifest);
    const { state: s2, news: n2 } = runTurnClose(s1, manifest);
    return { state: s2, news: [...n1, ...n2] };
  },
};
