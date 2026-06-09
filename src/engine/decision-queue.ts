import { DecisionItem, DecisionOutcome, DecisionOption, PushRisk, RandomDecisionOutcome } from '../types/decision';
import { Contract, ContractDraft, CounterTerms, CounterAcceptanceRange, Objective } from '../types/contract';
import { Client } from '../types/client';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { computeNegotiationModifier } from './progression';
import { applyMoneyDelta, applyReputationDelta, earnLumpSum, computeRepTier, computeAgencyPayout } from './resource';
import { applyClientStatDeltas, refreshClientFog, checkDecisionTraitGrants, grantTrait } from './client';

// INVARIANTS (PRD §2.1, §3.3):
// - Every item carries a mandatory default_on_ignore.
// - A decision is ALWAYS made — defaults fire at turn end if unresolved.
// - Board has 2–5 items per turn.

export const BOARD_MIN_ITEMS = 2;
export const BOARD_MAX_ITEMS = 5;

// A contract within this many turns of expiry qualifies for a renewal offer.
export const RENEWAL_NOTICE_TURNS = 4;
// Minimum morale true_value for the client to proactively seek renewal.
export const RENEWAL_MORALE_THRESHOLD = 65;

const generateId = (): string =>
  `itm_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

const contractId = (): string =>
  `ctr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

const fillTemplate = (template: string, clientName?: string): string =>
  template.replace(/\{client_name\}/g, clientName ?? 'A client');

const campaignGate = (template: { campaign_type_keys?: string[] }): string[] =>
  template.campaign_type_keys?.filter(Boolean) ?? [];

const matchingActiveCampaigns = (state: RunState, template: { campaign_type_keys?: string[] }) => {
  const keys = campaignGate(template);
  if (keys.length === 0) return [];
  return state.campaigns.filter(c => c.turns_remaining > 0 && keys.includes(c.type_key));
};

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
  const audienceLift = Math.max(0.85, Math.min(1.35, Math.log10(Math.max(100, client.audience)) / 4));
  const scaleFactor = Math.max(0.5, Math.min(2.2, (statScaling / 60) * audienceLift)); // normalised around stat=60 and 10k fans

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

  // Objectives: use explicit objective_templates if provided (any payout type),
  // otherwise fall back to hardcoded milestones for per_objective contracts.
  const objTemplates = template.objective_templates ?? [];
  const objectives = objTemplates.length > 0
    ? objTemplates.map(ot => ({
        description:   ot.description,
        payout:        Math.round(amount * ot.payout_fraction) || 5_000,
        condition_key: ot.condition_key,
        is_paid:       false,
      }))
    : template.payout_type === 'per_objective'
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
    exclusivity_scope:  template.exclusivity_scope ?? null,
  };
};

// ─── Contract renewal offers ──────────────────────────────────────────────────

// Returns one renewal board item per near-expiry contract whose client is happy,
// skipping any client that already has an unresolved renewal on the board.
export type GenerateContractRenewalOffers = (state: RunState, manifest: VariantManifest) => DecisionItem[];

