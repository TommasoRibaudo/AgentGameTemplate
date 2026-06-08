import { RunState } from '../types/run';
import { NewsItem } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { TurnPhase } from '../types/primitives';

// INVARIANTS (PRD §2.1):
// - Phase order is fixed: turn_open → upkeep → decision → resolution → turn_close.
//   No system may skip or reorder phases.
// - Early turn-end is allowed, but every unresolved queue item still resolves via its default.
//   The world always moves — the player cannot freeze time by not acting.
// - Failure is checked ONLY at turn_close. A low-Money early warning fires immediately
//   during upkeep or decision when Money first goes low/negative — never silent.
// - The career clock advances unconditionally at turn_close.

export interface PhaseResult {
  state: RunState;
  news: NewsItem[];
}

// Each phase runner is a pure function: (current state, manifest) → (new state, news items).
// Phases do not communicate side-effects — all state changes flow through the returned state.
export type PhaseRunner = (state: RunState, manifest: VariantManifest) => PhaseResult;

// ─── Phase 1: Turn Open ───────────────────────────────────────────────────────
// Prepares the news feed summary for the player to review.
// No state mutations — read-only aggregation of last turn's results.
// Returns the same state with news items describing what happened.
export type RunTurnOpen = PhaseRunner;

// ─── Phase 2: Upkeep (automatic) ─────────────────────────────────────────────
// Engine resolves all passive effects in this order:
//   1. Deduct overhead + defense track recurring costs
//   2. Credit per_month contract income (net of your_cut)
//   3. Tick contract duration_remaining (expire contracts at 0)
//   4. Service debt repayment (if debt.is_active)
//   5. Evaluate arc stage progression for all clients
//   6. Advance all active campaign installments (see campaign system)
//   7. Fire low-Money early warning if Money ≤ LOW_MONEY_THRESHOLD after step 4
// Player sees deltas in the news feed but does not act.
export type RunUpkeep = PhaseRunner;

export const LOW_MONEY_THRESHOLD = 0;  // warning fires at or below this value

// ─── Phase 3: Decision (player acts) ─────────────────────────────────────────
// Generates the decision board (2–5 items) at phase entry.
// Player resolves items in any order via approve/reject/push.
// Random events interrupt as modals and are resolved before board interaction resumes.
// Phase ends when the player presses End Turn.
// This runner sets up the board; actual item resolution is handled by the decision-queue system.
export type RunDecisionPhase = PhaseRunner;

// ─── Phase 4: Resolution (automatic) ─────────────────────────────────────────
// Applies all consequences of Phase 3 choices in the order items were resolved.
// Also applies defaults for any items the player left unresolved.
// Produces a digest of what happened for the news feed.
export type RunResolution = PhaseRunner;

// ─── Phase 5: Turn Close ──────────────────────────────────────────────────────
// 1. Check failure condition (see failure system — bankruptcy only checked here)
// 2. Advance turn_number
// 3. Check career clock expiry (turn_number >= career_length → end_condition = 'clock_expired')
// Returns updated state. If failure or expiry, sets is_active = false.
export type RunTurnClose = PhaseRunner;

// ─── Turn orchestrator ────────────────────────────────────────────────────────
// Drives the full turn sequence for the automatic phases (1, 2, 4, 5).
// Phase 3 (decision) is driven by the UI — the loop pauses and waits for player input.
export interface TurnOrchestrator {
  startTurn: (state: RunState, manifest: VariantManifest) => PhaseResult;      // runs phases 1–2
  endTurn: (state: RunState, manifest: VariantManifest) => PhaseResult;        // runs phases 4–5
}

// ─── Phase guard ─────────────────────────────────────────────────────────────
// Asserts state.phase matches the expected phase before a runner executes.
// Throws if the phase is wrong — enforces the fixed order invariant.
export type AssertPhase = (state: RunState, expected: TurnPhase) => void;
