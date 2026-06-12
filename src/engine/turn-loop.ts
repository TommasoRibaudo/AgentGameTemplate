import { RunState, NewsItem, NewsItemType } from '../types/run';
import { GameEvent } from '../types/event';
import { TurnPhase } from '../types/primitives';
import { VariantManifest } from '../types/manifest';
import { computeWeeklyIncome, computeWeeklyExpenses, applyMoneyDelta, applyReputationDelta, settleObjectivePayouts, evaluateObjectiveConditions, computeAgencyPayout } from './resource';
import { refreshClientFog, evaluateArcProgression, generateProspects, computeProspectPoolSize, applyTalentGrowthDecay, applyAudienceDecay } from './client';
import { advanceCampaigns, collectCatalogIncome } from './campaign';
import { generateEvents, applyEventDefaults } from './event';
import { generateDecisionBoard, applyBoardDefaults, tickBoardItemExpiry } from './decision-queue';
import { serviceDebt, checkFailureCondition, openDebtState, fireLowMoneyWarning, takeLoan, computeCreditCeiling } from './failure';
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
  fanDelta?: number | null,
): NewsItem => ({
  id:               `news_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
  turn_number:      state.turn_number,
  type,
  description,
  money_delta:      moneyDelta ?? null,
  reputation_delta: repDelta ?? null,
  fan_delta:        fanDelta ?? null,
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
  const expenses = computeWeeklyExpenses(s, manifest);
  s = applyMoneyDelta(s, -expenses);
  news.push(makeNews(s, 'upkeep_summary', `Expenses: -$${expenses.toLocaleString()}`, -expenses));

  // 2. Credit per_week income
  const income = computeWeeklyIncome(s);
  if (income > 0) {
    s = applyMoneyDelta(s, income);
    news.push(makeNews(s, 'income_received', `Weekly income: +$${income.toLocaleString()}`, income));
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
      const weeksLeft = s.debt.bankruptcy_warning_turns_remaining ?? 0;
      news.push(makeNews(s, 'debt_missed', `Debt repayment missed. Grace weeks remaining: ${weeksLeft}`));
    }
  }

  // 5. If money hit 0 and no debt yet: auto-loan the full credit ceiling
  if (s.money <= 0 && !s.debt.is_active) {
    const ceiling = computeCreditCeiling(s, manifest);
    if (ceiling > 0) {
      s = takeLoan(s, ceiling, manifest);
      const loanEvent: GameEvent = {
        id:                `evt_debt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
        template_key:      '__debt_opened',
        campaign_id:       null,
        category:          'agency',
        severity:          'major',
        client_id:         null,
        description:       `You ran out of operating capital. The bank has extended a credit line of $${ceiling.toLocaleString()}. A ${Math.round(manifest.economy.debt_interest_rate * 100)}% repayment is due each turn. Manage your expenses or risk bankruptcy.`,
        options:           [{ key: 'acknowledge', label: 'Understood', outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: null } }],
        default_outcome:   { money_delta: 0, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: null },
        defense_track_key: null,
        is_resolved:       false,
        chosen_option_key: null,
      };
      s = { ...s, pending_events: [...s.pending_events, loanEvent] };
      news.push(makeNews(s, 'debt_opened', `Bank extended a credit line of $${ceiling.toLocaleString()}`));
    } else {
      // No credit available — open debt state and start the bankruptcy countdown immediately
      s = openDebtState(s, manifest);
      s = { ...s, debt: { ...s.debt, bankruptcy_warning_turns_remaining: 1 } };
      news.push(makeNews(s, 'debt_opened', 'No credit available. Bankruptcy warning issued.'));
    }
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
        result.audience_gain > 0 ? result.audience_gain : null,
      ));
    }
  }

  // News for campaigns that ended (removed from active list) this turn
  for (const ended of campaignsBefore.filter(c => !s.campaigns.some(sc => sc.id === c.id))) {
    const endedClient = s.roster.find(c => c.id === ended.client_id);
    const endedType = manifest.campaign_types.find(t => t.key === ended.type_key);
    const endedLabel = endedType?.label ?? ended.type_key.replace(/_/g, ' ');
    const endedHistory = endedClient?.campaign_history?.find(h => h.id === ended.id);
    news.push(makeNews(
      s,
      'campaign_ended',
      `${endedClient?.name ?? 'Client'}: ${endedLabel} wrapped up`,
      endedHistory?.summary.money_delta ?? null,
      endedHistory?.summary.reputation_delta ?? null,
      ended.client_id,
      endedHistory?.summary.fan_delta ?? null,
    ));
  }

  const catalog = collectCatalogIncome(s);
  s = catalog.state;
  if (catalog.income > 0 || catalog.fanGain > 0) {
    news.push(makeNews(
      s,
      'income_received',
      'Catalog royalties',
      catalog.income > 0 ? catalog.income : null,
      null,
      null,
      catalog.fanGain > 0 ? catalog.fanGain : null,
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
      age_weeks:       client.age_weeks + 1,
      arc_stage:       newStage,
      turns_on_roster: client.turns_on_roster + 1,
      turns_at_stage:  stageChanged ? 0 : client.turns_at_stage + 1,
    };
    const withTalent = applyTalentGrowthDecay(staged, s.agent);
    const withDecay = applyAudienceDecay(withTalent);
    const newStats = refreshClientFog(withDecay, s.agent);
    return { ...withDecay, stats: newStats };
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

const isTutorialPressureLocked = (state: RunState): boolean =>
  state.tutorial_step !== null && state.tutorial_step !== 'done';

const hasActiveCampaignPressure = (state: RunState): boolean =>
  state.campaigns.some(c => c.turns_remaining > 0);

export const IDLE_DECISION_PRESSURE_CHANCE = 2 / 6;
export const ACTIVE_DECISION_PRESSURE_CHANCE = 3 / 6;
export const EVENT_PRESSURE_CHANCE = 1 / 6;
export const RECENT_DECISION_TEMPLATE_COOLDOWN = 6;

const recentDecisionTemplateKeys = (state: RunState): Set<string> =>
  new Set(
    state.decision_board
      .slice(-RECENT_DECISION_TEMPLATE_COOLDOWN)
      .map(item => item.template_key),
  );

const limitRandomBoardPressure = (
  generatedBoard: ReturnType<typeof generateDecisionBoard>,
  currentBoard: RunState['decision_board'],
  recentTemplateKeys: Set<string>,
): ReturnType<typeof generateDecisionBoard> => {
  const currentIds = new Set(currentBoard.map(item => item.id));
  const selectedTemplateKeys = new Set<string>();
  let selectedRandomItem = false;

  return generatedBoard.filter(item => {
    const isCarriedOver = currentIds.has(item.id);
    if (isCarriedOver || item.type === 'renewal') return true;
    if (selectedRandomItem) return false;
    if (recentTemplateKeys.has(item.template_key)) return false;
    if (selectedTemplateKeys.has(item.template_key)) return false;

    selectedRandomItem = true;
    selectedTemplateKeys.add(item.template_key);
    return true;
  });
};

export const shouldGenerateDecisionBeat = (state: RunState): boolean => {
  if (isTutorialPressureLocked(state)) return false;
  if (state.turn_number <= 1) return false;
  const chance = hasActiveCampaignPressure(state)
    ? ACTIVE_DECISION_PRESSURE_CHANCE
    : IDLE_DECISION_PRESSURE_CHANCE;
  return Math.random() < chance;
};

export const shouldGenerateEventBeat = (state: RunState): boolean => {
  if (isTutorialPressureLocked(state)) return false;
  return state.turn_number > 1 && Math.random() < EVENT_PRESSURE_CHANCE;
};

export const runDecisionPhase: PhaseRunner = (state, manifest) => {
  assertPhase(state, 'decision');

  const recentTemplateKeys = recentDecisionTemplateKeys(state);

  // Tick expiry on carried-over items first
  let s = tickBoardItemExpiry(state);

  // Tick prospect expiry and remove those whose window has closed
  const tickedProspects = s.prospects
    .map(p => ({ ...p, expires_in: p.expires_in - 1 }))
    .filter(p => p.expires_in > 0);

  // On a quality milestone (rep crosses a tier boundary), flush prospects generated
  // at the old quality ceiling so the player gets a fresh pool worth signing.
  const currentTier = computeProspectPoolSize(s.reputation);
  const freshPool = tickedProspects.filter(
    p => computeProspectPoolSize(p.generated_at_reputation) >= currentTier,
  );
  s = { ...s, prospects: freshPool };

  // One new prospect may appear each turn: 30% base chance, +10% per stat_scouting level, capped at 90%.
  const maxProspects = currentTier;
  if (s.prospects.length < maxProspects) {
    const spawnChance = Math.min(0.9, 0.3 + s.agent.stats.stat_scouting * 0.1);
    if (Math.random() < spawnChance) {
      const usedNames = new Set([
        ...s.roster.map(c => c.name),
        ...s.prospects.map(p => p.name),
      ]);
      const fresh = generateProspects(
        1,
        usedNames,
        s.reputation,
        s.turn_number,
        s.agent.stats.stat_scouting,
        s.agent.stats.insight_scouting,
      );
      s = { ...s, prospects: [...s.prospects, ...fresh] };
    }
  }

  // Randomly introduce new board pressure; carried-over expiring items remain visible.
  const board = shouldGenerateDecisionBeat(s)
    ? limitRandomBoardPressure(generateDecisionBoard(s, manifest), s.decision_board, recentTemplateKeys)
    : s.decision_board.filter(i => !i.is_resolved && (i.expires_in === null || i.expires_in > 0));

  // Track one-time templates the moment they appear so they never fire again
  const newOneTimeKeys = board
    .filter(i => manifest.board_item_templates.find(t => t.key === i.template_key && t.one_time))
    .map(i => i.template_key);

  // Events roll each week with a low average rate.
  const newEvents = shouldGenerateEventBeat(s)
    ? generateEvents(s, manifest)
    : [];

  return {
    state: {
      ...s,
      decision_board:      board,
      pending_events:      [...s.pending_events, ...newEvents],
      fired_one_time_keys: newOneTimeKeys.length > 0
        ? [...s.fired_one_time_keys, ...newOneTimeKeys]
        : s.fired_one_time_keys,
    },
    news: [],
  };
};

// ─── Phase 4: Resolution ──────────────────────────────────────────────────────

export const runResolution: PhaseRunner = (state, manifest) => {
  assertPhase(state, 'decision'); // resolution follows decision; phase guard uses 'decision'

  let s = state;
  const skippedBoardItems = s.decision_board.filter(item => !item.is_resolved).length;
  const skippedEvents = s.pending_events.length;
  const skippedItems = skippedBoardItems + skippedEvents;

  // Capture contract/renewal items that will be auto-declined so we can surface news
  const pendingDeclines = s.decision_board.filter(item =>
    !item.is_resolved
    && (item.type === 'contract_offer' || item.type === 'renewal')
    && item.contract_draft?.default_on_ignore === 'reject',
  );

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

  const declineNews = pendingDeclines.map(item => {
    const clientName = item.client_id
      ? (s.roster.find(c => c.id === item.client_id)?.name ?? 'Client')
      : 'Client';
    const description = item.type === 'renewal'
      ? `${clientName}: renewal window closed — contract will expire`
      : `${clientName}: offer withdrawn`;
    return makeNews(s, 'contract_expired', description, null, null, item.client_id ?? null);
  });

  return {
    state: {
      ...s,
      phase: 'turn_close',
      narrator_pacing: {
        consecutive_skipped_turns: skippedItems > 0
          ? state.narrator_pacing.consecutive_skipped_turns + 1
          : 0,
        last_turn_skipped_items: skippedItems,
      },
      news_feed: [...s.news_feed, ...payoutNews, ...declineNews],
    },
    news: [...payoutNews, ...declineNews],
  };
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
