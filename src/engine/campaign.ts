import { Campaign, CampaignInstallmentResult } from '../types/campaign';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';

// INVARIANTS (PRD §3.5):
// - A Campaign is a first-class object distinct from random events.
// - It spans N turns and resolves one installment per turn during Upkeep.
// - Each installment rolls from Form (true_value) + traits + random variance.
//   The engine uses Form's true_value — not the observed range — for resolution math.
// - Installment results are append-only; the full history feeds the News Feed.
// - Campaign installments can trigger events or trait grants (thresholds in manifest).

// ─── Installment resolution ──────────────────────────────────────────────────

// Roll a single campaign installment for a client.
// Formula: roll = (form_true_value * type.form_weight) + Normal(0, type.variance)
//          clamped to [0, 100].
// Trait modifiers that bias Form are applied before the roll.
// Returns the result record — caller appends it to campaign.installment_results
// and applies stat_deltas and money/reputation_delta to RunState.
export type RollInstallment = (
  state: RunState,
  campaignId: string,
  manifest: VariantManifest,
) => CampaignInstallmentResult;

// Advance all active campaigns by one installment during Upkeep.
// For each campaign: roll installment → apply deltas → check event/trait thresholds
// → decrement turns_remaining → if turns_remaining === 0, close the campaign.
export type AdvanceCampaigns = (
  state: RunState,
  manifest: VariantManifest,
) => RunState;

// ─── Post-installment checks ─────────────────────────────────────────────────

// After an installment resolves, check whether its roll crosses the event trigger
// threshold defined in the CampaignTypeDefinition. If so, generate one client event
// and add it to state.pending_events.
export type CheckInstallmentEventTrigger = (
  state: RunState,
  result: CampaignInstallmentResult,
  campaignId: string,
  manifest: VariantManifest,
) => RunState;

// Check whether the installment roll exceeds the trait trigger threshold.
// If so, run CheckTraitGrant (client system) and apply the trait if one is awarded.
export type CheckInstallmentTraitTrigger = (
  state: RunState,
  result: CampaignInstallmentResult,
  campaignId: string,
  manifest: VariantManifest,
) => RunState;

// ─── Objective settlement ────────────────────────────────────────────────────

// At campaign close (turns_remaining reaches 0), evaluate pending_objective_ids.
// For each linked contract objective whose condition_key matches the campaign outcome,
// mark it is_met and trigger the payout via the resource system.
export type SettleCampaignObjectives = (
  state: RunState,
  campaignId: string,
  manifest: VariantManifest,
) => RunState;

// ─── Campaign lifecycle ──────────────────────────────────────────────────────

// Start a new campaign for a client. Called when a campaign-type contract is activated
// or an opportunity is approved. Links pending objective IDs from the associated contract.
export type StartCampaign = (
  state: RunState,
  clientId: string,
  campaignTypeKey: string,
  linkedObjectiveIds: string[],
  manifest: VariantManifest,
) => RunState;

// Close a finished campaign: settle objectives, remove from active campaigns,
// and record a news item summarising the full run.
export type CloseCampaign = (
  state: RunState,
  campaignId: string,
  manifest: VariantManifest,
) => RunState;
