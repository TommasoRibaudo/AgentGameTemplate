import { DecisionItem, DecisionOutcome, PushRisk } from '../types/decision';
import { ContractDraft } from '../types/contract';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';

// INVARIANTS (PRD §2.1, §3.3):
// - Every decision item carries a mandatory default_on_ignore outcome.
// - A decision is ALWAYS made — if the player ends the turn without resolving an item,
//   the default fires. Ignoring is itself a choice, and defaults can be dangerous on purpose.
// - The board has 2–5 items per turn; the exact count is driven by game state.
// - Items resolve in the order the player picks them (free-pick, FM-style board).
// - Random events interrupt the board as modals; the board is suspended until resolved.

export const BOARD_MIN_ITEMS = 2;
export const BOARD_MAX_ITEMS = 5;

// ─── Board generation ─────────────────────────────────────────────────────────

// Build the decision board for the current turn.
// Generation pool = all board_item_templates filtered by:
//   - rep_gate ≤ current Reputation
//   - valid_arc_stages includes at least one current roster client's stage
//   - type-specific relevance (e.g. renewals only generated if contracts are expiring)
// Items are sampled from the filtered pool using generation weights from the manifest.
// Persistent items (expires_in > 0) from the prior turn are carried over and fill slots first.
export type GenerateDecisionBoard = (
  state: RunState,
  manifest: VariantManifest,
) => DecisionItem[];

// Hydrate a contract_offer item — samples a ContractDraft from the matched ContractTemplate
// using client stats and agent Reputation to scale the concrete values.
export type HydrateContractOffer = (
  state: RunState,
  templateKey: string,
  clientId: string,
  manifest: VariantManifest,
) => ContractDraft;

// ─── Item resolution ─────────────────────────────────────────────────────────

// Resolve a board item with the given option key ('approve' | 'reject' | 'push' | custom).
// Returns updated RunState. All consequences (money, reputation, stat deltas,
// contract activation) are applied immediately and a news item is recorded.
export type ResolveDecisionItem = (
  state: RunState,
  itemId: string,
  optionKey: string,
  manifest: VariantManifest,
) => RunState;

// Execute a Push action. Rolls against PushRisk.success_probability (derived from
// agent Negotiation stat and counterparty posture true_value). Returns which outcome fires.
// Open question §6.3: exact distribution for success_probability at each Negotiation level.
export type ExecutePush = (
  state: RunState,
  risk: PushRisk,
) => { succeeded: boolean; outcome: DecisionOutcome };

// On a successful Push, regenerate improved contract terms from the same template
// but with posture revealed and amount/cut biased toward the agent's favour.
export type RegeneratePushedDraft = (
  original: ContractDraft,
  negotiationLevel: number,
  manifest: VariantManifest,
) => ContractDraft;

// ─── End-of-turn default application ─────────────────────────────────────────

// Called during Resolution phase. For every unresolved board item, fires its
// default_on_ignore outcome and records a news item noting the default was taken.
export type ApplyBoardDefaults = (
  state: RunState,
  manifest: VariantManifest,
) => RunState;

// ─── Contract activation ─────────────────────────────────────────────────────

// Promote a ContractDraft to an active Contract and attach it to the run state.
// Also fires a lump_sum payout immediately if payout_type === 'lump_sum'.
export type ActivateContract = (
  state: RunState,
  draft: ContractDraft,
  manifest: VariantManifest,
) => RunState;

// ─── Shelf-life management ───────────────────────────────────────────────────

// Decrement expires_in on persistent items at the start of each turn.
// Items that reach expires_in === 0 are removed from the board (not defaulted — they expire).
export type TickBoardItemExpiry = (state: RunState) => RunState;
