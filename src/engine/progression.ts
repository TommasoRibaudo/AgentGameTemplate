import { RunState } from '../types/run';
import { AgentStats, DefenseTrack } from '../types/agent';
import { VariantManifest } from '../types/manifest';

// INVARIANTS (PRD §3.6):
// - Two distinct upgrade vectors: agent stats (personal skills) and agency infrastructure.
// - Agent stats cost Money + Reputation; infrastructure costs Money only (often recurring).
// - Roster slots are infrastructure — buying a slot raises event exposure (growth is double-edged).
// - Support staff is an OPTIONAL hook — not part of the core progression system.

export type InfrastructureUpgradeKey = 'roster_slot' | 'insurance' | 'pr' | 'legal' | 'medical';

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
  roster_slot: { money: 5_000, per_turn_recurring: 0 },
  insurance:   { money: 2_000, per_turn_recurring: 200 },
  pr:          { money: 2_000, per_turn_recurring: 300 },
  legal:       { money: 3_000, per_turn_recurring: 250 },
  medical:     { money: 2_500, per_turn_recurring: 200 },
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
