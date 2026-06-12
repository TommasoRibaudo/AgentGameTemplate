import { useRunStore } from '../useRunStore';
import { makeClient, makeClientStats, makeManifest, makeRunState } from '../../engine/__tests__/fixtures';

// Reset the Zustand store before each test so tests are isolated
beforeEach(() => {
  useRunStore.setState({ state: null, manifest: null });
});

const manifest = makeManifest();

describe('useRunStore — startNewRun', () => {
  it('creates a fresh run state from the manifest', () => {
    useRunStore.getState().startNewRun(manifest);
    const state = useRunStore.getState().state;
    expect(state).not.toBeNull();
    expect(state!.turn_number).toBe(1);
    expect(state!.phase).toBe('turn_open');
    expect(state!.money).toBe(manifest.economy.starting_money);
  });

  it('stores the manifest alongside the run state', () => {
    useRunStore.getState().startNewRun(manifest);
    expect(useRunStore.getState().manifest).toBe(manifest);
  });
});

describe('useRunStore — loadExistingRun', () => {
  it('loads a pre-existing run state', () => {
    const existingState = makeRunState({ turn_number: 15, money: 5_000 });
    useRunStore.getState().loadExistingRun(existingState, manifest);
    const s = useRunStore.getState().state!;
    expect(s.turn_number).toBe(15);
    expect(s.money).toBe(5_000);
  });
});

describe('useRunStore — clearRun', () => {
  it('nulls state and manifest', () => {
    useRunStore.getState().startNewRun(manifest);
    useRunStore.getState().clearRun();
    expect(useRunStore.getState().state).toBeNull();
    expect(useRunStore.getState().manifest).toBeNull();
  });
});

describe('useRunStore — pinned clients', () => {
  it('pins roster clients in order', () => {
    const a = makeClient({ id: 'client_a', name: 'A' });
    const b = makeClient({ id: 'client_b', name: 'B' });
    const c = makeClient({ id: 'client_c', name: 'C' });
    useRunStore.getState().loadExistingRun(makeRunState({ roster: [a, b, c] }), manifest);

    expect(useRunStore.getState().pinClient('client_a')).toBe(true);
    expect(useRunStore.getState().pinClient('client_b')).toBe(true);
    expect(useRunStore.getState().pinClient('client_c')).toBe(true);

    expect(useRunStore.getState().state!.pinned_client_ids).toEqual(['client_a', 'client_b', 'client_c']);
  });

  it('removes a released client from pinned slots', () => {
    const client = makeClient({ id: 'client_a' });
    useRunStore.getState().loadExistingRun(
      makeRunState({
        roster: [client],
        pinned_client_ids: ['client_a'],
        dismissed_auto_client_ids: ['client_a'],
      }),
      manifest,
    );

    useRunStore.getState().releaseClient('client_a');

    expect(useRunStore.getState().state!.pinned_client_ids).toEqual([]);
    expect(useRunStore.getState().state!.dismissed_auto_client_ids).toEqual([]);
  });

  it('dismisses automatic lower-bar clients and clears dismissal when pinned manually', () => {
    const client = makeClient({ id: 'client_a' });
    useRunStore.getState().loadExistingRun(makeRunState({ roster: [client] }), manifest);

    useRunStore.getState().dismissAutoClient('client_a');
    expect(useRunStore.getState().state!.dismissed_auto_client_ids).toEqual(['client_a']);

    expect(useRunStore.getState().pinClient('client_a')).toBe(true);
    expect(useRunStore.getState().state!.pinned_client_ids).toEqual(['client_a']);
    expect(useRunStore.getState().state!.dismissed_auto_client_ids).toEqual([]);
  });
});

describe('useRunStore — startTurn / endTurn', () => {
  it('startTurn advances phase from turn_open to decision', () => {
    useRunStore.getState().startNewRun(manifest);
    expect(useRunStore.getState().state!.phase).toBe('turn_open');
    useRunStore.getState().startTurn();
    expect(useRunStore.getState().state!.phase).toBe('decision');
  });

  it('endTurn after startTurn advances turn_number and resets to turn_open', () => {
    useRunStore.getState().loadExistingRun(makeRunState({ phase: 'turn_open', money: 50_000 }), manifest);
    useRunStore.getState().startTurn();
    useRunStore.getState().endTurn();
    expect(useRunStore.getState().state!.turn_number).toBe(2);
    expect(useRunStore.getState().state!.phase).toBe('turn_open');
  });

  it('no-ops gracefully when called with no active run', () => {
    expect(() => useRunStore.getState().startTurn()).not.toThrow();
    expect(useRunStore.getState().state).toBeNull();
  });
});

describe('useRunStore — resolveDecision', () => {
  it('marks a decision item as resolved', () => {
    const item = {
      id: 'itm_test', type: 'contract_offer' as const, template_key: 'x',
      client_id: null, contract_id: null, contract_draft: null,
      description: '', expires_in: null, is_resolved: false, chosen_option_key: null,
      options: [{ key: 'approve', label: 'Approve', outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null }, push_risk: null }],
      default_on_ignore: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
    };
    const state = makeRunState({ phase: 'decision', decision_board: [item] });
    useRunStore.getState().loadExistingRun(state, manifest);
    useRunStore.getState().resolveDecision('itm_test', 'approve');
    expect(useRunStore.getState().state!.decision_board[0].is_resolved).toBe(true);
  });
});

