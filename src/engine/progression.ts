import { RunState } from '../types/run';
import { AgentStats, DefenseTrack } from '../types/agent';
import { VariantManifest } from '../types/manifest';
import { CoreStatKey, StatDeltas } from '../types/primitives';
import { applyClientStatDeltas } from './client';

// INVARIANTS (PRD §3.6):
// - Two distinct upgrade vectors: agent stats (personal skills) and agency infrastructure.
// - Agent stats cost Money + Reputation; infrastructure costs Money only (often recurring).
// - Roster slots are infrastructure — buying a slot raises event exposure (growth is double-edged).
// - Support staff is an OPTIONAL hook — not part of the core progression system.

export type InfrastructureUpgradeKey =
  | 'roster_slot'
  | 'insurance'
  | 'pr'
  | 'legal'
  | 'medical'
  | 'training_facility'
  | 'media_studio'
  | 'wellness_suite';

export const CLIENT_BOOST_COST = 750;
export const CLIENT_BOOST_AMOUNT = 5;

const BUILDING_STAT_DELTAS: Partial<Record<InfrastructureUpgradeKey, StatDeltas>> = {
  training_facility: { form: 1 },
  media_studio: { marketability: 1 },
  wellness_suite: { morale: 1 },
};

// ─── Multipliers ──────────────────────────────────────────────────────────────

// 5% cost reduction per Operations level, minimum 50% (never free).
export const computeOperationsMultiplier = (level: number): number =>
  Math.max(0.5, 1 - level * 0.05);

// Added to base Push success probability per Negotiation level.
// Also used to narrow counterparty posture fog after a push attempt.
export const computeNegotiationModifier = (level: number): number =>
  Math.min(0.4, level * 0.08);

// ─── Agent stat upgrades ──────────────────────────────────────────────────────

export type ComputeAgentStatUpgradeCost = (
  state: RunState,
  stat: keyof AgentStats,
  manifest: VariantManifest,
) => { money: number; reputation: number };

export const computeAgentStatUpgradeCost: ComputeAgentStatUpgradeCost = (state, stat, manifest) => {
  const currentLevel = state.agent.stats[stat];
  const base = manifest.economy.agent_stat_upgrade_cost;
  const multiplier = 1 + currentLevel * 0.5;
  return {
    money:      Math.round(base.money * multiplier),
    reputation: Math.round(base.reputation * multiplier),
  };
};

export type UpgradeAgentStat = (
  state: RunState,
  stat: keyof AgentStats,
  manifest: VariantManifest,
) => RunState;

// Note: after upgrading stat_scouting or insight_scouting the turn loop must call
// refreshClientFog for all roster members. This function only mutates the stat.
export const upgradeAgentStat: UpgradeAgentStat = (state, stat, manifest) => {
  const cost = computeAgentStatUpgradeCost(state, stat, manifest);
  if (state.money < cost.money || state.reputation < cost.reputation) return state;
  return {
    ...state,
    money:      state.money - cost.money,
    reputation: state.reputation - cost.reputation,
    agent: {
      ...state.agent,
      stats: { ...state.agent.stats, [stat]: state.agent.stats[stat] + 1 },
    },
  };
};

// ─── Infrastructure upgrades ──────────────────────────────────────────────────

const BASE_INFRA_COSTS: Record<InfrastructureUpgradeKey, { money: number; per_turn_recurring: number }> = {
  roster_slot:       { money: 5_000, per_turn_recurring: 0 },
  insurance:         { money: 2_000, per_turn_recurring: 200 },
  pr:                { money: 2_000, per_turn_recurring: 300 },
  legal:             { money: 3_000, per_turn_recurring: 250 },
  medical:           { money: 2_500, per_turn_recurring: 200 },
  training_facility: { money: 4_000, per_turn_recurring: 300 },
  media_studio:      { money: 4_000, per_turn_recurring: 300 },
  wellness_suite:    { money: 3_500, per_turn_recurring: 250 },
};

export type ComputeInfrastructureUpgradeCost = (
  state: RunState,
  key: InfrastructureUpgradeKey,
  manifest: VariantManifest,
) => { money: number; per_turn_recurring: number };

export const computeInfrastructureUpgradeCost: ComputeInfrastructureUpgradeCost = (state, key, manifest) => {
  const track = state.agent.defense_tracks.find(t => t.key === key);
  const currentLevel = track?.level ?? 0;
  const base = BASE_INFRA_COSTS[key] ?? manifest.economy.defense_track_upgrade_cost;
  const multiplier = 1 + currentLevel * 0.4;
  return {
    money:             Math.round(base.money * multiplier),
    per_turn_recurring: Math.round(base.per_turn_recurring * multiplier),
  };
};

