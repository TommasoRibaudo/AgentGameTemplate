import { VariantManifest } from '../../types/manifest';

// Sports agent variant — represents athletes, brokers club & sponsorship deals.
// Engine-invariant: same 4 core stats, same arc stages, same turn structure.

export const SPORTS_MANIFEST: VariantManifest = {
  id:      'sports_v1',
  name:    'Sports Agent',
  version: '1.0.0',

  // ── Labels ──────────────────────────────────────────────────────────────────

  labels: {
    client:     'Athlete',
    entity:     'Club',
    agent:      'Agent',
    money:      'Budget',
    reputation: 'Prestige',
    audience:   'Followers',
    stat_labels: {
      talent:        'Athleticism',
      form:          'Match Form',
      marketability: 'Brand Value',
      morale:        'Morale',
    },
  },

  // ── Stat sub-attributes ──────────────────────────────────────────────────────

  stat_sub_attributes: [
    { key: 'speed',            label: 'Speed',            maps_to: 'talent',        weight: 0.35 },
    { key: 'technique',        label: 'Technical Skill',  maps_to: 'talent',        weight: 0.35 },
    { key: 'physicality',      label: 'Physicality',      maps_to: 'talent',        weight: 0.30 },
    { key: 'match_fitness',    label: 'Match Fitness',    maps_to: 'form',          weight: 0.60 },
    { key: 'confidence',       label: 'Confidence',       maps_to: 'form',          weight: 0.40 },
    { key: 'social_media',     label: 'Social Following', maps_to: 'marketability', weight: 0.50 },
    { key: 'commercial_appeal',label: 'Commercial Appeal',maps_to: 'marketability', weight: 0.50 },
    // Morale is tracked directly; no sub-attributes.
  ],

  // ── Entity types ─────────────────────────────────────────────────────────────

  entity_types: [
    { key: 'football_club',   label: 'Football Club',   valid_payout_types: ['per_month'] },
    { key: 'sportswear_brand',label: 'Sportswear Brand',valid_payout_types: ['lump_sum'] },
    { key: 'sports_media',    label: 'Sports Media',    valid_payout_types: ['per_objective'] },
  ],

  // ── Campaign types ────────────────────────────────────────────────────────────

  campaign_types: [
    {
      key:          'pre_season_training',
      label:        'Pre-Season Training',
      total_turns:  4,
      form_weight:  0.6,
      variance:     10,
      base_payout:  12_000,
      payout_type:  'per_month',
      per_installment_stat_deltas: { talent: 1, form: 1 },
      event_trigger_threshold:  30,
      trait_trigger_threshold:  88,
      valid_arc_stages: ['rising', 'peak'],
    },
    {
      key:          'match_season',
      label:        'Match Season',
      total_turns:  8,
      form_weight:  0.9,
      variance:     18,
      base_payout:  45_000,
      payout_type:  'per_month',
      per_installment_stat_deltas: { form: 1, morale: -1 },
      event_trigger_threshold:  28,
      trait_trigger_threshold:  90,
      valid_arc_stages: ['peak'],
    },
    {
      key:          'media_campaign',
      label:        'Media Campaign',
      total_turns:  3,
      form_weight:  0.4,
      variance:     12,
      base_payout:  25_000,
      payout_type:  'per_month',
      per_installment_stat_deltas: { marketability: 2 },
      event_trigger_threshold:  25,
      trait_trigger_threshold:  85,
      valid_arc_stages: ['rising', 'peak', 'declining'],
    },
    {
      key:          'charity_event',
      label:        'Charity Event',
      total_turns:  2,
      form_weight:  0.3,
      variance:     8,
      base_payout:  5_000,
      payout_type:  'per_month',
      per_installment_stat_deltas: { marketability: 1, morale: 2 },
      event_trigger_threshold:  20,
      trait_trigger_threshold:  80,
      valid_arc_stages: ['rising', 'peak', 'declining'],
    },
  ],

  // ── Trait library ─────────────────────────────────────────────────────────────

  traits: [
    {
      key:                    'consistent',
      label:                  'Consistent Performer',
      stat_modifiers:         { form: 2 },
      marketability_modifier: 1,
      event_bias:             { client: 0.8 },
      trigger_condition_key:  'sustained_form',
      trigger_threshold:      82,
    },
    {
      key:                    'fan_favourite',
      label:                  'Fan Favourite',
      stat_modifiers:         { morale: 3 },
      marketability_modifier: 5,
      event_bias:             { market: 0.7 },
      trigger_condition_key:  'crowd_pleaser',
      trigger_threshold:      80,
    },
    {
      key:                    'pressure_player',
      label:                  'Clutch Performer',
      stat_modifiers:         { form: 3 },
      marketability_modifier: 2,
      event_bias:             {},
      trigger_condition_key:  'clutch_moment',
      trigger_threshold:      88,
    },
    {
      key:                    'injury_prone',
      label:                  'Injury Prone',
      stat_modifiers:         { form: -2, morale: -2 },
      marketability_modifier: -2,
      event_bias:             { client: 1.5 },
      trigger_condition_key:  'repeated_injury',
      trigger_threshold:      15,
    },
  ],

  // ── Event library ─────────────────────────────────────────────────────────────

  events: [
    {
      key:                  'minor_injury',
      category:             'client',
      severity:             'minor',
      description_template: '{client_name} has picked up a knock in training. Limited availability this week.',
      options: [
        { key: 'rest',         label: 'Rest & Recover',  outcome: { money_delta: -500, reputation_delta:  0, stat_deltas: { form: -1, morale:  2 } } },
        { key: 'push_through', label: 'Play Through It', outcome: { money_delta:    0, reputation_delta:  1, stat_deltas: { form:  1, talent: -1 } } },
      ],
      default_outcome: { money_delta: -500, reputation_delta: -1, stat_deltas: { form: -2 } },
      defense_track_key: 'medical',
    },
    {
      key:                  'serious_injury',
      category:             'client',
      severity:             'crisis',
      description_template: '{client_name} has suffered a serious injury. Season at risk.',
      options: [
        { key: 'full_rest',       label: 'Full Rest Protocol',  outcome: { money_delta: -5000, reputation_delta: -1, stat_deltas: { form: -5 } } },
        { key: 'seek_treatment',  label: 'Specialist Treatment', outcome: { money_delta: -5000, reputation_delta:  0, stat_deltas: { form: -3, morale: 2 } } },
      ],
      default_outcome: { money_delta: -5000, reputation_delta: -3, stat_deltas: { form: -5, talent: -2 } },
      defense_track_key: 'medical',
    },
    {
      key:                  'form_slump',
      category:             'client',
      severity:             'minor',
      description_template: '{client_name} is struggling for form. The manager is losing patience.',
      options: [
        { key: 'extra_training', label: 'Extra Training',   outcome: { money_delta: -500, reputation_delta: 0, stat_deltas: { form:  2, morale: -1 } } },
        { key: 'mental_reset',   label: 'Mental Reset',     outcome: { money_delta: -500, reputation_delta: 0, stat_deltas: { morale: 3, form:   1 } } },
      ],
      default_outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { form: -2, morale: -1 } },
      defense_track_key: null,
    },
    {
      key:                  'transfer_speculation',
      category:             'market',
      severity:             'minor',
      description_template: 'Transfer rumours are swirling around {client_name}. A rival club is making enquiries.',
      options: [
        { key: 'deny',      label: 'Deny Publicly',    outcome: { money_delta:   0, reputation_delta:  0, stat_deltas: { morale:  1 } } },
        { key: 'entertain', label: 'Entertain Offers', outcome: { money_delta: 500, reputation_delta:  1, stat_deltas: { morale:  2 } } },
      ],
      default_outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -1 } },
      defense_track_key: 'pr',
    },
    {
      key:                  'media_scandal',
      category:             'client',
      severity:             'major',
      description_template: '{client_name} is involved in a media controversy. Damage control needed.',
      options: [
        { key: 'public_apology', label: 'Public Apology', outcome: { money_delta: -2000, reputation_delta: -1, stat_deltas: { marketability:  1 } } },
        { key: 'no_comment',     label: 'No Comment',     outcome: { money_delta:     0, reputation_delta: -3, stat_deltas: { marketability: -2 } } },
      ],
      default_outcome: { money_delta: -2000, reputation_delta: -4, stat_deltas: { marketability: -3 } },
      defense_track_key: 'pr',
    },
    {
      key:                  'breakthrough_performance',
      category:             'windfall',
      severity:             'minor',
      description_template: '{client_name} delivered a standout performance. Offers are flooding in.',
      options: [
        { key: 'capitalise',   label: 'Capitalise',    outcome: { money_delta: 1000, reputation_delta:  3, stat_deltas: { marketability: 3, morale: 2 } } },
        { key: 'stay_focused', label: 'Stay Focused',  outcome: { money_delta:    0, reputation_delta:  2, stat_deltas: { form: 2 } } },
      ],
      default_outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 1 } },
      defense_track_key: null,
    },
    {
      key:                  'contract_dispute',
      category:             'agency',
      severity:             'major',
      description_template: 'Your contract with {client_name} is under dispute. Renegotiation required.',
      options: [
        { key: 'renegotiate', label: 'Renegotiate',  outcome: { money_delta: -2000, reputation_delta:  0, stat_deltas: {} } },
        { key: 'hold_firm',   label: 'Hold Firm',    outcome: { money_delta:     0, reputation_delta: -2, stat_deltas: { morale: -2 } } },
      ],
      default_outcome: { money_delta: -2000, reputation_delta: -3, stat_deltas: { morale: -3 } },
      defense_track_key: 'legal',
    },
    {
      key:                  'sponsorship_windfall',
      category:             'windfall',
      severity:             'minor',
      description_template: 'A major brand has approached {client_name} for an unexpected partnership.',
      options: [
        { key: 'accept',  label: 'Accept Deal',   outcome: { money_delta: 2000, reputation_delta:  2, stat_deltas: { marketability: 2 } } },
        { key: 'decline', label: 'Stay Focused',  outcome: { money_delta:    0, reputation_delta:  0, stat_deltas: { morale: 1 } } },
      ],
      default_outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: {} },
      defense_track_key: null,
    },
  ],

  // ── Contract templates ────────────────────────────────────────────────────────

  contract_templates: [
    {
      key:                  'athlete_signing',
      tier:                 'agent_client',
      payout_type:          'per_month',
      amount_range:         [1_500, 4_000],
      duration_range:       [24, 48],
      cut_range:            [10, 20],
      obligations_range:    [500, 1_500],
      talent_scaling:       0.5,
      form_scaling:         0.3,
      marketability_scaling:0.2,
      rep_gate:             0,
      valid_arc_stages:     ['rising', 'peak', 'declining'],
      default_on_ignore:    'reject',
      expires_in:           3,
    },
    {
      key:                  'club_contract',
      tier:                 'client_entity',
      payout_type:          'per_month',
      amount_range:         [10_000, 80_000],
      duration_range:       [12, 36],
      cut_range:            null,
      obligations_range:    [1_000, 3_000],
      talent_scaling:       0.6,
      form_scaling:         0.3,
      marketability_scaling:0.1,
      rep_gate:             0,
      valid_arc_stages:     ['rising', 'peak'],
      default_on_ignore:    'lapse',
      expires_in:           2,
    },
    {
      key:                  'sponsorship_deal',
      tier:                 'client_entity',
      payout_type:          'lump_sum',
      amount_range:         [15_000, 120_000],
      duration_range:       [6, 24],
      cut_range:            null,
      obligations_range:    [500, 1_500],
      talent_scaling:       0.1,
      form_scaling:         0.2,
      marketability_scaling:0.7,
      rep_gate:             25,
      valid_arc_stages:     ['peak'],
      default_on_ignore:    'reject',
      expires_in:           2,
    },
    {
      key:                  'media_appearance_deal',
      tier:                 'client_entity',
      payout_type:          'per_objective',
      amount_range:         [5_000, 30_000],
      duration_range:       [3, 12],
      cut_range:            null,
      obligations_range:    [200, 800],
      talent_scaling:       0.0,
      form_scaling:         0.2,
      marketability_scaling:0.8,
      rep_gate:             0,
      valid_arc_stages:     ['peak', 'declining'],
      default_on_ignore:    'reject',
      expires_in:           3,
    },
  ],

  // ── Board item templates ───────────────────────────────────────────────────────

  board_item_templates: [
    {
      key:                   'club_interest',
      type:                  'contract_offer',
      description_template:  '{entity_name} is interested in signing {client_name}. Discuss terms?',
      rep_gate:              0,
      valid_arc_stages:      ['rising', 'peak'],
      contract_template_key: 'club_contract',
      default_on_ignore_key: 'let_expire',
      expires_in:            2,
    },
    {
      key:                   'sponsorship_offer',
      type:                  'contract_offer',
      description_template:  'A sportswear brand wants {client_name} as a face of their campaign.',
      rep_gate:              25,
      valid_arc_stages:      ['peak'],
      contract_template_key: 'sponsorship_deal',
      default_on_ignore_key: 'let_expire',
      expires_in:            2,
    },
    {
      key:                   'media_appearance_offer',
      type:                  'contract_offer',
      description_template:  'A sports broadcaster wants {client_name} for a segment deal.',
      rep_gate:              0,
      valid_arc_stages:      ['peak', 'declining'],
      contract_template_key: 'media_appearance_deal',
      default_on_ignore_key: 'reject',
      expires_in:            3,
    },
    {
      key:                   'training_camp_request',
      type:                  'client_request',
      description_template:  '{client_name} wants to attend a specialist training camp this month.',
      rep_gate:              0,
      valid_arc_stages:      ['rising'],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in:            null,
    },
    {
      key:                   'press_scandal_response',
      type:                  'client_request',
      description_template:  'A press rumor about {client_name} is catching fire. Pick a response before sponsors react.',
      rep_gate:              0,
      valid_arc_stages:      ['rising', 'peak', 'declining'],
      contract_template_key: null,
      default_on_ignore_key: 'go_quiet',
      expires_in:            1,
    },
    {
      key:                   'loyalty_bonus_renewal',
      type:                  'renewal',
      description_template:  '{client_name} is approaching the end of their contract. Time to renew?',
      rep_gate:              0,
      valid_arc_stages:      ['peak', 'declining'],
      contract_template_key: 'athlete_signing',
      default_on_ignore_key: 'let_expire',
      expires_in:            2,
    },
    {
      key:                   'endorsement_extension',
      type:                  'renewal',
      description_template:  'The sponsorship deal for {client_name} is up for extension.',
      rep_gate:              25,
      valid_arc_stages:      ['peak'],
      contract_template_key: 'sponsorship_deal',
      default_on_ignore_key: 'let_expire',
      expires_in:            2,
    },
    // ── global opportunities (valid with any roster, including empty) ───────────
    {
      key:                   'scouting_event',
      type:                  'opportunity',
      description_template:  'A talent identification event is open to agents. Attend and build contacts?',
      rep_gate:              0,
      valid_arc_stages:      [],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in:            null,
    },
    {
      key:                   'agents_conference',
      type:                  'opportunity',
      description_template:  'The annual sports agents conference is happening this week. Network and learn?',
      rep_gate:              0,
      valid_arc_stages:      [],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in:            null,
    },
  ],

  // ── Economy config ────────────────────────────────────────────────────────────

  economy: {
    starting_money:              18_000,
    starting_reputation:         25,
    overhead_per_turn:           1_800,
    career_length:               48,
    event_base_rate:             0.18,
    credit_ceiling_rep_weight:   60,
    credit_ceiling_asset_weight: 0.25,
    debt_interest_rate:          0.05,
    agent_stat_upgrade_cost:     { money: 2_000, reputation: 5 },
    roster_slot_upgrade_cost:    { money: 5_000 },
    defense_track_upgrade_cost:  { money: 2_000, per_turn_recurring: 200 },
    income_satisfaction_threshold: 20_000,  // comfortable per_month entity income at peak arc stage
  },

  // ── Arc config ────────────────────────────────────────────────────────────────

  arc: {
    rising_to_peak_base_turns:    20, // athletes peak younger
    peak_to_declining_base_turns: 28,
    stage_multipliers: {
      rising:    { talent: 0.75, form: 0.75, marketability: 0.65, income: 0.55 },
      peak:      { talent: 1.00, form: 1.00, marketability: 1.00, income: 1.00 },
      declining: { talent: 0.85, form: 0.65, marketability: 0.75, income: 0.45 },
    },
  },
};
