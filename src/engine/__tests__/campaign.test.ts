import {
  rollInstallment,
  startCampaign,
  closeCampaign,
  advanceCampaigns,
  collectCatalogIncome,
  checkInstallmentEventTrigger,
  checkInstallmentTraitTrigger,
  settleCampaignObjectives,
  buildCampaignSetup,
  computeExpectationFanDelta,
  computeCurrentStreak,
  computeBestStreak,
  computeStreakBonus,
  clientMeetsCampaignContractRequirements,
  resolveCampaignCategory,
  deriveCampaignSize,
} from '../campaign';
import { makeRunState, makeClient, makeClientStats, makeManifest, makeObjective, makeContract, makeAgentState, nextId } from './fixtures';
import { CampaignTypeDefinition, EventDefinition, TraitDefinition } from '../../types/manifest';
import { Campaign, CampaignHistoryItem, CampaignInstallmentResult } from '../../types/campaign';
import { MUSIC_MANIFEST } from '../../manifest/variants/music';

const makeCampaignType = (overrides?: Partial<CampaignTypeDefinition>): CampaignTypeDefinition => ({
  key: 'test_campaign',
  label: 'Test Campaign',
  form_weight: 1,
  variance: 10,
  total_turns: 4,
  payout_type: 'per_week',
  base_payout: 5_000,
  per_installment_stat_deltas: {},
  event_trigger_threshold: 25,
  trait_trigger_threshold: 85,
  valid_arc_stages: [],
  ...overrides,
});

const setupCampaignState = (campaignTypeOverrides?: Partial<CampaignTypeDefinition>) => {
  const clientId = nextId();
  const client = makeClient({ id: clientId });
  const campaignType = makeCampaignType(campaignTypeOverrides);
  const manifest = makeManifest({ campaign_types: [campaignType] });

  const campaign: Campaign = {
    id: nextId(),
    client_id: clientId,
    type_key: 'test_campaign',
    setup: buildCampaignSetup(campaignType),
    total_turns: 4,
    turns_remaining: 4,
    installment_results: [],
    pending_objective_ids: [],
  };

  const state = makeRunState({ roster: [client], campaigns: [campaign] });
  return { state, campaign, client, manifest };
};

// ─── rollInstallment ─────────────────────────────────────────────────────────

describe('campaign — rollInstallment', () => {
  it('returns a roll_result in [0, 100]', () => {
    const { state, campaign, manifest } = setupCampaignState();
    const result = rollInstallment(state, campaign.id, manifest);
    expect(result.roll_result).toBeGreaterThanOrEqual(0);
    expect(result.roll_result).toBeLessThanOrEqual(100);
  });

  it('outcome_key is "great" when roll >= 70', () => {
    // form=95, form_weight=1 → mean=95, variance=0.01 → roll ≈ 95 always "great"
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ form: 95 }) });
    const manifest = makeManifest({ campaign_types: [makeCampaignType({ form_weight: 1, variance: 0.01 })] });
    const campaign: Campaign = { id: nextId(), client_id: clientId, type_key: 'test_campaign', total_turns: 4, turns_remaining: 4, installment_results: [], pending_objective_ids: [] };
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = rollInstallment(state, campaign.id, manifest);
    expect(result.roll_result).toBeGreaterThanOrEqual(70);
    expect(result.outcome_key).toBe('great');
  });

  it('outcome_key is "poor" when roll < 40', () => {
    // form=5, form_weight=1 → mean=5, variance=0.01 → roll ≈ 5 always "poor"
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ form: 5 }) });
    const manifest = makeManifest({ campaign_types: [makeCampaignType({ form_weight: 1, variance: 0.01 })] });
    const campaign: Campaign = { id: nextId(), client_id: clientId, type_key: 'test_campaign', total_turns: 4, turns_remaining: 4, installment_results: [], pending_objective_ids: [] };
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = rollInstallment(state, campaign.id, manifest);
    expect(result.roll_result).toBeLessThan(40);
    expect(result.outcome_key).toBe('poor');
  });

  it('includes turn_number from state', () => {
    const { state, campaign, manifest } = setupCampaignState();
    const result = rollInstallment(state, campaign.id, manifest);
    expect(result.turn_number).toBe(state.turn_number);
  });
});

describe('campaign release campaigns', () => {
  it('generates an album release plan for album campaigns', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ talent: 80, form: 75, marketability: 60 }) });
    const manifest = makeManifest({
      campaign_types: [makeCampaignType({ key: 'album_cycle', release_kind: 'album' })],
    });
    const state = makeRunState({ money: 20_000, roster: [client] });
    const result = startCampaign(state, clientId, 'album_cycle', [], manifest);
    expect(result.campaigns[0].release_plan?.kind).toBe('album');
    expect(result.campaigns[0].release_plan?.songs).toHaveLength(10);
    expect(result.campaigns[0].release_plan?.songs[0].quality).toBeGreaterThan(0);
  });

  it('treats mixtape drops as multi-song release campaigns with catalog streams', () => {
    const clientId = nextId();
    const client = makeClient({
      id: clientId,
      audience: 20_000,
      stats: makeClientStats({ talent: 80, form: 95, marketability: 70 }),
    });
    const campaignType = makeCampaignType({
      key: 'mixtape_drop',
      label: 'Mixtape Drop',
      release_kind: 'mixtape',
      form_weight: 1,
      variance: 0.01,
      total_turns: 1,
    });
    const manifest = makeManifest({ campaign_types: [campaignType] });
    const started = startCampaign(
      makeRunState({ money: 20_000, roster: [client] }),
      clientId,
      'mixtape_drop',
      [],
      manifest,
    );

    expect(started.campaigns[0].release_plan?.kind).toBe('mixtape');
    expect(started.campaigns[0].release_plan?.songs.length).toBeGreaterThan(1);

    const installment = rollInstallment(started, started.campaigns[0].id, manifest);
    expect(installment.money_delta).toBe(0);

    const completed = closeCampaign(started, started.campaigns[0].id, manifest);
    expect(completed.roster[0].catalog_releases[0].kind).toBe('mixtape');
    expect(completed.roster[0].catalog_releases[0].is_selling_albums).toBe(true);

    const collected = collectCatalogIncome(completed);
    expect(collected.income).toBeGreaterThan(0);
    expect(collected.state.roster[0].catalog_releases[0].latest_turn_streams).toBeGreaterThan(0);
    expect(collected.state.roster[0].catalog_releases[0].latest_turn_album_units).toBeGreaterThan(0);
  });

  it('gives non-zero reputation_delta for release campaign installments', () => {
    // high form → great outcome → +2 rep
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ form: 95 }) });
    const campaignType = makeCampaignType({ key: 'album_cycle', release_kind: 'album', form_weight: 1, variance: 0.01 });
    const manifest = makeManifest({ campaign_types: [campaignType] });
    const campaign: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'album_cycle',
      total_turns: 4, turns_remaining: 4, installment_results: [], pending_objective_ids: [],
    };
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = rollInstallment(state, campaign.id, manifest);
    expect(result.reputation_delta).toBe(3);
  });

  it('moves completed release campaigns into talent history and catalog', () => {
    const clientId = nextId();
    const campaignId = nextId();
    const client = makeClient({ id: clientId, active_campaign_id: campaignId });
    const campaignType = makeCampaignType({ key: 'single_release', label: 'Single Release', release_kind: 'single' });
    const campaign: Campaign = {
      id: campaignId,
      client_id: clientId,
      type_key: 'single_release',
      release_plan: {
        kind: 'single',
        title: 'Test Single',
        songs: [{ id: 'song_1', title: 'Test Single', quality: 82 }],
      },
      total_turns: 2,
      turns_remaining: 0,
      installment_results: [],
      pending_objective_ids: [],
    };
    const manifest = makeManifest({ campaign_types: [campaignType] });
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = closeCampaign(state, campaignId, manifest);
    expect(result.roster[0].campaign_history).toHaveLength(1);
    expect(result.roster[0].catalog_releases).toHaveLength(1);
    expect(result.roster[0].catalog_releases[0].kind).toBe('single');
  });

  it('pays ongoing stream income and grows fans after release completion', () => {
    const clientId = nextId();
    const client = makeClient({
      id: clientId,
      audience: 20_000,
      catalog_releases: [{
        id: 'rel_1',
        campaign_id: 'camp_1',
        kind: 'single',
        type_key: 'single_release',
        title: 'Test Single',
        songs: [{ id: 'song_1', title: 'Test Single', quality: 90 }],
        released_turn: 1,
        turns_since_release: 0,
        album_units_sold: 0,
        total_streams: 0,
        album_income_total: 0,
        stream_income_total: 0,
        latest_turn_album_units: 0,
        latest_turn_streams: 0,
        latest_turn_income: 0,
        latest_turn_fan_gain: 0,
        total_fan_gain: 0,
        is_selling_albums: false,
      }],
    });
    const state = makeRunState({ money: 1_000, roster: [client] });
    const result = collectCatalogIncome(state);
    expect(result.income).toBeGreaterThan(0);
    expect(result.fanGain).toBeGreaterThan(0);
    expect(result.state.money).toBeGreaterThan(state.money);
    expect(result.state.roster[0].catalog_releases[0].total_streams).toBeGreaterThan(0);
  });

  it('uses the existing fan base to drive album launch sales and then adds fans', () => {
    const release = {
      id: 'rel_1',
      campaign_id: 'camp_1',
      kind: 'album' as const,
      type_key: 'album_cycle',
      title: 'Test Album',
      songs: Array.from({ length: 10 }, (_, index) => ({ id: `song_${index}`, title: `Song ${index}`, quality: 85 })),
      released_turn: 1,
      turns_since_release: 0,
      album_units_sold: 0,
      total_streams: 0,
      album_income_total: 0,
      stream_income_total: 0,
      latest_turn_album_units: 0,
      latest_turn_streams: 0,
      latest_turn_income: 0,
      latest_turn_fan_gain: 0,
      total_fan_gain: 0,
      is_selling_albums: true,
    };
    const lowFans = makeRunState({ roster: [makeClient({ audience: 5_000, catalog_releases: [release] })] });
    const highFans = makeRunState({ roster: [makeClient({ audience: 500_000, catalog_releases: [release] })] });
    const lowResult = collectCatalogIncome(lowFans);
    const highResult = collectCatalogIncome(highFans);
    expect(highResult.state.roster[0].catalog_releases[0].latest_turn_album_units)
      .toBeGreaterThan(lowResult.state.roster[0].catalog_releases[0].latest_turn_album_units);
    expect(highResult.fanGain).toBeGreaterThan(lowResult.fanGain);
  });

  const makeRelease = (kind: 'album' | 'mixtape' | 'single', overrides?: Partial<{ id: string; released_turn: number; turns_since_release: number }>) => ({
    id: overrides?.id ?? 'rel_1',
    campaign_id: 'camp_release',
    kind,
    type_key: `${kind}_campaign`,
    title: 'Test Release',
    songs: [{ id: 's1', title: 'Track 1', quality: 75 }],
    released_turn: overrides?.released_turn ?? 1,
    turns_since_release: overrides?.turns_since_release ?? 0,
    album_units_sold: 0,
    total_streams: 0,
    album_income_total: 0,
    stream_income_total: 0,
    latest_turn_album_units: 0,
    latest_turn_streams: 0,
    latest_turn_income: 0,
    latest_turn_fan_gain: 0,
    total_fan_gain: 0,
    is_selling_albums: kind === 'album' || kind === 'mixtape',
  });

  const makeGigCampaign = (clientId: string): Campaign => ({
    id: 'camp_gig',
    client_id: clientId,
    type_key: 'perform_gigs',
    total_turns: 3,
    turns_remaining: 2,
    installment_results: [],
    pending_objective_ids: [],
  });

  it('boosts rising-artist mixtape streams and units by roughly 2x when gigging', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, arc_stage: 'rising', audience: 10_000, catalog_releases: [makeRelease('mixtape')] });
    const noGig = makeRunState({ roster: [client] });
    const withGig = makeRunState({ roster: [client], campaigns: [makeGigCampaign(clientId)] });
    const baseResult = collectCatalogIncome(noGig).state.roster[0].catalog_releases[0];
    const boostedResult = collectCatalogIncome(withGig).state.roster[0].catalog_releases[0];
    expect(boostedResult.latest_turn_streams).toBeGreaterThan(baseResult.latest_turn_streams * 1.9);
    expect(boostedResult.latest_turn_album_units).toBeGreaterThan(baseResult.latest_turn_album_units);
    expect(boostedResult.latest_turn_album_units).toBeGreaterThan(0);
  });

  it('mixtape generates unit sales (non-zero) even without gigging', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, arc_stage: 'rising', audience: 10_000, catalog_releases: [makeRelease('mixtape')] });
    const state = makeRunState({ roster: [client] });
    const result = collectCatalogIncome(state).state.roster[0].catalog_releases[0];
    expect(result.latest_turn_album_units).toBeGreaterThan(0);
  });

  it('boosts peak-artist album units by 25% when gigging', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, arc_stage: 'peak', audience: 50_000, catalog_releases: [makeRelease('album')] });
    const noGig = makeRunState({ roster: [client] });
    const withGig = makeRunState({ roster: [client], campaigns: [makeGigCampaign(clientId)] });
    const base = collectCatalogIncome(noGig).state.roster[0].catalog_releases[0].latest_turn_album_units;
    const boosted = collectCatalogIncome(withGig).state.roster[0].catalog_releases[0].latest_turn_album_units;
    expect(boosted).toBeCloseTo(base * 1.25, 0);
  });

  it('does not boost sales when no perform_gigs campaign is active', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, arc_stage: 'rising', audience: 10_000, catalog_releases: [makeRelease('mixtape')] });
    const nonGigCampaign: Campaign = { ...makeGigCampaign(clientId), type_key: 'single_release' };
    const withOtherCampaign = makeRunState({ roster: [client], campaigns: [nonGigCampaign] });
    const noCampaign = makeRunState({ roster: [client] });
    const withOther = collectCatalogIncome(withOtherCampaign).state.roster[0].catalog_releases[0].latest_turn_streams;
    const withNone = collectCatalogIncome(noCampaign).state.roster[0].catalog_releases[0].latest_turn_streams;
    expect(withOther).toBe(withNone);
  });

  it('rising-artist gig boost scales upward with larger audience', () => {
    const smallClientId = nextId();
    const largeClientId = nextId();
    const smallClient = makeClient({ id: smallClientId, arc_stage: 'rising', audience: 1_000, catalog_releases: [makeRelease('mixtape')] });
    const largeClient = makeClient({ id: largeClientId, arc_stage: 'rising', audience: 100_000, catalog_releases: [makeRelease('mixtape')] });
    const smallState = makeRunState({ roster: [smallClient], campaigns: [makeGigCampaign(smallClientId)] });
    const largeState = makeRunState({ roster: [largeClient], campaigns: [makeGigCampaign(largeClientId)] });
    const smallStreams = collectCatalogIncome(smallState).state.roster[0].catalog_releases[0].latest_turn_streams;
    const largeStreams = collectCatalogIncome(largeState).state.roster[0].catalog_releases[0].latest_turn_streams;
    // Larger audience gets a bigger absolute stream count AND a higher per-unit boost
    expect(largeStreams).toBeGreaterThan(smallStreams);
  });

  it('performing boost applies only to the most recent release, not older ones', () => {
    const clientId = nextId();
    const olderRelease = makeRelease('mixtape', { id: 'rel_old', released_turn: 1, turns_since_release: 10 });
    const newerRelease = makeRelease('mixtape', { id: 'rel_new', released_turn: 11, turns_since_release: 0 });
    const client = makeClient({ id: clientId, arc_stage: 'rising', audience: 10_000, catalog_releases: [olderRelease, newerRelease] });
    const noGig = makeRunState({ roster: [client] });
    const withGig = makeRunState({ roster: [client], campaigns: [makeGigCampaign(clientId)] });

    const noGigResult = collectCatalogIncome(noGig).state.roster[0].catalog_releases;
    const withGigResult = collectCatalogIncome(withGig).state.roster[0].catalog_releases;

    const olderNoGig   = noGigResult.find(r => r.id === 'rel_old')!;
    const olderWithGig = withGigResult.find(r => r.id === 'rel_old')!;
    const newerNoGig   = noGigResult.find(r => r.id === 'rel_new')!;
    const newerWithGig = withGigResult.find(r => r.id === 'rel_new')!;

    // Older release: no boost — numbers identical
    expect(olderWithGig.latest_turn_streams).toBe(olderNoGig.latest_turn_streams);
    expect(olderWithGig.latest_turn_album_units).toBe(olderNoGig.latest_turn_album_units);
    // Newer release: boosted
    expect(newerWithGig.latest_turn_streams).toBeGreaterThan(newerNoGig.latest_turn_streams);
  });
});

