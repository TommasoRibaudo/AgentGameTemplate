import { Client, ClientStats, FoggedStat, Prospect } from '../types/client';
import { AgentState } from '../types/agent';
import { ArcStage, CoreStatKey, HardStatKey, SoftStatKey, StatDeltas } from '../types/primitives';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';

// INVARIANTS (PRD §3.2):
// - Every stat has a true_value the engine knows and an observed [min, max] the player sees.
// - Talent is a fixed ceiling — it does NOT grow. Scouting only reveals it more accurately.
// - Talent can NEVER be perfectly known (fog floor enforced — see FOG_FLOOR_HARD).
// - Three fog-narrowing sources: agent scouting skills, per-prospect money/rep spend, roster tenure.
// - stat_scouting narrows hard stats (Talent); insight_scouting narrows soft stats (Form, Morale, Arc).

// Minimum observable band width per stat type — Talent is never perfectly known (PRD §6.2 open Q).
// Exact values are economy tuning; these are the invariant minimums.
export const FOG_FLOOR_HARD = 3;   // Talent band can never be narrower than ±FOG_FLOOR_HARD
export const FOG_FLOOR_SOFT = 1;   // Form/Morale/Marketability floor (can get close to exact)

// ─── Fog model ───────────────────────────────────────────────────────────────

// Recompute observed_min/max for a single stat given all narrowing sources.
// Called whenever scouting_invested, agent skills, or turns_on_roster changes.
export type ComputeObservedStat = (
  stat: FoggedStat,
  statKey: CoreStatKey,
  agentState: AgentState,
  turnsOnRoster: number,
) => Pick<FoggedStat, 'observed_min' | 'observed_max'>;

// Recompute all stats for a client and return updated ClientStats.
export type RefreshClientFog = (
  client: Client,
  agentState: AgentState,
) => ClientStats;

// Same for a prospect (agent skills still apply, but tenure is always 0).
export type RefreshProspectFog = (
  prospect: Prospect,
  agentState: AgentState,
) => Prospect;

// Invest Money/Rep into scouting a specific stat on a prospect or client.
// Returns updated entity with narrowed fog; does NOT apply the money deduction to RunState.
export type InvestScouting = (
  entity: Client | Prospect,
  statKey: CoreStatKey,
  amount: number,
) => Client | Prospect;

// ─── Arc progression ─────────────────────────────────────────────────────────

// Evaluate whether a client should advance to the next arc stage this turn.
// Driven by turns_at_stage + Form true_value (high Form delays Rising→Peak, extends Peak).
// Returns the new arc stage (may be unchanged).
export type EvaluateArcProgression = (
  client: Client,
  manifest: VariantManifest,
) => ArcStage;

// Apply arc stage multipliers to a client's observed stat ranges.
// Must be called AFTER RefreshClientFog — multipliers layer on top of the fogged band.
export type ApplyArcMultipliers = (
  stats: ClientStats,
  stage: ArcStage,
  manifest: VariantManifest,
) => ClientStats;

// ─── Stat deltas ─────────────────────────────────────────────────────────────

// Apply engine-computed stat changes (from events, campaign installments, decisions).
// Deltas apply to true_value; observed band is recomputed via RefreshClientFog afterward.
// Clamps true_value to [0, 100].
export type ApplyClientStatDeltas = (
  client: Client,
  deltas: StatDeltas,
  agentState: AgentState,
) => Client;

// ─── Trait system ────────────────────────────────────────────────────────────

// Check whether a trait-granting condition is satisfied after a resolution event.
// condition_key is variant-defined; context carries the roll result and outcome_key.
export type CheckTraitGrant = (
  client: Client,
  conditionKey: string,
  rollResult: number,
  manifest: VariantManifest,
) => string | null;  // returns trait_id to grant, or null

// Apply a trait to a client (caches resolved modifiers from the manifest).
// No-ops if the client already has the trait.
export type GrantTrait = (
  client: Client,
  traitId: string,
  manifest: VariantManifest,
) => Client;

// ─── Roster operations ───────────────────────────────────────────────────────

// Sign a prospect — converts them to a Client, activates the agent<->client contract.
// Assumes contract draft has already been approved via the decision board.
export type SignClient = (
  state: RunState,
  prospectId: string,
  contractDraftId: string,
) => RunState;

// Release a client. If contract is active, computes severance (Money) and reputation ripple.
// If contract has lapsed/expired, release is clean.
export type ReleaseClient = (
  state: RunState,
  clientId: string,
  manifest: VariantManifest,
) => RunState;
