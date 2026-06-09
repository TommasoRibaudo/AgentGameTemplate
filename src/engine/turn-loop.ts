import { RunState, NewsItem, NewsItemType } from '../types/run';
import { TurnPhase } from '../types/primitives';
import { VariantManifest } from '../types/manifest';
import { computeMonthlyIncome, computeMonthlyExpenses, applyMoneyDelta, applyReputationDelta, settleObjectivePayouts, evaluateObjectiveConditions, computeAgencyPayout } from './resource';
import { refreshClientFog, evaluateArcProgression, generateProspects, computeProspectPoolSize, applyTalentGrowthDecay } from './client';
import { advanceCampaigns, collectCatalogIncome } from './campaign';
import { generateEvents, applyEventDefaults } from './event';
import { generateDecisionBoard, applyBoardDefaults, tickBoardItemExpiry } from './decision-queue';
import { serviceDebt, checkFailureCondition, openDebtState, fireLowMoneyWarning } from './failure';
import { applyBuildingDevelopment, applyContractSatisfaction } from './progression';

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
    const beforeDebt = s.debt;
    const beforeMoney = s.money;
    s = serviceDebt(s, manifest);
    const paid = beforeMoney - s.money;
    const missedPayment = beforeDebt.bankruptcy_warning_turns_remaining !== s.debt.bankruptcy_warning_turns_remaining
      && s.debt.bankruptcy_warning_turns_remaining !== null
      && paid === 0;

    if (paid > 0) {
      news.push(makeNews(s, 'debt_repayment', `Debt repayment: -$${paid.toLocaleString()}`, -paid));
    }
    if (beforeDebt.bankruptcy_warning_turns_remaining !== null && s.debt.bankruptcy_warning_turns_remaining === null) {
      news.push(makeNews(s, 'debt_recovered', 'Debt account returned to good standing'));
    }
    if (missedPayment) {
      const turnsLeft = s.debt.bankruptcy_warning_turns_remaining ?? 0;
      news.push(makeNews(s, 'debt_missed', `Debt repayment missed. Grace turns remaining: ${turnsLeft}`));
    }
  }

  // 5. Open debt state if money dropped to 0 or below
  if (s.money <= 0 && !s.debt.is_active) {
    s = openDebtState(s, manifest);
    news.push(makeNews(s, 'debt_opened', `Debt account opened. Credit ceiling: $${s.debt.credit_ceiling.toLocaleString()}`));
  }

  // 6. Fire low-money warning immediately if triggered
  s = fireLowMoneyWarning(s);

  // 7. Advance campaigns (one installment per campaign)
  const campaignsBefore = s.campaigns;
  s = advanceCampaigns(s, manifest);
  for (const campaign of s.campaigns) {
    const prior = campaignsBefore.find(c => c.id === campaign.id);
    if (!prior) continue;
    const newResults = campaign.installment_results.slice(prior.installment_results.length);
    const client = s.roster.find(c => c.id === campaign.client_id);
    for (const result of newResults) {
      const campaignType = manifest.campaign_types.find(t => t.key === campaign.type_key);
      const campaignLabel = campaignType?.label ?? campaign.type_key.replace(/_/g, ' ');
      const clientName = client?.name ?? 'Client';
      const isRelease = campaignType?.release_kind != null;
      news.push(makeNews(
        s,
        'campaign_installment',
        `${clientName}: ${campaignLabel} installment (${result.outcome_key.replace(/_/g, ' ')})`,
        isRelease ? null : result.money_delta,
        result.reputation_delta,
        campaign.client_id,
      ));
    }
  }

  const catalog = collectCatalogIncome(s);
  s = catalog.state;
  if (catalog.income > 0 || catalog.fanGain > 0) {
    news.push(makeNews(
      s,
      'income_received',
      `Catalog royalties: +$${catalog.income.toLocaleString()} and ${catalog.fanGain.toLocaleString()} new fans`,
      catalog.income,
      null,
      null,
    ));
  }

  // 8. Building development improves roster stats over time before fog refresh.
  s = applyBuildingDevelopment(s);

  // 8a. Contract satisfaction shifts morale based on earnings and fan growth.
  s = applyContractSatisfaction(s, manifest);

  // 9. Evaluate arc stage progression, apply talent growth/decay, refresh fog
  const updatedRoster = s.roster.map(client => {
    const newStage = evaluateArcProgression(client, manifest);
    const stageChanged = newStage !== client.arc_stage;
    if (stageChanged) {
      news.push(makeNews(s, 'client_milestone',
        `${client.name} has reached ${newStage}`, null, null, client.id));
    }
    const staged = {
      ...client,
      arc_stage:       newStage,
      turns_on_roster: client.turns_on_roster + 1,
      turns_at_stage:  stageChanged ? 0 : client.turns_at_stage + 1,
    };
    const withTalent = applyTalentGrowthDecay(staged, s.agent);
    const newStats = refreshClientFog(withTalent, s.agent);
    return { ...withTalent, stats: newStats };
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

export const runDecisionPhase: PhaseRunner = (state, manifest) => {
  assertPhase(state, 'decision');

  // Tick expiry on carried-over items first
  let s = tickBoardItemExpiry(state);

  // Refresh prospect pool (add up to 2 new prospects per turn, cap at MAX_PROSPECTS)
  const maxProspects = computeProspectPoolSize(s.reputation);
  if (s.prospects.length < maxProspects) {
    const usedNames = new Set([
      ...s.roster.map(c => c.name),
      ...s.prospects.map(p => p.name),
    ]);
    const fresh = generateProspects(Math.min(2, maxProspects - s.prospects.length), usedNames, s.reputation);
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
  const { state: settled, settledContractIds } = settleObjectivePayouts(s, manifest);
  s = settled;
  const payoutNews = settledContractIds.map(contractId => {
    const contract = s.contracts.find(c => c.id === contractId);
    const paidTotal = contract?.objectives
      .filter(o => o.is_met && o.is_paid)
      .reduce((sum, o) => sum + computeAgencyPayout(s, contract, o.payout), 0) ?? 0;
    return makeNews(
      s,
      'income_received',
      'Contract objective payout settled',
      paidTotal,
      null,
      contract?.client_id ?? null,
    );
  });

  return { state: { ...s, phase: 'turn_close', news_feed: [...s.news_feed, ...payoutNews] }, news: payoutNews };
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
