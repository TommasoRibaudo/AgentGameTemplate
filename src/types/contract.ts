import { ArcStage, ContractTier, PayoutType } from './primitives';

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
  turns_active: number;
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
}
