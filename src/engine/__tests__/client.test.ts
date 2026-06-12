import {
  computeObservedStat,
  canInvestScouting,
  refreshClientFog,
  refreshProspectFog,
  investScouting,
  evaluateArcProgression,
  applyArcMultipliers,
  applyClientStatDeltas,
  grantTrait,
  signClient,
  releaseClient,
  applyAudienceDecay,
  generateProspects,
  AUDIENCE_DECAY_RATE,
  PROSPECT_LIFESPAN,
} from '../client';
import { makeClient, makeClientStats, makeFoggedStat, makeRunState, makeManifest, makeAgentState, nextId } from './fixtures';
import { TraitDefinition } from '../../types/manifest';
import { Client, Prospect } from '../../types/client';
import { Campaign } from '../../types/campaign';
import { ArcStage } from '../../types/primitives';
import { MUSIC_MANIFEST } from '../../manifest/variants/music';

// ─── computeObservedStat ──────────────────────────────────────────────────────

describe('client — computeObservedStat', () => {
  const baseAgent = makeAgentState();

  it('talent can be perfectly known at max scouting', () => {
    // skill=7 (contrib=14) + invested=600 (contrib=12) + tenure=20 (contrib=20) = 46 > initialHalf 35
    const stat = makeFoggedStat(60, { scouting_invested: 600 });
    const { observed_min, observed_max } = computeObservedStat(
      stat, 'talent',
      makeAgentState({ stats: { stat_scouting: 7, insight_scouting: 0, negotiation: 0, operations: 0, coaching: 0 } }),
      20,
    );
    expect(observed_min).toBe(observed_max);
  });

  it('non-talent stats can be perfectly known at max scouting', () => {
    // invested=600 (contrib=12) + tenure=20 (contrib=30) = 42 > initialHalf 40
    const stat = makeFoggedStat(60, { scouting_invested: 600 });
    const { observed_min, observed_max } = computeObservedStat(
      stat, 'form',
      makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 0, operations: 0, coaching: 0 } }),
      20,
    );
    expect(observed_min).toBe(observed_max);
  });

  it('fog narrows as scouting_invested increases', () => {
    const lowInvest  = makeFoggedStat(60, { scouting_invested: 0 });
    const highInvest = makeFoggedStat(60, { scouting_invested: 600 });
    const low  = computeObservedStat(lowInvest,  'talent', baseAgent, 0);
    const high = computeObservedStat(highInvest, 'talent', baseAgent, 0);
    expect(high.observed_max - high.observed_min).toBeLessThan(low.observed_max - low.observed_min);
  });

  it('fog narrows with more tenure', () => {
    const stat = makeFoggedStat(60);
    const young = computeObservedStat(stat, 'form', baseAgent, 0);
    const veteran = computeObservedStat(stat, 'form', baseAgent, 16);
    expect(veteran.observed_max - veteran.observed_min).toBeLessThan(young.observed_max - young.observed_min);
  });

  it('fog narrows with matching infrastructure', () => {
    const stat = makeFoggedStat(60);
    const base = computeObservedStat(stat, 'marketability', baseAgent, 0);
    const withStudio = computeObservedStat(
      stat,
      'marketability',
      makeAgentState({
        defense_tracks: [{ key: 'media_studio', level: 2, per_turn_cost: 300 }],
      }),
      0,
    );
    expect(withStudio.observed_max - withStudio.observed_min).toBeLessThan(base.observed_max - base.observed_min);
  });

  it('observed_min is always >= 0 and observed_max is always <= 100', () => {
    const edgeLow = makeFoggedStat(2);
    const edgeHigh = makeFoggedStat(98);
    const low = computeObservedStat(edgeLow, 'talent', baseAgent, 0);
    const high = computeObservedStat(edgeHigh, 'talent', baseAgent, 0);
    expect(low.observed_min).toBeGreaterThanOrEqual(0);
    expect(high.observed_max).toBeLessThanOrEqual(100);
  });
});

// ─── refreshClientFog ─────────────────────────────────────────────────────────

describe('client — refreshClientFog', () => {
  it('returns updated stats for all four stat keys', () => {
    const client = makeClient();
    const result = refreshClientFog(client, makeAgentState());
    expect(result).toHaveProperty('talent');
    expect(result).toHaveProperty('form');
    expect(result).toHaveProperty('marketability');
    expect(result).toHaveProperty('morale');
  });

  it('does not mutate true_value', () => {
    const client = makeClient({ stats: makeClientStats({ talent: 75 }) });
    const result = refreshClientFog(client, makeAgentState());
    expect(result.talent.true_value).toBe(75);
  });
});