describe('useRunStore — upgradeAgentStat', () => {
  it('increments the stat when player can afford it', () => {
    useRunStore.getState().loadExistingRun(makeRunState({ money: 50_000, reputation: 50 }), manifest);
    useRunStore.getState().upgradeAgentStat('operations');
    expect(useRunStore.getState().state!.agent.stats.operations).toBe(1);
  });

  it('records manager skill upgrades as agency expenses', () => {
    useRunStore.getState().loadExistingRun(makeRunState({ money: 50_000, reputation: 50 }), manifest);
    useRunStore.getState().upgradeAgentStat('operations');

    const item = useRunStore.getState().state!.news_feed.at(-1)!;
    expect(item.type).toBe('agency_spend');
    expect(item.money_delta).toBe(-manifest.economy.agent_stat_upgrade_cost.money);
    expect(item.description).toContain('Manager skill upgraded');
  });

  it('leaves stat unchanged when player cannot afford it', () => {
    useRunStore.getState().loadExistingRun(makeRunState({ money: 0, reputation: 0 }), manifest);
    useRunStore.getState().upgradeAgentStat('operations');
    expect(useRunStore.getState().state!.agent.stats.operations).toBe(0);
    expect(useRunStore.getState().state!.news_feed).toHaveLength(0);
  });
});

describe('useRunStore — upgradeInfrastructure', () => {
  it('records infrastructure upgrades as agency expenses', () => {
    useRunStore.getState().loadExistingRun(makeRunState({ money: 50_000 }), manifest);
    useRunStore.getState().upgradeInfrastructure('legal');

    const item = useRunStore.getState().state!.news_feed.at(-1)!;
    expect(item.type).toBe('agency_spend');
    expect(item.money_delta).toBe(-3_000);
    expect(item.description).toContain('Infrastructure upgraded');
  });
});

describe('useRunStore — investScouting', () => {
  it('deducts money when scouting a prospect', () => {
    const prospect = {
      id: 'prospect_1',
      name: 'Prospect One',
      age_weeks: 20 * 52,
      arc_stage: 'rising' as const,
      audience: 5_000,
      stats: makeClientStats(),
      scouting_invested: 0,
      max_potential: 80,
      expires_in: 4,
      generated_at_reputation: 50,
    };
    useRunStore.getState().loadExistingRun(
      makeRunState({ money: 1_000, prospects: [prospect] }),
      manifest,
    );

    useRunStore.getState().investScouting('prospect_1', 'talent', 500);

    const state = useRunStore.getState().state!;
    expect(state.money).toBe(500);
    expect(state.prospects[0].stats.talent.scouting_invested).toBe(500);
    expect(state.prospects[0].scouting_invested).toBe(500);
  });

  it('does not scout when money is insufficient', () => {
    const prospect = {
      id: 'prospect_1',
      name: 'Prospect One',
      age_weeks: 20 * 52,
      arc_stage: 'rising' as const,
      audience: 5_000,
      stats: makeClientStats(),
      scouting_invested: 0,
      max_potential: 80,
      expires_in: 4,
      generated_at_reputation: 50,
    };
    useRunStore.getState().loadExistingRun(
      makeRunState({ money: 100, prospects: [prospect] }),
      manifest,
    );

    useRunStore.getState().investScouting('prospect_1', 'form', 500);

    const state = useRunStore.getState().state!;
    expect(state.money).toBe(100);
    expect(state.prospects[0].stats.form.scouting_invested).toBe(0);
    expect(state.prospects[0].scouting_invested).toBe(0);
  });

  it('does not charge money once scouting reaches the minimum fog window', () => {
    const stats = makeClientStats({ talent: 60 });
    const client = makeClient({
      id: 'client_1',
      turns_on_roster: 16,
      stats: {
        ...stats,
        talent: {
          ...stats.talent,
          observed_min: 57,
          observed_max: 63,
          scouting_invested: 600,
        },
      },
    });
    useRunStore.getState().loadExistingRun(
      makeRunState({
        money: 1_000,
        roster: [client],
        agent: {
          stats: { stat_scouting: 7, insight_scouting: 0, negotiation: 0, operations: 0, coaching: 0 },
          roster_capacity: 5,
          defense_tracks: [],
        },
      }),
      manifest,
    );

    useRunStore.getState().investScouting('client_1', 'talent', 500);

    const state = useRunStore.getState().state!;
    expect(state.money).toBe(1_000);
    expect(state.roster[0].stats.talent.scouting_invested).toBe(600);
  });
});

describe('useRunStore — retireVoluntarily', () => {
  it('ends the run when in decision phase', () => {
    useRunStore.getState().loadExistingRun(makeRunState({ phase: 'decision' }), manifest);
    useRunStore.getState().retireVoluntarily();
    expect(useRunStore.getState().state!.is_active).toBe(false);
    expect(useRunStore.getState().state!.end_condition).toBe('retired');
  });

  it('does nothing outside decision phase', () => {
    useRunStore.getState().loadExistingRun(makeRunState({ phase: 'turn_open' }), manifest);
    useRunStore.getState().retireVoluntarily();
    expect(useRunStore.getState().state!.is_active).toBe(true);
  });
});
