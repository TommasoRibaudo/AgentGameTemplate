import {
  computeExposure,
  computeEventProbability,
  resolveEvent,
  applyEventDefaults,
  mitigateEventOutcome,
  generateEvents,
  selectEventTarget,
  injectWindfallBoardItem,
  TARGET_EVENTS_PER_TURN_MAX,
} from '../event';
import { makeRunState, makeClient, makeManifest, makeAgentState, makeClientStats, makeContract, nextId } from './fixtures';
import { GameEvent, EventOutcome } from '../../types/event';
import { EventDefinition } from '../../types/manifest';

const makeEvent = (overrides?: Partial<GameEvent>): GameEvent => ({
  id: `evt_${nextId()}`,
  template_key: 'test_event',
  category: 'market',
  severity: 'minor',
  client_id: null,
  description: 'Test event',
  options: [
    { key: 'handle', label: 'Handle', outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: null } },
  ],
  default_outcome: { money_delta: -500, reputation_delta: -2, stat_deltas: {}, injects_board_item_key: null },
  defense_track_key: 'pr',
  is_resolved: false,
  chosen_option_key: null,
  ...overrides,
});

// ─── computeExposure ─────────────────────────────────────────────────────────

describe('event — computeExposure', () => {
  it('returns 0 with empty roster and no high-value contracts', () => {
    expect(computeExposure(makeRunState())).toBe(0);
  });

  it('increases with roster size', () => {
    const state = makeRunState({ roster: [makeClient(), makeClient()] });
    expect(computeExposure(state)).toBeGreaterThan(0);
  });

  it('peak clients add extra exposure', () => {
    const nonPeak = makeRunState({ roster: [makeClient({ arc_stage: 'rising' })] });
    const withPeak = makeRunState({ roster: [makeClient({ arc_stage: 'peak' })] });
    expect(computeExposure(withPeak)).toBeGreaterThan(computeExposure(nonPeak));
  });

  it('high-value entity contracts (amount >= 50,000) add extra exposure', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const bigContract = makeContract({ tier: 'client_entity', client_id: clientId, amount: 50_000, your_cut: null });
    const withBig    = makeRunState({ roster: [client], contracts: [bigContract] });
    const withoutBig = makeRunState({ roster: [client] });
    expect(computeExposure(withBig)).toBeGreaterThan(computeExposure(withoutBig));
  });
});

// ─── computeEventProbability ─────────────────────────────────────────────────

describe('event — computeEventProbability', () => {
  it('never exceeds 0.95', () => {
    const bigRoster = makeRunState({
      roster: Array.from({ length: 20 }, () => makeClient({ arc_stage: 'peak' })),
    });
    const prob = computeEventProbability(bigRoster, 'client', makeManifest());
    expect(prob).toBeLessThanOrEqual(0.95);
  });

  it('defense track reduces probability', () => {
    const state = makeRunState({ roster: [makeClient()] });
    const base = computeEventProbability(state, 'market', makeManifest());
    const defended = computeEventProbability(
      makeRunState({ roster: [makeClient()], agent: makeAgentState({ defense_tracks: [{ key: 'pr', level: 3, per_turn_cost: 300 }] }) }),
      'market',
      makeManifest(),
    );
    expect(defended).toBeLessThan(base);
  });

  it('is always a positive number', () => {
    const prob = computeEventProbability(makeRunState(), 'agency', makeManifest());
    expect(prob).toBeGreaterThan(0);
  });
});

// ─── mitigateEventOutcome ─────────────────────────────────────────────────────

describe('event — mitigateEventOutcome', () => {
  it('applies default outcome when no option chosen', () => {
    const event = makeEvent();
    const outcome = mitigateEventOutcome(makeRunState(), event, makeManifest());
    expect(outcome.money_delta).toBe(-500);
  });

  it('applies chosen option outcome', () => {
    const event = makeEvent({ chosen_option_key: 'handle' });
    const outcome = mitigateEventOutcome(makeRunState(), event, makeManifest());
    expect(outcome.money_delta).toBe(0);
  });

  it('defense track reduces money and rep damage', () => {
    const event = makeEvent();  // defense_track_key: 'pr'
    const state = makeRunState({
      agent: makeAgentState({ defense_tracks: [{ key: 'pr', level: 3, per_turn_cost: 300 }] }),
    });
    const mitigated = mitigateEventOutcome(state, event, makeManifest());
    // level 3 → 30% reduction
    expect(Math.abs(mitigated.money_delta)).toBeLessThan(500);
    expect(Math.abs(mitigated.reputation_delta)).toBeLessThan(2);
  });

  it('no mitigation when no defense track key', () => {
    const event = makeEvent({ defense_track_key: null });
    const outcome = mitigateEventOutcome(makeRunState(), event, makeManifest());
    expect(outcome.money_delta).toBe(-500);
  });
});