// ─── evaluateArcProgression ───────────────────────────────────────────────────

describe('client — evaluateArcProgression', () => {
  const manifest = makeManifest();

  it('rising stays rising below threshold', () => {
    const client = makeClient({ arc_stage: 'rising', turns_at_stage: 5 });
    expect(evaluateArcProgression(client, manifest)).toBe('rising');
  });

  it('rising advances to peak at threshold', () => {
    const base = manifest.arc.rising_to_peak_base_turns;
    const client = makeClient({ arc_stage: 'rising', turns_at_stage: base });
    expect(evaluateArcProgression(client, manifest)).toBe('peak');
  });

  it('high form accelerates rising→peak transition', () => {
    // formModifier for advancing = -6 when form > 70
    const earlyClient = makeClient({
      arc_stage: 'rising',
      turns_at_stage: manifest.arc.rising_to_peak_base_turns - 6,
      stats: makeClientStats({ form: 80 }),
    });
    expect(evaluateArcProgression(earlyClient, manifest)).toBe('peak');
  });

  it('peak stays peak below declining threshold', () => {
    const client = makeClient({ arc_stage: 'peak', turns_at_stage: 5 });
    expect(evaluateArcProgression(client, manifest)).toBe('peak');
  });

  it('peak advances to declining at threshold', () => {
    const base = manifest.arc.peak_to_declining_base_turns;
    const client = makeClient({ arc_stage: 'peak', turns_at_stage: base });
    expect(evaluateArcProgression(client, manifest)).toBe('declining');
  });

  it('declining never advances further', () => {
    const client = makeClient({ arc_stage: 'declining', turns_at_stage: 999 });
    expect(evaluateArcProgression(client, manifest)).toBe('declining');
  });

  it('high form (> 70) accelerates rising → peak transition (formModifier = -6)', () => {
    const base      = manifest.arc.rising_to_peak_base_turns;
    const adjThresh = base - 6; // high form lowers the threshold by 6
    const justBelow = makeClient({ arc_stage: 'rising', turns_at_stage: adjThresh - 1, stats: makeClientStats({ form: 80 }) });
    const atThresh  = makeClient({ arc_stage: 'rising', turns_at_stage: adjThresh,     stats: makeClientStats({ form: 80 }) });
    expect(evaluateArcProgression(justBelow, manifest)).toBe('rising');
    expect(evaluateArcProgression(atThresh,  manifest)).toBe('peak');
  });

  it('high form (> 70) at peak extends duration (formModifier = +8)', () => {
    const base      = manifest.arc.peak_to_declining_base_turns;
    const adjThresh = base + 8; // high form raises the threshold by 8
    const justBelow = makeClient({ arc_stage: 'peak', turns_at_stage: adjThresh - 1, stats: makeClientStats({ form: 80 }) });
    const atThresh  = makeClient({ arc_stage: 'peak', turns_at_stage: adjThresh,     stats: makeClientStats({ form: 80 }) });
    expect(evaluateArcProgression(justBelow, manifest)).toBe('peak');
    expect(evaluateArcProgression(atThresh,  manifest)).toBe('declining');
  });

  it('low form (< 30) delays rising → peak transition (formModifier = +8)', () => {
    const base      = manifest.arc.rising_to_peak_base_turns;
    const adjThresh = base + 8;  // low form raises threshold by 8
    const justBelow = makeClient({ arc_stage: 'rising', turns_at_stage: adjThresh - 1, stats: makeClientStats({ form: 20 }) });
    const atThresh  = makeClient({ arc_stage: 'rising', turns_at_stage: adjThresh,     stats: makeClientStats({ form: 20 }) });
    expect(evaluateArcProgression(justBelow, manifest)).toBe('rising');
    expect(evaluateArcProgression(atThresh,  manifest)).toBe('peak');
  });

  it('low form (< 30) accelerates peak → declining transition (formModifier = -6)', () => {
    const base      = manifest.arc.peak_to_declining_base_turns;
    const adjThresh = base - 6;  // low form lowers threshold by 6
    const atThresh  = makeClient({ arc_stage: 'peak', turns_at_stage: adjThresh, stats: makeClientStats({ form: 20 }) });
    expect(evaluateArcProgression(atThresh, manifest)).toBe('declining');
  });
});

// ─── applyClientStatDeltas ────────────────────────────────────────────────────

