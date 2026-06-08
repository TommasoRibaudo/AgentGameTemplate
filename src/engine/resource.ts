import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';

// INVARIANTS (PRD §3.1):
// - Money hitting 0 opens the debt state; it does NOT end the run.
// - Reputation cannot kill the player — it only gates access and offer quality.
// - Reputation is a single global number in core; no segmentation unless variant adds the hook.

// ─── Money ───────────────────────────────────────────────────────────────────

// Apply a money delta. If the result would push Money below 0, clamp to 0 and
// open the debt state. Caller is responsible for recording the triggering news item.
export type ApplyMoneyDelta = (state: RunState, delta: number) => RunState;

// Compute total per-turn Money inflow from all active per_month contracts.
// Called during Upkeep. Does not mutate state — caller applies the result.
export type ComputeMonthlyIncome = (state: RunState) => number;

// Compute total per-turn Money outflow: overhead + obligations + debt repayment + defense costs.
export type ComputeMonthlyExpenses = (state: RunState, manifest: VariantManifest) => number;

// Earn a lump-sum payout (signing bonus, transfer fee, sponsorship).
// Equivalent to ApplyMoneyDelta(state, amount) but named distinctly for clarity in logs.
export type EarnLumpSum = (state: RunState, amount: number, sourceContractId: string) => RunState;

// Check and pay out any per_objective contracts whose conditions are now met.
// Called after Resolution phase. Returns updated state and a list of contract IDs that paid out.
export type SettleObjectivePayouts = (
  state: RunState,
  manifest: VariantManifest,
) => { state: RunState; settledContractIds: string[] };

// ─── Reputation ──────────────────────────────────────────────────────────────

// Apply a reputation delta. Reputation is clamped to [0, MAX_REPUTATION].
// Never triggers game-over directly.
export type ApplyReputationDelta = (state: RunState, delta: number) => RunState;

export const MAX_REPUTATION = 100;
export const MIN_REPUTATION = 0;

// ─── Offer quality gating ────────────────────────────────────────────────────

// Returns the effective reputation tier used to filter the board item pool.
// Higher tier = higher-quality and higher-value templates are eligible.
// Thresholds are economy-tuning concerns; this function maps raw Rep → tier.
export type ComputeRepTier = (reputation: number) => RepTier;
export type RepTier = 'grassroots' | 'regional' | 'national' | 'elite';

// ─── Credit ceiling ──────────────────────────────────────────────────────────

// ComputeCreditCeiling lives in the failure system (src/engine/failure.ts) since
// credit is a debt concept. EstimateClientAssetValue is a helper it calls.

// Estimate the asset value of a single client (used by failure.ComputeCreditCeiling).
// Based on remaining contract duration, payout type, and arc stage multiplier.
export type EstimateClientAssetValue = (
  state: RunState,
  clientId: string,
  manifest: VariantManifest,
) => number;