// ─── resolveEvent ─────────────────────────────────────────────────────────────

describe('event — resolveEvent', () => {
  it('moves event from pending to resolved', () => {
    const event = makeEvent();
    const state = makeRunState({ pending_events: [event] });
    const result = resolveEvent(state, event.id, null, makeManifest());
    expect(result.pending_events).toHaveLength(0);
    expect(result.resolved_events).toHaveLength(1);
    expect(result.resolved_events[0].is_resolved).toBe(true);
  });

  it('applies money delta', () => {
    const event = makeEvent();
    const state = makeRunState({ money: 5_000, pending_events: [event] });
    const result = resolveEvent(state, event.id, null, makeManifest());
    expect(result.money).toBeLessThan(5_000);
  });

  it('clamps money at 0', () => {
    const event = makeEvent({ default_outcome: { money_delta: -50_000, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: null } });
    const state = makeRunState({ money: 100, pending_events: [event] });
    const result = resolveEvent(state, event.id, null, makeManifest());
    expect(result.money).toBe(0);
  });

  it('does nothing for unknown event id', () => {
    const state = makeRunState();
    const result = resolveEvent(state, 'unknown_id', null, makeManifest());
    expect(result).toBe(state);
  });

  it('sets low_money_warning when money first hits 0', () => {
    const event = makeEvent({ default_outcome: { money_delta: -50_000, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: null } });
    const state = makeRunState({ money: 100, low_money_warning: false, pending_events: [event] });
    const result = resolveEvent(state, event.id, null, makeManifest());
    expect(result.low_money_warning).toBe(true);
  });
});

// ─── applyEventDefaults ───────────────────────────────────────────────────────

describe('event — applyEventDefaults', () => {
  it('resolves all pending events', () => {
    const state = makeRunState({ pending_events: [makeEvent(), makeEvent()] });
    const result = applyEventDefaults(state, makeManifest());
    expect(result.pending_events).toHaveLength(0);
    expect(result.resolved_events).toHaveLength(2);
  });

  it('is a no-op when no pending events', () => {
    const state = makeRunState();
    const result = applyEventDefaults(state, makeManifest());
    expect(result.pending_events).toHaveLength(0);
  });
});

// ─── resolveEvent — additional coverage ──────────────────────────────────────

describe('event — resolveEvent with chosen option', () => {
  it('applies chosen option outcome instead of default', () => {
    const event = makeEvent({
      chosen_option_key: null,
      options: [
        { key: 'handle', label: 'Handle', outcome: { money_delta: 1000, reputation_delta: 2, stat_deltas: {}, injects_board_item_key: null } },
      ],
      default_outcome: { money_delta: -500, reputation_delta: -2, stat_deltas: {}, injects_board_item_key: null },
    });
    // Resolve with chosen option key
    const state = makeRunState({ money: 5_000, reputation: 50, pending_events: [event] });
    const result = resolveEvent(state, event.id, 'handle', makeManifest());
    expect(result.money).toBe(6_000);
    expect(result.reputation).toBe(52);
  });

  it('applies stat_deltas to the targeted client', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId, stats: makeClientStats({ form: 60 }) });
    const event    = makeEvent({
      client_id: clientId,
      default_outcome: {
        money_delta: 0, reputation_delta: 0,
        stat_deltas: { form: 5 },
        injects_board_item_key: null,
      },
    });
    const state  = makeRunState({ roster: [client], pending_events: [event] });
    const result = resolveEvent(state, event.id, null, makeManifest());
    const updatedClient = result.roster.find(c => c.id === clientId);
    expect(updatedClient?.stats.form.true_value).toBe(65);
  });

  it('accumulates total_earnings for positive money outcomes', () => {
    const event = makeEvent({
      options: [
        { key: 'win', label: 'Win', outcome: { money_delta: 3000, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: null } },
      ],
      default_outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: null },
    });
    const state  = makeRunState({ money: 1_000, total_earnings: 10_000, pending_events: [event] });
    const result = resolveEvent(state, event.id, 'win', makeManifest());
    expect(result.total_earnings).toBe(13_000);
  });

  it('tracks peak_reputation', () => {
    const event = makeEvent({
      options: [
        { key: 'boost', label: 'Boost', outcome: { money_delta: 0, reputation_delta: 10, stat_deltas: {}, injects_board_item_key: null } },
      ],
      default_outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: null },
    });
    const state  = makeRunState({ reputation: 60, peak_reputation: 60, pending_events: [event] });
    const result = resolveEvent(state, event.id, 'boost', makeManifest());
    expect(result.reputation).toBe(70);
    expect(result.peak_reputation).toBe(70);
  });
});