export type UpgradeInfrastructure = (
  state: RunState,
  key: InfrastructureUpgradeKey,
  manifest: VariantManifest,
) => RunState;

export const upgradeInfrastructure: UpgradeInfrastructure = (state, key, manifest) => {
  const cost = computeInfrastructureUpgradeCost(state, key, manifest);
  if (state.money < cost.money) return state;

  const newMoney = state.money - cost.money;

  if (key === 'roster_slot') {
    return {
      ...state,
      money: newMoney,
      agent: { ...state.agent, roster_capacity: state.agent.roster_capacity + 1 },
    };
  }

  const idx = state.agent.defense_tracks.findIndex(t => t.key === key);
  const newTracks: DefenseTrack[] = idx >= 0
    ? state.agent.defense_tracks.map((t, i) =>
        i === idx ? { ...t, level: t.level + 1, per_turn_cost: cost.per_turn_recurring } : t)
    : [...state.agent.defense_tracks, { key, level: 1, per_turn_cost: cost.per_turn_recurring }];

  return {
    ...state,
    money: newMoney,
    agent: { ...state.agent, defense_tracks: newTracks },
  };
};

export type ApplyBuildingDevelopment = (state: RunState) => RunState;

export const applyBuildingDevelopment: ApplyBuildingDevelopment = (state) => {
  if (state.roster.length === 0) return state;

  const totalDeltas = state.agent.defense_tracks.reduce<StatDeltas>((acc, track) => {
    const deltas = BUILDING_STAT_DELTAS[track.key as InfrastructureUpgradeKey];
    if (!deltas || track.level <= 0) return acc;
    for (const [key, delta] of Object.entries(deltas) as [CoreStatKey, number][]) {
      acc[key] = (acc[key] ?? 0) + (delta * track.level);
    }
    return acc;
  }, {});

  if (Object.keys(totalDeltas).length === 0) return state;

  return {
    ...state,
    roster: state.roster.map(client => applyClientStatDeltas(client, totalDeltas, state.agent)),
  };
};

export type BoostClientStat = (
  state: RunState,
  clientId: string,
  statKey: Exclude<CoreStatKey, 'talent'>,
) => RunState;

export const boostClientStat: BoostClientStat = (state, clientId, statKey) => {
  const client = state.roster.find(c => c.id === clientId);
  if (!client || state.money < CLIENT_BOOST_COST) return state;

  const boostedClient = applyClientStatDeltas(
    client,
    { [statKey]: CLIENT_BOOST_AMOUNT },
    state.agent,
  );
  const newMoney = state.money - CLIENT_BOOST_COST;

  return {
    ...state,
    money: newMoney,
    low_money_warning: newMoney <= 0 || state.low_money_warning,
    roster: state.roster.map(c => c.id === clientId ? boostedClient : c),
  };
};

// ─── Contract satisfaction ────────────────────────────────────────────────────

export type ApplyContractSatisfaction = (state: RunState, manifest: VariantManifest) => RunState;

// Each turn, morale drifts based on how well the client's current deals match their expectations.
// Income component (-2..+2): compares per_month entity contract total to the arc-scaled threshold.
// Fan component (-1..+1): based on fan_delta in the client's most recent completed campaign.
// Total delta is clamped to [-2, +2].
export const applyContractSatisfaction: ApplyContractSatisfaction = (state, manifest) => {
  if (state.roster.length === 0) return state;

  const threshold = manifest.economy.income_satisfaction_threshold;

  const updatedRoster = state.roster.map(client => {
    const arcIncomeMult = manifest.arc.stage_multipliers[client.arc_stage]?.income ?? 1;
    const expected = threshold * arcIncomeMult;

    const entityIncome = state.contracts
      .filter(c => c.tier === 'client_entity' && c.client_id === client.id && c.payout_type === 'per_month')
      .reduce((sum, c) => sum + c.amount, 0);

    let incomeComponent: number;
    if (entityIncome === 0) {
      incomeComponent = -2;
    } else if (entityIncome >= expected * 1.5) {
      incomeComponent = 2;
    } else if (entityIncome >= expected) {
      incomeComponent = 1;
    } else if (entityIncome >= expected * 0.5) {
      incomeComponent = 0;
    } else {
      incomeComponent = -1;
    }

    const lastCampaign = client.campaign_history[client.campaign_history.length - 1] ?? null;
    let fanComponent = 0;
    if (lastCampaign) {
      if (lastCampaign.summary.fan_delta > 0) fanComponent = 1;
      else if (lastCampaign.summary.fan_delta < 0) fanComponent = -1;
    }

    const delta = Math.max(-2, Math.min(2, incomeComponent + fanComponent));
    if (delta === 0) return client;
    return applyClientStatDeltas(client, { morale: delta }, state.agent);
  });

  return { ...state, roster: updatedRoster };
};