export const generateContractRenewalOffers: GenerateContractRenewalOffers = (state, manifest) => {
  const items: DecisionItem[] = [];

  for (const contract of state.contracts) {
    if (contract.duration_remaining === 0 || contract.duration_remaining > RENEWAL_NOTICE_TURNS) continue;

    const client = state.roster.find(c => c.id === contract.client_id);
    if (!client) continue;

    if (client.stats.morale.true_value < RENEWAL_MORALE_THRESHOLD) continue;

    const alreadyPending = state.decision_board.some(
      i => i.type === 'renewal' && i.client_id === client.id && !i.is_resolved,
    );
    if (alreadyPending) continue;

    const renewalTemplate = manifest.board_item_templates.find(t => {
      if (t.type !== 'renewal') return false;
      if (t.valid_arc_stages.length > 0 && !t.valid_arc_stages.includes(client.arc_stage)) return false;
      if (!t.contract_template_key) return false;
      const ct = manifest.contract_templates.find(c => c.key === t.contract_template_key);
      return ct?.tier === contract.tier;
    });
    if (!renewalTemplate) continue;

    const draft = hydrateContractOffer(state, renewalTemplate.contract_template_key!, client.id, manifest);

    items.push({
      id:               generateId(),
      type:             'renewal',
      template_key:     renewalTemplate.key,
      campaign_id:      null,
      client_id:        client.id,
      contract_id:      contract.id,
      contract_draft:   draft,
      description:      fillTemplate(renewalTemplate.description_template, client.name),
      options:          buildDefaultOptions(),
      default_on_ignore: defaultOutcomeForTemplate(renewalTemplate.key),
      expires_in:       renewalTemplate.expires_in,
      is_resolved:      false,
      chosen_option_key: null,
    });
  }

  return items;
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

  // Triggered renewal offers for near-expiry contracts with happy clients
  const renewals = generateContractRenewalOffers(state, manifest);
  for (const renewal of renewals) {
    if (items.length >= BOARD_MAX_ITEMS) break;
    if (!items.some(i => i.client_id === renewal.client_id && i.type === 'renewal')) {
      items.push(renewal);
    }
  }

  if (items.length >= BOARD_MAX_ITEMS) return items.slice(0, BOARD_MAX_ITEMS);

  // Filter eligible templates by rep tier and roster state
  const REP_TIER_VALUES: Record<string, number> = {
    grassroots: 0, regional: 25, national: 50, elite: 75,
  };
  const playerRepValue = REP_TIER_VALUES[repTier] ?? 0;

  const eligible = manifest.board_item_templates.filter(t => {
    // Renewals are triggered by contract state, not randomly selected.
    if (t.type === 'renewal') return false;
    if (t.rep_gate > playerRepValue) return false;
    const campaignKeys = campaignGate(t);
    if (campaignKeys.length > 0 && matchingActiveCampaigns(state, t).length === 0) return false;
    if (t.valid_arc_stages.length > 0) {
      const campaignClientIds = matchingActiveCampaigns(state, t).map(c => c.client_id);
      const candidateClients = campaignClientIds.length > 0
        ? state.roster.filter(c => campaignClientIds.includes(c.id))
        : state.roster;
      const hasMatch = candidateClients.some(c => t.valid_arc_stages.includes(c.arc_stage));
      if (!hasMatch) return false;
    }
    return true;
  });

  // Shuffle and fill to BOARD_MIN_ITEMS..BOARD_MAX_ITEMS
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const targetCount = BOARD_MIN_ITEMS + Math.floor(Math.random() * (BOARD_MAX_ITEMS - BOARD_MIN_ITEMS + 1));

  for (const template of shuffled) {
    if (items.length >= Math.min(targetCount, BOARD_MAX_ITEMS)) break;

    // Pick a relevant client, preferring the campaign client for campaign-gated items.
    const campaign = matchingActiveCampaigns(state, template)[0] ?? null;
    const candidateClients = campaign
      ? state.roster.filter(c => c.id === campaign.client_id)
      : state.roster;
    const relevantClient = candidateClients.find(c => template.valid_arc_stages.includes(c.arc_stage))
      ?? candidateClients[0]
      ?? state.roster.find(c => template.valid_arc_stages.includes(c.arc_stage))
      ?? state.roster[0];

    let draft: ContractDraft | null = null;
    if (template.contract_template_key && relevantClient) {
      draft = hydrateContractOffer(state, template.contract_template_key, relevantClient.id, manifest);
    }

    const item: DecisionItem = {
      id:               generateId(),
      type:             template.type,
      template_key:     template.key,
      campaign_id:      campaign?.id ?? null,
      client_id:        relevantClient?.id ?? null,
      contract_id:      null,
      contract_draft:   draft,
      description:      fillTemplate(template.description_template, relevantClient?.name),
      options:          buildOptionsForTemplate(template.key, draft !== null),
      default_on_ignore: defaultOutcomeForTemplate(template.key),
      expires_in:       template.expires_in,
      is_resolved:      false,
      chosen_option_key: null,
      resolved_outcome: null,
      resolved_result_label: null,
      resolved_result_description: null,
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

const buildOptionsForTemplate = (templateKey: string, _hasDraft: boolean): DecisionOption[] => {
  if (templateKey === 'scandal_denial' || templateKey === 'press_scandal_response') {
    return [
      {
        key: 'deny',
        label: 'Deny It',
        outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 1 }, morale_delta: 0, activates_contract_id: null },
        random_outcomes: [
          {
            key: 'backfire',
            label: 'Backfired',
            description: 'The denial drew more scrutiny and the story grew.',
            chance: 0.35,
            marketability_modifier: 0.5,
            outcome: { money_delta: 0, reputation_delta: -4, stat_deltas: { marketability: -5, morale: -2 }, morale_delta: 0, activates_contract_id: null },
          },
        ],
        push_risk: null,
      },
      {
        key: 'address',
        label: 'Address It',
        outcome: { money_delta: -2_000, reputation_delta: -1, stat_deltas: { marketability: 1, morale: 1 }, morale_delta: 0, activates_contract_id: null },
        push_risk: null,
      },
      {
        key: 'go_quiet',
        label: 'Go Quiet',
        outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null },
        push_risk: null,
      },
    ];
  }

  return buildDefaultOptions();
};

