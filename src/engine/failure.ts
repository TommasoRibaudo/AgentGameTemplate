import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';

// INVARIANTS (PRD §3.8):
// - Money = 0 opens the debt state. It does NOT end the run.
// - Failure is checked ONLY at Turn Close (never mid-Upkeep).
// - A low/negative Money warning fires IMMEDIATELY when Money first drops low —
//   the player is never silently surprised by the end.
// - True bankruptcy = missed repayment WITH no credit headroom remaining.
// - A one-turn grace period precedes bankruptcy — one final turn to recover.
// - Voluntary retirement is always available as a legitimate end.

// ─── Debt state ───────────────────────────────────────────────────────────────

// Open the debt state when Money hits 0 during any phase.
// Offers the player a loan: injects Money now against recurring repayment + interest.
// Sets debt.is_active = true and computes the initial credit offer up to ComputeCreditCeiling.
export type OpenDebtState = (
  state: RunState,
  manifest: VariantManifest,
) => RunState;

// Take out a loan: injects `amount` into Money, increases debt.balance,
// sets per_turn_repayment, and recomputes the credit ceiling.
// Amount must not exceed (debt.credit_ceiling - debt.balance).
export type TakeLoan = (
  state: RunState,
  amount: number,
  manifest: VariantManifest,
) => RunState;

// Process debt repayment during Upkeep. Deducts per_turn_repayment from Money,
// applies interest to balance, and checks for missed repayment condition.
// If Money < per_turn_repayment and credit headroom is exhausted, fires the
// bankruptcy warning (sets bankruptcy_warning_turns_remaining = 1).
export type ServiceDebt = (
  state: RunState,
  manifest: VariantManifest,
) => RunState;

// ─── Credit ceiling ──────────────────────────────────────────────────────────

// Credit ceiling = (reputation * economy.credit_ceiling_rep_weight)
//               + (roster_asset_value * economy.credit_ceiling_asset_weight)
// Selling a client LOWERS the ceiling even as it raises cash — a real tension.
// Recalculated after every roster or reputation change.
export type ComputeCreditCeiling = (
  state: RunState,
  manifest: VariantManifest,
) => number;

// ─── Failure check (Turn Close only) ─────────────────────────────────────────

// Called exactly once per turn at Turn Close.
// Checks for true bankruptcy: debt.is_active AND missed repayment AND credit exhausted.
// If bankruptcy_warning_turns_remaining was 1 last turn and condition persists → end run.
// If the warning fires for the first time → set bankruptcy_warning_turns_remaining = 1,
// do NOT end the run yet.
export type CheckFailureCondition = (
  state: RunState,
  manifest: VariantManifest,
) => RunState;

// ─── Early-warning notification ──────────────────────────────────────────────

// Fires IMMEDIATELY (not at Turn Close) whenever Money first drops to ≤ LOW_MONEY_THRESHOLD
// during any phase. Sets a flag on RunState so the UI can display the persistent warning.
// Does not check bankruptcy — just flags that the player is in danger.
export type FireLowMoneyWarning = (state: RunState) => RunState;

// ─── End-of-run handling ─────────────────────────────────────────────────────

// Trigger a run end with the given condition. Sets is_active = false, records
// end_condition, and computes the final career score.
export type EndRun = (
  state: RunState,
  condition: 'retired' | 'bankrupt' | 'clock_expired',
  manifest: VariantManifest,
) => RunState;

// Compute the final career score for leaderboard submission.
// Score = f(peak_reputation, total_earnings, clients_developed, hall_of_fame_clients).
// Open question §6.8: exact weighting of these four components.
export type ComputeCareerScore = (state: RunState) => number;

// Player-initiated voluntary retirement. Valid at any point during the Decision phase.
// Locks in the current score — a strategic choice to avoid a late-career collapse.
export type RetireVoluntarily = (state: RunState, manifest: VariantManifest) => RunState;
