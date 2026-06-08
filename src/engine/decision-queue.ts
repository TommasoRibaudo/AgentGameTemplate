import { DecisionItem, DecisionOutcome, DecisionOption, PushRisk } from '../types/decision';
import { Contract, ContractDraft, Objective } from '../types/contract';
import { Client } from '../types/client';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { computeNegotiationModifier } from './progression';
import { applyMoneyDelta, applyReputationDelta, earnLumpSum, computeRepTier } from './resource';
import { refreshClientFog } from './client';

// INVARIANTS (PRD §2.1, §3.3):
// - Every item carries a mandatory default_on_ignore.
// - A decision is ALWAYS made — defaults fire at turn end if unresolved.
// - Board has 2–5 items per turn.

export const BOARD_MIN_ITEMS = 2;
export const BOARD_MAX_ITEMS = 5;

const generateId = (): string =>
  `itm_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

const contractId = (): string =>
  `ctr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

// ─── Contract hydration ───────────────────────────────────────────────────────

export type HydrateContractOffer = (
  state: RunState,
  templateKey: string,
  clientId: string,
  manifest: VariantManifest,
) => ContractDraft | null;

export const hydrateContractOffer: HydrateContractOffer = (state, templateKey, clientId, manifest) => {
  const template = manifest.contract_templates.find(t => t.key === templateKey);
  if (!template) return null;

  const client = [...state.roster, ...state.prospects].find(c => c.id === clientId);
  if (!client) return null;

  // Sample from ranges
  const lerp = (range: [number, number], t: number) =>
    Math.round(range[0] + (range[1] - range[0]) * t);
  const rand = () => Math.random();

  // Scale factor from client stats (true values drive quality of generated offers)
  const statScaling =
    client.stats.talent.true_value        * template.talent_scaling +
    client.stats.form.true_value          * template.form_scaling +
    client.stats.marketability.true_value * template.marketability_scaling;
  const scaleFactor = Math.max(0.5, Math.min(2.0, statScaling / 60)); // normalised around stat=60

  const baseAmount = lerp(template.amount_range, rand());
  const amount     = Math.round(baseAmount * scaleFactor);
  const duration   = lerp(template.duration_range, rand());
  const your_cut   = template.cut_range ? lerp(template.cut_range, rand()) : null;
  const obligations = lerp(template.obligations_range, rand());

  // Posture: fog starts fully hidden
  const truePosture = 0.3 + Math.random() * 0.5; // 0.3–0.8 range
  const postureRevealed = state.agent.stats.negotiation >= 5; // fully revealed at level 5+

  const posture: import('../types/contract').FoggedPosture = {
    true_value:   truePosture,
    is_revealed:  postureRevealed,
    observed_min: postureRevealed ? truePosture - 0.05 : null,
    observed_max: postureRevealed ? truePosture + 0.05 : null,
  };

  // For per_objective contracts, generate 2 milestone objectives.
  // Condition keys must be handled by evaluateObjectiveConditions in resource.ts.
  const objectives = template.payout_type === 'per_objective'
    ? [
        {
          description:   'Reach peak career stage',
          payout:        Math.round(amount * 0.6) || 8_000,
          condition_key: 'peak_arc',
          is_paid:       false,
        },
        {
          description:   'Sustain high form (70+) in a single turn',
          payout:        Math.round(amount * 0.4) || 5_000,
          condition_key: 'high_form',
          is_paid:       false,
        },
      ]
    : [];

  return {
    tier:               template.tier,
    client_id:          clientId,
    entity_id:          template.tier === 'client_entity' ? `entity_${rand().toString(36).substring(2)}` : null,
    payout_type:        template.payout_type,
    your_cut,
    amount,
    duration,
    objectives,
    obligations_per_turn: obligations,
    counterparty_posture: posture,
    default_on_ignore:  template.default_on_ignore,
    expires_in:         template.expires_in,
  };
};

// ─── Board generation ─────────────────────────────────────────────────────────

export type GenerateDecisionBoard = (state: RunState, manifest: VariantManifest) => DecisionItem[];

