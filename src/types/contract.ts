import { ArcStage, ContractTier, PayoutType } from './primitives';

// Reusable shape for objective entries embedded in contract templates
export interface ObjectiveTemplate {
  description: string;
  payout_fraction: number;  // portion of contract amount paid on completion
  condition_key: string;    // variant-defined condition identifier
}

// Counterparty posture is the one fogged field on a deal — not the terms, but the
// willingness to move. Negotiation skill reveals it; pushing without knowing it is risky.
export interface FoggedPosture {
  true_value: number;           // 0–1 willingness-to-move; engine only
  is_revealed: boolean;
  observed_min: number | null;  // null until Negotiation investment partially narrows it
  observed_max: number | null;
}

// For per_objective contracts — pays out when the client hits a specific milestone
export interface Objective {
  id: string;
  description: string;
  payout: number;
  condition_key: string;    // variant-defined condition identifier (e.g. 'album_platinum')
  is_met: boolean;
  // set to true after the payout has been credited — prevents double-payment
  is_paid: boolean;
}

// The proposed terms attached to a contract_offer DecisionItem. The player reads this
// before deciding. On Approve the engine promotes it to an active Contract.
// All fields except counterparty_posture are fully visible to the player (PRD §3.3).
export interface ContractDraft {
  tier: ContractTier;
  client_id: string;
  entity_id: string | null;         // null on agent<->client tier
  payout_type: PayoutType;
  your_cut: number | null;          // % on agent<->client tier only
  amount: number;
  duration: number;                 // in turns
  objectives: Omit<Objective, 'id' | 'is_met'>[];
  obligations_per_turn: number;
  counterparty_posture: FoggedPosture;
  default_on_ignore: 'reject' | 'client_leaves' | 'lapse' | string;
  expires_in: number | null;
  // Non-null means the contract prohibits signing another deal with this scope (e.g. 'label', 'sponsor')
  exclusivity_scope: string | null;
}

// An active contract — promoted from a ContractDraft on Approve.
export interface Contract {
  id: string;
  tier: ContractTier;
  client_id: string;
  entity_id: string | null;
  payout_type: PayoutType;
  your_cut: number | null;
  amount: number;
  duration_remaining: number;       // counts down each Upkeep phase
  objectives: Objective[];
  obligations_per_turn: number;
  counterparty_posture: FoggedPosture;
  default_on_ignore: string;
  expires_in: number | null;
  exclusivity_scope: string | null;
  turns_active: number;
}

// The terms a player proposes when countering a contract offer.
// Only include fields the player actually changed — undefined = keep original.
export interface CounterTerms {
  payout_type?: PayoutType;
  amount?: number;
  your_cut?: number | null;
  duration?: number;
  obligations_per_turn?: number;
}

// The fogged acceptance-probability range shown to the player after computing counter terms.
// true_probability is engine-only and never sent to the UI layer.
export interface CounterAcceptanceRange {
  true_probability: number;   // 0–1; never exposed
  observed_min: number;       // 0–1; lower bound shown to player
  observed_max: number;       // 0–1; upper bound shown to player
}

// Variant manifest blueprint. The engine samples concrete values from these ranges,
// scaled by the relevant client stats and agent Reputation, to produce a ContractDraft.
export interface ContractTemplate {
  key: string;
  tier: ContractTier;
  payout_type: PayoutType;
  // ranges the engine samples from; scaling factors shift the distribution
  amount_range: [number, number];
  duration_range: [number, number];     // in turns
  cut_range: [number, number] | null;   // null on client<->entity tier
  obligations_range: [number, number];
  // which client stats scale the generated amount up or down
  talent_scaling: number;
  form_scaling: number;
  marketability_scaling: number;
  // minimum agent Reputation required for this offer to be generated at all
  rep_gate: number;
  valid_arc_stages: ArcStage[];
  default_on_ignore: string;
  expires_in: number | null;
  // If set, the contract includes this exclusivity clause (e.g. 'label', 'sponsor')
  exclusivity_scope?: string | null;
  // Milestone objectives attached to this contract regardless of payout_type;
  // payouts are computed as payout_fraction * generated amount
  objective_templates?: ObjectiveTemplate[];
}