const defaultOutcomeForTemplate = (templateKey: string): DecisionOutcome => {
  if (templateKey === 'scandal_denial' || templateKey === 'press_scandal_response') {
    return { money_delta: 0, reputation_delta: -2, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null };
  }

  return { money_delta: 0, reputation_delta: -1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
};

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
      s = applyOutcome(s, item, outcome);
    }
  } else {
    const option = item.options.find(o => o.key === optionKey);
    const result = resolveOptionOutcome(s, item, option);
    s = applyOutcome(s, item, result.outcome);

    if (optionKey === 'approve' && item.contract_draft) {
      s = activateContract(s, item.contract_draft, manifest);
    }

    s = applyDecisionTraitGrants(s, item, optionKey, manifest);
    return resolveBoardItem(s, item, optionKey, result.outcome, result.label, result.description);
  }

  const option = item.options.find(o => o.key === optionKey);
  const outcome = option?.push_risk?.failure_outcome ?? option?.outcome ?? item.default_on_ignore;
  return resolveBoardItem(s, item, optionKey, outcome, null, null);
};

const applyDecisionTraitGrants = (
  state: RunState,
  item: DecisionItem,
  optionKey: string,
  manifest: VariantManifest,
): RunState => {
  if (!item.client_id || !item.template_key) return state;
  const client = state.roster.find(c => c.id === item.client_id);
  if (!client) return state;

  const countKey = `${item.template_key}:${optionKey}`;
  const updatedCounts = {
    ...client.decision_option_counts,
    [countKey]: (client.decision_option_counts[countKey] ?? 0) + 1,
  };
  const clientWithCount = { ...client, decision_option_counts: updatedCounts };

  const traitIds = checkDecisionTraitGrants(clientWithCount, item.template_key, optionKey, manifest);
  const finalClient = traitIds.reduce((c, id) => grantTrait(c, id, manifest), clientWithCount);

  return {
    ...state,
    roster: state.roster.map(c => c.id === item.client_id ? finalClient : c),
  };
};

const applyOutcome = (state: RunState, item: DecisionItem, outcome: DecisionOutcome): RunState => {
  let s = state;
  if (outcome.money_delta !== 0)      s = applyMoneyDelta(s, outcome.money_delta);
  if (outcome.reputation_delta !== 0) s = applyReputationDelta(s, outcome.reputation_delta);
  if (Object.keys(outcome.stat_deltas).length > 0 && item.client_id) {
    s = {
      ...s,
      roster: s.roster.map(client =>
        client.id === item.client_id
          ? applyClientStatDeltas(client, outcome.stat_deltas, s.agent)
          : client,
      ),
    };
  }
  if (outcome.morale_delta && outcome.morale_delta !== 0) {
    // Apply morale delta to the relevant client if tracked on the item
    // Simplified: morale applied globally here; per-client in full implementation
  }
  return s;
};