export const generateDecisionBoard: GenerateDecisionBoard = (state, manifest) => {
  const repTier = computeRepTier(state.reputation);
  const items: DecisionItem[] = [];

  // Carry over persistent items first
  const persistent = state.decision_board.filter(
    i => !i.is_resolved && i.expires_in !== null && i.expires_in > 0,
  );
  items.push(...persistent);

  if (items.length >= BOARD_MAX_ITEMS) return items.slice(0, BOARD_MAX_ITEMS);

  // Filter eligible templates by rep tier and roster state
  const REP_TIER_VALUES: Record<string, number> = {
    grassroots: 0, regional: 25, national: 50, elite: 75,
  };
  const playerRepValue = REP_TIER_VALUES[repTier] ?? 0;

  const eligible = manifest.board_item_templates.filter(t => {
    if (t.rep_gate > playerRepValue) return false;
    if (t.valid_arc_stages.length > 0) {
      const hasMatch = state.roster.some(c => t.valid_arc_stages.includes(c.arc_stage));
      if (!hasMatch) return false;
    }
    return true;
  });

  // Shuffle and fill to BOARD_MIN_ITEMS..BOARD_MAX_ITEMS
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const targetCount = BOARD_MIN_ITEMS + Math.floor(Math.random() * (BOARD_MAX_ITEMS - BOARD_MIN_ITEMS + 1));

  for (const template of shuffled) {
    if (items.length >= Math.min(targetCount, BOARD_MAX_ITEMS)) break;

    // Pick a relevant client
    const relevantClient = state.roster.find(c => template.valid_arc_stages.includes(c.arc_stage))
      ?? state.roster[0];

    let draft: ContractDraft | null = null;
    if (template.contract_template_key && relevantClient) {
      draft = hydrateContractOffer(state, template.contract_template_key, relevantClient.id, manifest);
    }

    const item: DecisionItem = {
      id:               generateId(),
      type:             template.type,
      template_key:     template.key,
      client_id:        relevantClient?.id ?? null,
      contract_id:      null,
      contract_draft:   draft,
      description:      template.description_template,
      options:          buildDefaultOptions(),
      default_on_ignore: { money_delta: 0, reputation_delta: -1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
      expires_in:       template.expires_in,
      is_resolved:      false,
      chosen_option_key: null,
    };

    items.push(item);
  }

  return items;
};

const buildDefaultOptions = (): DecisionOption[] => [
  { key: 'approve', label: 'Approve', outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null }, push_risk: null },
  { key: 'reject',  label: 'Reject',  outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null }, push_risk: null },
  { key: 'push',    label: 'Push',    outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
    push_risk: {
      success_probability: 0.5,
      success_outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
      failure_outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
    },
  },
];

// ─── Push execution ───────────────────────────────────────────────────────────

export type ExecutePush = (state: RunState, risk: PushRisk) => { succeeded: boolean; outcome: DecisionOutcome };

export const executePush: ExecutePush = (state, risk) => {
  const PUSH_BASE = 0.35;
  const negMod = computeNegotiationModifier(state.agent.stats.negotiation);
  const prob = Math.max(0.05, Math.min(0.85, PUSH_BASE + negMod + risk.success_probability * 0.2));
  const succeeded = Math.random() < prob;
  return { succeeded, outcome: succeeded ? risk.success_outcome : risk.failure_outcome };
};

export type RegeneratePushedDraft = (
  original: ContractDraft,
  negotiationLevel: number,
  manifest: VariantManifest,
) => ContractDraft;

export const regeneratePushedDraft: RegeneratePushedDraft = (original, negotiationLevel, _manifest) => {
  const boost = 1 + computeNegotiationModifier(negotiationLevel) * 0.5;
  return {
    ...original,
    amount:              Math.round(original.amount * boost),
    your_cut:            original.your_cut !== null ? Math.min(30, Math.round(original.your_cut * boost)) : null,
    obligations_per_turn: Math.round(original.obligations_per_turn * 0.9),
    counterparty_posture: { ...original.counterparty_posture, is_revealed: true },
  };
};

// ─── Item resolution ──────────────────────────────────────────────────────────

export type ResolveDecisionItem = (
  state: RunState,
  itemId: string,
  optionKey: string,
  manifest: VariantManifest,
) => RunState;

export const resolveDecisionItem: ResolveDecisionItem = (state, itemId, optionKey, manifest) => {
  const item = state.decision_board.find(i => i.id === itemId);
  if (!item || item.is_resolved) return state;

  let s = state;

  if (optionKey === 'push' && item.contract_draft) {
    const pushOption = item.options.find(o => o.key === 'push');
    if (pushOption?.push_risk) {
      const { succeeded, outcome } = executePush(s, pushOption.push_risk);
      if (succeeded && item.contract_draft) {
        const betterDraft = regeneratePushedDraft(item.contract_draft, s.agent.stats.negotiation, manifest);
        // Replace item with improved draft for a follow-up approve/reject
        s = {
          ...s,
          decision_board: s.decision_board.map(i =>
            i.id === itemId ? { ...i, contract_draft: betterDraft } : i,
          ),
        };
        return s;
      }
      // Failed push: apply failure outcome and mark resolved
      s = applyOutcome(s, outcome);
    }
  } else {
    const option = item.options.find(o => o.key === optionKey);
    const outcome = option?.outcome ?? item.default_on_ignore;
    s = applyOutcome(s, outcome);

    if (optionKey === 'approve' && item.contract_draft) {
      s = activateContract(s, item.contract_draft, manifest);
    }
  }

  return {
    ...s,
    decision_board: s.decision_board.map(i =>
      i.id === itemId ? { ...i, is_resolved: true, chosen_option_key: optionKey } : i,
    ),
  };
};

