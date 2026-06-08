import { ArcStage, CoreStatKey, EventCategory, EventSeverity, PayoutType, StatDeltas } from './primitives';
import { ContractTemplate } from './contract';

// Every variant must supply a manifest satisfying this interface.
// The engine validates the manifest at load time before a run starts.
// Variants MUST NOT extend core systems — only supply content + tuning (PRD §5.3).

// §5.1.1 — display labels for the fixed engine structures
export interface DomainLabels {
  client: string;       // e.g. 'Artist', 'Player', 'Actor'
  entity: string;       // e.g. 'Label', 'Club', 'Studio'
  agent: string;        // e.g. 'Manager', 'Agent'
  money: string;        // e.g. 'Cash', 'Budget'
  reputation: string;   // e.g. 'Clout', 'Prestige'
  stat_labels: Record<CoreStatKey, string>;
}

// §5.1.2 — domain sub-attributes that roll up to the four engine stats
export interface StatSubAttribute {
  key: string;
  label: string;
  maps_to: CoreStatKey;
  weight: number;       // contribution weight; weights for the same maps_to must sum to 1
}

// §5.1.3 — what kinds of entities clients can sign with
export interface EntityTypeDefinition {
  key: string;
  label: string;
  valid_payout_types: PayoutType[];
}

// §5.1.4 — campaign type definitions
export interface CampaignTypeDefinition {
  key: string;
  label: string;
  total_turns: number;
  // Form is the primary driver; variance is layered on top
  form_weight: number;
  variance: number;               // std deviation of the random component
  base_payout: number;
  payout_type: PayoutType;
  per_installment_stat_deltas: StatDeltas;
  // installment roll below this threshold triggers an event
  event_trigger_threshold: number;
  // installment roll above this threshold can trigger a trait grant
  trait_trigger_threshold: number;
  valid_arc_stages: ArcStage[];
}

// §5.1.5 — trait library entry
export interface TraitDefinition {
  key: string;
  label: string;
  stat_modifiers: StatDeltas;
  marketability_modifier: number;
  // multiplier on the base event probability per category (e.g. 'client' -> 1.5)
  event_bias: Partial<Record<EventCategory, number>>;
  // variant-defined key identifying what activity/outcome can grant this trait
  trigger_condition_key: string;
  // the installment/resolution roll must exceed this to trigger a grant check
  trigger_threshold: number;
}

// §5.1.6 — event library entry
export interface EventDefinition {
  key: string;
  category: EventCategory;
  severity: EventSeverity;
  description_template: string;   // may include {client_name} etc. for substitution
  option_keys: string[];
  // which defense track key (if any) mitigates this event's frequency and severity
  defense_track_key: string | null;
}

// §5.1.7 — decision board item template (offers, requests, opportunities, renewals)
export interface BoardItemTemplate {
  key: string;
  type: 'contract_offer' | 'client_request' | 'opportunity' | 'renewal';
  description_template: string;
  // minimum Reputation for this item to appear in the generation pool
  rep_gate: number;
  // arc stages of the client that allow this item to be generated
  valid_arc_stages: ArcStage[];
  // null means item is not a contract offer
  contract_template_key: string | null;
  default_on_ignore_key: string;
  expires_in: number | null;
}

// §5.1.8 — economy tuning (all open-question values live here)
export interface EconomyConfig {
  starting_money: number;
  starting_reputation: number;
  overhead_per_turn: number;
  career_length: number;
  event_base_rate: number;          // base probability (0–1) of an event per turn before exposure scaling
  // credit ceiling = (reputation * rep_weight) + (roster_asset_value * asset_weight)
  credit_ceiling_rep_weight: number;
  credit_ceiling_asset_weight: number;
  debt_interest_rate: number;
  agent_stat_upgrade_cost: { money: number; reputation: number };
  roster_slot_upgrade_cost: { money: number };
  defense_track_upgrade_cost: { money: number; per_turn_recurring: number };
}

// §5.1.9 — arc tuning
export interface ArcConfig {
  // base turns before the arc stage advances; Form accelerates or delays this
  rising_to_peak_base_turns: number;
  peak_to_declining_base_turns: number;
  // multipliers applied to true stat values and income at each stage
  stage_multipliers: Record<ArcStage, {
    talent: number;
    form: number;
    marketability: number;
    income: number;
  }>;
}

// Root manifest — every variant must export a value satisfying this shape
export interface VariantManifest {
  id: string;
  name: string;
  version: string;

  labels: DomainLabels;
  stat_sub_attributes: StatSubAttribute[];
  entity_types: EntityTypeDefinition[];
  campaign_types: CampaignTypeDefinition[];
  traits: TraitDefinition[];
  events: EventDefinition[];
  board_item_templates: BoardItemTemplate[];
  contract_templates: ContractTemplate[];

  economy: EconomyConfig;
  arc: ArcConfig;
}