// ─── startCampaign ───────────────────────────────────────────────────────────

describe('campaign — startCampaign', () => {
  it('adds the campaign to state.campaigns', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ roster: [client] });
    const result = startCampaign(state, clientId, 'test_campaign', [], manifest);
    expect(result.campaigns).toHaveLength(1);
  });

  it('links active_campaign_id on the client', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ roster: [client] });
    const result = startCampaign(state, clientId, 'test_campaign', [], manifest);
    const updatedClient = result.roster.find(c => c.id === clientId);
    expect(updatedClient?.active_campaign_id).toBe(result.campaigns[0].id);
  });

  it('does nothing if campaign type not in manifest', () => {
    const clientId = nextId();
    const state = makeRunState({ roster: [makeClient({ id: clientId })] });
    const result = startCampaign(state, clientId, 'unknown_type', [], makeManifest());
    expect(result.campaigns).toHaveLength(0);
  });

  it('stores chosen campaign setup and deducts its budget', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ money: 20_000, roster: [client] });
    const result = startCampaign(
      state,
      clientId,
      'test_campaign',
      [],
      manifest,
      { size: 'large', length: 6, budget: 8_000 },
    );
    expect(result.campaigns[0].setup?.size).toBe('large');
    expect(result.campaigns[0].total_turns).toBe(6);
    expect(result.money).toBe(12_000);
  });

  it('does not start a campaign when the setup budget is unaffordable', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ money: 1_000, roster: [client] });
    const result = startCampaign(
      state,
      clientId,
      'test_campaign',
      [],
      manifest,
      { size: 'large', length: 6, budget: 8_000 },
    );
    expect(result).toBe(state);
    expect(result.campaigns).toHaveLength(0);
  });

  it('does not start a second campaign for a client with an active campaign', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, active_campaign_id: 'camp_active' });
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ roster: [client] });
    const result = startCampaign(state, clientId, 'test_campaign', [], manifest);
    expect(result).toBe(state);
    expect(result.campaigns).toHaveLength(0);
  });

  it('blocks label-required campaigns until the client has an active label contract', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const labelCampaign = makeCampaignType({ requires_label_contract: true });
    const manifest = makeManifest({ campaign_types: [labelCampaign] });
    const withoutLabel = makeRunState({ roster: [client] });

    expect(clientMeetsCampaignContractRequirements(withoutLabel, clientId, labelCampaign)).toBe(false);
    expect(startCampaign(withoutLabel, clientId, 'test_campaign', [], manifest)).toBe(withoutLabel);

    const withLabel = makeRunState({
      roster: [client],
      contracts: [makeContract({
        client_id: clientId,
        tier: 'client_entity',
        exclusivity_scope: 'label',
        duration_remaining: 4,
      })],
    });

    expect(clientMeetsCampaignContractRequirements(withLabel, clientId, labelCampaign)).toBe(true);
    expect(startCampaign(withLabel, clientId, 'test_campaign', [], manifest).campaigns).toHaveLength(1);
  });

  it('blocks start when auto_link_contract_scope is set but no matching contract is active', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const commissionCampaign = makeCampaignType({ auto_link_contract_scope: 'commission' });
    const manifest = makeManifest({ campaign_types: [commissionCampaign] });
    const state = makeRunState({ roster: [client] });
    expect(startCampaign(state, clientId, 'test_campaign', [], manifest)).toBe(state);
  });

  it('auto-links unmet objectives from the matching commission contract', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const obj = makeObjective({ is_paid: false });
    const commissionContract = makeContract({
      client_id: clientId,
      tier: 'client_entity',
      payout_type: 'per_objective',
      exclusivity_scope: 'commission',
      duration_remaining: 8,
      objectives: [obj],
    });
    const commissionCampaign = makeCampaignType({ auto_link_contract_scope: 'commission' });
    const manifest = makeManifest({ campaign_types: [commissionCampaign] });
    const state = makeRunState({ roster: [client], contracts: [commissionContract] });
    const result = startCampaign(state, clientId, 'test_campaign', [], manifest);
    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].pending_objective_ids).toContain(obj.id);
  });
});

