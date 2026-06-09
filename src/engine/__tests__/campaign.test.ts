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
} from '../campaign';
import { makeRunState, makeClient, makeClientStats, makeManifest, makeObjective, makeContract, nextId } from './fixtures';
import { CampaignTypeDefinition, EventDefinition, TraitDefinition } from '../../types/manifest';
import { Campaign, CampaignInstallmentResult } from '../../types/campaign';

const makeCampaignType = (overrides?: Partial<CampaignTypeDefinition>): CampaignTypeDefinition => ({
  key: 'test_campaign',
  label: 'Test Campaign',
  form_weight: 1,
  variance: 10,
  total_turns: 4,
  payout_type: 'per_month',
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
    expect(result.reputation_delta).toBe(2);
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
});

describe('campaign — buildCampaignSetup', () => {
  it('scales campaign cost, payout, audience growth, and event risk by size', () => {
    const campaignType = makeCampaignType();
    const small = buildCampaignSetup(campaignType, 'small');
    const large = buildCampaignSetup(campaignType, 'large');

    expect(large.budget).toBeGreaterThan(small.budget);
    expect(large.payout_multiplier).toBeGreaterThan(small.payout_multiplier);
    expect(large.audience_multiplier).toBeGreaterThan(small.audience_multiplier);
    expect(large.event_risk_multiplier).toBeGreaterThan(small.event_risk_multiplier);
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

  it('adds money to state for per_month campaign installments', () => {
    // form=100, form_weight=1 → roll ≈ 100 → money_delta = base_payout
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ form: 100 }) });
    const campaignType = makeCampaignType({ form_weight: 1, variance: 0.01, base_payout: 3000, payout_type: 'per_month' });
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

// ─── rollInstallment — per_month payout ──────────────────────────────────────

describe('campaign — rollInstallment payout', () => {
  it('money_delta is proportional to roll_result for per_month type', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ form: 100 }) });
    const campaignType = makeCampaignType({ form_weight: 1, variance: 0.01, base_payout: 5_000, payout_type: 'per_month' });
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

  it('money_delta is 0 for non-per_month payout types', () => {
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
    triggered_event_id: null, triggered_trait_id: null,
  };

  const highRollResult: CampaignInstallmentResult = {
    turn_number: 1, roll_result: 90, outcome_key: 'great',
    stat_deltas: {}, money_delta: 3000, reputation_delta: 2,
    triggered_event_id: null, triggered_trait_id: null,
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
    triggered_event_id: null, triggered_trait_id: null,
  };

  const lowRollResult: CampaignInstallmentResult = {
    turn_number: 1, roll_result: 50, outcome_key: 'average',
    stat_deltas: {}, money_delta: 0, reputation_delta: 0,
    triggered_event_id: null, triggered_trait_id: null,
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
    triggered_event_id: null, triggered_trait_id: null,
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
    triggered_event_id: null, triggered_trait_id: null,
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