// ─── generateEvents ───────────────────────────────────────────────────────────

const makeEventDef = (overrides?: Partial<EventDefinition>): EventDefinition => ({
  key: 'test_client_event',
  category: 'client',
  severity: 'minor',
  description_template: 'Test event',
  options: [
    { key: 'act', label: 'Act on it', outcome: { money_delta: -200, reputation_delta: 1, stat_deltas: {} } },
  ],
  default_outcome: { money_delta: -500, reputation_delta: -1, stat_deltas: {} },
  defense_track_key: null,
  ...overrides,
});

describe('event — generateEvents', () => {
  afterEach(() => jest.restoreAllMocks());

  it('generates events with the correct runtime options format from manifest options', () => {
    // Math.random=0.01 → all probability checks pass; candidate index=0
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const manifest = makeManifest({ events: [makeEventDef()] });
    const state = makeRunState({ roster: [makeClient()] });
    const events = generateEvents(state, manifest);
    if (events.length > 0) {
      const ev = events[0];
      expect(Array.isArray(ev.options)).toBe(true);
      expect(ev.options[0].key).toBe('act');
      expect(ev.options[0].label).toBe('Act on it');
      expect(typeof ev.options[0].outcome.money_delta).toBe('number');
      expect(ev.options[0].outcome.injects_board_item_key).toBeNull();
      expect(ev.default_outcome.money_delta).toBe(-500);
    }
  });

  it('never generates more than TARGET_EVENTS_PER_TURN_MAX', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const allCategories: EventDefinition[] = ['client', 'market', 'agency', 'windfall'].map(cat => ({
      ...makeEventDef(),
      key:      `ev_${cat}`,
      category: cat as any,
    }));
    const manifest = makeManifest({ events: allCategories });
    const state = makeRunState({ roster: [makeClient()] });
    const events = generateEvents(state, manifest);
    expect(events.length).toBeLessThanOrEqual(TARGET_EVENTS_PER_TURN_MAX);
  });

  it('sorts events by severity — crisis before minor', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const minorEvent  = makeEventDef({ key: 'minor', category: 'client',  severity: 'minor' });
    const crisisEvent = makeEventDef({ key: 'crisis', category: 'market', severity: 'crisis' });
    const manifest = makeManifest({ events: [minorEvent, crisisEvent] });
    const state = makeRunState({ roster: [makeClient()] });
    const events = generateEvents(state, manifest);
    if (events.length >= 2) {
      expect(events[0].severity).toBe('crisis');
    }
  });

  it('returns empty array when no events are in the manifest', () => {
    const manifest = makeManifest({ events: [] });
    const state    = makeRunState({ roster: [makeClient()] });
    const events   = generateEvents(state, manifest);
    expect(events).toHaveLength(0);
  });

  it('sets client_id for client-category events', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const manifest = makeManifest({ events: [makeEventDef({ category: 'client' })] });
    const state    = makeRunState({ roster: [makeClient({ id: clientId })] });
    const events   = generateEvents(state, manifest);
    if (events.length > 0 && events[0].category === 'client') {
      expect(events[0].client_id).toBe(clientId);
    }
  });
});