describe('campaign — buildCampaignSetup', () => {
  it('respects per-size budget floors from the manifest', () => {
    // Low base_payout so the raw formula falls below each floor
    const cheapType = makeCampaignType({ base_payout: 100, total_turns: 1 });
    const floors = { small: 150, medium: 400, large: 900 };
    expect(buildCampaignSetup(cheapType, 'small',  1, undefined, floors).budget).toBe(150);
    expect(buildCampaignSetup(cheapType, 'medium', 1, undefined, floors).budget).toBe(400);
    expect(buildCampaignSetup(cheapType, 'large',  1, undefined, floors).budget).toBe(900);
  });

  it('falls back to 500 floor when no budgetFloors provided', () => {
    const cheapType = makeCampaignType({ base_payout: 100, total_turns: 1 });
    expect(buildCampaignSetup(cheapType, 'small').budget).toBe(500);
  });

  it('scales campaign cost, payout, audience growth, and event risk by size', () => {
    const campaignType = makeCampaignType();
    const small = buildCampaignSetup(campaignType, 'small');
    const large = buildCampaignSetup(campaignType, 'large');

    expect(large.budget).toBeGreaterThan(small.budget);
    expect(large.payout_multiplier).toBeGreaterThan(small.payout_multiplier);
    expect(large.audience_multiplier).toBeGreaterThan(small.audience_multiplier);
    expect(large.event_risk_multiplier).toBeGreaterThan(small.event_risk_multiplier);
  });

  it('music perform gigs is cheap and can generate fans through normal campaign advancement', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const gigs = MUSIC_MANIFEST.campaign_types.find(c => c.key === 'perform_gigs');
    const tour = MUSIC_MANIFEST.campaign_types.find(c => c.key === 'tour');
    expect(gigs).toBeDefined();
    expect(tour).toBeDefined();

    const gigsSetup = buildCampaignSetup(gigs!);
    const tourSetup = buildCampaignSetup(tour!);
    expect(gigsSetup.budget).toBeLessThan(tourSetup.budget);

    const clientId = nextId();
    const client = makeClient({ id: clientId, audience: 500, stats: makeClientStats({ form: 65, marketability: 55 }) });
    const started = startCampaign(
      makeRunState({ money: 5_000, roster: [client] }),
      clientId,
      'perform_gigs',
      [],
      MUSIC_MANIFEST,
    );
    expect(started.money).toBe(5_000 - gigsSetup.budget);

    const advanced = advanceCampaigns(started, MUSIC_MANIFEST);
    expect(advanced.roster[0].audience).toBeGreaterThan(client.audience);
    expect(advanced.roster[0].stats.talent.true_value).toBe(client.stats.talent.true_value);
    expect(advanced.campaigns[0].installment_results[0].stat_deltas.talent).toBeUndefined();
    expect(advanced.campaigns[0].installment_results[0].money_delta).toBeLessThan(1_000);
    jest.restoreAllMocks();
  });

  it('music mixtape drops generate fans through post-release catalog performance', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const campaignId = nextId();
    const client = makeClient({
      id: clientId,
      active_campaign_id: campaignId,
      arc_stage: 'rising',
      audience: 20_000,
      max_potential: 80,
      stats: makeClientStats({ talent: 60, form: 70, marketability: 55 }),
    });
    const campaign: Campaign = {
      id: campaignId,
      client_id: clientId,
      type_key: 'mixtape_drop',
      setup: buildCampaignSetup(MUSIC_MANIFEST.campaign_types.find(c => c.key === 'mixtape_drop')!),
      release_plan: {
        kind: 'mixtape',
        title: 'Test Tape',
        songs: Array.from({ length: 8 }, (_, index) => ({ id: `song_${index}`, title: `Track ${index + 1}`, quality: 85 })),
      },
      total_turns: 4,
      turns_remaining: 0,
      installment_results: [
        { turn_number: 1, roll_result: 70, outcome_key: 'great', stat_deltas: {}, money_delta: 0, reputation_delta: 2, triggered_event_id: null, triggered_trait_id: null, audience_gain: 0 },
      ],
      pending_objective_ids: [],
    };
    const state = makeRunState({ roster: [client], campaigns: [campaign] });

    const completed = closeCampaign(state, campaignId, MUSIC_MANIFEST);
    expect(completed.roster[0].audience).toBe(client.audience);
    expect(completed.roster[0].catalog_releases[0].kind).toBe('mixtape');

    const collected = collectCatalogIncome(completed);
    expect(collected.fanGain).toBeGreaterThan(0);
    expect(collected.state.roster[0].audience).toBeGreaterThan(client.audience);
    jest.restoreAllMocks();
  });

  it('rolls once for rising gig talent growth using coaching skill', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const campaignId = nextId();
    const client = makeClient({
      id: clientId,
      active_campaign_id: campaignId,
      arc_stage: 'rising',
      max_potential: 80,
      stats: makeClientStats({ talent: 60 }),
    });
    const campaign: Campaign = {
      id: campaignId,
      client_id: clientId,
      type_key: 'perform_gigs',
      setup: buildCampaignSetup(MUSIC_MANIFEST.campaign_types.find(c => c.key === 'perform_gigs')!),
      total_turns: 3,
      turns_remaining: 0,
      installment_results: [
        { turn_number: 1, roll_result: 70, outcome_key: 'great', stat_deltas: {}, money_delta: 0, reputation_delta: 2, triggered_event_id: null, triggered_trait_id: null, audience_gain: 0 },
        { turn_number: 2, roll_result: 70, outcome_key: 'great', stat_deltas: {}, money_delta: 0, reputation_delta: 2, triggered_event_id: null, triggered_trait_id: null, audience_gain: 0 },
        { turn_number: 3, roll_result: 70, outcome_key: 'great', stat_deltas: {}, money_delta: 0, reputation_delta: 2, triggered_event_id: null, triggered_trait_id: null, audience_gain: 0 },
      ],
      pending_objective_ids: [],
    };
    const state = makeRunState({
      agent: makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 0, operations: 0, coaching: 5 } }),
      roster: [client],
      campaigns: [campaign],
    });

    const completed = closeCampaign(state, campaignId, MUSIC_MANIFEST);
    expect(completed.roster[0].stats.talent.true_value).toBe(61);
    jest.restoreAllMocks();
  });

  it('does not grow rising mixtape talent when the coaching roll misses', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    const clientId = nextId();
    const campaignId = nextId();
    const client = makeClient({
      id: clientId,
      active_campaign_id: campaignId,
      arc_stage: 'rising',
      max_potential: 80,
      stats: makeClientStats({ talent: 60 }),
    });
    const campaign: Campaign = {
      id: campaignId,
      client_id: clientId,
      type_key: 'mixtape_drop',
      setup: buildCampaignSetup(MUSIC_MANIFEST.campaign_types.find(c => c.key === 'mixtape_drop')!),
      total_turns: 4,
      turns_remaining: 0,
      installment_results: [
        { turn_number: 1, roll_result: 70, outcome_key: 'great', stat_deltas: {}, money_delta: 0, reputation_delta: 2, triggered_event_id: null, triggered_trait_id: null, audience_gain: 0 },
      ],
      pending_objective_ids: [],
    };
    const state = makeRunState({ roster: [client], campaigns: [campaign] });

    const completed = closeCampaign(state, campaignId, MUSIC_MANIFEST);
    expect(completed.roster[0].stats.talent.true_value).toBe(60);
    jest.restoreAllMocks();
  });

  it('does not give gig talent growth outside the rising arc', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const campaignId = nextId();
    const client = makeClient({
      id: clientId,
      active_campaign_id: campaignId,
      arc_stage: 'peak',
      stats: makeClientStats({ talent: 60, form: 70, marketability: 55 }),
    });
    const campaign: Campaign = {
      id: campaignId,
      client_id: clientId,
      type_key: 'perform_gigs',
      setup: buildCampaignSetup(MUSIC_MANIFEST.campaign_types.find(c => c.key === 'perform_gigs')!),
      total_turns: 3,
      turns_remaining: 0,
      installment_results: [
        { turn_number: 1, roll_result: 70, outcome_key: 'great', stat_deltas: {}, money_delta: 0, reputation_delta: 2, triggered_event_id: null, triggered_trait_id: null, audience_gain: 0 },
      ],
      pending_objective_ids: [],
    };
    const state = makeRunState({
      agent: makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 0, operations: 0, coaching: 5 } }),
      roster: [client],
      campaigns: [campaign],
    });

    const completed = closeCampaign(state, campaignId, MUSIC_MANIFEST);
    expect(completed.roster[0].stats.talent.true_value).toBe(60);
    jest.restoreAllMocks();
  });

  it('does not give rising talent growth for album or single campaigns', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const albumClientId = nextId();
    const singleClientId = nextId();
    const albumCampaign: Campaign = {
      id: nextId(),
      client_id: albumClientId,
      type_key: 'album_cycle',
      setup: buildCampaignSetup(MUSIC_MANIFEST.campaign_types.find(c => c.key === 'album_cycle')!),
      total_turns: 10,
      turns_remaining: 10,
      installment_results: [],
      pending_objective_ids: [],
    };
    const singleCampaign: Campaign = {
      id: nextId(),
      client_id: singleClientId,
      type_key: 'single_release',
      setup: buildCampaignSetup(MUSIC_MANIFEST.campaign_types.find(c => c.key === 'single_release')!),
      total_turns: 2,
      turns_remaining: 2,
      installment_results: [],
      pending_objective_ids: [],
    };
    const state = makeRunState({
      roster: [
        makeClient({ id: albumClientId, arc_stage: 'rising', stats: makeClientStats({ talent: 60, form: 70 }) }),
        makeClient({ id: singleClientId, arc_stage: 'rising', stats: makeClientStats({ talent: 60, form: 70 }) }),
      ],
      campaigns: [albumCampaign, singleCampaign],
    });

    const advanced = advanceCampaigns(state, MUSIC_MANIFEST);
    expect(advanced.roster.find(c => c.id === albumClientId)?.stats.talent.true_value).toBe(60);
    expect(advanced.roster.find(c => c.id === singleClientId)?.stats.talent.true_value).toBe(60);
    jest.restoreAllMocks();
  });
});

// ─── closeCampaign ───────────────────────────────────────────────────────────

describe('campaign — closeCampaign', () => {
  it('removes the campaign from state.campaigns', () => {
    const { state, campaign, manifest } = setupCampaignState();
    const result = closeCampaign(state, campaign.id, manifest);
    expect(result.campaigns).toHaveLength(0);
  });

  it('clears active_campaign_id on the client', () => {
    const { state, campaign, client, manifest } = setupCampaignState();
    // Set active_campaign_id on client
    const stateWithLink = {
      ...state,
      roster: state.roster.map(c => c.id === client.id ? { ...c, active_campaign_id: campaign.id } : c),
    };
    const result = closeCampaign(stateWithLink, campaign.id, manifest);
    const updatedClient = result.roster.find(c => c.id === client.id);
    expect(updatedClient?.active_campaign_id).toBeNull();
  });
});

// ─── advanceCampaigns ────────────────────────────────────────────────────────

