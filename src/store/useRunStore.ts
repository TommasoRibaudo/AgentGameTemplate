import { create } from 'zustand';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { CoreStatKey } from '../types/primitives';
import { AgentStats } from '../types/agent';
import { InfrastructureUpgradeKey } from '../engine/progression';
import { createNewRun } from './initRun';

// ── Engine imports ────────────────────────────────────────────────────────────
import { turnOrchestrator }                             from '../engine/turn-loop';
import { resolveDecisionItem, hydrateContractOffer }    from '../engine/decision-queue';
import { resolveEvent as engineResolveEvent }           from '../engine/event';
import { upgradeAgentStat, upgradeInfrastructure }      from '../engine/progression';
import { takeLoan, retireVoluntarily as engineRetire }  from '../engine/failure';
import { investScouting, signClient, releaseClient }    from '../engine/client';
import { startCampaign }                                from '../engine/campaign';
import { DecisionItem }                                 from '../types/decision';

const EMPTY_ARRAY: never[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Store shape
// ─────────────────────────────────────────────────────────────────────────────

interface RunStore {
  // ── State ──────────────────────────────────────────────────────────────────
  state:    RunState | null;
  manifest: VariantManifest | null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  startNewRun:      (manifest: VariantManifest) => void;
  loadExistingRun:  (state: RunState, manifest: VariantManifest) => void;
  clearRun:         () => void;

  // ── Turn loop ──────────────────────────────────────────────────────────────
  startTurn: () => void;
  endTurn:   () => void;

  // ── Decision board ────────────────────────────────────────────────────────
  resolveDecision: (itemId: string, optionKey: string) => void;

  // ── Events ────────────────────────────────────────────────────────────────
  resolveEvent: (eventId: string, optionKey: string | null) => void;

  // ── Progression ───────────────────────────────────────────────────────────
  upgradeAgentStat:     (stat: keyof AgentStats) => void;
  upgradeInfrastructure:(key: InfrastructureUpgradeKey) => void;

  // ── Debt / bank ───────────────────────────────────────────────────────────
  takeLoan:         (amount: number) => void;
  retireVoluntarily:() => void;

  // ── Roster management ─────────────────────────────────────────────────────
  investScouting:    (entityId: string, statKey: CoreStatKey, amount: number) => void;
  signClient:        (prospectId: string, contractId: string) => void;
  releaseClient:     (clientId: string) => void;
  startCampaign:     (clientId: string, campaignTypeKey: string, linkedObjectiveIds: string[]) => void;
  queueSigningOffer: (prospectId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — applies a pure function to the current state; no-ops if state or
// manifest is null. Keeps actions DRY.
// ─────────────────────────────────────────────────────────────────────────────

type StateTransform = (state: RunState, manifest: VariantManifest) => RunState;

const applyTransform =
  (set: (fn: (store: RunStore) => Partial<RunStore>) => void) =>
  (transform: StateTransform) =>
    set(store => {
      if (!store.state || !store.manifest) return {};
      const newState = transform(store.state, store.manifest);
      return { state: newState };
    });

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useRunStore = create<RunStore>((set, get) => {
  const apply = applyTransform(set);

  return {
    state:    null,
    manifest: null,

    // ── Lifecycle ────────────────────────────────────────────────────────────

    startNewRun: (manifest) =>
      set({ state: createNewRun(manifest), manifest }),

    loadExistingRun: (state, manifest) =>
      set({ state, manifest }),

    clearRun: () =>
      set({ state: null, manifest: null }),

    // ── Turn loop ────────────────────────────────────────────────────────────

    startTurn: () =>
      apply((state, manifest) => {
        const { state: next } = turnOrchestrator.startTurn(state, manifest);
        return next;
      }),

    endTurn: () =>
      apply((state, manifest) => {
        const { state: next } = turnOrchestrator.endTurn(state, manifest);
        return next;
      }),

    // ── Decision board ───────────────────────────────────────────────────────

    resolveDecision: (itemId, optionKey) =>
      apply((state, manifest) => resolveDecisionItem(state, itemId, optionKey, manifest)),

    // ── Events ───────────────────────────────────────────────────────────────

    resolveEvent: (eventId, optionKey) =>
      apply((state, manifest) => engineResolveEvent(state, eventId, optionKey, manifest)),

    // ── Progression ──────────────────────────────────────────────────────────

    upgradeAgentStat: (stat) =>
      apply((state, manifest) => upgradeAgentStat(state, stat, manifest)),

    upgradeInfrastructure: (key) =>
      apply((state, manifest) => upgradeInfrastructure(state, key, manifest)),

    // ── Debt / bank ──────────────────────────────────────────────────────────

    takeLoan: (amount) =>
      apply((state, manifest) => takeLoan(state, amount, manifest)),

    retireVoluntarily: () =>
      apply((state, manifest) => engineRetire(state, manifest)),

    // ── Roster management ────────────────────────────────────────────────────

    investScouting: (entityId, statKey, amount) =>
      apply((state, manifest) => {
        const entity =
          state.roster.find(c => c.id === entityId) ??
          state.prospects.find(p => p.id === entityId);
        if (!entity) return state;
        const updated = investScouting(entity, statKey, amount, state.agent);
        const isOnRoster = state.roster.some(c => c.id === entityId);
        return isOnRoster
          ? { ...state, roster:    state.roster.map(c    => c.id === entityId ? updated as typeof c    : c) }
          : { ...state, prospects: state.prospects.map(p => p.id === entityId ? updated as typeof p : p) };
      }),

    signClient: (prospectId, contractId) =>
      apply((state, manifest) => signClient(state, prospectId, contractId, state.agent)),

    releaseClient: (clientId) =>
      apply((state, manifest) => releaseClient(state, clientId, manifest)),

    queueSigningOffer: (prospectId) =>
      apply((state, manifest) => {
        const prospect = state.prospects.find(p => p.id === prospectId);
        if (!prospect) return state;
        const draft = hydrateContractOffer(state, 'agent_signing', prospectId, manifest);
        if (!draft) return state;
        const item: DecisionItem = {
          id:               `itm_sign_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
          type:             'contract_offer',
          template_key:     'agent_signing',
          client_id:        prospectId,
          contract_id:      null,
          contract_draft:   draft,
          description:      `Sign ${prospect.name} as your client?`,
          options: [
            { key: 'approve', label: 'Sign',  outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null }, push_risk: null },
            { key: 'reject',  label: 'Pass',  outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null }, push_risk: null },
          ],
          default_on_ignore: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          expires_in:        3,
          is_resolved:       false,
          chosen_option_key: null,
        };
        return { ...state, decision_board: [...state.decision_board, item] };
      }),

    startCampaign: (clientId, campaignTypeKey, linkedObjectiveIds) =>
      apply((state, manifest) => startCampaign(state, clientId, campaignTypeKey, linkedObjectiveIds, manifest)),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Selector hooks
// ─────────────────────────────────────────────────────────────────────────────

export const useRunState     = () => useRunStore(s => s.state);
export const useManifest     = () => useRunStore(s => s.manifest);
export const useRoster       = () => useRunStore(s => s.state?.roster       ?? EMPTY_ARRAY);
export const useProspects    = () => useRunStore(s => s.state?.prospects    ?? EMPTY_ARRAY);
export const useDecisionBoard= () => useRunStore(s => s.state?.decision_board ?? EMPTY_ARRAY);
export const useActiveEvents = () => useRunStore(s => s.state?.pending_events  ?? EMPTY_ARRAY);
export const useDebtState    = () => useRunStore(s => s.state?.debt         ?? null);
export const useNewsFeed     = () => useRunStore(s => s.state?.news_feed    ?? EMPTY_ARRAY);
export const useMoney        = () => useRunStore(s => s.state?.money        ?? 0);
export const useReputation   = () => useRunStore(s => s.state?.reputation   ?? 0);
export const useTurnNumber   = () => useRunStore(s => s.state?.turn_number  ?? 1);
export const usePhase        = () => useRunStore(s => s.state?.phase        ?? 'turn_open');
export const useIsRunActive  = () => useRunStore(s => s.state?.is_active    ?? false);
export const useAgentState   = () => useRunStore(s => s.state?.agent        ?? null);