describe('client — applyClientStatDeltas', () => {
  it('applies positive and negative deltas', () => {
    const client = makeClient({ stats: makeClientStats({ form: 60 }) });
    const result = applyClientStatDeltas(client, { form: 10 }, makeAgentState());
    expect(result.stats.form.true_value).toBe(70);
  });

  it('clamps at 100', () => {
    const client = makeClient({ stats: makeClientStats({ morale: 95 }) });
    const result = applyClientStatDeltas(client, { morale: 20 }, makeAgentState());
    expect(result.stats.morale.true_value).toBe(100);
  });

  it('clamps at 0', () => {
    const client = makeClient({ stats: makeClientStats({ form: 5 }) });
    const result = applyClientStatDeltas(client, { form: -20 }, makeAgentState());
    expect(result.stats.form.true_value).toBe(0);
  });
});

// ─── grantTrait ───────────────────────────────────────────────────────────────

const makeTrait = (key: string): TraitDefinition => ({
  key,
  label: 'Test Trait',
  stat_modifiers: { form: 5 },
  marketability_modifier: 0,
  event_bias: {},
  trigger_condition_key: 'test_condition',
  trigger_threshold: 80,
});

describe('client — grantTrait', () => {
  it('adds trait if not already present', () => {
    const manifest = makeManifest({ traits: [makeTrait('hustle')] });
    const client = makeClient();
    const result = grantTrait(client, 'hustle', manifest);
    expect(result.traits).toHaveLength(1);
    expect(result.traits[0].trait_id).toBe('hustle');
  });

  it('is idempotent — does not add duplicate', () => {
    const manifest = makeManifest({ traits: [makeTrait('hustle')] });
    const client = makeClient();
    const once = grantTrait(client, 'hustle', manifest);
    const twice = grantTrait(once, 'hustle', manifest);
    expect(twice.traits).toHaveLength(1);
  });

  it('does nothing if trait not in manifest', () => {
    const client = makeClient();
    const result = grantTrait(client, 'nonexistent', makeManifest());
    expect(result.traits).toHaveLength(0);
  });
});

// ─── checkTraitGrant ──────────────────────────────────────────────────────────

describe('client — checkTraitGrant', () => {
  const { checkTraitGrant } = require('../client');

  it('returns trait key when roll >= threshold and condition_key matches', () => {
    const manifest = makeManifest({ traits: [makeTrait('hustle')] });
    const client = makeClient();
    const result = checkTraitGrant(client, 'test_condition', 90, manifest);
    expect(result).toBe('hustle');
  });

  it('returns null when roll < threshold', () => {
    const manifest = makeManifest({ traits: [makeTrait('hustle')] });
    const client = makeClient();
    expect(checkTraitGrant(client, 'test_condition', 50, manifest)).toBeNull();
  });

  it('returns null when condition_key does not match', () => {
    const manifest = makeManifest({ traits: [makeTrait('hustle')] });
    const client = makeClient();
    expect(checkTraitGrant(client, 'different_condition', 90, manifest)).toBeNull();
  });

  it('skips and returns null when client already has the trait', () => {
    const manifest = makeManifest({ traits: [makeTrait('hustle')] });
    // Grant the trait first, then try again — should skip due to already having it
    const clientWithTrait = grantTrait(makeClient(), 'hustle', manifest);
    const result = checkTraitGrant(clientWithTrait, 'test_condition', 90, manifest);
    expect(result).toBeNull();
  });
});

// ─── refreshProspectFog ───────────────────────────────────────────────────────

const makeProspect = (overrides?: Partial<Prospect>) => ({
  id:                         overrides?.id ?? nextId(),
  name:                       overrides?.name ?? 'Test Prospect',
  age_weeks:                  overrides?.age_weeks ?? 20 * 52,
  arc_stage:                  (overrides?.arc_stage ?? 'rising') as ArcStage,
  audience:                   overrides?.audience ?? 5_000,
  stats:                      overrides?.stats ?? makeClientStats(),
  scouting_invested:          overrides?.scouting_invested ?? 0,
  max_potential:               overrides?.max_potential ?? 80,
  expires_in:                 overrides?.expires_in ?? 10,
  generated_at_reputation:    overrides?.generated_at_reputation ?? 0,
} as Prospect);