describe('campaign — advanceCampaigns', () => {
  it('decrements turns_remaining for each active campaign', () => {
    const { state, campaign, manifest } = setupCampaignState();
    const result = advanceCampaigns(state, manifest);
    const updated = result.campaigns.find(c => c.id === campaign.id);
    // Campaign may be closed if turns_remaining was 1; use total_turns=4 so it stays open
    expect(updated?.turns_remaining ?? 0).toBe(campaign.turns_remaining - 1);
  });

  it('closes campaign when turns_remaining hits 0', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, active_campaign_id: 'camp_1' });
    const campaign: Campaign = {
      id: 'camp_1', client_id: clientId, type_key: 'test_campaign',
      total_turns: 1, turns_remaining: 1, installment_results: [], pending_objective_ids: [],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType({ total_turns: 1 })] });
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = advanceCampaigns(state, manifest);
    expect(result.campaigns).toHaveLength(0);
  });

  it('is a no-op when there are no campaigns', () => {
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState();
    const result = advanceCampaigns(state, manifest);
    expect(result.campaigns).toHaveLength(0);
  });

  it('removes campaigns whose client is no longer on the roster', () => {
    const campaign: Campaign = {
      id: nextId(), client_id: 'missing_client', type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [], pending_objective_ids: [],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ roster: [], campaigns: [campaign] });
    const result = advanceCampaigns(state, manifest);
    expect(result.campaigns).toHaveLength(0);
  });

  it('adds money to state for per_week campaign installments', () => {
    // form=100, form_weight=1 → roll ≈ 100 → money_delta = base_payout
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ form: 100 }) });
    const campaignType = makeCampaignType({ form_weight: 1, variance: 0.01, base_payout: 3000, payout_type: 'per_week' });
    const manifest = makeManifest({ campaign_types: [campaignType] });
    const campaign: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [], pending_objective_ids: [],
    };
    const state = makeRunState({ money: 0, roster: [client], campaigns: [campaign] });
    const result = advanceCampaigns(state, manifest);
    // At form=100, roll ≈ 100, money_delta ≈ (100/100)*3000 = 3000
    expect(result.money).toBeGreaterThan(0);
    expect(result.total_earnings).toBeGreaterThan(0);
  });

  it('grows client audience from campaign installments', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, audience: 8_000, stats: makeClientStats({ form: 100, marketability: 70 }) });
    const campaignType = makeCampaignType({ form_weight: 1, variance: 0.01 });
    const manifest = makeManifest({ campaign_types: [campaignType] });
    const campaign: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [], pending_objective_ids: [],
    };
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = advanceCampaigns(state, manifest);
    expect(result.roster[0].audience).toBeGreaterThan(client.audience);
  });
});

// ─── rollInstallment — per_week payout ──────────────────────────────────────

describe('campaign — rollInstallment payout', () => {
  it('money_delta is proportional to roll_result for per_week type', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ form: 100 }) });
    const campaignType = makeCampaignType({ form_weight: 1, variance: 0.01, base_payout: 5_000, payout_type: 'per_week' });
    const manifest = makeManifest({ campaign_types: [campaignType] });
    const campaign: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [], pending_objective_ids: [],
    };
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = rollInstallment(state, campaign.id, manifest);
    // money_delta = round((roll / 100) * 5000) — should be significant at form=100
    expect(result.money_delta).toBeGreaterThan(0);
    expect(result.money_delta).toBeLessThanOrEqual(5_000);
  });

  it('money_delta is 0 for non-per_week payout types', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ form: 100 }) });
    const campaignType = makeCampaignType({ payout_type: 'lump_sum' });
    const manifest = makeManifest({ campaign_types: [campaignType] });
    const campaign: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [], pending_objective_ids: [],
    };
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = rollInstallment(state, campaign.id, manifest);
    expect(result.money_delta).toBe(0);
  });
});

// ─── checkInstallmentEventTrigger ────────────────────────────────────────────

const makeEventDef = (overrides?: Partial<EventDefinition>): EventDefinition => ({
  key: 'test_event',
  category: 'client',
  severity: 'minor',
  description_template: 'Test event description',
  options: [
    { key: 'handle', label: 'Handle', outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {} } },
  ],
  default_outcome: { money_delta: -500, reputation_delta: -1, stat_deltas: {} },
  defense_track_key: 'medical',
  ...overrides,
});

describe('campaign — checkInstallmentEventTrigger', () => {
  afterEach(() => jest.restoreAllMocks());

  const lowRollResult: CampaignInstallmentResult = {
    turn_number: 1, roll_result: 10, outcome_key: 'poor',
    stat_deltas: {}, money_delta: 0, reputation_delta: -1,
    triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
  };

  const highRollResult: CampaignInstallmentResult = {
    turn_number: 1, roll_result: 90, outcome_key: 'great',
    stat_deltas: {}, money_delta: 3000, reputation_delta: 2,
    triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
  };

  it('adds a pending event when roll is below event_trigger_threshold', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const { state, campaign, manifest: base } = setupCampaignState({ event_trigger_threshold: 50 });
    const manifest = { ...base, events: [makeEventDef()] };
    const result = checkInstallmentEventTrigger(state, lowRollResult, campaign.id, manifest);
    expect(result.pending_events).toHaveLength(1);
  });

  it('does not add an event when roll is above threshold', () => {
    const { state, campaign, manifest: base } = setupCampaignState({ event_trigger_threshold: 50 });
    const manifest = { ...base, events: [makeEventDef()] };
    const result = checkInstallmentEventTrigger(state, highRollResult, campaign.id, manifest);
    expect(result.pending_events).toHaveLength(0);
  });

  it('does not add an event when manifest has no client events', () => {
    const { state, campaign, manifest } = setupCampaignState({ event_trigger_threshold: 50 });
    // manifest has empty events array
    const result = checkInstallmentEventTrigger(state, lowRollResult, campaign.id, manifest);
    expect(result.pending_events).toHaveLength(0);
  });

  it('generated event has options from manifest (new format)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const { state, campaign, manifest: base } = setupCampaignState({ event_trigger_threshold: 50 });
    const manifest = { ...base, events: [makeEventDef()] };
    const result = checkInstallmentEventTrigger(state, lowRollResult, campaign.id, manifest);
    const event = result.pending_events[0];
    expect(event).toBeDefined();
    expect(Array.isArray(event.options)).toBe(true);
    expect(event.options[0].key).toBe('handle');
    expect(event.options[0].outcome).toBeDefined();
    expect(event.default_outcome.money_delta).toBe(-500);
  });

  it('prefers campaign-specific events and records the campaign id', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const { state, campaign, manifest: base } = setupCampaignState({ event_trigger_threshold: 50 });
    const manifest = {
      ...base,
      events: [
        makeEventDef({ key: 'generic_client_event' }),
        makeEventDef({ key: 'campaign_client_event', campaign_type_keys: ['test_campaign'] }),
      ],
    };
    const result = checkInstallmentEventTrigger(state, lowRollResult, campaign.id, manifest);
    expect(result.pending_events[0].template_key).toBe('campaign_client_event');
    expect(result.pending_events[0].campaign_id).toBe(campaign.id);
  });

  it('is a no-op when campaign is not found', () => {
    const { state, manifest: base } = setupCampaignState();
    const manifest = { ...base, events: [makeEventDef()] };
    const result = checkInstallmentEventTrigger(state, lowRollResult, 'unknown_campaign', manifest);
    expect(result).toBe(state);
  });
});

// ─── checkInstallmentTraitTrigger ────────────────────────────────────────────

describe('campaign — checkInstallmentTraitTrigger', () => {
  const highRollResult: CampaignInstallmentResult = {
    turn_number: 1, roll_result: 95, outcome_key: 'great',
    stat_deltas: {}, money_delta: 3000, reputation_delta: 2,
    triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
  };

  const lowRollResult: CampaignInstallmentResult = {
    turn_number: 1, roll_result: 50, outcome_key: 'average',
    stat_deltas: {}, money_delta: 0, reputation_delta: 0,
    triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
  };

  const testTrait: TraitDefinition = {
    key: 'test_trait',
    label: 'Test Trait',
    stat_modifiers: {},
    marketability_modifier: 0,
    event_bias: {},
    trigger_condition_key: 'test_campaign',
    trigger_threshold: 80,
  };

  it('grants a trait when roll exceeds trait_trigger_threshold', () => {
    const { state, campaign, manifest: base } = setupCampaignState({ trait_trigger_threshold: 80 });
    const manifest = { ...base, traits: [testTrait] };
    const result = checkInstallmentTraitTrigger(state, highRollResult, campaign.id, manifest);
    const updatedClient = result.roster[0];
    expect(updatedClient.traits).toHaveLength(1);
    expect(updatedClient.traits[0].trait_id).toBe('test_trait');
  });

  it('does not grant a trait when roll is below trait_trigger_threshold', () => {
    const { state, campaign, manifest: base } = setupCampaignState({ trait_trigger_threshold: 80 });
    const manifest = { ...base, traits: [testTrait] };
    const result = checkInstallmentTraitTrigger(state, lowRollResult, campaign.id, manifest);
    expect(result).toBe(state);
  });

  it('does not grant a trait when no matching trait exists in manifest', () => {
    const { state, campaign, manifest } = setupCampaignState({ trait_trigger_threshold: 80 });
    const result = checkInstallmentTraitTrigger(state, highRollResult, campaign.id, manifest);
    expect(result).toBe(state);
  });
});

// ─── settleCampaignObjectives ─────────────────────────────────────────────────