// ─── selectEventTarget ────────────────────────────────────────────────────────

describe('event — selectEventTarget', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns null for non-client categories', () => {
    const state = makeRunState({ roster: [makeClient()] });
    expect(selectEventTarget(state, 'market', makeManifest())).toBeNull();
    expect(selectEventTarget(state, 'agency', makeManifest())).toBeNull();
    expect(selectEventTarget(state, 'windfall', makeManifest())).toBeNull();
  });

  it('returns null when roster is empty', () => {
    expect(selectEventTarget(makeRunState(), 'client', makeManifest())).toBeNull();
  });

  it('returns a client id for client category with a non-empty roster', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const state    = makeRunState({ roster: [makeClient({ id: clientId })] });
    const result   = selectEventTarget(state, 'client', makeManifest());
    expect(result).toBe(clientId);
  });

  it('uses event_bias from client traits to weight selection', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    // Client with high client-event bias should be selected
    const biasedId = nextId();
    const biasedClient = makeClient({
      id: biasedId,
      traits: [{ trait_id: 'injury_prone', stat_modifiers: {}, marketability_modifier: 0, event_bias: { client: 2.0 } }],
    });
    const normalClient = makeClient({ traits: [] });
    const state = makeRunState({ roster: [biasedClient, normalClient] });
    const result = selectEventTarget(state, 'client', makeManifest());
    // With Math.random=0.01 the first weighted entry (biasedClient) wins
    expect(result).toBe(biasedId);
  });
});

// ─── injectWindfallBoardItem ──────────────────────────────────────────────────

describe('event — injectWindfallBoardItem', () => {
  const makeBoardTemplate = () => ({
    key: 'windfall_opportunity',
    type: 'opportunity' as const,
    description_template: 'A windfall opportunity appeared!',
    rep_gate: 0,
    valid_arc_stages: [] as any[],
    contract_template_key: null,
    default_on_ignore_key: 'skip',
    expires_in: null,
  });

  it('injects a board item when outcome has injects_board_item_key', () => {
    const event = makeEvent({
      default_outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: 'windfall_opportunity' },
    });
    const manifest = makeManifest({ board_item_templates: [makeBoardTemplate()] });
    const state    = makeRunState();
    const result   = injectWindfallBoardItem(state, event, manifest);
    expect(result.decision_board).toHaveLength(1);
    expect(result.decision_board[0].template_key).toBe('windfall_opportunity');
  });

  it('returns state unchanged when injects_board_item_key is null', () => {
    const event = makeEvent({ default_outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: null } });
    const state  = makeRunState();
    const result = injectWindfallBoardItem(state, event, makeManifest());
    expect(result).toBe(state);
  });

  it('returns state unchanged when template key not found in manifest', () => {
    const event = makeEvent({
      default_outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: 'missing_template' },
    });
    const state  = makeRunState();
    const result = injectWindfallBoardItem(state, event, makeManifest());
    expect(result).toBe(state);
  });

  it('uses the chosen option outcome injects_board_item_key when option is chosen', () => {
    const event = makeEvent({
      chosen_option_key: 'act',
      options: [
        { key: 'act', label: 'Act', outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: 'windfall_opportunity' } },
      ],
      default_outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: null },
    });
    const manifest = makeManifest({ board_item_templates: [makeBoardTemplate()] });
    const state    = makeRunState();
    const result   = injectWindfallBoardItem(state, event, manifest);
    expect(result.decision_board).toHaveLength(1);
  });
});

// ─── resolveEvent — injects_board_item_key ───────────────────────────────────

describe('event — resolveEvent injects board item', () => {
  it('injects a windfall board item when default_outcome has injects_board_item_key', () => {
    const boardTemplate = {
      key: 'windfall_opportunity',
      type: 'opportunity' as const,
      description_template: 'Windfall!',
      rep_gate: 0,
      valid_arc_stages: [] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in: null,
    };
    const event = makeEvent({
      default_outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, injects_board_item_key: 'windfall_opportunity' },
    });
    const manifest = makeManifest({ board_item_templates: [boardTemplate] });
    const state    = makeRunState({ pending_events: [event] });
    const result   = resolveEvent(state, event.id, null, manifest);
    expect(result.decision_board).toHaveLength(1);
  });
});