describe('client — refreshProspectFog', () => {
  it('returns updated prospect with recalculated fog', () => {
    const prospect = makeProspect();
    const result = refreshProspectFog(prospect, makeAgentState());
    expect(result).toHaveProperty('id', prospect.id);
    expect(result.stats.talent.observed_min).toBeGreaterThanOrEqual(0);
    expect(result.stats.talent.observed_max).toBeLessThanOrEqual(100);
  });

  it('does not mutate true_value on any stat', () => {
    const prospect = makeProspect();
    const trueValues = Object.fromEntries(
      Object.entries(prospect.stats).map(([k, v]) => [k, v.true_value]),
    );
    const result = refreshProspectFog(prospect, makeAgentState());
    for (const key of Object.keys(trueValues)) {
      expect(result.stats[key as keyof typeof result.stats].true_value).toBe(trueValues[key]);
    }
  });

  it('narrows fog as insight_scouting level increases', () => {
    const prospect = makeProspect();
    const lowAgent  = makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 0, operations: 0, coaching: 0 } });
    const highAgent = makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 7, negotiation: 0, operations: 0, coaching: 0 } });
    const low  = refreshProspectFog(prospect, lowAgent);
    const high = refreshProspectFog(prospect, highAgent);
    const lowBand  = low.stats.form.observed_max  - low.stats.form.observed_min;
    const highBand = high.stats.form.observed_max - high.stats.form.observed_min;
    expect(highBand).toBeLessThanOrEqual(lowBand);
  });
});

// ─── investScouting ───────────────────────────────────────────────────────────

describe('client — generateProspects', () => {
  afterEach(() => jest.restoreAllMocks());

  it('starts low-reputation artists with local-scene audience numbers', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const prospects = generateProspects(3, new Set(), 20);
    expect(prospects).toHaveLength(3);
    for (const prospect of prospects) {
      expect(prospect.audience).toBeLessThanOrEqual(2_000);
      expect(prospect.audience).toBeGreaterThanOrEqual(50);
    }
  });

  it('still gives higher-reputation scouting pools larger audiences', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const lowRep = generateProspects(1, new Set(), 10)[0];
    const highRep = generateProspects(1, new Set(), 75)[0];
    expect(highRep.audience).toBeGreaterThan(lowRep.audience);
  });

  it('generates higher-quality prospects in later turns than turn 1', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const earlyProspect = generateProspects(1, new Set(), 50, 1)[0];
    const lateProspect  = generateProspects(1, new Set(), 50, 50)[0];
    expect(lateProspect.stats.talent.true_value).toBeGreaterThan(earlyProspect.stats.talent.true_value);
  });

  it('generates higher-quality prospects for agents with better scouting', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const noScout   = generateProspects(1, new Set(), 50, 1, 0, 0)[0];
    const goodScout = generateProspects(1, new Set(), 50, 1, 6, 6)[0];
    expect(goodScout.stats.talent.true_value).toBeGreaterThan(noScout.stats.talent.true_value);
  });

  it('generates rising prospects with rising-stage ages', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const prospect = generateProspects(1, new Set(), 50)[0];
    expect(prospect.arc_stage).toBe('rising');
    expect(prospect.age_weeks).toBeGreaterThanOrEqual(16 * 52);
    expect(prospect.age_weeks).toBeLessThan(24 * 52);
  });

  it('stamps expires_in with PROSPECT_LIFESPAN', () => {
    const prospect = generateProspects(1, new Set(), 50)[0];
    expect(prospect.expires_in).toBe(PROSPECT_LIFESPAN);
  });

  it('stamps generated_at_reputation with the supplied reputation', () => {
    const prospect = generateProspects(1, new Set(), 60)[0];
    expect(prospect.generated_at_reputation).toBe(60);
  });
});