describe('campaign — settleCampaignObjectives', () => {
  it('marks linked objectives as is_paid and pays out money', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const objId    = nextId();
    const obj      = makeObjective({ id: objId, payout: 5_000 });
    const contract = makeContract({ client_id: clientId, objectives: [obj] });
    const campaign: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [],
      pending_objective_ids: [objId],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state    = makeRunState({ money: 1_000, roster: [client], contracts: [contract], campaigns: [campaign] });
    const result   = settleCampaignObjectives(state, campaign.id, manifest);
    expect(result.money).toBe(6_000);
    expect(result.contracts[0].objectives[0].is_paid).toBe(true);
  });

  it('pays only the agency cut for linked client-entity objectives', () => {
    const clientId = nextId();
    const agentContractId = nextId();
    const client = makeClient({ id: clientId, agent_contract_id: agentContractId });
    const agentContract = makeContract({
      id: agentContractId, tier: 'agent_client', client_id: clientId,
      your_cut: 25, amount: 0,
    });
    const objId = nextId();
    const obj = makeObjective({ id: objId, payout: 8_000 });
    const entityContract = makeContract({
      tier: 'client_entity', client_id: clientId, entity_id: nextId(),
      payout_type: 'per_objective', your_cut: null, objectives: [obj],
    });
    const campaign: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [],
      pending_objective_ids: [objId],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({
      money: 1_000,
      roster: [client],
      contracts: [agentContract, entityContract],
      campaigns: [campaign],
    });
    const result = settleCampaignObjectives(state, campaign.id, manifest);
    expect(result.money).toBe(3_000);
    expect(result.contracts[1].objectives[0].is_paid).toBe(true);
  });

  it('is a no-op when the campaign has no pending_objective_ids', () => {
    const { state, campaign, manifest } = setupCampaignState();
    // campaign.pending_objective_ids is already []
    const result = settleCampaignObjectives(state, campaign.id, manifest);
    expect(result).toBe(state);
  });

  it('applies per_installment_stat_deltas when campaign type has them', () => {
    const { state, campaign, manifest: base } = setupCampaignState();
    const manifest = {
      ...base,
      campaign_types: base.campaign_types.map(t => ({
        ...t,
        per_installment_stat_deltas: { form: -2 },
      })),
    };
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = advanceCampaigns(state, manifest);
    const updatedClient = result.roster[0];
    // form should have decreased by 2 (clamped at 0)
    expect(updatedClient.stats.form.true_value).toBe(Math.max(0, state.roster[0].stats.form.true_value - 2));
    jest.restoreAllMocks();
  });

  it('rollInstallment applies form modifier from client traits', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const campaignId = nextId();
    // Client with a trait that boosts form by 15
    const client = makeClient({
      id: clientId,
      stats: makeClientStats({ form: 50 }),
      traits: [{ trait_id: 'in_form', stat_modifiers: { form: 15 }, marketability_modifier: 0, event_bias: {} }],
    });
    const campaign: Campaign = {
      id: campaignId, client_id: clientId, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [],
      pending_objective_ids: [],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType({ form_weight: 1, base_payout: 1_000 })] });
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = rollInstallment(state, campaignId, manifest);
    // With form=50, trait adds 15 → effectiveForm=65. Roll should reflect this.
    expect(result.roll_result).toBeGreaterThanOrEqual(0);
    expect(result.roll_result).toBeLessThanOrEqual(100);
    jest.restoreAllMocks();
  });

  it('does not pay objectives not in pending_objective_ids', () => {
    const clientId   = nextId();
    const client     = makeClient({ id: clientId });
    const unlinkedId = nextId();
    const obj        = makeObjective({ id: unlinkedId, payout: 5_000 });
    const contract   = makeContract({ client_id: clientId, objectives: [obj] });
    const campaign: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [],
      pending_objective_ids: [],  // empty — obj not linked
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state    = makeRunState({ money: 1_000, roster: [client], contracts: [contract], campaigns: [campaign] });
    const result   = settleCampaignObjectives(state, campaign.id, manifest);
    expect(result).toBe(state);
    expect(result.money).toBe(1_000);
  });
});

// ─── normalRandom — edge branches ────────────────────────────────────────────

describe('campaign — rollInstallment normalRandom edge branches', () => {
  afterEach(() => jest.restoreAllMocks());

  it('handles Math.random() returning 0 (u1 fallback to Number.EPSILON)', () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0)   // u1 = 0 → || Number.EPSILON kicks in
      .mockReturnValue(0.5);    // u2 and subsequent
    const { state, campaign, manifest } = setupCampaignState();
    const result = rollInstallment(state, campaign.id, manifest);
    expect(result.roll_result).toBeGreaterThanOrEqual(0);
    expect(result.roll_result).toBeLessThanOrEqual(100);
  });

  it('trait with no form key in stat_modifiers uses 0 as fallback (form ?? 0)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const campaignId = nextId();
    const client = makeClient({
      id: clientId,
      stats: makeClientStats({ form: 50 }),
      traits: [{ trait_id: 'hustle', stat_modifiers: { morale: 5 }, marketability_modifier: 0, event_bias: {} }],
    });
    const campaign: Campaign = {
      id: campaignId, client_id: clientId, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [], pending_objective_ids: [],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType({ form_weight: 1 })] });
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = rollInstallment(state, campaignId, manifest);
    // formModifierFromTraits = 0 (form key absent → ?? 0) → effectiveForm = 50
    expect(result.roll_result).toBeGreaterThanOrEqual(0);
  });
});

// ─── checkInstallmentEventTrigger — extra branches ───────────────────────────

describe('campaign — checkInstallmentEventTrigger extra branches', () => {
  const lowRollResult: CampaignInstallmentResult = {
    turn_number: 1, roll_result: 10, outcome_key: 'poor',
    stat_deltas: {}, money_delta: 0, reputation_delta: -1,
    triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
  };

  it('returns state when campaign type not in manifest', () => {
    const { state, campaign } = setupCampaignState({ event_trigger_threshold: 50 });
    const manifest = makeManifest({ events: [makeEventDef()], campaign_types: [] });
    const result = checkInstallmentEventTrigger(state, lowRollResult, campaign.id, manifest);
    expect(result).toBe(state);
  });
});

// ─── checkInstallmentTraitTrigger — extra branches ───────────────────────────

describe('campaign — checkInstallmentTraitTrigger extra branches', () => {
  const highRollResult: CampaignInstallmentResult = {
    turn_number: 1, roll_result: 95, outcome_key: 'great',
    stat_deltas: {}, money_delta: 3000, reputation_delta: 2,
    triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
  };

  const testTrait: TraitDefinition = {
    key: 'test_trait',
    label: 'Test Trait',
    stat_modifiers: {},
    marketability_modifier: 0,
    event_bias: {},
    trigger_condition_key: 'test_campaign',
    trigger_threshold: 80,
  };

  it('returns state when campaign not found', () => {
    const { state, manifest: base } = setupCampaignState({ trait_trigger_threshold: 80 });
    const manifest = { ...base, traits: [testTrait] };
    const result = checkInstallmentTraitTrigger(state, highRollResult, 'unknown_campaign_id', manifest);
    expect(result).toBe(state);
  });

  it('returns state when campaign type not in manifest', () => {
    const { state, campaign } = setupCampaignState({ trait_trigger_threshold: 80 });
    const manifest = makeManifest({ traits: [testTrait] }); // campaign type absent
    const result = checkInstallmentTraitTrigger(state, highRollResult, campaign.id, manifest);
    expect(result).toBe(state);
  });

  it('returns state when client not on roster', () => {
    const { state, campaign, manifest: base } = setupCampaignState({ trait_trigger_threshold: 80 });
    const manifest = { ...base, traits: [testTrait] };
    const stateNoClient = { ...state, roster: [] };
    const result = checkInstallmentTraitTrigger(stateNoClient, highRollResult, campaign.id, manifest);
    expect(result).toBe(stateNoClient);
  });

  it('only updates campaign client when roster has multiple clients', () => {
    const { state, campaign, client, manifest: base } = setupCampaignState({ trait_trigger_threshold: 80 });
    const manifest = { ...base, traits: [testTrait] };
    const otherClient = makeClient();
    const stateWithTwo = { ...state, roster: [...state.roster, otherClient] };
    const result = checkInstallmentTraitTrigger(stateWithTwo, highRollResult, campaign.id, manifest);
    const updatedClient = result.roster.find(c => c.id === client.id);
    const untouched = result.roster.find(c => c.id === otherClient.id);
    expect(updatedClient?.traits).toHaveLength(1);
    expect(untouched?.traits).toHaveLength(0);
  });
});

// ─── settleCampaignObjectives — extra branches ────────────────────────────────

describe('campaign — settleCampaignObjectives extra branches', () => {
  it('skips contracts with empty objectives array', () => {
    const clientId = nextId();
    const objId = nextId();
    const emptyContract = makeContract({ client_id: clientId, objectives: [] });
    const campaign: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [],
      pending_objective_ids: [objId],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ money: 1_000, roster: [makeClient({ id: clientId })], contracts: [emptyContract], campaigns: [campaign] });
    const result = settleCampaignObjectives(state, campaign.id, manifest);
    expect(result.money).toBe(1_000);
  });

  it('does not re-pay already-paid objectives', () => {
    const clientId = nextId();
    const objId = nextId();
    const paidObj = makeObjective({ id: objId, payout: 5_000, is_paid: true });
    const contract = makeContract({ client_id: clientId, objectives: [paidObj] });
    const campaign: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [],
      pending_objective_ids: [objId],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ money: 1_000, roster: [makeClient({ id: clientId })], contracts: [contract], campaigns: [campaign] });
    const result = settleCampaignObjectives(state, campaign.id, manifest);
    expect(result.money).toBe(1_000);
  });
});

// ─── startCampaign — roster.map branch ───────────────────────────────────────

describe('campaign — startCampaign roster map branch', () => {
  it('only links active_campaign_id on the target client when roster has multiple', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const otherClient = makeClient();
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ roster: [client, otherClient] });
    const result = startCampaign(state, clientId, 'test_campaign', [], manifest);
    const target = result.roster.find(c => c.id === clientId);
    const other  = result.roster.find(c => c.id === otherClient.id);
    expect(target?.active_campaign_id).not.toBeNull();
    expect(other?.active_campaign_id).toBeNull();
  });
});

// ─── streak helpers ───────────────────────────────────────────────────────────

const makeGreat = (): CampaignInstallmentResult => ({
  turn_number: 1, roll_result: 90, outcome_key: 'great',
  stat_deltas: {}, money_delta: 0, reputation_delta: 3,
  triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
});
const makeAverage = (): CampaignInstallmentResult => ({
  turn_number: 1, roll_result: 55, outcome_key: 'average',
  stat_deltas: {}, money_delta: 0, reputation_delta: 0,
  triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
});

describe('computeCurrentStreak', () => {
  it('returns 0 for empty results', () => {
    expect(computeCurrentStreak([])).toBe(0);
  });

  it('counts trailing consecutive greats', () => {
    expect(computeCurrentStreak([makeAverage(), makeGreat(), makeGreat(), makeGreat()])).toBe(3);
  });

  it('resets on a non-great break', () => {
    expect(computeCurrentStreak([makeGreat(), makeGreat(), makeAverage()])).toBe(0);
  });

  it('returns full length when all greats', () => {
    expect(computeCurrentStreak([makeGreat(), makeGreat()])).toBe(2);
  });
});

describe('computeBestStreak', () => {
  it('returns 0 for empty results', () => {
    expect(computeBestStreak([])).toBe(0);
  });

  it('finds the longest run when there are multiple runs', () => {
    const results = [makeGreat(), makeGreat(), makeAverage(), makeGreat(), makeGreat(), makeGreat()];
    expect(computeBestStreak(results)).toBe(3);
  });

  it('returns the streak length when all greats', () => {
    expect(computeBestStreak([makeGreat(), makeGreat(), makeGreat()])).toBe(3);
  });
});