const resolveOptionOutcome = (
  state: RunState,
  item: DecisionItem,
  option: DecisionOption | undefined,
): { outcome: DecisionOutcome; label: string | null; description: string | null } => {
  if (!option) return { outcome: item.default_on_ignore, label: 'Default', description: 'No valid option was selected.' };

  const selected = selectRandomOutcome(state, item, option.random_outcomes ?? []);
  if (selected) {
    return {
      outcome: selected.outcome,
      label: selected.label,
      description: selected.description,
    };
  }

  return { outcome: option.outcome, label: option.label, description: null };
};

const selectRandomOutcome = (
  state: RunState,
  item: DecisionItem,
  outcomes: RandomDecisionOutcome[],
): RandomDecisionOutcome | null => {
  const client = item.client_id ? state.roster.find(c => c.id === item.client_id) : null;
  const marketability = client?.stats.marketability.true_value ?? 50;
  let roll = Math.random();

  for (const outcome of outcomes) {
    const adjustedChance = Math.max(0, Math.min(1,
      outcome.chance + ((50 - marketability) / 100) * outcome.marketability_modifier,
    ));
    if (roll < adjustedChance) return outcome;
    roll -= adjustedChance;
  }

  return null;
};

const resolveBoardItem = (
  state: RunState,
  item: DecisionItem,
  optionKey: string,
  outcome: DecisionOutcome,
  resultLabel: string | null,
  resultDescription: string | null,
): RunState => {
  const option = item.options.find(o => o.key === optionKey);
  const label = resultLabel ?? option?.label ?? 'Resolved';
  const description = resultDescription ?? `${label}: ${item.description}`;

  return {
    ...state,
    decision_board: state.decision_board.map(i =>
      i.id === item.id
        ? {
            ...i,
            is_resolved: true,
            chosen_option_key: optionKey,
            resolved_outcome: outcome,
            resolved_result_label: label,
            resolved_result_description: description,
          }
        : i,
    ),
  };
};

export type ApplyBoardDefaults = (state: RunState, manifest: VariantManifest) => RunState;

