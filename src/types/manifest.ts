import { ArcStage, CoreStatKey, EventCategory, EventSeverity, PayoutType, StatDeltas } from './primitives';
import { CampaignSize } from './campaign';
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
  audience: string;     // e.g. 'Fans', 'Followers', 'Viewers'
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
  release_kind?: 'album' | 'single' | 'mixtape';
  // When true, the client must have an active label contract to start this campaign.
  requires_label_contract?: boolean;
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
  // variant-specific display labels for each campaign size option
  size_labels?: Partial<Record<CampaignSize, string>>;
  // If set, startCampaign auto-links unmet objectives from any active client_entity contract
  // with this exclusivity_scope. Also gates start: if the scope is configured but no matching
  // contract is active, the campaign cannot begin.
  auto_link_contract_scope?: string;
  // When true, this campaign type is not player-selectable; it can only be started by events.
  event_only?: boolean;
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
  // optional: also grant this trait from repeated decisions — once the player has chosen
  // option_key on template_key at least required_count times for this client, each
  // further choice rolls against probability (0–1) for a chance to grant the trait
  decision_trigger?: {
    template_key: string;
    option_key: string;
    required_count: number;
    probability: number;
  };
}

// §5.1.6 — event library entry

// Each option the player can choose; outcome is applied immediately on selection.
// This is the manifest-side definition; engine maps it to EventOption at runtime.
export interface EventOptionDefinition {
  key: string;
  label: string;
  outcome: {
    money_delta: number;
    reputation_delta: number;
    stat_deltas: StatDeltas;
    // Applies to a linked campaign's pending release plan when present.
    release_quality_delta?: number;
    // If true, resolving this option cancels the linked active campaign.
    cancels_campaign?: boolean;
  };
  result_description?: string | null;
}

export interface EventDefinition {
  key: string;
  category: EventCategory;
  severity: EventSeverity;
  description_template: string;   // may include {client_name} etc. for substitution
  // If present, this event can only fire while one of these campaign types is active.
  campaign_type_keys?: string[];
  // If present, this event can only fire when at least one active contract with this
  // exclusivity_scope exists; the event is targeted at that client.
  requires_active_scope?: string;
  options: EventOptionDefinition[];
  // fires when the turn ends with the event still unresolved
  default_outcome: {
    money_delta: number;
    reputation_delta: number;
    stat_deltas: StatDeltas;
    release_quality_delta?: number;
    cancels_campaign?: boolean;
  };
  // which defense track key (if any) mitigates this event's frequency and severity
  defense_track_key: string | null;
}

// §5.1.7 — decision board item template (offers, requests, opportunities, renewals)
export interface BoardItemTemplate {
  key: string;
  type: 'contract_offer' | 'client_request' | 'opportunity' | 'renewal';
  description_template: string;
  // If present, this decision can only appear while one of these campaign types is active.
  campaign_type_keys?: string[];
  // If present, this decision can only appear for a client with a matching completed catalog release.
  requires_catalog_release_kind?: ('album' | 'single' | 'mixtape')[];
  // If present, at least one roster client must have an active contract with this exclusivity_scope.
  requires_active_scope?: string;
  // If true, fires at most once per run — permanently filtered out after its first appearance.
  one_time?: boolean;
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
  // "comfortable" entity per_week income for a peak-arc client; scaled by arc income multiplier for other stages
  income_satisfaction_threshold: number;
}

// §5.1.9 — arc tuning
export interface ArcConfig {
  // base weeks before the arc stage advances; Form accelerates or delays this
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

// §5.1.4b — two-card campaign category system (optional; variants without this fall back to flat list)

export interface CampaignCategoryConditions {
  has_label?: boolean;
  min_audience?: number;
  min_turns?: number;
  max_turns?: number;
  valid_arc_stages?: ArcStage[];
}

export interface CampaignRoutingRule {
  type_key: string;
  conditions: CampaignCategoryConditions;
  size_names: Record<CampaignSize, string>;
}

export interface CampaignCategoryDefinition {
  category: string;
  display_label: string;
  routing_rules: CampaignRoutingRule[];
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
  // Minimum budget floor per campaign size. Defaults to 500 for any size not specified.
  budget_floors?: Partial<Record<CampaignSize, number>>;
  // When present, the Campaign tab shows two category cards instead of a flat type list.
  campaign_categories?: CampaignCategoryDefinition[];
}