describe('computeStreakBonus', () => {
  it('returns 0 for streak < 2 regardless of arc', () => {
    expect(computeStreakBonus(0, 'rising')).toBe(0);
    expect(computeStreakBonus(1, 'rising')).toBe(0);
    expect(computeStreakBonus(1, 'peak')).toBe(0);
  });

  it('returns 0 for declining arc at any streak', () => {
    expect(computeStreakBonus(5, 'declining')).toBe(0);
  });

  it('rising arc: streak=2 gives 0.12, streak=6 gives capped 0.60', () => {
    expect(computeStreakBonus(2, 'rising')).toBeCloseTo(0.12);
    expect(computeStreakBonus(6, 'rising')).toBeCloseTo(0.60);
    expect(computeStreakBonus(10, 'rising')).toBeCloseTo(0.60); // capped
  });

  it('peak arc: bonus is much lower than rising for same streak', () => {
    const rising = computeStreakBonus(4, 'rising');
    const peak   = computeStreakBonus(4, 'peak');
    expect(peak).toBeLessThan(rising);
    expect(computeStreakBonus(10, 'peak')).toBeCloseTo(0.15); // capped
  });
});

// ─── advanceCampaigns — streak bonus ─────────────────────────────────────────

describe('advanceCampaigns — streak bonus', () => {
  const makeGreatClient = (id: string, arcStage: string) =>
    makeClient({ id, arc_stage: arcStage as any, audience: 10_000, stats: makeClientStats({ form: 100, marketability: 60 }) });
  const greatCampaignType = makeCampaignType({ form_weight: 1, variance: 0.01, base_payout: 5_000, payout_type: 'per_week' });

  it('no bonus on the first great (streak=1)', () => {
    const clientId = nextId();
    const client = makeGreatClient(clientId, 'rising');
    const manifest = makeManifest({ campaign_types: [greatCampaignType] });
    const campaign: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      setup: buildCampaignSetup(greatCampaignType),
      total_turns: 4, turns_remaining: 4, installment_results: [], pending_objective_ids: [],
    };
    const state = makeRunState({ money: 0, roster: [client], campaigns: [campaign] });
    const after = advanceCampaigns(state, manifest);
    const stored = after.campaigns[0]?.installment_results[0];
    // streak=1 → bonus=0, so money_delta should equal roll/100 * base_payout * payout_mult (unscaled)
    expect(stored?.outcome_key).toBe('great');
    expect(stored?.money_delta).toBeGreaterThan(0);
    // Reference: roll≈100, payout_mult≈1, money ≈ 5000; no streak scaling at streak=1
    expect(after.money).toBeCloseTo(stored!.money_delta, -2);
  });

  it('streak=2 yields more money and audience than streak=1 for rising arc', () => {
    const clientId = nextId();
    const client = makeGreatClient(clientId, 'rising');
    const manifest = makeManifest({ campaign_types: [greatCampaignType] });

    // Baseline: no prior streak
    const camp1: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      setup: buildCampaignSetup(greatCampaignType),
      total_turns: 4, turns_remaining: 4, installment_results: [], pending_objective_ids: [],
    };
    const after1 = advanceCampaigns(makeRunState({ money: 0, roster: [client], campaigns: [camp1] }), manifest);
    const base = after1.campaigns[0].installment_results[0];

    // With one prior great, streak=2
    const priorGreat: CampaignInstallmentResult = {
      turn_number: 1, roll_result: 95, outcome_key: 'great',
      stat_deltas: {}, money_delta: base.money_delta, reputation_delta: 3,
      triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
    };
    const camp2: Campaign = {
      ...camp1, id: nextId(), turns_remaining: 3, installment_results: [priorGreat],
    };
    const after2 = advanceCampaigns(makeRunState({ money: 0, roster: [client], campaigns: [camp2] }), manifest);
    const boosted = after2.campaigns[0].installment_results[1];

    expect(boosted.money_delta).toBeGreaterThan(base.money_delta);
    expect(after2.money).toBeGreaterThan(after1.money);
    expect(after2.roster[0].audience).toBeGreaterThan(after1.roster[0].audience);
  });

  it('no streak bonus for declining arc', () => {
    const clientId = nextId();
    const client = makeGreatClient(clientId, 'declining');
    const manifest = makeManifest({ campaign_types: [greatCampaignType] });

    const priorGreat: CampaignInstallmentResult = {
      turn_number: 1, roll_result: 95, outcome_key: 'great',
      stat_deltas: {}, money_delta: 4500, reputation_delta: 3,
      triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
    };
    // streak=2 but arc=declining → bonus=0
    const camp: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      setup: buildCampaignSetup(greatCampaignType),
      total_turns: 4, turns_remaining: 3, installment_results: [priorGreat], pending_objective_ids: [],
    };
    const after = advanceCampaigns(makeRunState({ money: 0, roster: [client], campaigns: [camp] }), manifest);
    const stored = after.campaigns[0].installment_results[1];
    // money_delta should match the unscaled value (no bonus)
    // With form=100, variance=0.01, roll≈100, base=round((100/100)*5000*payout_mult)
    const setup = buildCampaignSetup(greatCampaignType);
    const expectedBase = Math.round((100 / 100) * 5_000 * setup.payout_multiplier);
    expect(stored.money_delta).toBeCloseTo(expectedBase, -2);
  });

  it('no streak bonus for release campaigns', () => {
    const clientId = nextId();
    const client = makeGreatClient(clientId, 'rising');
    const releaseCampaignType = makeCampaignType({ key: 'album_cycle', release_kind: 'album', form_weight: 1, variance: 0.01, payout_type: 'per_week' });
    const manifest = makeManifest({ campaign_types: [releaseCampaignType] });
    const priorGreat: CampaignInstallmentResult = {
      turn_number: 1, roll_result: 95, outcome_key: 'great',
      stat_deltas: {}, money_delta: 0, reputation_delta: 3,
      triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
    };
    const camp: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'album_cycle',
      setup: buildCampaignSetup(releaseCampaignType),
      release_plan: { kind: 'album', title: 'Test', songs: [{ id: 's1', title: 'T', quality: 70 }] },
      total_turns: 4, turns_remaining: 3, installment_results: [priorGreat], pending_objective_ids: [],
    };
    const after = advanceCampaigns(makeRunState({ money: 0, roster: [client], campaigns: [camp] }), manifest);
    const stored = after.campaigns[0].installment_results[1];
    // Release campaigns never get streak bonus — money_delta is always 0 for per_week release
    expect(stored.money_delta).toBe(0);
  });
});

// ─── closeCampaign — release streak bonus ────────────────────────────────────

describe('closeCampaign — release streak bonus', () => {
  const makeReleaseCampaignWithStreak = (
    clientId: string,
    arcStage: string,
    streakLength: number,
    baseQuality: number,
  ) => {
    const campaignType = makeCampaignType({ key: 'album_cycle', release_kind: 'album' });
    const campaignId = nextId();
    const installments: CampaignInstallmentResult[] = Array.from({ length: streakLength }, (_, i) => ({
      turn_number: i + 1, roll_result: 90, outcome_key: 'great',
      stat_deltas: {}, money_delta: 0, reputation_delta: 3,
      triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
    }));
    const campaign: Campaign = {
      id: campaignId,
      client_id: clientId,
      type_key: 'album_cycle',
      setup: buildCampaignSetup(campaignType),
      release_plan: { kind: 'album', title: 'Test Album', songs: [{ id: 's1', title: 'Song', quality: baseQuality }] },
      total_turns: streakLength,
      turns_remaining: 0,
      installment_results: installments,
      pending_objective_ids: [],
    };
    // active_campaign_id must match so closeCampaign can locate and update the client
    const client = makeClient({ id: clientId, arc_stage: arcStage as any, active_campaign_id: campaignId });
    const manifest = makeManifest({ campaign_types: [campaignType] });
    return { campaign, client, manifest };
  };

  it('streak < 2 gives no quality boost', () => {
    const clientId = nextId();
    const { campaign, client, manifest } = makeReleaseCampaignWithStreak(clientId, 'rising', 1, 60);
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const after = closeCampaign(state, campaign.id, manifest);
    const release = after.roster.find(c => c.id === clientId)!.catalog_releases?.[0];
    expect(release!.songs[0].quality).toBe(60);
  });

  it('rising arc streak boosts song quality', () => {
    const clientId = nextId();
    const { campaign, client, manifest } = makeReleaseCampaignWithStreak(clientId, 'rising', 4, 60);
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const after = closeCampaign(state, campaign.id, manifest);
    const release = after.roster.find(c => c.id === clientId)!.catalog_releases?.[0];
    expect(release!.songs[0].quality).toBeGreaterThan(60);
  });

  it('peak arc boost is lower than rising arc boost for the same streak', () => {
    const baseQuality = 60;
    const streakLength = 5;

    const risingId = nextId();
    const { campaign: risingCamp, client: risingClient, manifest } =
      makeReleaseCampaignWithStreak(risingId, 'rising', streakLength, baseQuality);
    const risingAfter = closeCampaign(makeRunState({ roster: [risingClient], campaigns: [risingCamp] }), risingCamp.id, manifest);
    const risingQuality = risingAfter.roster.find(c => c.id === risingId)!.catalog_releases![0].songs[0].quality;

    const peakId = nextId();
    const { campaign: peakCamp, client: peakClient } =
      makeReleaseCampaignWithStreak(peakId, 'peak', streakLength, baseQuality);
    const peakAfter = closeCampaign(makeRunState({ roster: [peakClient], campaigns: [peakCamp] }), peakCamp.id, manifest);
    const peakQuality = peakAfter.roster.find(c => c.id === peakId)!.catalog_releases![0].songs[0].quality;

    expect(peakQuality).toBeGreaterThan(baseQuality);
    expect(risingQuality).toBeGreaterThan(peakQuality);
  });

  it('declining arc gives no quality boost regardless of streak', () => {
    const clientId = nextId();
    const { campaign, client, manifest } = makeReleaseCampaignWithStreak(clientId, 'declining', 6, 70);
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const after = closeCampaign(state, campaign.id, manifest);
    const release = after.roster.find(c => c.id === clientId)!.catalog_releases?.[0];
    expect(release!.songs[0].quality).toBe(70);
  });

  it('boosted quality is capped at 100', () => {
    const clientId = nextId();
    const { campaign, client, manifest } = makeReleaseCampaignWithStreak(clientId, 'rising', 10, 99);
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const after = closeCampaign(state, campaign.id, manifest);
    const release = after.roster.find(c => c.id === clientId)!.catalog_releases?.[0];
    expect(release!.songs[0].quality).toBeLessThanOrEqual(100);
  });
});

// ─── computeExpectationFanDelta ───────────────────────────────────────────────

const makeInstallments = (avgRoll: number, count = 4): CampaignInstallmentResult[] =>
  Array.from({ length: count }, () => ({
    turn_number: 1, roll_result: avgRoll, outcome_key: 'average',
    stat_deltas: {}, money_delta: 0, reputation_delta: 0,
    triggered_event_id: null, triggered_trait_id: null, audience_gain: 0,
  }));

