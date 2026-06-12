import { create } from 'zustand';
import { RunState } from '../types/run';
import { RunEndCondition } from '../types/primitives';
import { VariantManifest } from '../types/manifest';
import { computeCareerScore } from '../engine/failure';
import { evaluateAchievements } from '../engine/achievements';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CompletedRunRecord {
  run_id:            string;
  variant_id:        string;
  score:             number;
  end_condition:     RunEndCondition;
  peak_reputation:   number;
  total_earnings:    number;
  clients_developed: number;
  turn_number:       number;
  timestamp:         number; // unix ms
  // achievements earned during this specific run (absent on old persisted records)
  newly_unlocked_achievements?: string[];
}

interface MetaStore {
  // ── State ──────────────────────────────────────────────────────────────────
  completed_runs:        CompletedRunRecord[];
  unlocked_achievements: string[];   // Phase 6 — populated as stubs for now
  leaderboard_cache:     CompletedRunRecord[]; // remote cache; populated Phase 6

  // ── Actions ───────────────────────────────────────────────────────────────
  recordRunCompletion: (state: RunState, manifest: VariantManifest) => void;
  unlockAchievement:   (key: string) => void;
  setLeaderboardCache: (records: CompletedRunRecord[]) => void;
  hydrate:             (data: Pick<MetaStore, 'completed_runs' | 'unlocked_achievements'>) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useMetaStore = create<MetaStore>((set) => ({
  completed_runs:        [],
  unlocked_achievements: [],
  leaderboard_cache:     [],

  recordRunCompletion: (state, manifest) => {
    if (!state.end_condition) return;
    set(store => {
      if (store.completed_runs.some(record => record.run_id === state.id)) return {};

      const newlyUnlocked = evaluateAchievements(
        state,
        store.completed_runs,
        store.unlocked_achievements,
      );
      const record: CompletedRunRecord = {
        run_id:            state.id,
        variant_id:        manifest.id,
        score:             computeCareerScore(state),
        end_condition:     state.end_condition!,
        peak_reputation:   state.peak_reputation,
        total_earnings:    state.total_earnings,
        clients_developed: state.clients_developed,
        turn_number:       state.turn_number,
        timestamp:         Date.now(),
        newly_unlocked_achievements: newlyUnlocked,
      };
      return {
        completed_runs:        [...store.completed_runs, record],
        unlocked_achievements: [...store.unlocked_achievements, ...newlyUnlocked],
      };
    });
  },

  unlockAchievement: (key) =>
    set(store =>
      store.unlocked_achievements.includes(key)
        ? {}
        : { unlocked_achievements: [...store.unlocked_achievements, key] }
    ),

  setLeaderboardCache: (records) =>
    set({ leaderboard_cache: records }),

  hydrate: (data) =>
    set({ completed_runs: data.completed_runs, unlocked_achievements: data.unlocked_achievements }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Selector hooks
// ─────────────────────────────────────────────────────────────────────────────

export const useCompletedRuns     = () => useMetaStore(s => s.completed_runs);
export const useHighScore         = () => useMetaStore(s =>
  s.completed_runs.reduce((max, r) => Math.max(max, r.score), 0)
);
export const useUnlockedAchievements = () => useMetaStore(s => s.unlocked_achievements);
