import { VariantManifest } from '../types/manifest';

// Valid infrastructure keys (must match InfrastructureUpgradeKey in progression.ts)
const VALID_INFRA_KEYS = new Set(['roster_slot', 'insurance', 'pr', 'legal', 'medical']);
const CORE_STAT_KEYS   = new Set(['talent', 'form', 'marketability', 'morale']);

// Weight sums must match 1.0 within this tolerance (float arithmetic)
const WEIGHT_SUM_TOLERANCE = 0.01;

function fail(message: string): never {
  throw new Error(`[ManifestValidator] ${message}`);
}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkCampaignTypeKeys(
  ownerLabel: string,
  keys: unknown,
  campaignTypeKeys: Set<string>,
): void {
  if (keys === undefined) return;
  check(Array.isArray(keys), `${ownerLabel} campaign_type_keys must be an array when provided`);
  for (const key of keys as unknown[]) {
    check(typeof key === 'string', `${ownerLabel} campaign_type_keys entries must be strings`);
    check(
      campaignTypeKeys.has(key),
      `${ownerLabel} references unknown campaign_type_key "${key}"`,
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function validateManifest(raw: unknown): VariantManifest {
  check(isObject(raw), 'Manifest must be a non-null object');

  // ── Top-level identity fields
  check(typeof raw.id      === 'string' && raw.id.length      > 0, 'manifest.id must be a non-empty string');
  check(typeof raw.name    === 'string' && raw.name.length    > 0, 'manifest.name must be a non-empty string');
  check(typeof raw.version === 'string' && raw.version.length > 0, 'manifest.version must be a non-empty string');

  // ── Labels
  check(isObject(raw.labels), 'manifest.labels must be an object');
  const lbl = raw.labels;
  check(typeof lbl.client     === 'string', 'manifest.labels.client must be a string');
  check(typeof lbl.entity     === 'string', 'manifest.labels.entity must be a string');
  check(typeof lbl.agent      === 'string', 'manifest.labels.agent must be a string');
  check(typeof lbl.money      === 'string', 'manifest.labels.money must be a string');
  check(typeof lbl.reputation === 'string', 'manifest.labels.reputation must be a string');
  check(isObject(lbl.stat_labels), 'manifest.labels.stat_labels must be an object');
  for (const key of CORE_STAT_KEYS) {
    check(
      typeof (lbl.stat_labels as Record<string, unknown>)[key] === 'string',
      `manifest.labels.stat_labels.${key} must be a string`,
    );
  }

  // ── Stat sub-attributes — weights per maps_to group must sum to 1.0
  check(Array.isArray(raw.stat_sub_attributes), 'manifest.stat_sub_attributes must be an array');
  const weightsByGroup: Record<string, number> = {};
  for (const attr of raw.stat_sub_attributes as unknown[]) {
    check(isObject(attr), 'Each stat_sub_attribute must be an object');
    check(typeof attr.key   === 'string', 'stat_sub_attribute.key must be a string');
    check(typeof attr.label === 'string', 'stat_sub_attribute.label must be a string');
    check(
      typeof attr.maps_to === 'string' && CORE_STAT_KEYS.has(attr.maps_to as string),
      `stat_sub_attribute.maps_to must be one of: ${[...CORE_STAT_KEYS].join(', ')}`,
    );
    check(
      typeof attr.weight === 'number' && (attr.weight as number) > 0,
      `stat_sub_attribute "${attr.key}" weight must be a positive number`,
    );
    weightsByGroup[attr.maps_to as string] = (weightsByGroup[attr.maps_to as string] ?? 0) + (attr.weight as number);
  }
  for (const [group, sum] of Object.entries(weightsByGroup)) {
    check(
      Math.abs(sum - 1.0) <= WEIGHT_SUM_TOLERANCE,
      `stat_sub_attributes for "${group}" must sum to 1.0 (got ${sum.toFixed(4)})`,
    );
  }

  // ── Entity types
  check(Array.isArray(raw.entity_types), 'manifest.entity_types must be an array');
  for (const et of raw.entity_types as unknown[]) {
    check(isObject(et), 'Each entity_type must be an object');
    check(typeof et.key   === 'string', 'entity_type.key must be a string');
    check(typeof et.label === 'string', 'entity_type.label must be a string');
    check(Array.isArray(et.valid_payout_types), 'entity_type.valid_payout_types must be an array');
  }

  // ── Campaign types
  check(Array.isArray(raw.campaign_types), 'manifest.campaign_types must be an array');
  const campaignTypeKeys = new Set<string>();
  for (const ct of raw.campaign_types as unknown[]) {
    check(isObject(ct), 'Each campaign_type must be an object');
    check(typeof ct.key === 'string', 'campaign_type.key must be a string');
    campaignTypeKeys.add(ct.key);
    if (ct.release_kind !== undefined) {
      check(
        ct.release_kind === 'album' || ct.release_kind === 'single',
        `campaign_type "${ct.key}" release_kind must be "album" or "single" when provided`,
      );
    }
    check(
      typeof ct.total_turns === 'number' && (ct.total_turns as number) > 0,
      `campaign_type "${ct.key}" total_turns must be > 0`,
    );
    check(typeof ct.form_weight === 'number', `campaign_type "${ct.key}" form_weight must be a number`);
    check(
      typeof ct.variance === 'number' && (ct.variance as number) >= 0,
      `campaign_type "${ct.key}" variance must be >= 0`,
    );
    check(
      typeof ct.base_payout === 'number' && (ct.base_payout as number) >= 0,
      `campaign_type "${ct.key}" base_payout must be >= 0`,
    );
    check(Array.isArray(ct.valid_arc_stages), `campaign_type "${ct.key}" valid_arc_stages must be an array`);
  }

  // ── Traits
  check(Array.isArray(raw.traits), 'manifest.traits must be an array');
  for (const t of raw.traits as unknown[]) {
    check(isObject(t), 'Each trait must be an object');
    check(typeof t.key   === 'string', 'trait.key must be a string');
    check(typeof t.label === 'string', 'trait.label must be a string');
    check(isObject(t.stat_modifiers), `trait "${t.key}" stat_modifiers must be an object`);
    check(typeof t.marketability_modifier === 'number', `trait "${t.key}" marketability_modifier must be a number`);
    check(typeof t.trigger_condition_key  === 'string', `trait "${t.key}" trigger_condition_key must be a string`);
    check(typeof t.trigger_threshold      === 'number', `trait "${t.key}" trigger_threshold must be a number`);
  }

  // ── Events — options array + default_outcome; defense_track_key must be null or valid infra key
  check(Array.isArray(raw.events), 'manifest.events must be an array');
  for (const ev of raw.events as unknown[]) {
    check(isObject(ev), 'Each event must be an object');
    check(typeof ev.key                  === 'string', 'event.key must be a string');
    check(typeof ev.category             === 'string', `event "${ev.key}" category must be a string`);
    check(typeof ev.severity             === 'string', `event "${ev.key}" severity must be a string`);
    check(typeof ev.description_template === 'string', `event "${ev.key}" description_template must be a string`);
    checkCampaignTypeKeys(`event "${ev.key}"`, ev.campaign_type_keys, campaignTypeKeys);
    check(Array.isArray(ev.options),                   `event "${ev.key}" options must be an array`);
    for (const opt of ev.options as unknown[]) {
      check(isObject(opt), `event "${ev.key}" each option must be an object`);
      check(typeof (opt as Record<string,unknown>).key   === 'string', `event "${ev.key}" option.key must be a string`);
      check(typeof (opt as Record<string,unknown>).label === 'string', `event "${ev.key}" option.label must be a string`);
      check(isObject((opt as Record<string,unknown>).outcome), `event "${ev.key}" option.outcome must be an object`);
    }
    check(isObject(ev.default_outcome), `event "${ev.key}" default_outcome must be an object`);
    if (ev.defense_track_key !== null) {
      check(
        typeof ev.defense_track_key === 'string' && VALID_INFRA_KEYS.has(ev.defense_track_key as string),
        `event "${ev.key}" defense_track_key "${ev.defense_track_key}" must be null or one of: ${[...VALID_INFRA_KEYS].join(', ')}`,
      );
    }
  }

  // ── Contract templates (built first so board items can cross-reference)
  check(Array.isArray(raw.contract_templates), 'manifest.contract_templates must be an array');
  const contractTemplateKeys = new Set<string>();
  for (const ct of raw.contract_templates as unknown[]) {
    check(isObject(ct), 'Each contract_template must be an object');
    check(typeof ct.key         === 'string',  'contract_template.key must be a string');
    check(typeof ct.tier        === 'string',  `contract_template "${ct.key}" tier must be a string`);
    check(typeof ct.payout_type === 'string',  `contract_template "${ct.key}" payout_type must be a string`);
    check(
      Array.isArray(ct.amount_range)      && (ct.amount_range      as unknown[]).length === 2,
      `contract_template "${ct.key}" amount_range must be a 2-element array`,
    );
    check(
      Array.isArray(ct.duration_range)    && (ct.duration_range    as unknown[]).length === 2,
      `contract_template "${ct.key}" duration_range must be a 2-element array`,
    );
    check(
      Array.isArray(ct.obligations_range) && (ct.obligations_range as unknown[]).length === 2,
      `contract_template "${ct.key}" obligations_range must be a 2-element array`,
    );
    contractTemplateKeys.add(ct.key as string);
  }

  // ── Board item templates — contract_template_key cross-reference
  check(Array.isArray(raw.board_item_templates), 'manifest.board_item_templates must be an array');
  for (const bit of raw.board_item_templates as unknown[]) {
    check(isObject(bit), 'Each board_item_template must be an object');
    check(typeof bit.key                  === 'string', 'board_item_template.key must be a string');
    check(typeof bit.type                 === 'string', `board_item_template "${bit.key}" type must be a string`);
    check(typeof bit.description_template === 'string', `board_item_template "${bit.key}" description_template must be a string`);
    checkCampaignTypeKeys(`board_item_template "${bit.key}"`, bit.campaign_type_keys, campaignTypeKeys);
    check(typeof bit.rep_gate             === 'number', `board_item_template "${bit.key}" rep_gate must be a number`);
    check(Array.isArray(bit.valid_arc_stages),          `board_item_template "${bit.key}" valid_arc_stages must be an array`);
    if (bit.contract_template_key !== null) {
      check(
        typeof bit.contract_template_key === 'string' && contractTemplateKeys.has(bit.contract_template_key as string),
        `board_item_template "${bit.key}" references unknown contract_template_key "${bit.contract_template_key}"`,
      );
    }
  }

  // ── Economy
  check(isObject(raw.economy), 'manifest.economy must be an object');
  const econ = raw.economy;
  check(typeof econ.starting_money             === 'number' && (econ.starting_money as number) >= 0,       'economy.starting_money must be >= 0');
  check(typeof econ.starting_reputation        === 'number',                                               'economy.starting_reputation must be a number');
  check(typeof econ.overhead_per_turn          === 'number' && (econ.overhead_per_turn as number) >= 0,    'economy.overhead_per_turn must be >= 0');
  check(typeof econ.career_length              === 'number' && (econ.career_length as number) > 0,          'economy.career_length must be > 0');
  check(
    typeof econ.event_base_rate === 'number' &&
    (econ.event_base_rate as number) >= 0 && (econ.event_base_rate as number) <= 1,
    `economy.event_base_rate must be in [0, 1] (got ${econ.event_base_rate})`,
  );
  check(typeof econ.credit_ceiling_rep_weight   === 'number', 'economy.credit_ceiling_rep_weight must be a number');
  check(typeof econ.credit_ceiling_asset_weight === 'number', 'economy.credit_ceiling_asset_weight must be a number');
  check(
    typeof econ.debt_interest_rate === 'number' && (econ.debt_interest_rate as number) >= 0,
    'economy.debt_interest_rate must be >= 0',
  );
  check(isObject(econ.agent_stat_upgrade_cost),   'economy.agent_stat_upgrade_cost must be an object');
  check(isObject(econ.roster_slot_upgrade_cost),  'economy.roster_slot_upgrade_cost must be an object');
  check(isObject(econ.defense_track_upgrade_cost),'economy.defense_track_upgrade_cost must be an object');
  check(
    typeof econ.income_satisfaction_threshold === 'number' && (econ.income_satisfaction_threshold as number) > 0,
    'economy.income_satisfaction_threshold must be > 0',
  );

  // ── Arc config — all multipliers must be > 0
  check(isObject(raw.arc), 'manifest.arc must be an object');
  const arc = raw.arc;
  check(
    typeof arc.rising_to_peak_base_turns    === 'number' && (arc.rising_to_peak_base_turns    as number) > 0,
    'arc.rising_to_peak_base_turns must be > 0',
  );
  check(
    typeof arc.peak_to_declining_base_turns === 'number' && (arc.peak_to_declining_base_turns as number) > 0,
    'arc.peak_to_declining_base_turns must be > 0',
  );
  check(isObject(arc.stage_multipliers), 'arc.stage_multipliers must be an object');
  for (const stage of ['rising', 'peak', 'declining']) {
    const mults = (arc.stage_multipliers as Record<string, unknown>)[stage];
    check(isObject(mults), `arc.stage_multipliers.${stage} must be an object`);
    for (const field of ['talent', 'form', 'marketability', 'income']) {
      const v = (mults as Record<string, unknown>)[field];
      check(
        typeof v === 'number' && (v as number) > 0,
        `arc.stage_multipliers.${stage}.${field} must be > 0`,
      );
    }
  }

  return raw as unknown as VariantManifest;
}