describe('client — investScouting', () => {
  it('increases scouting_invested on the target stat', () => {
    const client = makeClient({ stats: makeClientStats({ talent: 60 }) });
    const result = investScouting(client, 'talent', 200, makeAgentState()) as Client;
    expect(result.stats.talent.scouting_invested).toBe(200);
  });

  it('narrows the observed band after investment', () => {
    const client = makeClient();
    const bandBefore = client.stats.talent.observed_max - client.stats.talent.observed_min;
    const updated = investScouting(client, 'talent', 600, makeAgentState()) as Client;
    const bandAfter = updated.stats.talent.observed_max - updated.stats.talent.observed_min;
    expect(bandAfter).toBeLessThanOrEqual(bandBefore);
  });

  it('works on a Prospect (no turns_on_roster field)', () => {
    const prospect = makeProspect({ scouting_invested: 0 });
    const result = investScouting(prospect, 'form', 100, makeAgentState());
    expect(result.stats.form.scouting_invested).toBe(100);
  });

  it('does not change true_value', () => {
    const client = makeClient({ stats: makeClientStats({ talent: 72 }) });
    const result = investScouting(client, 'talent', 300, makeAgentState()) as Client;
    expect(result.stats.talent.true_value).toBe(72);
  });

  it('stops investing once the minimum fog window is reached', () => {
    const agent = makeAgentState({ stats: { stat_scouting: 7, insight_scouting: 0, negotiation: 0, operations: 0, coaching: 0 } });
    const client = makeClient({
      turns_on_roster: 16,
      stats: makeClientStats({
        talent: 60,
      }),
    });
    const talentAtMinimum = {
      ...client.stats.talent,
      scouting_invested: 600,
    };
    const atMinimum = {
      ...client,
      stats: {
        ...client.stats,
        talent: {
          ...talentAtMinimum,
          ...computeObservedStat(talentAtMinimum, 'talent', agent, 16),
        },
      },
    };

    const result = investScouting(atMinimum, 'talent', 500, agent) as Client;

    expect(result).toBe(atMinimum);
    expect(result.stats.talent.scouting_invested).toBe(600);
    expect(canInvestScouting(atMinimum, 'talent', 500, agent)).toBe(false);
  });
});

// ─── applyArcMultipliers ──────────────────────────────────────────────────────

describe('client — applyArcMultipliers', () => {
  it('scales observed_min/max by the stage multiplier for talent', () => {
    const manifest = makeManifest();
    const stats = makeClientStats({ talent: 60 });
    const rising = applyArcMultipliers(stats, 'rising', manifest);
    const peak   = applyArcMultipliers(stats, 'peak',   manifest);
    // Rising talent multiplier (0.8) < Peak talent multiplier (1.0) → smaller observed range
    expect(rising.talent.observed_max).toBeLessThanOrEqual(peak.talent.observed_max);
  });

  it('does NOT scale morale — morale is arc-multiplier immune', () => {
    const manifest = makeManifest();
    const stats = makeClientStats({ morale: 70 });
    const rising    = applyArcMultipliers(stats, 'rising',   manifest);
    const declining = applyArcMultipliers(stats, 'declining', manifest);
    expect(rising.morale).toEqual(declining.morale);
  });

  it('does not change true_value on any stat', () => {
    const manifest = makeManifest();
    const stats = makeClientStats({ talent: 60, form: 55, marketability: 65, morale: 70 });
    const result = applyArcMultipliers(stats, 'peak', manifest);
    expect(result.talent.true_value).toBe(60);
    expect(result.form.true_value).toBe(55);
    expect(result.marketability.true_value).toBe(65);
    expect(result.morale.true_value).toBe(70);
  });
});

// ─── signClient ───────────────────────────────────────────────────────────────

describe('client — signClient', () => {
  it('promotes prospect to roster', () => {
    const prospectId = nextId();
    const contractId = nextId();
    const prospect = makeProspect({ id: prospectId });
    const state = makeRunState({ prospects: [prospect] });
    const result = signClient(state, prospectId, contractId, makeAgentState(), makeManifest());
    expect(result.roster).toHaveLength(1);
    expect(result.roster[0].id).toBe(prospectId);
    expect(result.prospects).toHaveLength(0);
  });

  it('sets agent_contract_id on the promoted client', () => {
    const prospectId = nextId();
    const contractId = nextId();
    const prospect = makeProspect({ id: prospectId });
    const state = makeRunState({ prospects: [prospect] });
    const result = signClient(state, prospectId, contractId, makeAgentState(), makeManifest());
    expect(result.roster[0].agent_contract_id).toBe(contractId);
  });

  it('preserves audience when promoting a prospect', () => {
    const prospectId = nextId();
    const contractId = nextId();
    const prospect = makeProspect({ id: prospectId, audience: 12_345 });
    const state = makeRunState({ prospects: [prospect] });
    const result = signClient(state, prospectId, contractId, makeAgentState(), makeManifest());
    expect(result.roster[0].audience).toBe(12_345);
  });

  it('preserves age when promoting a prospect', () => {
    const prospectId = nextId();
    const contractId = nextId();
    const prospect = makeProspect({ id: prospectId, age_weeks: (22 * 52) + 13 });
    const state = makeRunState({ prospects: [prospect] });
    const result = signClient(state, prospectId, contractId, makeAgentState(), makeManifest());
    expect(result.roster[0].age_weeks).toBe(prospect.age_weeks);
  });

  it('updates existing contract client_id to match the signed prospect', () => {
    const prospectId = nextId();
    const contractId = nextId();
    const prospect = makeProspect({ id: prospectId });
    const contract = { id: contractId, tier: 'agent_client' as const, client_id: 'placeholder', entity_id: null, payout_type: 'per_week' as const, your_cut: 15, amount: 0, duration_remaining: 12, objectives: [], obligations_per_turn: 200, counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null }, default_on_ignore: 'reject', expires_in: null, exclusivity_scope: null, turns_active: 0, album_option: null };
    const state = makeRunState({ prospects: [prospect], contracts: [contract] });
    const result = signClient(state, prospectId, contractId, makeAgentState(), makeManifest());
    expect(result.contracts[0].client_id).toBe(prospectId);
  });

  it('returns state unchanged for an unknown prospect id', () => {
    const state = makeRunState();
    const result = signClient(state, 'unknown_id', 'ctr_x', makeAgentState(), makeManifest());
    expect(result).toBe(state);
  });
});

