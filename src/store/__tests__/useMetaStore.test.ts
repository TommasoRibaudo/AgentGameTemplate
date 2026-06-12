import { useMetaStore } from '../useMetaStore';
import { makeRunState, makeManifest } from '../../engine/__tests__/fixtures';

beforeEach(() => {
  useMetaStore.setState({ completed_runs: [], unlocked_achievements: [], leaderboard_cache: [] });
});

const manifest = makeManifest();

describe('useMetaStore — recordRunCompletion', () => {
  it('appends a completed run record', () => {
    const state = makeRunState({
      is_active: false, end_condition: 'retired',
      peak_reputation: 80, total_earnings: 200_000, clients_developed: 4, turn_number: 42,
    });
    useMetaStore.getState().recordRunCompletion(state, manifest);
    const runs = useMetaStore.getState().completed_runs;
    expect(runs).toHaveLength(1);
    const record = runs[0];
    expect(record.end_condition).toBe('retired');
    expect(record.peak_reputation).toBe(80);
    expect(record.total_earnings).toBe(200_000);
    expect(record.clients_developed).toBe(4);
    expect(record.turn_number).toBe(42);
    expect(record.variant_id).toBe(manifest.id);
  });

  it('computes a non-zero score from peak reputation and earnings', () => {
    const state = makeRunState({ is_active: false, end_condition: 'clock_expired', peak_reputation: 70, total_earnings: 100_000, clients_developed: 2 });
    useMetaStore.getState().recordRunCompletion(state, manifest);
    expect(useMetaStore.getState().completed_runs[0].score).toBeGreaterThan(0);
  });

  it('does nothing when run has no end_condition', () => {
    const state = makeRunState({ is_active: true, end_condition: null });
    useMetaStore.getState().recordRunCompletion(state, manifest);
    expect(useMetaStore.getState().completed_runs).toHaveLength(0);
  });

  it('accumulates multiple run records', () => {
    useMetaStore.getState().recordRunCompletion(makeRunState({ is_active: false, end_condition: 'retired' }), manifest);
    useMetaStore.getState().recordRunCompletion(makeRunState({ is_active: false, end_condition: 'bankrupt' }), manifest);
    expect(useMetaStore.getState().completed_runs).toHaveLength(2);
  });

  it('records an ended run only once by run_id', () => {
    const state = makeRunState({ is_active: false, end_condition: 'bankrupt' });

    useMetaStore.getState().recordRunCompletion(state, manifest);
    useMetaStore.getState().recordRunCompletion(state, manifest);

    const runs = useMetaStore.getState().completed_runs;
    expect(runs).toHaveLength(1);
    expect(runs[0].end_condition).toBe('bankrupt');
  });
});

describe('useMetaStore — unlockAchievement', () => {
  it('adds an achievement key', () => {
    useMetaStore.getState().unlockAchievement('first_peak');
    expect(useMetaStore.getState().unlocked_achievements).toContain('first_peak');
  });

  it('is idempotent — does not add duplicates', () => {
    useMetaStore.getState().unlockAchievement('first_peak');
    useMetaStore.getState().unlockAchievement('first_peak');
    expect(useMetaStore.getState().unlocked_achievements.filter((k: string) => k === 'first_peak')).toHaveLength(1);
  });
});

describe('useMetaStore — hydrate', () => {
  it('restores previously persisted state', () => {
    useMetaStore.getState().hydrate({
      completed_runs: [{ run_id: 'r1', variant_id: 'music_v1', score: 9500, end_condition: 'retired', peak_reputation: 75, total_earnings: 80_000, clients_developed: 3, turn_number: 55, timestamp: 1_000 }],
      unlocked_achievements: ['first_peak'],
    });
    expect(useMetaStore.getState().completed_runs).toHaveLength(1);
    expect(useMetaStore.getState().unlocked_achievements).toContain('first_peak');
  });
});

describe('useMetaStore — setLeaderboardCache', () => {
  it('replaces the cache', () => {
    const cache = [{ run_id: 'r2', variant_id: 'music_v1', score: 10_000, end_condition: 'clock_expired' as const, peak_reputation: 90, total_earnings: 300_000, clients_developed: 6, turn_number: 60, timestamp: 2_000 }];
    useMetaStore.getState().setLeaderboardCache(cache);
    const cached = useMetaStore.getState().leaderboard_cache;
    expect(cached).toHaveLength(1);
    expect(cached[0].score).toBe(10_000);
  });
});