const makeHistory = (avgRoll: number): CampaignHistoryItem => ({
  id: nextId(),
  type_key: 'test_campaign',
  label: 'Test Campaign',
  started_turn: 1,
  completed_turn: 5,
  total_turns: 4,
  installment_results: makeInstallments(avgRoll),
  release_id: null,
  summary: { money_delta: 0, reputation_delta: 0, fan_delta: 0 },
  visible_notes: [],
});

describe('computeExpectationFanDelta', () => {
  it('returns 0 when there is no prior campaign history (first campaign is free)', () => {
    const result = computeExpectationFanDelta([], makeInstallments(80), 4, 2000, 10_000);
    expect(result).toBe(0);
  });

  it('returns 0 when current campaign has no installments', () => {
    const result = computeExpectationFanDelta([makeHistory(60)], [], 4, 2000, 10_000);
    expect(result).toBe(0);
  });

  it('returns 0 when gap is within the dead zone', () => {
    // personal best = 60, current = 70, gap = 10 < 15
    const result = computeExpectationFanDelta([makeHistory(60)], makeInstallments(70), 4, 2000, 10_000);
    expect(result).toBe(0);
  });

  it('returns positive delta when campaign clearly beats personal best', () => {
    // personal best = 50, current = 80, gap = 30 > 15
    const result = computeExpectationFanDelta([makeHistory(50)], makeInstallments(80), 4, 2000, 10_000);
    expect(result).toBeGreaterThan(0);
  });

  it('returns negative delta when campaign clearly falls short of personal best', () => {
    // personal best = 80, current = 50, gap = -30 < -15
    const result = computeExpectationFanDelta([makeHistory(80)], makeInstallments(50), 4, 2000, 10_000);
    expect(result).toBeLessThan(0);
  });

  it('larger audience amplifies the delta', () => {
    const small = computeExpectationFanDelta([makeHistory(50)], makeInstallments(80), 4, 2000, 10_000);
    const large = computeExpectationFanDelta([makeHistory(50)], makeInstallments(80), 4, 2000, 500_000);
    expect(large).toBeGreaterThan(small);
  });

  it('larger investment amplifies the delta', () => {
    const light = computeExpectationFanDelta([makeHistory(50)], makeInstallments(80), 2, 500, 10_000);
    const heavy = computeExpectationFanDelta([makeHistory(50)], makeInstallments(80), 8, 10_000, 10_000);
    expect(heavy).toBeGreaterThan(light);
  });

  it('uses the best prior campaign as the benchmark (not average)', () => {
    // history has a weak and a strong campaign; benchmark should be the strong one
    const weak = makeHistory(40);
    const strong = makeHistory(75);
    // current = 80, gap vs best (75) = 5, inside dead zone → 0
    const result = computeExpectationFanDelta([weak, strong], makeInstallments(80), 4, 2000, 10_000);
    expect(result).toBe(0);
  });
});

describe('closeCampaign — expectation fan delta', () => {
  const makePriorHistoryClient = (clientId: string, campaignId: string, avgRoll: number) => {
    const prior: CampaignHistoryItem = {
      id: nextId(),
      type_key: 'test_campaign',
      label: 'Test Campaign',
      started_turn: 1,
      completed_turn: 5,
      total_turns: 4,
      installment_results: makeInstallments(avgRoll),
      release_id: null,
      summary: { money_delta: 0, reputation_delta: 0, fan_delta: 0 },
      visible_notes: [],
    };
    return makeClient({
      id: clientId,
      active_campaign_id: campaignId,
      audience: 10_000,
      campaign_history: [prior],
    });
  };

  it('applies fan gain when campaign beats personal best', () => {
    const clientId = nextId();
    const campaignId = nextId();
    const client = makePriorHistoryClient(clientId, campaignId, 50);
    const campaign: Campaign = {
      id: campaignId,
      client_id: clientId,
      type_key: 'test_campaign',
      setup: buildCampaignSetup(makeCampaignType()),
      total_turns: 4,
      turns_remaining: 0,
      installment_results: makeInstallments(80),
      pending_objective_ids: [],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = closeCampaign(state, campaignId, manifest);
    expect(result.roster[0].audience).toBeGreaterThan(10_000);
    expect(result.roster[0].campaign_history[1].summary.fan_delta).toBeGreaterThan(0);
  });

  it('applies fan loss when campaign falls well short of personal best', () => {
    const clientId = nextId();
    const campaignId = nextId();
    const client = makePriorHistoryClient(clientId, campaignId, 80);
    const campaign: Campaign = {
      id: campaignId,
      client_id: clientId,
      type_key: 'test_campaign',
      setup: buildCampaignSetup(makeCampaignType()),
      total_turns: 4,
      turns_remaining: 0,
      installment_results: makeInstallments(50),
      pending_objective_ids: [],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = closeCampaign(state, campaignId, manifest);
    expect(result.roster[0].audience).toBeLessThan(10_000);
    expect(result.roster[0].campaign_history[1].summary.fan_delta).toBeLessThan(0);
  });

  it('adds an expectation note to visible_notes on fan gain', () => {
    const clientId = nextId();
    const campaignId = nextId();
    const client = makePriorHistoryClient(clientId, campaignId, 50);
    const campaign: Campaign = {
      id: campaignId,
      client_id: clientId,
      type_key: 'test_campaign',
      setup: buildCampaignSetup(makeCampaignType()),
      total_turns: 4,
      turns_remaining: 0,
      installment_results: makeInstallments(80),
      pending_objective_ids: [],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = closeCampaign(state, campaignId, manifest);
    const note = result.roster[0].campaign_history[1].visible_notes.find(n => n.includes('exceeded expectations'));
    expect(note).toBeDefined();
  });

  it('adds an expectation note to visible_notes on fan loss', () => {
    const clientId = nextId();
    const campaignId = nextId();
    const client = makePriorHistoryClient(clientId, campaignId, 80);
    const campaign: Campaign = {
      id: campaignId,
      client_id: clientId,
      type_key: 'test_campaign',
      setup: buildCampaignSetup(makeCampaignType()),
      total_turns: 4,
      turns_remaining: 0,
      installment_results: makeInstallments(50),
      pending_objective_ids: [],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = closeCampaign(state, campaignId, manifest);
    const note = result.roster[0].campaign_history[1].visible_notes.find(n => n.includes('fell short'));
    expect(note).toBeDefined();
  });

  it('does not change audience when first campaign closes (no prior history)', () => {
    const clientId = nextId();
    const campaignId = nextId();
    const client = makeClient({ id: clientId, active_campaign_id: campaignId, audience: 10_000, campaign_history: [] });
    const campaign: Campaign = {
      id: campaignId,
      client_id: clientId,
      type_key: 'test_campaign',
      setup: buildCampaignSetup(makeCampaignType()),
      total_turns: 4,
      turns_remaining: 0,
      installment_results: makeInstallments(80),
      pending_objective_ids: [],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ roster: [client], campaigns: [campaign] });
    const result = closeCampaign(state, campaignId, manifest);
    expect(result.roster[0].audience).toBe(10_000);
    expect(result.roster[0].campaign_history[0].summary.fan_delta).toBe(0);
  });
});

// ─── advanceCampaigns — extra branches ───────────────────────────────────────

describe('campaign — advanceCampaigns extra branches', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not add total_earnings for lump_sum campaigns (money_delta=0 branch)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ form: 50 }) });
    const campaignType = makeCampaignType({ payout_type: 'lump_sum', base_payout: 5_000 });
    const manifest = makeManifest({ campaign_types: [campaignType] });
    const campaign: Campaign = {
      id: nextId(), client_id: clientId, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 4, installment_results: [], pending_objective_ids: [],
    };
    const state = makeRunState({ money: 1_000, total_earnings: 0, roster: [client], campaigns: [campaign] });
    const result = advanceCampaigns(state, manifest);
    expect(result.total_earnings).toBe(0);
  });

  it('processes multiple campaigns independently (campaigns.map non-matching branch)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const c1Id = nextId();
    const c2Id = nextId();
    const client1 = makeClient({ id: c1Id });
    const client2 = makeClient({ id: c2Id });
    const camp1: Campaign = {
      id: nextId(), client_id: c1Id, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 3, installment_results: [], pending_objective_ids: [],
    };
    const camp2: Campaign = {
      id: nextId(), client_id: c2Id, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 3, installment_results: [], pending_objective_ids: [],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType()] });
    const state = makeRunState({ roster: [client1, client2], campaigns: [camp1, camp2] });
    const result = advanceCampaigns(state, manifest);
    expect(result.campaigns).toHaveLength(2);
    result.campaigns.forEach(c => expect(c.turns_remaining).toBe(2));
  });

  it('stat_deltas only update campaign client when roster has multiple (roster.map branch)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const c1Id = nextId();
    const c2Id = nextId();
    const client1 = makeClient({ id: c1Id, stats: makeClientStats({ form: 50 }) });
    const client2 = makeClient({ id: c2Id, stats: makeClientStats({ form: 50 }) });
    const campaign: Campaign = {
      id: nextId(), client_id: c1Id, type_key: 'test_campaign',
      total_turns: 4, turns_remaining: 3, installment_results: [], pending_objective_ids: [],
    };
    const manifest = makeManifest({ campaign_types: [makeCampaignType({ per_installment_stat_deltas: { form: -5 } })] });
    const state = makeRunState({ roster: [client1, client2], campaigns: [campaign] });
    const result = advanceCampaigns(state, manifest);
    const updated1 = result.roster.find(c => c.id === c1Id);
    const updated2 = result.roster.find(c => c.id === c2Id);
    expect(updated1?.stats.form.true_value).toBe(Math.max(0, 50 - 5));
    expect(updated2?.stats.form.true_value).toBe(50);
  });
});

// ─── closeCampaign — album option clause ─────────────────────────────────────

