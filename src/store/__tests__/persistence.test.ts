import { saveRun, loadRun, clearSavedRun, saveMetaStore, loadMetaStore } from '../persistence';
import { makeRunState } from '../../engine/__tests__/fixtures';

// In-memory backing store — cleared between tests so they stay isolated
const mockStorage: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem:    jest.fn((key: string, value: string): Promise<void> =>
      Promise.resolve().then(() => { mockStorage[key] = value; })),
    getItem:    jest.fn((key: string): Promise<string | null> =>
      Promise.resolve(mockStorage[key] ?? null)),
    removeItem: jest.fn((key: string): Promise<void> =>
      Promise.resolve().then(() => { delete mockStorage[key]; })),
  },
}));

beforeEach(() => {
  // Clear storage AND reset mock call records before each test
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  jest.clearAllMocks();
});

// ─── saveRun / loadRun ─────────────────────────────────────────────────────

describe('persistence — saveRun / loadRun', () => {
  it('round-trips RunState through AsyncStorage', async () => {
    const state = makeRunState({ turn_number: 12, money: 7_500, reputation: 60 });
    await saveRun(state);
    const loaded = await loadRun();
    expect(loaded).not.toBeNull();
    expect(loaded!.turn_number).toBe(12);
    expect(loaded!.money).toBe(7_500);
    expect(loaded!.reputation).toBe(60);
  });

  it('preserves id and phase', async () => {
    const state = makeRunState({ phase: 'decision' });
    await saveRun(state);
    const loaded = await loadRun();
    expect(loaded!.id).toBe(state.id);
    expect(loaded!.phase).toBe('decision');
  });

  it('returns null when nothing is saved', async () => {
    const loaded = await loadRun();
    expect(loaded).toBeNull();
  });

  it('returns null for a version-mismatched save', async () => {
    mockStorage['run_active'] = JSON.stringify({ version: 999, state: makeRunState() });
    const loaded = await loadRun();
    expect(loaded).toBeNull();
  });

  it('returns null for corrupted JSON', async () => {
    mockStorage['run_active'] = '{{bad json}}';
    const loaded = await loadRun();
    expect(loaded).toBeNull();
  });
});

// ─── clearSavedRun ─────────────────────────────────────────────────────────

describe('persistence — clearSavedRun', () => {
  it('removes the saved run so loadRun returns null', async () => {
    await saveRun(makeRunState());
    await clearSavedRun();
    const loaded = await loadRun();
    expect(loaded).toBeNull();
  });
});

// ─── saveMetaStore / loadMetaStore ─────────────────────────────────────────

describe('persistence — saveMetaStore / loadMetaStore', () => {
  it('round-trips completed_runs and unlocked_achievements', async () => {
    const runs = [
      { run_id: 'r1', variant_id: 'music_v1', score: 8000, end_condition: 'retired' as const, peak_reputation: 70, total_earnings: 150_000, clients_developed: 3, turn_number: 50, timestamp: 1_000 },
    ];
    const achievements = ['first_peak', 'bankrupt_survivor'];
    await saveMetaStore(runs, achievements);
    const loaded = await loadMetaStore();
    expect(loaded).not.toBeNull();
    expect(loaded!.completed_runs).toHaveLength(1);
    expect(loaded!.completed_runs[0].run_id).toBe('r1');
    expect(loaded!.unlocked_achievements).toContain('first_peak');
    expect(loaded!.unlocked_achievements).toContain('bankrupt_survivor');
  });

  it('returns null when nothing is saved', async () => {
    const loaded = await loadMetaStore();
    expect(loaded).toBeNull();
  });

  it('returns null for a version-mismatched save', async () => {
    mockStorage['meta'] = JSON.stringify({ version: 999, completed_runs: [], unlocked_achievements: [] });
    const loaded = await loadMetaStore();
    expect(loaded).toBeNull();
  });
});