const applyOutcome = (state: RunState, outcome: DecisionOutcome): RunState => {
  let s = state;
  if (outcome.money_delta !== 0)      s = applyMoneyDelta(s, outcome.money_delta);
  if (outcome.reputation_delta !== 0) s = applyReputationDelta(s, outcome.reputation_delta);
  if (outcome.morale_delta && outcome.morale_delta !== 0) {
    // Apply morale delta to the relevant client if tracked on the item
    // Simplified: morale applied globally here; per-client in full implementation
  }
  return s;
};

export type ApplyBoardDefaults = (state: RunState, manifest: VariantManifest) => RunState;

export const applyBoardDefaults: ApplyBoardDefaults = (state, manifest) => {
  let s = state;
  for (const item of s.decision_board) {
    if (!item.is_resolved) {
      s = applyOutcome(s, item.default_on_ignore);
      s = {
        ...s,
        decision_board: s.decision_board.map(i =>
          i.id === item.id
            ? { ...i, is_resolved: true, chosen_option_key: '__default__' }
            : i,
        ),
      };
    }
  }
  return s;
};

// ─── Contract activation ──────────────────────────────────────────────────────

export type ActivateContract = (
  state: RunState,
  draft: ContractDraft,
  manifest: VariantManifest,
) => RunState;

export const activateContract: ActivateContract = (state, draft, _manifest) => {
  const newContract: Contract = {
    id:                contractId(),
    tier:              draft.tier,
    client_id:         draft.client_id,
    entity_id:         draft.entity_id,
    payout_type:       draft.payout_type,
    your_cut:          draft.your_cut,
    amount:            draft.amount,
    duration_remaining: draft.duration,
    objectives:        draft.objectives.map((o, i) => ({
      id:            `obj_${i}_${Date.now().toString(36)}`,
      description:   o.description,
      payout:        o.payout,
      condition_key: o.condition_key,
      is_met:        false,
      is_paid:       false,
    })),
    obligations_per_turn: draft.obligations_per_turn,
    counterparty_posture: draft.counterparty_posture,
    default_on_ignore: draft.default_on_ignore,
    expires_in:        draft.expires_in,
    turns_active:      0,
  };

  let s: RunState = { ...state, contracts: [...state.contracts, newContract] };

  // Lump sum pays out immediately on activation
  if (draft.payout_type === 'lump_sum') {
    s = earnLumpSum(s, draft.amount, newContract.id);
  }

  // Link / promote for agent<->client contracts
  if (draft.tier === 'agent_client') {
    const isOnRoster = s.roster.some(c => c.id === draft.client_id);
    if (isOnRoster) {
      // Already signed: update the contract link
      s = {
        ...s,
        roster: s.roster.map(c =>
          c.id === draft.client_id ? { ...c, agent_contract_id: newContract.id } : c,
        ),
      };
    } else {
      // Prospect signing: promote to roster
      const prospect = s.prospects.find(p => p.id === draft.client_id);
      if (prospect) {
        const stub: Client = {
          id:               prospect.id,
          name:             prospect.name,
          arc_stage:        prospect.arc_stage,
          stats:            refreshClientFog({ ...prospect, traits: [], turns_on_roster: 0, turns_at_stage: 0, active_campaign_id: null, agent_contract_id: newContract.id } as Client, s.agent),
          traits:           [],
          turns_on_roster:  0,
          turns_at_stage:   0,
          active_campaign_id: null,
          agent_contract_id: newContract.id,
        };
        s = {
          ...s,
          roster:    [...s.roster, stub],
          prospects: s.prospects.filter(p => p.id !== prospect.id),
        };
      }
    }
  }

  return s;
};

// ─── Shelf-life management ────────────────────────────────────────────────────

export type TickBoardItemExpiry = (state: RunState) => RunState;

export const tickBoardItemExpiry: TickBoardItemExpiry = (state) => {
  const board = state.decision_board
    .map(i => i.expires_in !== null ? { ...i, expires_in: i.expires_in - 1 } : i)
    .filter(i => i.expires_in === null || i.expires_in > 0 || i.is_resolved);
  return { ...state, decision_board: board };
};