// ─── signClient — pre-signing history ─────────────────────────────────────────

describe('client — signClient pre-signing history', () => {
  it('generates no history for a brand-new artist (audience < 900)', () => {
    const prospectId = nextId();
    const prospect = makeProspect({ id: prospectId, audience: 500 });
    const state = makeRunState({ prospects: [prospect] });
    const result = signClient(state, prospectId, 'ctr', makeAgentState(), MUSIC_MANIFEST);
    expect(result.roster[0].campaign_history).toHaveLength(0);
    expect(result.roster[0].catalog_releases).toHaveLength(0);
  });

  it('generates at least one past campaign for an artist with audience >= 900', () => {
    const prospectId = nextId();
    const prospect = makeProspect({ id: prospectId, audience: 1_000 });
    const state = makeRunState({ prospects: [prospect] });
    const result = signClient(state, prospectId, 'ctr', makeAgentState(), MUSIC_MANIFEST);
    expect(result.roster[0].campaign_history.length).toBeGreaterThanOrEqual(1);
  });

  it('generates a catalog release for an artist with audience >= 1400', () => {
    const prospectId = nextId();
    const prospect = makeProspect({ id: prospectId, audience: 1_600 });
    const state = makeRunState({ prospects: [prospect] });
    const result = signClient(state, prospectId, 'ctr', makeAgentState(), MUSIC_MANIFEST);
    expect(result.roster[0].catalog_releases.length).toBeGreaterThanOrEqual(1);
    const release = result.roster[0].catalog_releases[0];
    expect(release.turns_since_release).toBeGreaterThan(0);
    expect(release.is_selling_albums).toBe(false);
  });

  it('campaign_history release_id links to an entry in catalog_releases', () => {
    const prospectId = nextId();
    const prospect = makeProspect({ id: prospectId, audience: 1_600 });
    const state = makeRunState({ prospects: [prospect] });
    const result = signClient(state, prospectId, 'ctr', makeAgentState(), MUSIC_MANIFEST);
    const releaseIds = new Set(result.roster[0].catalog_releases.map(r => r.id));
    for (const h of result.roster[0].campaign_history) {
      if (h.release_id !== null) {
        expect(releaseIds.has(h.release_id)).toBe(true);
      }
    }
  });

  it('past campaigns use negative turn numbers', () => {
    const prospectId = nextId();
    const prospect = makeProspect({ id: prospectId, audience: 1_000 });
    const state = makeRunState({ prospects: [prospect] });
    const result = signClient(state, prospectId, 'ctr', makeAgentState(), MUSIC_MANIFEST);
    for (const h of result.roster[0].campaign_history) {
      expect(h.completed_turn).toBeLessThan(0);
      expect(h.started_turn).toBeLessThan(h.completed_turn);
    }
  });

  it('audience is preserved regardless of generated history', () => {
    const prospectId = nextId();
    const prospect = makeProspect({ id: prospectId, audience: 2_000 });
    const state = makeRunState({ prospects: [prospect] });
    const result = signClient(state, prospectId, 'ctr', makeAgentState(), MUSIC_MANIFEST);
    expect(result.roster[0].audience).toBe(2_000);
  });
});

// ─── releaseClient ────────────────────────────────────────────────────────────

