import { AgentStats } from '../types/agent';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';

// INVARIANTS (PRD §3.6):
// - Two distinct upgrade vectors: agent stats (personal skills) and agency infrastructure.
// - Agent stats cost Money + Reputation; infrastructure costs Money only (often recurring).
// - Roster slots are infrastructure — buying a slot raises event exposure (growth is double-edged).
// - Support staff is an OPTIONAL hook — not part of the core progression system.

// ─── Agent stat upgrades ──────────────────────────────────────────────────────

// The four agent stats and the key stat they primarily affect:
//   stat_scouting    → narrows FoggedStat on hard stats (Talent)
//   insight_scouting → narrows FoggedStat on soft stats (Form, Morale, Arc)
//   negotiation      → improves contract terms + reveals counterparty posture
//   operations       → reduces overhead and client costs

// Compute the cost to upgrade an agent stat by one level.
// Cost typically scales with current level; exact curve is economy tuning.
export type ComputeAgentStatUpgradeCost = (
  state: RunState,
  stat: keyof AgentStats,
  manifest: VariantManifest,
) => { money: number; reputation: number };

// Upgrade an agent stat by one level.
// Deducts the cost from state.money and state.reputation, increments the stat.
// After upgrading stat_scouting or insight_scouting, all client/prospect fog must
// be refreshed (call client system's RefreshClientFog for each roster member).
export type UpgradeAgentStat = (
  state: RunState,
  stat: keyof AgentStats,
  manifest: VariantManifest,
) => RunState;

// ─── Infrastructure upgrades ──────────────────────────────────────────────────

// Infrastructure upgrade keys — core defines these four tracks:
//   'roster_slot'  → increases roster_capacity by 1; raises event exposure
//   'insurance'    → reduces frequency/severity of client injury events
//   'pr'           → reduces frequency/severity of scandal and agency PR events
//   'legal'        → reduces frequency/severity of lawsuit and penalty events
//   'medical'      → reduces frequency/severity of health-related client events
// Variants may rename defense tracks but must map to these keys.

export type InfrastructureUpgradeKey = 'roster_slot' | 'insurance' | 'pr' | 'legal' | 'medical';

// Compute the cost (one-time Money) and recurring per-turn cost to upgrade a track.
export type ComputeInfrastructureUpgradeCost = (
  state: RunState,
  key: InfrastructureUpgradeKey,
  manifest: VariantManifest,
) => { money: number; per_turn_recurring: number };

// Upgrade an infrastructure track by one level.
// For 'roster_slot': increments agent.roster_capacity.
// For defense tracks: increments the matching DefenseTrack.level and sets per_turn_cost.
// Deducts the one-time money cost; the recurring cost is handled in Upkeep.
export type UpgradeInfrastructure = (
  state: RunState,
  key: InfrastructureUpgradeKey,
  manifest: VariantManifest,
) => RunState;

// ─── Effect queries ──────────────────────────────────────────────────────────

// How much does the current Operations level reduce per-turn costs?
// Returns a multiplier in [0, 1] applied to overhead and obligation costs.
// At Operations = 0, multiplier = 1.0 (no reduction).
export type ComputeOperationsMultiplier = (operationsLevel: number) => number;

// How much does the current Negotiation level affect Push success probability?
// Returns a modifier added to the base success_probability before a Push roll.
// Also used to reveal counterparty posture — higher Negotiation narrows posture fog.
export type ComputeNegotiationModifier = (negotiationLevel: number) => number;
