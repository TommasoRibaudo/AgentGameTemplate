import { validateManifest } from '../validator';
import { MUSIC_MANIFEST }   from '../variants/music';
import { SPORTS_MANIFEST }  from '../variants/sports';
import { VariantManifest }  from '../../types/manifest';

// Build a deep copy we can mutate per test
const clone = (m: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(m));
const valid  = (): Record<string, unknown> => clone(MUSIC_MANIFEST);

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('validateManifest — valid manifest', () => {
  it('accepts the music reference manifest', () => {
    expect(() => validateManifest(MUSIC_MANIFEST)).not.toThrow();
  });

  it('returns the same object typed as VariantManifest', () => {
    const result: VariantManifest = validateManifest(MUSIC_MANIFEST);
    expect(result.id).toBe('music_v1');
  });

  it('accepts the sports reference manifest', () => {
    expect(() => validateManifest(SPORTS_MANIFEST)).not.toThrow();
  });

  it('sports manifest has correct id and labels', () => {
    const result = validateManifest(SPORTS_MANIFEST);
    expect(result.id).toBe('sports_v1');
    expect(result.labels.client).toBe('Athlete');
    expect(result.labels.agent).toBe('Agent');
  });
});

// ─── Non-object input ─────────────────────────────────────────────────────────

describe('validateManifest — bad input type', () => {
  it('throws on null',      () => expect(() => validateManifest(null)).toThrow(/non-null object/));
  it('throws on string',    () => expect(() => validateManifest('{}' )).toThrow(/non-null object/));
  it('throws on array',     () => expect(() => validateManifest([])   ).toThrow(/non-null object/));
  it('throws on undefined', () => expect(() => validateManifest(undefined)).toThrow(/non-null object/));
});

// ─── Required top-level fields ────────────────────────────────────────────────

describe('validateManifest — top-level required fields', () => {
  it('throws on missing id',      () => { const m = valid(); delete m.id;      expect(() => validateManifest(m)).toThrow(/manifest\.id/); });
  it('throws on empty id',        () => { const m = valid(); m.id = '';         expect(() => validateManifest(m)).toThrow(/manifest\.id/); });
  it('throws on missing name',    () => { const m = valid(); delete m.name;    expect(() => validateManifest(m)).toThrow(/manifest\.name/); });
  it('throws on missing version', () => { const m = valid(); delete m.version; expect(() => validateManifest(m)).toThrow(/manifest\.version/); });
});

// ─── Stat sub-attribute weight validation ────────────────────────────────────

describe('validateManifest — stat_sub_attribute weights', () => {
  it('throws when weights do not sum to 1.0 for a maps_to group', () => {
    const m = valid();
    (m.stat_sub_attributes as { weight: number }[])[0].weight = 0.5; // talent group will sum to ~0.65+0.30 = 0.95
    expect(() => validateManifest(m)).toThrow(/sum to 1\.0/);
  });

  it('throws on invalid maps_to key', () => {
    const m = valid();
    (m.stat_sub_attributes as { maps_to: string }[])[0].maps_to = 'stamina';
    expect(() => validateManifest(m)).toThrow(/maps_to must be one of/);
  });

  it('throws on zero weight', () => {
    const m = valid();
    (m.stat_sub_attributes as { weight: number }[])[0].weight = 0;
    expect(() => validateManifest(m)).toThrow(/weight must be a positive number/);
  });
});

// ─── Board item → contract template cross-reference ──────────────────────────

describe('validateManifest — board_item_template cross-reference', () => {
  it('throws when contract_template_key references a nonexistent template', () => {
    const m = valid();
    (m.board_item_templates as { contract_template_key: string }[])[0].contract_template_key = 'does_not_exist';
    expect(() => validateManifest(m)).toThrow(/unknown contract_template_key/);
  });

  it('allows null contract_template_key', () => {
    const m = valid();
    (m.board_item_templates as { contract_template_key: null }[])[0].contract_template_key = null;
    expect(() => validateManifest(m)).not.toThrow();
  });
});

// ─── Event defense_track_key validation ──────────────────────────────────────

