import { VariantManifest } from '../../types/manifest';

// Music industry variant — minimal but fully playable.
// All numeric values are placeholders to be tuned in Phase 5 playtesting.

export const MUSIC_MANIFEST: VariantManifest = {
  id:      'music_v1',
  name:    'Music Manager',
  version: '1.0.0',

  // ── Labels ──────────────────────────────────────────────────────────────────

  labels: {
    client:     'Artist',
    entity:     'Label',
    agent:      'Manager',
    money:      'Cash',
    reputation: 'Clout',
    audience:   'Fans',
    stat_labels: {
      talent:        'Raw Talent',
      form:          'Current Form',
      marketability: 'Marketability',
      morale:        'Morale',
    },
  },

  // ── Stat sub-attributes ──────────────────────────────────────────────────────
  // Weights per maps_to group must sum to 1.0.

  stat_sub_attributes: [
    { key: 'vocal',       label: 'Vocal Ability',   maps_to: 'talent',        weight: 0.35 },
    { key: 'songwriting', label: 'Songwriting',      maps_to: 'talent',        weight: 0.35 },
    { key: 'performance', label: 'Stage Performance',maps_to: 'talent',        weight: 0.30 },
    { key: 'buzz',        label: 'Buzz',             maps_to: 'form',          weight: 1.00 },
    { key: 'fanbase',     label: 'Fanbase Size',     maps_to: 'marketability', weight: 0.50 },
    { key: 'brand',       label: 'Brand Appeal',     maps_to: 'marketability', weight: 0.50 },
    // Morale is tracked directly by the engine; no sub-attributes.
  ],

  // ── Entity types ─────────────────────────────────────────────────────────────

  entity_types: [
    { key: 'record_label',       label: 'Record Label',       valid_payout_types: ['per_month'] },
    { key: 'streaming_platform', label: 'Streaming Platform', valid_payout_types: ['per_objective'] },
    { key: 'sponsor',            label: 'Sponsor',            valid_payout_types: ['lump_sum'] },
  ],

  // ── Campaign types ────────────────────────────────────────────────────────────

  campaign_types: [
    {
      key:          'album_cycle',
      label:        'Album Cycle',
      release_kind: 'album',
      total_turns:  10,
      form_weight:  0.8,
      variance:     15,
      base_payout:  4_000,
      payout_type:  'per_month',
      per_installment_stat_deltas: { marketability: 1 },
      event_trigger_threshold: 35,
      trait_trigger_threshold: 85,
      valid_arc_stages: ['rising', 'peak'],
    },
    {
      key:          'tour',
      label:        'World Tour',
      total_turns:  6,
      form_weight:  0.9,
      variance:     12,
      base_payout:  2_500,  // at form~60 yields ~$9k over full tour
      payout_type:  'per_month',
      per_installment_stat_deltas: { form: 1, morale: -1 },
      event_trigger_threshold: 30,
      trait_trigger_threshold: 88,
      valid_arc_stages: ['peak', 'declining'],
    },
    {
      key:          'single_release',
      label:        'Single Release',
      release_kind: 'single',
      total_turns:  2,
      form_weight:  0.7,
      variance:     20,
      base_payout:  1_000,
      payout_type:  'per_month',
      per_installment_stat_deltas: {},
      event_trigger_threshold: 30,
      trait_trigger_threshold: 88,
      valid_arc_stages: ['rising', 'peak', 'declining'],
    },
  ],

  // ── Trait library (8 traits) ──────────────────────────────────────────────────

  traits: [
    {
      key:                    'viral_moment',
      label:                  'Viral Moment',
      stat_modifiers:         { marketability: 8 },
      marketability_modifier: 0,
      event_bias:             { market: 1.2 },
      trigger_condition_key:  'single_release',
      trigger_threshold:      85,
    },
    {
      key:                    'critically_acclaimed',
      label:                  'Critically Acclaimed',
      stat_modifiers:         { talent: 5, marketability: 5 },
      marketability_modifier: 0,
      event_bias:             {},
      trigger_condition_key:  'album_cycle',
      trigger_threshold:      88,
    },
    {
      key:                    'touring_machine',
      label:                  'Touring Machine',
      stat_modifiers:         { form: 5, morale: 5 },
      marketability_modifier: 0,
      event_bias:             { client: 0.7 },
      trigger_condition_key:  'tour',
      trigger_threshold:      85,
    },
    {
      key:                    'fan_favourite',
      label:                  'Fan Favourite',
      stat_modifiers:         { marketability: 10 },
      marketability_modifier: 0,
      event_bias:             {},
      trigger_condition_key:  'single_release',
      trigger_threshold:      82,
    },
    {
      key:                    'prolific',
      label:                  'Prolific',
      stat_modifiers:         { talent: 3, form: 3 },
      marketability_modifier: 0,
      event_bias:             {},
      trigger_condition_key:  'album_cycle',
      trigger_threshold:      80,
    },
    {
      key:                    'stage_presence',
      label:                  'Stage Presence',
      stat_modifiers:         { form: 5, marketability: 3 },
      marketability_modifier: 0,
      event_bias:             {},
      trigger_condition_key:  'tour',
      trigger_threshold:      80,
    },
    {
      key:                    'sonic_innovator',
      label:                  'Sonic Innovator',
      stat_modifiers:         { talent: 8, marketability: 2 },
      marketability_modifier: 0,
      event_bias:             {},
      trigger_condition_key:  'album_cycle',
      trigger_threshold:      90,
    },
    {
      key:                    'media_magnet',
      label:                  'Media Magnet',
      stat_modifiers:         { marketability: 12 },
      marketability_modifier: 0,
      event_bias:             { market: 1.4 },
      trigger_condition_key:  'single_release',
      trigger_threshold:      88,
    },
  ],

  // ── Event library (12 events, 4 categories × 3 severity) ─────────────────────

  events: [
    // ── client events (medical track)
    {
      key:                  'artist_fatigue',
      category:             'client',
      severity:             'minor',
      description_template: '{client_name} is showing signs of fatigue.',
      options: [
        { key: 'rest',         label: 'Schedule Rest',  outcome: { money_delta: -500,  reputation_delta:  0, stat_deltas: { form: -1, morale:  3 } } },
        { key: 'push_through', label: 'Push Through',   outcome: { money_delta:     0, reputation_delta:  1, stat_deltas: { form:  1, morale: -3 } } },
      ],
      default_outcome: { money_delta: -500, reputation_delta: -1, stat_deltas: { form: -2, morale: -2 } },
      defense_track_key: 'medical',
    },
    {
      key:                  'artist_burnout',
      category:             'client',
      severity:             'major',
      description_template: '{client_name} is on the verge of burnout.',
      options: [
        { key: 'hiatus',   label: 'Schedule Hiatus', outcome: { money_delta: -2000, reputation_delta: -1, stat_deltas: { morale:  8, form: -3 } } },
        { key: 'therapy',  label: 'Book Therapy',    outcome: { money_delta: -2000, reputation_delta:  0, stat_deltas: { morale:  5 } } },
        { key: 'ignore',   label: 'Ignore It',       outcome: { money_delta:     0, reputation_delta: -2, stat_deltas: { morale: -5, form: -3 } } },
      ],
      default_outcome: { money_delta: -2000, reputation_delta: -3, stat_deltas: { morale: -8, form: -5 } },
      defense_track_key: 'medical',
    },
    {
      key:                  'album_deadline_pressure',
      category:             'client',
      severity:             'minor',
      description_template: '{client_name} is under pressure to finish the album sessions on time.',
      campaign_type_keys:   ['album_cycle'],
      options: [
        { key: 'book_extra_studio', label: 'Book Extra Studio Time', outcome: { money_delta: -1500, reputation_delta: 0, stat_deltas: { form: 2, morale: 1 } } },
        { key: 'trim_scope',        label: 'Trim the Scope',         outcome: { money_delta:     0, reputation_delta: 0, stat_deltas: { form: -1, morale: 2 } } },
        { key: 'push_deadline',     label: 'Push the Deadline',      outcome: { money_delta:  -500, reputation_delta: -1, stat_deltas: { morale: -1 } } },
      ],
      default_outcome: { money_delta: -500, reputation_delta: -1, stat_deltas: { form: -1, morale: -2 } },
      defense_track_key: 'medical',
    },
    {
      key:                  'health_crisis',
      category:             'client',
      severity:             'crisis',
      description_template: '{client_name} has been hospitalised. The world is watching.',
      options: [
        { key: 'release_statement', label: 'Release Statement', outcome: { money_delta: -5000, reputation_delta: -1, stat_deltas: { morale:  3 } } },
        { key: 'no_comment',        label: 'No Comment',        outcome: { money_delta:     0, reputation_delta: -5, stat_deltas: { morale: -3 } } },
      ],
      default_outcome: { money_delta: -5000, reputation_delta: -5, stat_deltas: { morale: -5, form: -5 } },
      defense_track_key: 'medical',
    },
    // ── market events (pr track)
    {
      key:                  'negative_review',
      category:             'market',
      severity:             'minor',
      description_template: 'A music critic published a scathing review of {client_name}\'s recent work.',
      options: [
        { key: 'respond', label: 'Respond Publicly', outcome: { money_delta: -500, reputation_delta:  1, stat_deltas: { marketability:  1 } } },
        { key: 'ignore',  label: 'Ignore It',        outcome: { money_delta:    0, reputation_delta: -1, stat_deltas: { marketability: -1 } } },
      ],
      default_outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: { marketability: -2 } },
      defense_track_key: 'pr',
    },
    {
      key:                  'social_controversy',
      category:             'market',
      severity:             'major',
      description_template: '{client_name} is trending for the wrong reasons.',
      options: [
        { key: 'issue_apology', label: 'Issue Apology',  outcome: { money_delta: -2000, reputation_delta: -1, stat_deltas: { marketability:  2 } } },
        { key: 'double_down',   label: 'Double Down',    outcome: { money_delta:     0, reputation_delta: -3, stat_deltas: { marketability:  3 } } },
        { key: 'go_quiet',      label: 'Go Quiet',       outcome: { money_delta:     0, reputation_delta: -2, stat_deltas: { marketability: -2 } } },
      ],
      default_outcome: { money_delta: -2000, reputation_delta: -4, stat_deltas: { marketability: -4 } },
      defense_track_key: 'pr',
    },
    {
      key:                  'major_scandal',
      category:             'market',
      severity:             'crisis',
      description_template: 'A major scandal has engulfed {client_name}. Endorsements are at risk.',
      options: [
        { key: 'crisis_pr',           label: 'Crisis PR Team',       outcome: { money_delta: -5000, reputation_delta: -2, stat_deltas: { marketability: -2 } } },
        { key: 'deny',                label: 'Deny Everything',      outcome: { money_delta:     0, reputation_delta: -5, stat_deltas: { marketability: -3 } } },
        { key: 'accept_consequences', label: 'Accept Consequences',  outcome: { money_delta: -5000, reputation_delta: -3, stat_deltas: { marketability:  2 } } },
      ],
      default_outcome: { money_delta: -5000, reputation_delta: -6, stat_deltas: { marketability: -5 } },
      defense_track_key: 'pr',
    },
    // ── agency events (legal track)
    {
      key:                  'contract_dispute',
      category:             'agency',
      severity:             'minor',
      description_template: 'A minor contract dispute has emerged with a partner.',
      options: [
        { key: 'settle',  label: 'Settle Quickly', outcome: { money_delta: -500, reputation_delta:  0, stat_deltas: {} } },
        { key: 'contest', label: 'Contest It',     outcome: { money_delta:    0, reputation_delta:  1, stat_deltas: {} } },
      ],
      default_outcome: { money_delta: -500, reputation_delta: -2, stat_deltas: {} },
      defense_track_key: 'legal',
    },
    {
      key:                  'label_pressure',
      category:             'agency',
      severity:             'major',
      description_template: 'A label is threatening to pull the deal over creative differences.',
      options: [
        { key: 'negotiate',  label: 'Negotiate',    outcome: { money_delta: -2000, reputation_delta:  0, stat_deltas: {} } },
        { key: 'walk_away',  label: 'Walk Away',    outcome: { money_delta:     0, reputation_delta: -2, stat_deltas: { morale:  2 } } },
        { key: 'concede',    label: 'Concede',      outcome: { money_delta:     0, reputation_delta: -1, stat_deltas: { morale: -2 } } },
      ],
      default_outcome: { money_delta: -2000, reputation_delta: -3, stat_deltas: { morale: -3 } },
      defense_track_key: 'legal',
    },
    {
      key:                  'agency_lawsuit',
      category:             'agency',
      severity:             'crisis',
      description_template: 'Your agency has been named in a major industry lawsuit.',
      options: [
        { key: 'fight',               label: 'Fight It',          outcome: { money_delta: -5000, reputation_delta:  0, stat_deltas: {} } },
        { key: 'settle_out_of_court', label: 'Settle Out of Court', outcome: { money_delta: -5000, reputation_delta: -2, stat_deltas: {} } },
      ],
      default_outcome: { money_delta: -5000, reputation_delta: -5, stat_deltas: {} },
      defense_track_key: 'legal',
    },
    // ── windfall events (no defense needed)
    {
      key:                  'award_nomination',
      category:             'windfall',
      severity:             'minor',
      description_template: '{client_name} has received an unexpected award nomination.',
      options: [
        { key: 'celebrate',    label: 'Celebrate Publicly', outcome: { money_delta: -500, reputation_delta:  3, stat_deltas: { morale: 3, marketability: 2 } } },
        { key: 'stay_focused', label: 'Stay Focused',       outcome: { money_delta:    0, reputation_delta:  2, stat_deltas: { form: 2 } } },
      ],
      default_outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { morale: 1 } },
      defense_track_key: null,
    },
    {
      key:                  'brand_inquiry',
      category:             'windfall',
      severity:             'major',
      description_template: 'A major global brand has reached out to discuss a partnership with {client_name}.',
      options: [
        { key: 'engage', label: 'Engage the Brand', outcome: { money_delta: 2000, reputation_delta: 2, stat_deltas: { marketability: 3 } } },
        { key: 'pass',   label: 'Stay Artistic',    outcome: { money_delta:    0, reputation_delta: 0, stat_deltas: { form: 2 } } },
      ],
      default_outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: {} },
      defense_track_key: null,
    },
    {
      key:                  'streaming_viral',
      category:             'windfall',
      severity:             'minor',
      description_template: '{client_name}\'s back catalog is suddenly trending across streaming platforms.',
      options: [
        { key: 'capitalise',   label: 'Capitalise Now',  outcome: { money_delta: 500, reputation_delta: 2, stat_deltas: { marketability: 3 } } },
        { key: 'let_it_ride',  label: 'Let It Ride',     outcome: { money_delta:   0, reputation_delta: 1, stat_deltas: { form: 1, marketability: 1 } } },
      ],
      default_outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 1 } },
      defense_track_key: null,
    },
  ],

  // ── Contract templates (5) ────────────────────────────────────────────────────

  contract_templates: [
    {
      key:                  'label_deal_basic',
      tier:                 'client_entity',
      payout_type:          'per_month',
      amount_range:         [5_000, 15_000],
      duration_range:       [12, 24],
      cut_range:            null,
      obligations_range:    [0, 0],
      talent_scaling:       0.5,
      form_scaling:         0.3,
      marketability_scaling: 0.2,
      rep_gate:             0,
      valid_arc_stages:     ['rising', 'peak'],
      default_on_ignore:    'reject',
      expires_in:           3,
      exclusivity_scope:    'label',
      objective_templates:  [
        { description: 'Release one album during the deal', payout_fraction: 0.3, condition_key: 'album_released' },
      ],
    },
    {
      key:                  'label_deal_premium',
      tier:                 'client_entity',
      payout_type:          'per_month',
      amount_range:         [15_000, 50_000],
      duration_range:       [24, 48],
      cut_range:            null,
      obligations_range:    [0, 0],
      talent_scaling:       0.3,
      form_scaling:         0.3,
      marketability_scaling: 0.4,
      rep_gate:             50,
      valid_arc_stages:     ['peak'],
      default_on_ignore:    'reject',
      expires_in:           3,
      exclusivity_scope:    'label',
      objective_templates:  [
        { description: 'Release two albums during the deal', payout_fraction: 0.5, condition_key: 'two_albums_released' },
        { description: 'Reach 500k fans', payout_fraction: 0.3, condition_key: 'fans_500k' },
      ],
    },
    {
      key:                  'streaming_deal',
      tier:                 'client_entity',
      payout_type:          'per_objective',
      amount_range:         [0, 0],
      duration_range:       [6, 18],
      cut_range:            null,
      obligations_range:    [0, 0],
      talent_scaling:       0.4,
      form_scaling:         0.3,
      marketability_scaling: 0.3,
      rep_gate:             25,
      valid_arc_stages:     ['rising', 'peak', 'declining'],
      default_on_ignore:    'reject',
      expires_in:           2,
      exclusivity_scope:    null,
      objective_templates:  [],
    },
    {
      key:                  'sponsorship_basic',
      tier:                 'client_entity',
      payout_type:          'lump_sum',
      amount_range:         [10_000, 30_000],
      duration_range:       [4, 12],
      cut_range:            null,
      obligations_range:    [100, 300],
      talent_scaling:       0.1,
      form_scaling:         0.2,
      marketability_scaling: 0.7,
      rep_gate:             0,
      valid_arc_stages:     ['rising', 'peak', 'declining'],
      default_on_ignore:    'reject',
      expires_in:           3,
      exclusivity_scope:    'sponsor',
      objective_templates:  [],
    },
    {
      key:                  'agent_signing',
      tier:                 'agent_client',
      payout_type:          'per_month',
      amount_range:         [0, 0],
      duration_range:       [24, 48],
      cut_range:            [10, 20],
      obligations_range:    [200, 500],
      talent_scaling:       0.5,
      form_scaling:         0.3,
      marketability_scaling: 0.2,
      rep_gate:             0,
      valid_arc_stages:     ['rising', 'peak', 'declining'],
      default_on_ignore:    'reject',
      expires_in:           null,
      exclusivity_scope:    'management',
      objective_templates:  [],
    },
  ],

  // ── Board item templates (8, 2 per type) ─────────────────────────────────────

  board_item_templates: [
    // contract_offer
    {
      key:                   'new_label_signing',
      type:                  'contract_offer',
      description_template:  'A record label wants to sign {client_name}.',
      rep_gate:              0,
      valid_arc_stages:      ['rising'],
      contract_template_key: 'label_deal_basic',
      default_on_ignore_key: 'reject',
      expires_in:            3,
    },
    {
      key:                   'premium_label_offer',
      type:                  'contract_offer',
      description_template:  'A major label is making a premium offer for {client_name}.',
      rep_gate:              50,
      valid_arc_stages:      ['peak'],
      contract_template_key: 'label_deal_premium',
      default_on_ignore_key: 'reject',
      expires_in:            3,
    },
    // client_request
    {
      key:                   'creative_direction',
      type:                  'client_request',
      description_template:  '{client_name} wants your input on their next creative direction.',
      rep_gate:              0,
      valid_arc_stages:      ['rising', 'peak', 'declining'],
      contract_template_key: null,
      default_on_ignore_key: 'no_input',
      expires_in:            null,
    },
    {
      key:                   'recording_budget_request',
      type:                  'client_request',
      description_template:  '{client_name} is requesting a larger recording budget.',
      campaign_type_keys:    ['album_cycle'],
      rep_gate:              25,
      valid_arc_stages:      ['rising', 'peak'],
      contract_template_key: null,
      default_on_ignore_key: 'decline',
      expires_in:            2,
    },
    {
      key:                   'scandal_denial',
      type:                  'client_request',
      description_template:  'A rumor about {client_name} is spreading. Decide how to respond before it defines the story.',
      rep_gate:              0,
      valid_arc_stages:      ['rising', 'peak', 'declining'],
      contract_template_key: null,
      default_on_ignore_key: 'go_quiet',
      expires_in:            1,
    },
    // opportunity
    {
      key:                   'streaming_opportunity',
      type:                  'opportunity',
      description_template:  'A streaming platform is offering {client_name} an exclusive deal.',
      rep_gate:              25,
      valid_arc_stages:      ['rising', 'peak'],
      contract_template_key: 'streaming_deal',
      default_on_ignore_key: 'pass',
      expires_in:            2,
    },
    {
      key:                   'sponsorship_opportunity',
      type:                  'opportunity',
      description_template:  'A brand is interested in sponsoring {client_name}.',
      rep_gate:              0,
      valid_arc_stages:      ['rising', 'peak', 'declining'],
      contract_template_key: 'sponsorship_basic',
      default_on_ignore_key: 'pass',
      expires_in:            3,
    },
    // renewal
    {
      key:                   'label_renewal',
      type:                  'renewal',
      description_template:  '{client_name}\'s label contract is up for renewal.',
      rep_gate:              0,
      valid_arc_stages:      ['peak', 'declining'],
      contract_template_key: 'label_deal_basic',
      default_on_ignore_key: 'let_expire',
      expires_in:            2,
    },
    {
      key:                   'management_renewal',
      type:                  'renewal',
      description_template:  '{client_name} wants to discuss renewing your management agreement.',
      rep_gate:              0,
      valid_arc_stages:      ['rising', 'peak', 'declining'],
      contract_template_key: 'agent_signing',
      default_on_ignore_key: 'let_expire',
      expires_in:            2,
    },
    // ── global opportunities (valid even with no roster clients) ────────────────
    {
      key:                   'industry_networking',
      type:                  'opportunity',
      description_template:  'An industry mixer is happening downtown. Attend and build connections?',
      rep_gate:              0,
      valid_arc_stages:      [],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in:            null,
    },
    {
      key:                   'artist_showcase',
      type:                  'opportunity',
      description_template:  'A talent showcase is open for submissions. Enter an emerging act?',
      rep_gate:              0,
      valid_arc_stages:      [],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in:            null,
    },
  ],

  // ── Economy config (Phase 5 tuning pass) ─────────────────────────────────────

  economy: {
    starting_money:              20_000,  // ~13 turns of runway before income is needed
    starting_reputation:         20,
    overhead_per_turn:           1_500,   // reduced to allow focus on talent acquisition early
    career_length:               60,
    event_base_rate:             0.15,
    credit_ceiling_rep_weight:   200,
    credit_ceiling_asset_weight: 0.1,
    debt_interest_rate:          0.08,
    agent_stat_upgrade_cost:     { money: 2_500, reputation: 5 },
    roster_slot_upgrade_cost:    { money: 5_000 },
    defense_track_upgrade_cost:  { money: 2_000, per_turn_recurring: 200 },
    income_satisfaction_threshold: 8_000,   // comfortable per_month entity income at peak arc stage
  },

  // ── Arc config (placeholder — tuned in Phase 5) ───────────────────────────────

  arc: {
    rising_to_peak_base_turns:    24,
    peak_to_declining_base_turns: 36,
    stage_multipliers: {
      rising:   { talent: 0.8, form: 0.8, marketability: 0.7, income: 0.6 },
      peak:     { talent: 1.0, form: 1.0, marketability: 1.0, income: 1.0 },
      declining:{ talent: 0.9, form: 0.7, marketability: 0.8, income: 0.5 },
    },
  },
};
