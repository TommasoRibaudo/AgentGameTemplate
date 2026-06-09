import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RunState } from '../types/run';
import { CompletedRunRecord } from './useMetaStore';
import { useRunStore } from './useRunStore';
import { useMetaStore } from './useMetaStore';
import { MANIFEST_REGISTRY, DEFAULT_MANIFEST_ID } from '../manifest/registry';

// ─────────────────────────────────────────────────────────────────────────────
// Storage keys & schema version
// ─────────────────────────────────────────────────────────────────────────────

const RUN_KEY  = 'run_active';
const META_KEY = 'meta';

// Bump when serialized shape changes incompatibly; triggers a clean slate.
const SAVE_VERSION = 2;

interface RunSavePayload {
  version: number;
  state: RunState;
}

interface MetaSavePayload {
  version: number;
  completed_runs:        CompletedRunRecord[];
  unlocked_achievements: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Run persistence
// ─────────────────────────────────────────────────────────────────────────────

export async function saveRun(state: RunState): Promise<void> {
  const payload: RunSavePayload = { version: SAVE_VERSION, state };
  await AsyncStorage.setItem(RUN_KEY, JSON.stringify(payload));
}

export async function loadRun(): Promise<RunState | null> {
  const raw = await AsyncStorage.getItem(RUN_KEY);
  if (!raw) return null;

  let payload: RunSavePayload;
  try {
    payload = JSON.parse(raw) as RunSavePayload;
  } catch {
    return null;
  }

  // Stale version → discard; migrations not yet implemented
  if (payload.version !== SAVE_VERSION) return null;

  return {
    ...payload.state,
    player_name: payload.state.player_name ?? 'Manager',
  };
}

export async function clearSavedRun(): Promise<void> {
  await AsyncStorage.removeItem(RUN_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta persistence
// ─────────────────────────────────────────────────────────────────────────────

export async function saveMetaStore(
  completed_runs: CompletedRunRecord[],
  unlocked_achievements: string[],
): Promise<void> {
  const payload: MetaSavePayload = { version: SAVE_VERSION, completed_runs, unlocked_achievements };
  await AsyncStorage.setItem(META_KEY, JSON.stringify(payload));
}

export async function loadMetaStore(): Promise<Pick<MetaSavePayload, 'completed_runs' | 'unlocked_achievements'> | null> {
  const raw = await AsyncStorage.getItem(META_KEY);
  if (!raw) return null;

  let payload: MetaSavePayload;
  try {
    payload = JSON.parse(raw) as MetaSavePayload;
  } catch {
    return null;
  }

  if (payload.version !== SAVE_VERSION) return null;

  return { completed_runs: payload.completed_runs, unlocked_achievements: payload.unlocked_achievements };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-save hook
//
// Mount once near the app root. Watches for the phase to become 'turn_close'
// and persists the active run at that point. Also persists meta whenever
// completed_runs changes (a run just ended).
// ─────────────────────────────────────────────────────────────────────────────

export function useAutoSave(): void {
  const runState = useRunStore(s => s.state);

  const completedRuns       = useMetaStore(s => s.completed_runs);
  const unlockedAchievements= useMetaStore(s => s.unlocked_achievements);

  // Save run on every state mutation so mid-turn progress survives app close.
  useEffect(() => {
    if (!runState) return;
    saveRun(runState).catch(console.error);
  }, [runState]);

  // Save meta when completed_runs changes (run ended) or achievements unlock
  useEffect(() => {
    saveMetaStore(completedRuns, unlockedAchievements).catch(console.error);
  }, [completedRuns, unlockedAchievements]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap helper — call once in the root component.
// Restores run and meta from storage on first mount.
// Returns { hydrating: true } until the async load completes.
// ─────────────────────────────────────────────────────────────────────────────

export function useHydrateStores(): { hydrating: boolean } {
  const [hydrating, setHydrating] = useState(true);
  const loadExistingRun = useRunStore(s => s.loadExistingRun);
  const hydrateMeta     = useMetaStore(s => s.hydrate);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [savedRun, savedMeta] = await Promise.all([loadRun(), loadMetaStore()]);

      if (cancelled) return;

      if (savedRun) {
        // variant_id may be absent in saves written before this field was added
        const variantId = (savedRun as RunState & { variant_id?: string }).variant_id ?? DEFAULT_MANIFEST_ID;
        const manifest  = MANIFEST_REGISTRY[variantId] ?? MANIFEST_REGISTRY[DEFAULT_MANIFEST_ID];
        if (manifest) loadExistingRun(savedRun, manifest);
      }
      if (savedMeta) {
        hydrateMeta(savedMeta);
      }

      if (!cancelled) setHydrating(false);
    })().catch(e => { console.error(e); setHydrating(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { hydrating };
}
