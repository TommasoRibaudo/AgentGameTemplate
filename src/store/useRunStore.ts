import { create } from 'zustand';
import { RunState, TutorialStep } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { CoreStatKey } from '../types/primitives';
import { AgentStats } from '../types/agent';
import { InfrastructureUpgradeKey } from '../engine/progression';
import { createNewRun } from './initRun';

// ── Engine imports ────────────────────────────────────────────────────────────
import { turnOrchestrator }                             from '../engine/turn-loop';
import { resolveDecisionItem, hydrateContractOffer, resolveCounteroffer, queueContractRenewalOffer } from '../engine/decision-queue';
import { resolveEvent as engineResolveEvent }           from '../engine/event';
import {
  boostClientStat,
  computeAgentStatUpgradeCost,
  computeInfrastructureUpgradeCost,
  upgradeAgentStat,
  upgradeInfrastructure,
  downgradeInfrastructure,
} from '../engine/progression';
import { openDebtState, takeLoan, retireVoluntarily as engineRetire } from '../engine/failure';
import { canInvestScouting, investScouting, signClient, releaseClient } from '../engine/client';
import { startCampaign }                                from '../engine/campaign';
import { applyMoneyDelta }                              from '../engine/resource';
import { DecisionItem }                                 from '../types/decision';
import { CounterTerms, Contract }                       from '../types/contract';
import { CampaignSetup }                                from '../types/campaign';
import { Client, FoggedStat, Prospect }                 from '../types/client';