export const applyBoardDefaults: ApplyBoardDefaults = (state, manifest) => {
  let s = state;
  for (const item of s.decision_board) {
    if (!item.is_resolved) {
      s = applyOutcome(s, item, item.default_on_ignore);
      s = resolveBoardItem(
        s,
        item,
        '__default__',
        item.default_on_ignore,
        'Ignored',
        `Ignored: ${item.description}`,
      );
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
    exclusivity_scope: draft.exclusivity_scope,
    turns_active:      0,
  };

  let s: RunState = { ...state, contracts: [...state.contracts, newContract] };

  // Lump sum pays out immediately on activation. Company-side deals credit only
  // the agency's cut; agent-client deals credit the full negotiated amount.
  if (draft.payout_type === 'lump_sum') {
    s = earnLumpSum(s, computeAgencyPayout(s, newContract, draft.amount), newContract.id);
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
          audience:         prospect.audience,
          max_potential:    prospect.max_potential,
          stats:            refreshClientFog({ ...prospect, traits: [], turns_on_roster: 0, turns_at_stage: 0, active_campaign_id: null, campaign_history: [], catalog_releases: [], agent_contract_id: newContract.id, max_potential: prospect.max_potential, decision_option_counts: {} } as Client, s.agent),
          traits:           [],
          decision_option_counts: {},
          turns_on_roster:  0,
          turns_at_stage:   0,
          active_campaign_id: null,
          campaign_history: [],
          catalog_releases: [],
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

// ─── Counteroffer / acceptance-probability flow ───────────────────────────────
//
// DESIGN (DESIGN_CORE_SYSTEMS.md §Counteroffer Flow):
// - Player adjusts specific terms; engine estimates acceptance probability.
// - Probability displayed as fogged range; higher Negotiation narrows the band.
// - Resolution outcomes: accepted (contract activates), revised (counterparty
//   moves partway), or rejected (reputation penalty, item closed).

export const FOG_HALF_BASE = 0.25;        // half-width of fog band at Negotiation 0
export const COUNTER_REVISED_WINDOW = 0.25; // probability mass allocated to the revised outcome

// Signed measure of how aggressively the counter favors the agent vs. original terms.
// Positive = agent asking for more (harder to accept); negative = agent conceding (easier).
// Returned value is in [-1, 1]; fields not present in counter are ignored.
export type ComputeCounterAggressiveness = (draft: ContractDraft, counter: CounterTerms) => number;

export const computeCounterAggressiveness: ComputeCounterAggressiveness = (draft, counter) => {
  let aggression = 0;

  if (counter.amount !== undefined && draft.amount > 0) {
    const rel = Math.max(-1, Math.min(1, (counter.amount - draft.amount) / draft.amount));
    aggression += rel * 0.45;
  }

  if (
    counter.your_cut !== undefined &&
    counter.your_cut !== null &&
    draft.your_cut !== null
  ) {
    const rel = Math.max(-1, Math.min(1, (counter.your_cut - draft.your_cut) / 30));
    aggression += rel * 0.30;
  }

  if (counter.obligations_per_turn !== undefined && draft.obligations_per_turn > 0) {
    // Asking for fewer obligations is agent-favorable → positive aggressiveness
    const rel = Math.max(-1, Math.min(1,
      (draft.obligations_per_turn - counter.obligations_per_turn) / draft.obligations_per_turn,
    ));
    aggression += rel * 0.15;
  }

  if (counter.duration !== undefined && draft.duration > 0) {
    // Asking for a longer lock-in is agent-favorable → positive aggressiveness
    const rel = Math.max(-1, Math.min(1, (counter.duration - draft.duration) / draft.duration));
    aggression += rel * 0.10;
  }

  return Math.max(-1, Math.min(1, aggression));
};

// Core probability math shared by the engine function and the UI preview.
// Takes negotiation level directly so the UI can call it without a full RunState.
export const computeCounterRange = (
  negotiationLevel: number,
  draft: ContractDraft,
  counter: CounterTerms,
): CounterAcceptanceRange => {
  const aggressiveness   = computeCounterAggressiveness(draft, counter);
  const posture          = draft.counterparty_posture.true_value;
  const negMod           = computeNegotiationModifier(negotiationLevel);
  const true_probability = Math.max(0.05, Math.min(0.95,
    posture - aggressiveness * 0.6 + negMod * 0.2,
  ));
  const fog_half = Math.max(0.05, FOG_HALF_BASE * (1 - negMod / 0.4));
  return {
    true_probability,
    observed_min: Math.max(0.02, true_probability - fog_half),
    observed_max: Math.min(0.98, true_probability + fog_half),
  };
};

// Returns the fogged acceptance-probability range for a proposed counter.
// true_probability is engine-only; observed_min/max are shown to the player.
export type ComputeCounterAcceptanceProbability = (
  state: RunState,
  draft: ContractDraft,
  counter: CounterTerms,
) => CounterAcceptanceRange;

export const computeCounterAcceptanceProbability: ComputeCounterAcceptanceProbability = (
  state, draft, counter,
) => computeCounterRange(state.agent.stats.negotiation, draft, counter);

// Returns a new draft with only the counter's specified fields applied.
export type ApplyCounterTerms = (draft: ContractDraft, counter: CounterTerms) => ContractDraft;

export const applyCounterTerms: ApplyCounterTerms = (draft, counter) => ({
  ...draft,
  ...(counter.payout_type          !== undefined ? { payout_type: counter.payout_type }                 : {}),
  ...(counter.amount               !== undefined ? { amount: counter.amount }                           : {}),
  ...(counter.your_cut             !== undefined ? { your_cut: counter.your_cut }                       : {}),
  ...(counter.duration             !== undefined ? { duration: counter.duration }                       : {}),
  ...(counter.obligations_per_turn !== undefined ? { obligations_per_turn: counter.obligations_per_turn } : {}),
});

// Counterparty meets the agent partway — used for the 'revised' outcome.
const computeRevisedDraft = (
  original: ContractDraft,
  counter: CounterTerms,
  negotiationLevel: number,
): ContractDraft => {
  const negMod = computeNegotiationModifier(negotiationLevel);
  // Higher Negotiation = counterparty concedes a larger fraction
  const factor = 0.25 + negMod * 0.5;

  const revised: CounterTerms = {};
  if (counter.amount !== undefined) {
    revised.amount = Math.round(original.amount + (counter.amount - original.amount) * factor);
  }
  if (counter.your_cut !== undefined && counter.your_cut !== null && original.your_cut !== null) {
    revised.your_cut = Math.round(original.your_cut + (counter.your_cut - original.your_cut) * factor);
  }
  if (counter.obligations_per_turn !== undefined) {
    revised.obligations_per_turn = Math.round(
      original.obligations_per_turn +
      (counter.obligations_per_turn - original.obligations_per_turn) * factor,
    );
  }
  if (counter.duration !== undefined) {
    revised.duration = Math.round(original.duration + (counter.duration - original.duration) * factor);
  }
  return applyCounterTerms(original, revised);
};

// Resolves a counteroffer against the item identified by itemId.
//
// Outcomes encoded in returned state:
//   accepted  — contract activated; item resolved with chosen_option_key 'counter_accepted'
//   revised   — contract_draft updated to compromise terms; item stays unresolved
//   rejected  — reputation −1 applied; item resolved with chosen_option_key 'counter_rejected'
export type ResolveCounteroffer = (
  state: RunState,
  itemId: string,
  counter: CounterTerms,
  manifest: VariantManifest,
) => RunState;

export const resolveCounteroffer: ResolveCounteroffer = (state, itemId, counter, manifest) => {
  const item = state.decision_board.find(i => i.id === itemId);
  if (!item || item.is_resolved || !item.contract_draft) return state;

  const { true_probability } = computeCounterAcceptanceProbability(state, item.contract_draft, counter);
  const roll = Math.random();

  if (roll < true_probability) {
    const acceptedDraft = applyCounterTerms(item.contract_draft, counter);
    let s = activateContract(state, acceptedDraft, manifest);
    return {
      ...s,
      decision_board: s.decision_board.map(i =>
        i.id === itemId ? { ...i, is_resolved: true, chosen_option_key: 'counter_accepted' } : i,
      ),
    };
  }

  if (roll < true_probability + COUNTER_REVISED_WINDOW) {
    const revisedDraft = computeRevisedDraft(
      item.contract_draft, counter, state.agent.stats.negotiation,
    );
    return {
      ...state,
      decision_board: state.decision_board.map(i =>
        i.id === itemId ? { ...i, contract_draft: revisedDraft } : i,
      ),
    };
  }

  const s = applyReputationDelta(state, -1);
  return {
    ...s,
    decision_board: s.decision_board.map(i =>
      i.id === itemId ? { ...i, is_resolved: true, chosen_option_key: 'counter_rejected' } : i,
    ),
  };
};

// ─── Shelf-life management ────────────────────────────────────────────────────

export type TickBoardItemExpiry = (state: RunState) => RunState;

export const tickBoardItemExpiry: TickBoardItemExpiry = (state) => {
  const board = state.decision_board
    .map(i => i.expires_in !== null ? { ...i, expires_in: i.expires_in - 1 } : i)
    .filter(i => i.expires_in === null || i.expires_in > 0 || i.is_resolved);
  return { ...state, decision_board: board };
};