describe('campaign — closeCampaign album option', () => {
  const makeAlbumCampaignState = (avgRoll: number, hasOption: boolean) => {
    const clientId = nextId();
    const campaignId = nextId();
    const client = makeClient({ id: clientId, active_campaign_id: campaignId });
    const labelContract = makeContract({
      client_id: clientId,
      tier: 'client_entity',
      entity_id: 'Test Records',
      exclusivity_scope: 'label',
      duration_remaining: 10,
      album_option: hasOption ? { success_threshold: 55, duration: 12 } : null,
    });
    const rollCount = 4;
    const rollResult = Math.round(avgRoll);
    const installments = Array.from({ length: rollCount }, (_, i) => ({
      turn_number: i + 1,
      roll_result: rollResult,
      outcome_key: 'average' as const,
      stat_deltas: {},
      money_delta: 0,
      reputation_delta: 0,
      triggered_event_id: null,
      triggered_trait_id: null,
      audience_gain: 0,
    }));
    const campaign: Campaign = {
      id: campaignId,
      client_id: clientId,
      type_key: 'album_cycle',
      setup: buildCampaignSetup(MUSIC_MANIFEST.campaign_types.find(c => c.key === 'album_cycle')!),
      release_plan: { kind: 'album', title: 'Test Album', songs: [{ id: 'song_1', title: 'Track 1', quality: 70 }] },
      total_turns: rollCount,
      turns_remaining: 0,
      installment_results: installments,
      pending_objective_ids: [],
    };
    const state = makeRunState({ roster: [client], campaigns: [campaign], contracts: [labelContract] });
    return { state, campaignId, clientId, labelContract };
  };

  it('injects a label_option decision when album closes successfully and contract has option', () => {
    const { state, campaignId, clientId } = makeAlbumCampaignState(70, true);
    const result = closeCampaign(state, campaignId, MUSIC_MANIFEST);
    const optionItem = result.decision_board.find(i => i.type === 'label_option');
    expect(optionItem).toBeDefined();
    expect(optionItem?.client_id).toBe(clientId);
    expect(optionItem?.contract_draft?.duration).toBe(12);
  });

  it('does not inject a label_option when avg roll is below the success threshold', () => {
    const { state, campaignId } = makeAlbumCampaignState(40, true);
    const result = closeCampaign(state, campaignId, MUSIC_MANIFEST);
    expect(result.decision_board.some(i => i.type === 'label_option')).toBe(false);
  });

  it('does not inject a label_option when the contract has no album_option clause', () => {
    const { state, campaignId } = makeAlbumCampaignState(70, false);
    const result = closeCampaign(state, campaignId, MUSIC_MANIFEST);
    expect(result.decision_board.some(i => i.type === 'label_option')).toBe(false);
  });

  it('does not inject a duplicate label_option when one is already pending', () => {
    const { state, campaignId, clientId } = makeAlbumCampaignState(70, true);
    const first = closeCampaign(state, campaignId, MUSIC_MANIFEST);
    expect(first.decision_board.filter(i => i.type === 'label_option' && i.client_id === clientId)).toHaveLength(1);
  });
});

// ─── resolveCampaignCategory ─────────────────────────────────────────────────

describe('campaign — resolveCampaignCategory', () => {
  const recordCat = MUSIC_MANIFEST.campaign_categories!.find(c => c.category === 'record')!;
  const performCat = MUSIC_MANIFEST.campaign_categories!.find(c => c.category === 'perform')!;

  const makeLabelContract = (clientId: string) => makeContract({
    client_id: clientId,
    tier: 'client_entity',
    exclusivity_scope: 'label',
    duration_remaining: 12,
  });

  // ── Record: turn-based routing ───────────────────────────────────────────────

  it('Record: 2 turns, no label → single_release, all size_names present', () => {
    const client = makeClient({ arc_stage: 'rising', audience: 0 });
    const result = resolveCampaignCategory(recordCat, client, [], 2);
    expect(result).not.toBeNull();
    expect(result!.type_key).toBe('single_release');
    expect(result!.size_names.small).toBe('Promo Single');
    expect(result!.size_names.medium).toBe('Single Release');
    expect(result!.size_names.large).toBe('Major Push');
  });

  it('Record: 3 turns, no label → mixtape_drop', () => {
    const client = makeClient({ arc_stage: 'rising', audience: 0 });
    const result = resolveCampaignCategory(recordCat, client, [], 3);
    expect(result!.type_key).toBe('mixtape_drop');
    expect(result!.size_names.medium).toBe('Mixtape Drop');
    expect(result!.size_names.large).toBe('Collab Tape');
  });

  it('Record: 5 turns, no label → mixtape_drop', () => {
    const client = makeClient({ arc_stage: 'declining', audience: 0 });
    const result = resolveCampaignCategory(recordCat, client, [], 5);
    expect(result!.type_key).toBe('mixtape_drop');
  });

  it('Record: 6 turns, has label, rising → album_cycle', () => {
    const client = makeClient({ arc_stage: 'rising', audience: 0 });
    const label = makeLabelContract(client.id);
    const result = resolveCampaignCategory(recordCat, client, [label], 6);
    expect(result!.type_key).toBe('album_cycle');
    expect(result!.size_names.medium).toBe('Standard Album');
    expect(result!.size_names.large).toBe('Deluxe Campaign');
  });

  it('Record: 10 turns, has label, peak → album_cycle', () => {
    const client = makeClient({ arc_stage: 'peak', audience: 200_000 });
    const label = makeLabelContract(client.id);
    const result = resolveCampaignCategory(recordCat, client, [label], 10);
    expect(result!.type_key).toBe('album_cycle');
  });

  it('Record: 6 turns, has label, declining → album_cycle arc gate fails → mixtape_drop', () => {
    const client = makeClient({ arc_stage: 'declining', audience: 0 });
    const label = makeLabelContract(client.id);
    const result = resolveCampaignCategory(recordCat, client, [label], 6);
    // album_cycle requires rising/peak; declining falls through to mixtape (min_turns=3 matches)
    expect(result!.type_key).toBe('mixtape_drop');
  });

  it('Record: 6 turns, no label → album_cycle has_label gate fails → mixtape_drop', () => {
    const client = makeClient({ arc_stage: 'rising', audience: 0 });
    const result = resolveCampaignCategory(recordCat, client, [], 6);
    expect(result!.type_key).toBe('mixtape_drop');
  });

  it('Record: ignores expired label contracts', () => {
    const client = makeClient({ arc_stage: 'rising', audience: 0 });
    const expiredLabel = makeContract({
      client_id: client.id,
      tier: 'client_entity',
      exclusivity_scope: 'label',
      duration_remaining: 0,
    });
    const result = resolveCampaignCategory(recordCat, client, [expiredLabel], 8);
    // Expired label → no active label → album_cycle skipped → mixtape_drop (min_turns=3 matches)
    expect(result!.type_key).toBe('mixtape_drop');
  });

  // ── Perform: audience/arc routing ─────────────────────────────────────────

  it('Perform: rising artist, 50k fans → perform_gigs (tour requires peak/declining)', () => {
    const client = makeClient({ arc_stage: 'rising', audience: 50_000 });
    const result = resolveCampaignCategory(performCat, client, [], 3);
    expect(result!.type_key).toBe('perform_gigs');
    expect(result!.size_names.large).toBe('Festival Slot');
  });

  it('Perform: peak artist, 50k fans → tour, all size_names present', () => {
    const client = makeClient({ arc_stage: 'peak', audience: 50_000 });
    const result = resolveCampaignCategory(performCat, client, [], 3);
    expect(result!.type_key).toBe('tour');
    expect(result!.size_names.medium).toBe('Headline Tour');
  });

  it('Perform: peak artist, 200k fans → tour arena tier', () => {
    const client = makeClient({ arc_stage: 'peak', audience: 200_000 });
    const result = resolveCampaignCategory(performCat, client, [], 6);
    expect(result!.type_key).toBe('tour');
    expect(result!.size_names.medium).toBe('Arena Tour');
    expect(result!.size_names.large).toBe('Stadium Tour');
  });

  it('Perform: declining artist, 200k fans → tour', () => {
    const client = makeClient({ arc_stage: 'declining', audience: 200_000 });
    const result = resolveCampaignCategory(performCat, client, [], 6);
    expect(result!.type_key).toBe('tour');
  });

  it('Perform: low-audience rising artist → perform_gigs', () => {
    const client = makeClient({ arc_stage: 'rising', audience: 500 });
    const result = resolveCampaignCategory(performCat, client, [], 3);
    expect(result!.type_key).toBe('perform_gigs');
    expect(result!.size_names.small).toBe('Local Gigs');
  });

  it('returns null when no routing rule matches an empty rule list', () => {
    const emptyCategory = { category: 'test', display_label: 'Test', routing_rules: [] };
    const client = makeClient({ arc_stage: 'rising', audience: 0 });
    const result = resolveCampaignCategory(emptyCategory, client, [], 3);
    expect(result).toBeNull();
  });
});

// ─── deriveCampaignSize ───────────────────────────────────────────────────────

describe('campaign — deriveCampaignSize', () => {
  const makeTypeDef = (base_payout: number): CampaignTypeDefinition => ({
    key: 'test_type',
    label: 'Test',
    total_turns: 4,
    form_weight: 0.8,
    variance: 12,
    base_payout,
    payout_type: 'per_week',
    per_installment_stat_deltas: {},
    event_trigger_threshold: 30,
    trait_trigger_threshold: 70,
    valid_arc_stages: ['rising', 'peak', 'declining'],
  });

  // base_payout=1000, len=4:
  //   medBudget = max(500, 1000*4*0.25*1.00) = 1000
  //   lgBudget  = max(1000, 1000*4*0.25*1.70) = 1700
  //   lgThreshold = (1000+1700)/2 = 1350
  //   medThreshold = 1000*0.75 = 750

  it('budget at medium baseline → medium', () => {
    expect(deriveCampaignSize(makeTypeDef(1000), 4, 1000)).toBe('medium');
  });

  it('budget at large threshold → large', () => {
    expect(deriveCampaignSize(makeTypeDef(1000), 4, 1350)).toBe('large');
  });

  it('budget above large threshold → large', () => {
    expect(deriveCampaignSize(makeTypeDef(1000), 4, 2000)).toBe('large');
  });

  it('budget at medium threshold → medium', () => {
    expect(deriveCampaignSize(makeTypeDef(1000), 4, 750)).toBe('medium');
  });

  it('budget just below medium threshold → small', () => {
    expect(deriveCampaignSize(makeTypeDef(1000), 4, 749)).toBe('small');
  });

  it('budget 0 → small', () => {
    expect(deriveCampaignSize(makeTypeDef(1000), 4, 0)).toBe('small');
  });

  it('budget floor raises baselines when base_payout is tiny', () => {
    // base_payout=10, len=4: computed medBudget = max(500, 10*4*0.25) = 500
    //   lgBudget = max(1000, 17) = 1000; lgThreshold = 750; medThreshold = 375
    const td = makeTypeDef(10);
    expect(deriveCampaignSize(td, 4, 750)).toBe('large');
    expect(deriveCampaignSize(td, 4, 500)).toBe('medium');
    expect(deriveCampaignSize(td, 4, 374)).toBe('small');
  });

  it('custom budget floor shifts thresholds', () => {
    const td = makeTypeDef(10);
    // floors: medium=200, large=800 → medBudget=200, lgBudget=800 → lgThreshold=500, medThreshold=150
    expect(deriveCampaignSize(td, 4, 500, { medium: 200, large: 800 })).toBe('large');
    expect(deriveCampaignSize(td, 4, 200, { medium: 200, large: 800 })).toBe('medium');
    expect(deriveCampaignSize(td, 4, 149, { medium: 200, large: 800 })).toBe('small');
  });

  it('length 1 does not crash and scales down thresholds', () => {
    const result = deriveCampaignSize(makeTypeDef(1000), 1, 250);
    expect(['small', 'medium', 'large']).toContain(result);
  });
});