describe('validateManifest — event defense_track_key', () => {
  it('throws on invalid defense_track_key', () => {
    const m = valid();
    (m.events as { defense_track_key: string }[])[0].defense_track_key = 'unknown_track';
    expect(() => validateManifest(m)).toThrow(/defense_track_key/);
  });

  it('allows null defense_track_key', () => {
    const m = valid();
    (m.events as { defense_track_key: null }[])[0].defense_track_key = null;
    expect(() => validateManifest(m)).not.toThrow();
  });

  it('accepts all valid infra key values', () => {
    for (const key of ['insurance', 'pr', 'legal', 'medical'] as const) {
      const m = valid();
      (m.events as { defense_track_key: string }[])[0].defense_track_key = key;
      expect(() => validateManifest(m)).not.toThrow();
    }
  });
});

// ─── Economy validation ───────────────────────────────────────────────────────

describe('validateManifest — economy', () => {
  it('throws when event_base_rate > 1', () => {
    const m = valid();
    (m.economy as { event_base_rate: number }).event_base_rate = 1.5;
    expect(() => validateManifest(m)).toThrow(/event_base_rate must be in \[0, 1\]/);
  });

  it('throws when event_base_rate < 0', () => {
    const m = valid();
    (m.economy as { event_base_rate: number }).event_base_rate = -0.1;
    expect(() => validateManifest(m)).toThrow(/event_base_rate must be in \[0, 1\]/);
  });

  it('accepts event_base_rate = 0', () => {
    const m = valid();
    (m.economy as { event_base_rate: number }).event_base_rate = 0;
    expect(() => validateManifest(m)).not.toThrow();
  });

  it('accepts event_base_rate = 1', () => {
    const m = valid();
    (m.economy as { event_base_rate: number }).event_base_rate = 1;
    expect(() => validateManifest(m)).not.toThrow();
  });

  it('throws when overhead_per_turn is negative', () => {
    const m = valid();
    (m.economy as { overhead_per_turn: number }).overhead_per_turn = -1;
    expect(() => validateManifest(m)).toThrow(/overhead_per_turn/);
  });

  it('throws when career_length is 0', () => {
    const m = valid();
    (m.economy as { career_length: number }).career_length = 0;
    expect(() => validateManifest(m)).toThrow(/career_length must be > 0/);
  });
});

// ─── Arc config validation ────────────────────────────────────────────────────

describe('validateManifest — arc config', () => {
  it('throws when a stage multiplier is 0', () => {
    const m = valid();
    ((m.arc as { stage_multipliers: { rising: { talent: number } } }).stage_multipliers.rising).talent = 0;
    expect(() => validateManifest(m)).toThrow(/must be > 0/);
  });

  it('throws when a stage multiplier is negative', () => {
    const m = valid();
    ((m.arc as { stage_multipliers: { peak: { income: number } } }).stage_multipliers.peak).income = -1;
    expect(() => validateManifest(m)).toThrow(/must be > 0/);
  });

  it('throws when rising_to_peak_base_turns is 0', () => {
    const m = valid();
    (m.arc as { rising_to_peak_base_turns: number }).rising_to_peak_base_turns = 0;
    expect(() => validateManifest(m)).toThrow(/rising_to_peak_base_turns must be > 0/);
  });
});

// ─── Campaign type validation ─────────────────────────────────────────────────

describe('validateManifest — campaign types', () => {
  it('throws when total_turns is 0', () => {
    const m = valid();
    (m.campaign_types as { total_turns: number }[])[0].total_turns = 0;
    expect(() => validateManifest(m)).toThrow(/total_turns must be > 0/);
  });

  it('throws when variance is negative', () => {
    const m = valid();
    (m.campaign_types as { variance: number }[])[0].variance = -5;
    expect(() => validateManifest(m)).toThrow(/variance must be >= 0/);
  });
});

// ─── Labels validation ────────────────────────────────────────────────────────

describe('validateManifest — labels', () => {
  it('throws when a stat_label key is missing', () => {
    const m = valid();
    delete (m.labels as { stat_labels: { talent?: string } }).stat_labels.talent;
    expect(() => validateManifest(m)).toThrow(/stat_labels\.talent/);
  });

  it('throws when labels.client is not a string', () => {
    const m = valid();
    (m.labels as { client: number }).client = 42;
    expect(() => validateManifest(m)).toThrow(/labels\.client/);
  });
});