describe('client — releaseClient', () => {
  it('returns state unchanged for unknown client id', () => {
    const state = makeRunState({ roster: [] });
    const result = releaseClient(state, 'unknown_client_id', makeManifest());
    expect(result).toBe(state);
  });

  it('removes client from roster', () => {
    const clientId = nextId();
    const contractId = nextId();
    const client = makeClient({ id: clientId, agent_contract_id: contractId });
    const contract = { id: contractId, tier: 'agent_client' as const, client_id: clientId, entity_id: null, payout_type: 'per_week' as const, your_cut: 15, amount: 0, duration_remaining: 6, objectives: [], obligations_per_turn: 200, counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null }, default_on_ignore: 'reject' as const, expires_in: null, exclusivity_scope: null, turns_active: 0, album_option: null };
    const state = makeRunState({ roster: [client], contracts: [contract] });
    const result = releaseClient(state, clientId, makeManifest());
    expect(result.roster).toHaveLength(0);
  });

  it('removes active campaigns for the released client', () => {
    const clientId = nextId();
    const otherClientId = nextId();
    const client = makeClient({ id: clientId, active_campaign_id: 'camp_release' });
    const otherClient = makeClient({ id: otherClientId, active_campaign_id: 'camp_keep' });
    const campaign: Campaign = {
      id: 'camp_release',
      client_id: clientId,
      type_key: 'test_campaign',
      total_turns: 4,
      turns_remaining: 2,
      installment_results: [],
      pending_objective_ids: [],
    };
    const otherCampaign: Campaign = {
      id: 'camp_keep',
      client_id: otherClientId,
      type_key: 'test_campaign',
      total_turns: 4,
      turns_remaining: 2,
      installment_results: [],
      pending_objective_ids: [],
    };
    const state = makeRunState({ roster: [client, otherClient], campaigns: [campaign, otherCampaign] });
    const result = releaseClient(state, clientId, makeManifest());
    expect(result.campaigns).toEqual([otherCampaign]);
  });

  it('applies severance and rep penalty when contract is active', () => {
    const clientId = nextId();
    const contractId = nextId();
    const client = makeClient({ id: clientId, agent_contract_id: contractId });
    const contract = { id: contractId, tier: 'agent_client' as const, client_id: clientId, entity_id: null, payout_type: 'per_week' as const, your_cut: 15, amount: 0, duration_remaining: 6, objectives: [], obligations_per_turn: 500, counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null }, default_on_ignore: 'reject' as const, expires_in: null, exclusivity_scope: null, turns_active: 0, album_option: null };
    const state = makeRunState({ money: 5_000, reputation: 50, roster: [client], contracts: [contract] });
    const result = releaseClient(state, clientId, makeManifest());
    // severance = 500 * 2 = 1000
    expect(result.money).toBe(4_000);
    expect(result.reputation).toBe(45);
  });

  it('releases client with no agent_contract_id without applying severance', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, agent_contract_id: null });
    const state = makeRunState({ money: 5_000, reputation: 50, roster: [client] });
    const result = releaseClient(state, clientId, makeManifest());
    expect(result.roster).toHaveLength(0);
    expect(result.money).toBe(5_000);
    expect(result.reputation).toBe(50);
  });

  it('does not apply severance when contract duration_remaining is 0', () => {
    const clientId = nextId();
    const contractId = nextId();
    const client = makeClient({ id: clientId, agent_contract_id: contractId });
    const contract = { id: contractId, tier: 'agent_client' as const, client_id: clientId, entity_id: null, payout_type: 'per_week' as const, your_cut: 15, amount: 0, duration_remaining: 0, objectives: [], obligations_per_turn: 500, counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null }, default_on_ignore: 'reject' as const, expires_in: null, exclusivity_scope: null, turns_active: 0, album_option: null };
    const state = makeRunState({ money: 5_000, reputation: 50, roster: [client], contracts: [contract] });
    const result = releaseClient(state, clientId, makeManifest());
    expect(result.money).toBe(5_000);
    expect(result.reputation).toBe(50);
  });

  it('only zeroes the agent contract in contracts.map (non-matching :c branch)', () => {
    const clientId = nextId();
    const contractId = nextId();
    const otherContractId = nextId();
    const client = makeClient({ id: clientId, agent_contract_id: contractId });
    const agentContract = { id: contractId, tier: 'agent_client' as const, client_id: clientId, entity_id: null, payout_type: 'per_week' as const, your_cut: 15, amount: 0, duration_remaining: 6, objectives: [], obligations_per_turn: 200, counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null }, default_on_ignore: 'reject' as const, expires_in: null, exclusivity_scope: null, turns_active: 0, album_option: null };
    const otherContract  = { id: otherContractId, tier: 'agent_client' as const, client_id: 'other', entity_id: null, payout_type: 'per_week' as const, your_cut: 15, amount: 0, duration_remaining: 6, objectives: [], obligations_per_turn: 200, counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null }, default_on_ignore: 'reject' as const, expires_in: null, exclusivity_scope: null, turns_active: 0, album_option: null };
    const state = makeRunState({ roster: [client], contracts: [agentContract, otherContract] });
    const result = releaseClient(state, clientId, makeManifest());
    expect(result.contracts.find(c => c.id === contractId)?.duration_remaining).toBe(0);
    expect(result.contracts.find(c => c.id === otherContractId)?.duration_remaining).toBe(6);
  });
});