const EMPTY_ARRAY: never[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Store shape
// ─────────────────────────────────────────────────────────────────────────────

interface RunStore {
  // ── State ──────────────────────────────────────────────────────────────────
  state:    RunState | null;
  manifest: VariantManifest | null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  startNewRun:      (manifest: VariantManifest, playerName?: string) => void;
  loadExistingRun:  (state: RunState, manifest: VariantManifest) => void;
  clearRun:         () => void;

  // ── Turn loop ──────────────────────────────────────────────────────────────
  startTurn: () => void;
  endTurn:   () => void;

  // ── Decision board ────────────────────────────────────────────────────────
  resolveDecision: (itemId: string, optionKey: string) => void;
  counterOffer:    (itemId: string, counter: CounterTerms) => 'accepted' | 'revised' | 'rejected';

  // ── Events ────────────────────────────────────────────────────────────────
  resolveEvent: (eventId: string, optionKey: string | null) => void;

  // ── Progression ───────────────────────────────────────────────────────────
  upgradeAgentStat:       (stat: keyof AgentStats) => void;
  upgradeInfrastructure:  (key: InfrastructureUpgradeKey) => void;
  downgradeInfrastructure:(key: InfrastructureUpgradeKey) => void;

  // ── Debt / bank ───────────────────────────────────────────────────────────
  takeLoan:         (amount: number) => void;
  retireVoluntarily:() => void;

  // ── Roster management ─────────────────────────────────────────────────────
  investScouting:    (entityId: string, statKey: CoreStatKey, amount: number) => void;
  boostClientStat:   (clientId: string, statKey: Exclude<CoreStatKey, 'talent'>) => void;
  signClient:        (prospectId: string, contractId: string) => void;
  releaseClient:     (clientId: string) => void;
  startCampaign:     (clientId: string, campaignTypeKey: string, linkedObjectiveIds: string[], setup?: Partial<Pick<CampaignSetup, 'size' | 'length' | 'budget'>>) => void;
  queueSigningOffer: (prospectId: string) => void;
  queueRenewalOffer: (clientId: string) => boolean;
  pinClient:         (clientId: string) => boolean;
  unpinClient:       (clientId: string) => void;
  dismissAutoClient: (clientId: string) => void;

  // ── Release summary ────────────────────────────────────────────────────────
  dismissReleaseSummary: (id: string) => void;

  // ── Tutorial ───────────────────────────────────────────────────────────────
  acceptFriendArtist:          () => void;
  declineFriendArtist:         () => void;
  advanceTutorial:             (from: TutorialStep) => void;
  restartTutorialAfterHydration: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — applies a pure function to the current state; no-ops if state or
// manifest is null. Keeps actions DRY.
// ─────────────────────────────────────────────────────────────────────────────

type StateTransform = (state: RunState, manifest: VariantManifest) => RunState;

const formatLedgerLabel = (key: string) =>
  key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const appendAgencySpendNews = (state: RunState, description: string, amount: number): RunState => ({
  ...state,
  news_feed: [
    ...state.news_feed,
    {
      id:               `news_agency_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      turn_number:      state.turn_number,
      type:             'agency_spend',
      description,
      money_delta:      -amount,
      reputation_delta: null,
      fan_delta:        null,
      client_id:        null,
    },
  ],
});

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

    startNewRun: (manifest, playerName) =>
      set({ state: createNewRun(manifest, playerName), manifest }),

    loadExistingRun: (state, manifest) =>
      set({ state, manifest }),

    clearRun: () =>
      set({ state: null, manifest: null }),

    // ── Turn loop ────────────────────────────────────────────────────────────

    startTurn: () =>
      apply((state, manifest) => {
        const { state: next } = turnOrchestrator.startTurn(state, manifest);
        if (
          next.tutorial_step === 'post_gig_hint' &&
          next.decision_board.filter(i => !i.is_resolved).length === 0
        ) {
          const tutorialItem: DecisionItem = {
            id:                `itm_tut_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
            type:              'opportunity',
            template_key:      'tutorial_first_board',
            client_id:         next.tutorial_friend_id,
            contract_id:       null,
            contract_draft:    null,
            description:       "Dev's first gig went well! Each week you'll find board items like this — resolve them to shape your clients' careers.",
            options: [
              {
                key:       'approve',
                label:     'Got it',
                outcome:   { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
                push_risk: null,
              },
            ],
            default_on_ignore: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
            expires_in:        null,
            is_resolved:       false,
            chosen_option_key: null,
          };
          return { ...next, decision_board: [tutorialItem, ...next.decision_board] };
        }
        return next;
      }),

    endTurn: () =>
      apply((state, manifest) => {
        const { state: next } = turnOrchestrator.endTurn(state, manifest);
        if (state.tutorial_step === 'end_turn_hint') {
          const tutorialItem: DecisionItem = {
            id:                `itm_tut_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
            type:              'opportunity',
            template_key:      'tutorial_first_board',
            client_id:         state.tutorial_friend_id,
            contract_id:       null,
            contract_draft:    null,
            description:       "Dev's first gig is in the books. Each week you'll find board items like this — resolve them to shape your clients' careers.",
            options: [
              {
                key:       'approve',
                label:     'Got it',
                outcome:   { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
                push_risk: null,
              },
            ],
            default_on_ignore: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
            expires_in:        null,
            is_resolved:       false,
            chosen_option_key: null,
          };
          return { ...next, tutorial_step: 'post_gig_hint' as TutorialStep, decision_board: [tutorialItem, ...next.decision_board] };
        }
        return next;
      }),

    // ── Decision board ───────────────────────────────────────────────────────

    resolveDecision: (itemId, optionKey) =>
      apply((state, manifest) => {
        let s = resolveDecisionItem(state, itemId, optionKey, manifest);
        const resolved = s.decision_board.find(i => i.id === itemId);
        const campaignKey = resolved?.resolved_outcome?.start_campaign_key;
        if (campaignKey && resolved?.client_id) {
          const client = s.roster.find(c => c.id === resolved.client_id);
          if (client && !client.active_campaign_id) {
            s = startCampaign(s, resolved.client_id, campaignKey, [], manifest);
          }
        }
        if (
          s.tutorial_step === 'contract_approve_hint' &&
          resolved?.template_key === 'agent_signing' &&
          resolved?.client_id === s.tutorial_prospect_id &&
          resolved?.chosen_option_key === 'approve'
        ) {
          s = { ...s, tutorial_step: 'agency_hint' as TutorialStep };
        }
        if (s.tutorial_step === 'post_gig_hint' && resolved?.template_key === 'tutorial_first_board') {
          const tutProsId = `prospect_tut_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`;
          const tutProspect: Prospect = {
            id:                    tutProsId,
            name:                  'Alex Torres',
            age_weeks:             22 * 52,
            arc_stage:             'rising',
            audience:              420,
            max_potential:         75,
            scouting_invested:     0,
            expires_in:            999,
            generated_at_reputation: 0,
            stats: {
              talent:        { true_value: 62, observed_min: 30, observed_max: 90, scouting_invested: 0 },
              form:          { true_value: 55, observed_min: 30, observed_max: 82, scouting_invested: 0 },
              marketability: { true_value: 58, observed_min: 35, observed_max: 80, scouting_invested: 0 },
              morale:        { true_value: 72, observed_min: 50, observed_max: 90, scouting_invested: 0 },
            },
          };
          s = {
            ...s,
            tutorial_step:        'scout_hint' as TutorialStep,
            tutorial_prospect_id: tutProsId,
            prospects:            [tutProspect, ...s.prospects],
          };
        }
        return s;
      }),

    counterOffer: (itemId, counter) => {
      const { state, manifest } = get();
      if (!state || !manifest) return 'rejected';
      const newState = resolveCounteroffer(state, itemId, counter, manifest);
      set({ state: newState });
      const item = newState.decision_board.find(i => i.id === itemId);
      if (!item) return 'rejected';
      if (item.chosen_option_key === 'counter_accepted') return 'accepted';
      if (item.chosen_option_key === 'counter_rejected') return 'rejected';
      return 'revised';
    },

    // ── Events ───────────────────────────────────────────────────────────────

    resolveEvent: (eventId, optionKey) =>
      apply((state, manifest) => engineResolveEvent(state, eventId, optionKey, manifest)),

    // ── Progression ──────────────────────────────────────────────────────────

    upgradeAgentStat: (stat) =>
      apply((state, manifest) => {
        const cost = computeAgentStatUpgradeCost(state, stat, manifest);
        const nextState = upgradeAgentStat(state, stat, manifest);
        if (nextState === state || nextState.money === state.money) return nextState;
        return appendAgencySpendNews(
          nextState,
          `${manifest.labels.agent} skill upgraded: ${formatLedgerLabel(stat)}`,
          cost.money,
        );
      }),

    upgradeInfrastructure: (key) =>
      apply((state, manifest) => {
        const cost = computeInfrastructureUpgradeCost(state, key, manifest);
        const nextState = upgradeInfrastructure(state, key, manifest);
        if (nextState === state || nextState.money === state.money) return nextState;
        return appendAgencySpendNews(
          nextState,
          `Infrastructure upgraded: ${formatLedgerLabel(key)}`,
          cost.money,
        );
      }),

    downgradeInfrastructure: (key) =>
      apply((state, manifest) => downgradeInfrastructure(state, key, manifest)),

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
        if (!entity || amount <= 0 || state.money < amount) return state;
        if (!canInvestScouting(entity, statKey, amount, state.agent)) return state;

        const updated = investScouting(entity, statKey, amount, state.agent);
        if (updated === entity) return state;

        const isOnRoster = state.roster.some(c => c.id === entityId);
        let nextState = applyMoneyDelta(state, -amount);
        if (nextState.money <= 0) nextState = openDebtState(nextState, manifest);

        return isOnRoster
          ? { ...nextState, roster: nextState.roster.map(c => c.id === entityId ? updated as typeof c : c) }
          : {
              ...nextState,
              prospects: nextState.prospects.map(p =>
                p.id === entityId
                  ? { ...updated as typeof p, scouting_invested: p.scouting_invested + amount }
                  : p,
              ),
            };
      }),

    boostClientStat: (clientId, statKey) =>
      apply((state, manifest) => {
        const nextState = boostClientStat(state, clientId, statKey);
        if (nextState === state || nextState.money > 0 || nextState.debt.is_active) return nextState;
        return openDebtState(nextState, manifest);
      }),

    signClient: (prospectId, contractId) =>
      apply((state, manifest) => signClient(state, prospectId, contractId, state.agent, manifest)),

    releaseClient: (clientId) =>
      apply((state, manifest) => ({
        ...releaseClient(state, clientId, manifest),
        pinned_client_ids: state.pinned_client_ids.filter(id => id !== clientId),
        dismissed_auto_client_ids: state.dismissed_auto_client_ids.filter(id => id !== clientId),
      })),

    pinClient: (clientId) => {
      const { state } = get();
      if (!state) return false;
      if (!state.roster.some(client => client.id === clientId)) return false;
      if (state.pinned_client_ids.includes(clientId)) return true;
      set({
        state: {
          ...state,
          pinned_client_ids: [...state.pinned_client_ids, clientId],
          dismissed_auto_client_ids: state.dismissed_auto_client_ids.filter(id => id !== clientId),
        },
      });
      return true;
    },

    unpinClient: (clientId) => {
      const { state } = get();
      if (!state || !state.pinned_client_ids.includes(clientId)) return;
      set({ state: { ...state, pinned_client_ids: state.pinned_client_ids.filter(id => id !== clientId) } });
    },

    dismissAutoClient: (clientId) => {
      const { state } = get();
      if (!state) return;
      if (state.dismissed_auto_client_ids.includes(clientId)) return;
      set({
        state: {
          ...state,
          pinned_client_ids: state.pinned_client_ids.filter(id => id !== clientId),
          dismissed_auto_client_ids: [...state.dismissed_auto_client_ids, clientId],
        },
      });
    },

    queueSigningOffer: (prospectId) =>
      apply((state, manifest) => {
        const prospect = state.prospects.find(p => p.id === prospectId);
        if (!prospect) return state;
        const pendingSignings = state.decision_board.filter(
          i => i.template_key === 'agent_signing' && !i.is_resolved,
        ).length;
        if (state.roster.length + pendingSignings >= state.agent.roster_capacity) return state;
        let draft = hydrateContractOffer(state, 'agent_signing', prospectId, manifest);
        if (!draft) return state;
        const isTutorialProspect =
          prospectId === state.tutorial_prospect_id &&
          (state.tutorial_step === 'scout_hint' || state.tutorial_step === 'scout_signing');
        if (isTutorialProspect) {
          draft = { ...draft, amount: 0, obligations_per_turn: 0 };
        }
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
        let nextState = { ...state, decision_board: [...state.decision_board, item] };
        if (isTutorialProspect) {
          nextState = { ...nextState, tutorial_step: 'contract_approve_hint' as TutorialStep };
        }
        return nextState;
      }),

    queueRenewalOffer: (clientId) => {
      const { state, manifest } = get();
      if (!state || !manifest) return false;
      const contract = state.contracts.find(c =>
        c.client_id === clientId
        && c.tier === 'agent_client'
        && c.duration_remaining > 0,
      );
      if (!contract) return false;
      const nextState = queueContractRenewalOffer(state, contract.id, manifest);
      if (nextState === state) return false;
      set({ state: nextState });
      return true;
    },

    startCampaign: (clientId, campaignTypeKey, linkedObjectiveIds, setup) =>
      apply((state, manifest) => startCampaign(state, clientId, campaignTypeKey, linkedObjectiveIds, manifest, setup)),

    // ── Release summary ───────────────────────────────────────────────────────

    dismissReleaseSummary: (id) =>
      set(store => {
        if (!store.state) return {};
        return {
          state: {
            ...store.state,
            pending_release_summaries: store.state.pending_release_summaries.filter(n => n.id !== id),
          },
        };
      }),

    // ── Tutorial ─────────────────────────────────────────────────────────────

    acceptFriendArtist: () => {
      const { state } = get();
      if (!state || state.tutorial_step !== 'friend_pitch') return;

      const friendId   = `client_friend_${Date.now().toString(36)}`;
      const contractId = `contract_friend_${Date.now().toString(36)}`;

      const FRIEND_SCOUTING = 600;
      const FRIEND_TENURE   = 20;
      // Dev Reyes is a personal friend — all stats are perfectly known from day one.
      const knownStat = (v: number): FoggedStat => ({
        true_value: v, observed_min: v, observed_max: v, scouting_invested: FRIEND_SCOUTING,
      });

      const agentContract: Contract = {
        id:                   contractId,
        tier:                 'agent_client',
        client_id:            friendId,
        entity_id:            null,
        payout_type:          'per_week',
        your_cut:             15,
        amount:               0,
        duration_remaining:   36,
        objectives:           [],
        obligations_per_turn: 0,
        counterparty_posture: { true_value: 1, is_revealed: true, observed_min: 1, observed_max: 1 },
        default_on_ignore:    'reject',
        expires_in:           null,
        exclusivity_scope:    'management',
        turns_active:         0,
        album_option:         null,
      };

      const friend: Client = {
        id:               friendId,
        name:             'Dev Reyes',
        age_weeks:        19 * 52,
        arc_stage:        'rising',
        audience:         820,
        max_potential:    82,
        stats: {
          talent:        knownStat(57),
          form:          knownStat(60),
          marketability: knownStat(70),
          morale:        knownStat(90),
        },
        traits:                 [],
        decision_option_counts: {},
        turns_on_roster:        FRIEND_TENURE,
        turns_at_stage:         0,
        active_campaign_id:     null,
        campaign_history:       [],
        catalog_releases:       [],
        agent_contract_id:      contractId,
      };

      set(store => {
        if (!store.state) return {};
        return {
          state: {
            ...store.state,
            roster:             [...store.state.roster, friend],
            contracts:          [...store.state.contracts, agentContract],
            tutorial_step:      'roster_highlight' as TutorialStep,
            tutorial_friend_id: friendId,
          },
        };
      });
    },

    declineFriendArtist: () =>
      set(store => {
        if (!store.state || store.state.tutorial_step !== 'friend_pitch') return {};
        return { state: { ...store.state, tutorial_step: 'done' as TutorialStep } };
      }),

    advanceTutorial: (from) =>
      set(store => {
        if (!store.state || store.state.tutorial_step !== from) return {};
        const NEXT: Partial<Record<TutorialStep, TutorialStep>> = {
          roster_highlight: 'campaign_tab',
          campaign_tab:     'gig_hint',
          gig_hint:         'end_turn_hint',
          end_turn_hint:    'post_gig_hint',
          scout_hint:       'scout_signing',
          scout_signing:    'agency_hint',
          agency_hint:      'done',
        };
        const next = NEXT[from];
        if (!next) return {};
        return { state: { ...store.state, tutorial_step: next } };
      }),

    restartTutorialAfterHydration: () => {
      const { state } = get();
      if (!state || !state.tutorial_step || state.tutorial_step === 'done') return;

      const step = state.tutorial_step;

      // Gig started but new scout/agency tutorial hasn't begun — terminate cleanly, keep state
      if (step === 'end_turn_hint' || step === 'post_gig_hint') {
        set(store => store.state ? { state: { ...store.state, tutorial_step: 'done' as TutorialStep } } : {});
        return;
      }

      // scout_hint / scout_signing / contract_approve_hint / agency_hint — resume normally
      if (step === 'scout_hint' || step === 'scout_signing' || step === 'contract_approve_hint' || step === 'agency_hint') return;

      // Pre-gig (roster_highlight / campaign_tab / gig_hint): remove Dev Reyes and restart from friend_pitch
      const friendId    = state.tutorial_friend_id;
      const prospectId  = state.tutorial_prospect_id;
      set(store => {
        if (!store.state) return {};
        const s = store.state;
        return {
          state: {
            ...s,
            tutorial_step:        'friend_pitch' as TutorialStep,
            tutorial_friend_id:   null,
            tutorial_prospect_id: null,
            roster:    friendId   ? s.roster.filter(c => c.id !== friendId)    : s.roster,
            contracts: friendId   ? s.contracts.filter(c => c.client_id !== friendId) : s.contracts,
            campaigns: friendId   ? s.campaigns.filter(c => c.client_id !== friendId) : s.campaigns,
            prospects: prospectId ? s.prospects.filter(p => p.id !== prospectId)      : s.prospects,
          },
        };
      });
    },
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
export const useAgentState      = () => useRunStore(s => s.state?.agent           ?? null);
export const useTutorialStep      = () => useRunStore(s => s.state?.tutorial_step      ?? null);
export const useTutorialFriendId  = () => useRunStore(s => s.state?.tutorial_friend_id  ?? null);
export const useTutorialProspectId= () => useRunStore(s => s.state?.tutorial_prospect_id ?? null);