// ─── signClient — contracts.map branch ───────────────────────────────────────

describe('client — signClient contracts.map branch', () => {
  it('only updates the matching contract client_id (non-matching :c branch)', () => {
    const prospectId = nextId();
    const contractId = nextId();
    const otherContractId = nextId();
    const prospect = makeProspect({ id: prospectId });
    const mainContract  = { id: contractId,      tier: 'agent_client' as const, client_id: 'placeholder',   entity_id: null, payout_type: 'per_week' as const, your_cut: 15, amount: 0, duration_remaining: 12, objectives: [], obligations_per_turn: 200, counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null }, default_on_ignore: 'reject', expires_in: null, exclusivity_scope: null, turns_active: 0, album_option: null };
    const otherContract = { id: otherContractId, tier: 'agent_client' as const, client_id: 'other_client', entity_id: null, payout_type: 'per_week' as const, your_cut: 15, amount: 0, duration_remaining: 12, objectives: [], obligations_per_turn: 200, counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null }, default_on_ignore: 'reject', expires_in: null, exclusivity_scope: null, turns_active: 0, album_option: null };
    const state = makeRunState({ prospects: [prospect], contracts: [mainContract, otherContract] });
    const result = signClient(state, prospectId, contractId, makeAgentState(), makeManifest());
    expect(result.contracts.find(c => c.id === contractId)?.client_id).toBe(prospectId);
    expect(result.contracts.find(c => c.id === otherContractId)?.client_id).toBe('other_client');
  });
});

// ─── applyAudienceDecay ───────────────────────────────────────────────────────

describe('client — applyAudienceDecay', () => {
  it('declining clients lose more fans per turn than rising clients', () => {
    const audience = 50_000;
    const rising   = applyAudienceDecay(makeClient({ arc_stage: 'rising',   audience }));
    const declining = applyAudienceDecay(makeClient({ arc_stage: 'declining', audience }));
    const risingLoss   = audience - rising.audience;
    const decliningLoss = audience - declining.audience;
    expect(decliningLoss).toBeGreaterThan(risingLoss);
  });

  it('peak clients lose fewer fans per turn than declining clients', () => {
    const audience = 50_000;
    const peak     = applyAudienceDecay(makeClient({ arc_stage: 'peak',     audience }));
    const declining = applyAudienceDecay(makeClient({ arc_stage: 'declining', audience }));
    expect(audience - peak.audience).toBeLessThan(audience - declining.audience);
  });

  it('loss is proportional to audience size (larger audience → larger loss)', () => {
    const small = applyAudienceDecay(makeClient({ arc_stage: 'declining', audience: 10_000 }));
    const large = applyAudienceDecay(makeClient({ arc_stage: 'declining', audience: 200_000 }));
    expect(10_000  - small.audience).toBeLessThan(200_000 - large.audience);
  });

  it('audience never goes below zero', () => {
    const result = applyAudienceDecay(makeClient({ arc_stage: 'declining', audience: 0 }));
    expect(result.audience).toBe(0);
  });

  it('returns the same client reference when loss rounds to zero', () => {
    // audience so small that rate * audience < 0.5 → rounds to 0
    const client = makeClient({ arc_stage: 'rising', audience: 10 });
    const result = applyAudienceDecay(client);
    expect(result).toBe(client);
  });

  it('decay rates match the exported constants for each stage', () => {
    const audience = 100_000;
    (['rising', 'peak', 'declining'] as const).forEach(stage => {
      const client = makeClient({ arc_stage: stage, audience });
      const result = applyAudienceDecay(client);
      const expected = Math.round(audience * AUDIENCE_DECAY_RATE[stage]);
      expect(audience - result.audience).toBe(expected);
    });
  });
});
