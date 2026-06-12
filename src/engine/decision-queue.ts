import { DecisionItem, DecisionOutcome, DecisionOption, PushRisk, RandomDecisionOutcome } from '../types/decision';
import { Contract, ContractDraft, CounterTerms, CounterAcceptanceRange, Objective } from '../types/contract';
import { Client } from '../types/client';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { computeNegotiationModifier } from './progression';
import { applyMoneyDelta, applyReputationDelta, earnLumpSum, computeRepTier, computeAgencyPayout } from './resource';
import { applyClientStatDeltas, refreshClientFog, checkDecisionTraitGrants, grantTrait, generateProspects, refreshProspectFog } from './client';
import { computeNarratorPacingMultiplier, computeNarratorTurnRamp, selectWeightedClient } from './narrator';

// INVARIANTS (PRD §2.1, §3.3):
// - Every item carries a mandatory default_on_ignore.
// - A decision is ALWAYS made — defaults fire at turn end if unresolved.
// - Board has 2–5 items per turn.

export const BOARD_MIN_ITEMS = 2;
export const BOARD_MAX_ITEMS = 5;
export const EARLY_BOARD_MAX_ITEMS = 1;
export const MIDGAME_BOARD_MAX_ITEMS = 3;

// A contract within this many turns of expiry qualifies for a renewal offer.
export const RENEWAL_NOTICE_TURNS = 4;
// Minimum morale true_value for the client to proactively seek renewal.
export const RENEWAL_MORALE_THRESHOLD = 65;
export const SPONSORSHIP_REPUTATION_FLOOR = 35;
export const SPONSORSHIP_MARKETABILITY_FLOOR = 68;
export const LABEL_DEAL_REPUTATION_FLOOR = 25;
export const LABEL_DEAL_TALENT_FLOOR = 62;

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

const releaseKindGate = (template: { requires_catalog_release_kind?: string[] }): string[] =>
  template.requires_catalog_release_kind?.filter(Boolean) ?? [];

const clientMatchesReleaseKindGate = (
  client: Client,
  template: { requires_catalog_release_kind?: string[] },
): boolean => {
  const kinds = releaseKindGate(template);
  if (kinds.length === 0) return true;
  return (client.catalog_releases ?? []).some(release => kinds.includes(release.kind));
};

const REP_TIER_VALUES: Record<string, number> = {
  grassroots: 0, regional: 25, national: 50, elite: 75,
};

const LABEL_ENTITY_NAMES = [
  'Northstar Records',
  'Velvet District',
  'Glasshouse Music',
  'Rooftop Sound',
  'Blue Hour Records',
  'Signal Park',
  'Crescent Row',
  'Wide Awake Music',
];

const clientHasActiveScope = (state: RunState, clientId: string, scope: string | null | undefined): boolean =>
  scope != null && state.contracts.some(
    c => c.client_id === clientId && c.exclusivity_scope === scope && c.duration_remaining > 0,
  );

const exclusiveContractsForDraft = (state: RunState, draft: ContractDraft): Contract[] => {
  if (draft.exclusivity_scope == null) return [];
  return state.contracts.filter(c =>
    c.client_id === draft.client_id
    && c.exclusivity_scope === draft.exclusivity_scope
    && c.duration_remaining > 0,
  );
};

const hasRecentCampaignMomentum = (state: RunState, clientId: string): boolean =>
  state.campaigns.some(c => c.client_id === clientId && c.turns_remaining > 0)
  || state.roster.some(c => c.id === clientId && c.catalog_releases.length > 0);

const labelNameForRoll = (roll: number): string => {
  const index = Math.max(0, Math.min(LABEL_ENTITY_NAMES.length - 1, Math.floor(roll * LABEL_ENTITY_NAMES.length)));
  return LABEL_ENTITY_NAMES[index];
};

const clientMeetsContractPacing = (
  state: RunState,
  client: Client,
  templateKey: string,
  manifest: VariantManifest,
): boolean => {
  const contractTemplate = manifest.contract_templates.find(t => t.key === templateKey);
  if (!contractTemplate || contractTemplate.tier !== 'client_entity') return true;
  if (clientHasActiveScope(state, client.id, contractTemplate.exclusivity_scope)) return false;
  if (contractTemplate.min_audience && client.audience < contractTemplate.min_audience) return false;

  const repValue = REP_TIER_VALUES[computeRepTier(state.reputation)] ?? 0;
  const marketability = client.stats.marketability.true_value;
  const talent = client.stats.talent.true_value;
  const form = client.stats.form.true_value;
  const audienceBonus = Math.min(12, Math.max(0, (Math.log10(Math.max(100, client.audience)) - 4) * 6));
  const campaignBonus = hasRecentCampaignMomentum(state, client.id) ? 6 : 0;
  const commercialScore = marketability * 0.55 + form * 0.20 + talent * 0.15 + audienceBonus + campaignBonus;

  if (contractTemplate.exclusivity_scope === 'sponsor' || contractTemplate.payout_type === 'lump_sum') {
    return repValue >= SPONSORSHIP_REPUTATION_FLOOR
      && marketability >= SPONSORSHIP_MARKETABILITY_FLOOR
      && commercialScore >= 72;
  }

  if (contractTemplate.exclusivity_scope === 'label') {
    return repValue >= LABEL_DEAL_REPUTATION_FLOOR
      && talent >= LABEL_DEAL_TALENT_FLOOR
      && commercialScore >= 58;
  }

  return repValue >= contractTemplate.rep_gate && commercialScore >= 62;
};

const eligibleClientsForTemplate = (
  state: RunState,
  template: {
    valid_arc_stages: string[];
    campaign_type_keys?: string[];
    requires_catalog_release_kind?: string[];
    contract_template_key?: string | null;
  },
  manifest: VariantManifest,
): Client[] => {
  const campaignClientIds = matchingActiveCampaigns(state, template).map(c => c.client_id);
  const candidateClients = campaignClientIds.length > 0
    ? state.roster.filter(c => campaignClientIds.includes(c.id))
    : state.roster;
  const stageMatched = template.valid_arc_stages.length > 0
    ? candidateClients.filter(c => template.valid_arc_stages.includes(c.arc_stage))
    : candidateClients;
  const releaseMatched = stageMatched.filter(c => clientMatchesReleaseKindGate(c, template));

  if (!template.contract_template_key) return releaseMatched;
  return releaseMatched.filter(c => clientMeetsContractPacing(state, c, template.contract_template_key!, manifest));
};

export const computeDecisionBoardTargetCount = (state: RunState): number => {
  const rosterSize = state.roster.length;
  const repValue = REP_TIER_VALUES[computeRepTier(state.reputation)] ?? 0;
  const activeCampaigns = state.campaigns.filter(c => c.turns_remaining > 0).length;
  const activeEntityContracts = state.contracts.filter(
    c => c.tier === 'client_entity' && c.duration_remaining > 0,
  ).length;
  const pacing = computeNarratorPacingMultiplier(state);

  if (state.turn_number <= 4) return rosterSize === 0 ? 1 : Math.max(1, Math.ceil(EARLY_BOARD_MAX_ITEMS * pacing));
  if (state.turn_number <= 10) {
    const midgameTarget = Math.min(MIDGAME_BOARD_MAX_ITEMS, 1 + Math.floor((rosterSize + activeCampaigns) / 2));
    return Math.max(1, Math.ceil(midgameTarget * pacing));
  }

  const growthSlots = Math.floor((repValue + rosterSize * 10 + activeCampaigns * 8 + activeEntityContracts * 6) / 25);
  const turnRamp = computeNarratorTurnRamp(state.turn_number);
  const target = Math.ceil((1 + growthSlots) * pacing * turnRamp);
  const minItems = pacing < 1 ? 1 : BOARD_MIN_ITEMS;
  return Math.max(minItems, Math.min(BOARD_MAX_ITEMS, target));
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
  // Obligations scale exponentially with quality — stars demand disproportionately more.
  const obligations = Math.round(lerp(template.obligations_range, rand()) * scaleFactor ** 2);

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

  const entityId = template.tier === 'client_entity'
    ? template.exclusivity_scope === 'label'
      ? labelNameForRoll(rand())
      : `entity_${rand().toString(36).substring(2)}`
    : null;

  return {
    tier:               template.tier,
    client_id:          clientId,
    entity_id:          entityId,
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
    album_option:       template.album_option ?? null,
  };
};

const draftRenewalFromContract = (
  state: RunState,
  contract: Contract,
  templateKey: string,
  manifest: VariantManifest,
): ContractDraft | null => {
  const templateDraft = hydrateContractOffer(state, templateKey, contract.client_id, manifest);
  if (!templateDraft) return null;

  // Artist always asks for at least their current rate; more if their stats now justify it.
  const renewalAmount = Math.max(templateDraft.amount, contract.amount);

  // Artist never asks for a higher cut than the current contract gives the agent.
  // They may offer a discount if the template generates a lower cut.
  const renewalCut =
    contract.your_cut !== null && templateDraft.your_cut !== null
      ? Math.min(templateDraft.your_cut, contract.your_cut)
      : contract.your_cut;

  return {
    ...templateDraft,
    tier: contract.tier,
    client_id: contract.client_id,
    entity_id: contract.entity_id,
    payout_type: contract.payout_type,
    your_cut: renewalCut,
    amount: renewalAmount,
    objectives: contract.objectives.map(o => ({
      description: o.description,
      payout: o.payout,
      condition_key: o.condition_key,
      is_paid: false,
    })),
    obligations_per_turn: contract.obligations_per_turn,
    exclusivity_scope: contract.exclusivity_scope,
  };
};

const findRenewalTemplate = (
  manifest: VariantManifest,
  client: Client,
  contract: Contract,
) => manifest.board_item_templates.find(t => {
  if (t.type !== 'renewal') return false;
  if (t.valid_arc_stages.length > 0 && !t.valid_arc_stages.includes(client.arc_stage)) return false;
  if (!t.contract_template_key) return false;
  const ct = manifest.contract_templates.find(c => c.key === t.contract_template_key);
  return ct?.tier === contract.tier;
}) ?? null;

const hasPendingRenewal = (state: RunState, clientId: string, contractId?: string | null): boolean =>
  state.decision_board.some(i =>
    i.type === 'renewal'
    && i.client_id === clientId
    && !i.is_resolved
    && (contractId == null || i.contract_id === contractId),
  );

const isContractCounterpartySatisfied = (client: Client, contract: Contract): boolean => {
  if (contract.tier === 'agent_client') {
    return client.stats.morale.true_value >= RENEWAL_MORALE_THRESHOLD;
  }

  const completedObjectiveCount = contract.objectives.filter(o => o.is_met || o.is_paid).length;
  if (completedObjectiveCount > 0) return true;

  if (contract.exclusivity_scope === 'label') {
    return client.catalog_releases.some(r => r.kind === 'album')
      || client.audience >= 500_000
      || client.stats.form.true_value >= 72;
  }

  return client.stats.morale.true_value >= RENEWAL_MORALE_THRESHOLD;
};

const buildRenewalItem = (
  state: RunState,
  client: Client,
  contract: Contract,
  manifest: VariantManifest,
): DecisionItem | null => {
  const renewalTemplate = findRenewalTemplate(manifest, client, contract);
  if (!renewalTemplate?.contract_template_key) return null;

  const draft = draftRenewalFromContract(state, contract, renewalTemplate.contract_template_key, manifest);
  if (!draft) return null;

  return {
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

    if (!isContractCounterpartySatisfied(client, contract)) continue;

    if (hasPendingRenewal(state, client.id)) continue;

    const item = buildRenewalItem(state, client, contract, manifest);
    if (item) items.push(item);
  }

  return items;
};

export type QueueContractRenewalOffer = (
  state: RunState,
  contractId: string,
  manifest: VariantManifest,
) => RunState;

export const queueContractRenewalOffer: QueueContractRenewalOffer = (state, contractId, manifest) => {
  const contract = state.contracts.find(c => c.id === contractId);
  if (!contract || contract.duration_remaining === 0 || contract.duration_remaining > RENEWAL_NOTICE_TURNS) {
    return state;
  }

  const client = state.roster.find(c => c.id === contract.client_id);
  if (!client) return state;
  if (hasPendingRenewal(state, client.id, contract.id)) return state;

  const item = buildRenewalItem(state, client, contract, manifest);
  if (!item) return state;

  return { ...state, decision_board: [...state.decision_board, item] };
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

  // Turn 1 with an active tutorial: the tutorial is the sole focus.
  if (state.turn_number === 1 && state.tutorial_step !== null && state.tutorial_step !== 'done') {
    return items;
  }

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
  const playerRepValue = REP_TIER_VALUES[repTier] ?? 0;

  const eligible = manifest.board_item_templates.filter(t => {
    // Renewals are triggered by contract state, not randomly selected.
    if (t.type === 'renewal') return false;
    if (t.rep_gate > playerRepValue) return false;
    if (t.one_time && state.fired_one_time_keys.includes(t.key)) return false;
    if (t.requires_active_scope) {
      if (!state.roster.some(c => clientHasActiveScope(state, c.id, t.requires_active_scope ?? null))) return false;
    }
    const campaignKeys = campaignGate(t);
    if (campaignKeys.length > 0 && matchingActiveCampaigns(state, t).length === 0) return false;
    if (t.valid_arc_stages.length > 0 || releaseKindGate(t).length > 0) {
      if (eligibleClientsForTemplate(state, t, manifest).length === 0) return false;
    } else if (t.contract_template_key && eligibleClientsForTemplate(state, t, manifest).length === 0) {
      return false;
    }
    return true;
  });

  // Shuffle and fill to BOARD_MIN_ITEMS..BOARD_MAX_ITEMS
  const shuffled = [...eligible]
    .sort(() => Math.random() - 0.5)
    .sort((a, b) => matchingActiveCampaigns(state, b).length - matchingActiveCampaigns(state, a).length);
  const targetCount = computeDecisionBoardTargetCount(state);
  const targetedClientIds = new Set(items.map(i => i.client_id).filter((id): id is string => id !== null));

  for (const template of shuffled) {
    if (items.length >= Math.min(targetCount, BOARD_MAX_ITEMS)) break;

    // Pick a relevant client, preferring the campaign client for campaign-gated items.
    const campaign = matchingActiveCampaigns(state, template)[0] ?? null;
    const eligibleClients = eligibleClientsForTemplate(state, template, manifest);
    const campaignClient = campaign ? eligibleClients.find(c => c.id === campaign.client_id) : null;
    const weightedClient = selectWeightedClient(state, eligibleClients, targetedClientIds)
      ?? selectWeightedClient(state, state.roster, targetedClientIds);
    const relevantClient = campaignClient ?? weightedClient ?? eligibleClients[0] ?? state.roster[0];

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
    if (item.client_id) targetedClientIds.add(item.client_id);
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
  switch (templateKey) {
    case 'scandal_denial':
    case 'press_scandal_response':
      return [
        {
          key: 'deny',
          label: 'Deny It',
          result_description: 'The denial held in the short term — reputation ticked up, though it\'s worth watching.',
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
          result_description: 'Addressing it cost money and reputation but left the artist with morale intact and the story behind them.',
          outcome: { money_delta: -2_000, reputation_delta: -1, stat_deltas: { marketability: 1, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'go_quiet',
          label: 'Go Quiet',
          result_description: 'Going quiet let the story tell itself — reputation and marketability both slid.',
          outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'tour_guitarist_leaves':
      return [
        {
          key: 'find_replacement',
          label: 'Find a Replacement',
          result_description: 'A replacement was found in time — the show went on, money spent.',
          outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'botched',
              label: 'Fell Apart',
              description: 'The replacement couldn\'t hold the set together.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: -750, reputation_delta: -1, stat_deltas: { form: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'cancel_show',
          label: 'Cancel the Show',
          result_description: 'Cancelling hurt everywhere — reputation and marketability took the brunt of it.',
          outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'play_without',
          label: 'Play Without Them',
          result_description: 'Playing without them worked — form jumped and the crowd responded to the stripped-back energy.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { form: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'fell_flat',
              label: 'Fell Flat',
              description: 'Without the guitarist the set lost its energy.',
              chance: 0.5,
              marketability_modifier: -0.2,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -2, morale: -1 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'tour_technical_accident':
      return [
        {
          key: 'embrace_chaos',
          label: 'Embrace the Chaos',
          result_description: 'Embracing the chaos made a moment of it — form and reputation both moved.',
          outcome: { money_delta: 0, reputation_delta: 2, stat_deltas: { form: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'backfire',
              label: 'Backfired',
              description: 'The chaos was too much — the crowd turned on it.',
              chance: 0.45,
              marketability_modifier: -0.3,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -3, marketability: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'try_resolve',
          label: 'Try to Resolve It',
          result_description: 'Resolving it quickly kept things together — a modest form gain from handling it with composure.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { form: 1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'failed_recovery',
              label: 'Failed Recovery',
              description: 'The disruption was too visible to overcome.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'album_great_idea':
      return [
        {
          key: 'sponsor_it',
          label: 'Back the Idea',
          result_description: 'Backing the idea paid off — form improved and the artist gained real creative confidence.',
          outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { form: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'fell_short',
              label: 'Fell Short',
              description: 'The idea didn\'t land — artist appreciated the support though.',
              chance: 0.4,
              marketability_modifier: 0,
              outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { morale: 2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'pass',
          label: 'Pass on It',
          result_description: 'Passing on it disappointed the artist — morale took the hit.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'album_better_studio':
      return [
        {
          key: 'upgrade',
          label: 'Upgrade the Studio',
          result_description: 'The upgrade paid off — form and morale both improved from the better environment.',
          outcome: { money_delta: -3_000, reputation_delta: 0, stat_deltas: { form: 3, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'no_benefit',
              label: 'No Improvement',
              description: 'The better studio didn\'t translate to better output.',
              chance: 0.4,
              marketability_modifier: 0,
              outcome: { money_delta: -3_000, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'keep_current',
          label: 'Keep Current Studio',
          result_description: 'Keeping the current setup saved money and nothing was lost — the work continues.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'album_producer_reshape':
      return [
        {
          key: 'let_them',
          label: 'Let the Producer Reshape',
          result_description: 'The reshape worked commercially — form and marketability climbed even as morale dipped from the compromise.',
          outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { form: 3, marketability: 2, morale: -2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'creative_damage',
              label: 'Creative Damage',
              description: 'The reshaped sound pleased no one.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { morale: -3, form: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Stay True to the Vision',
          result_description: 'Staying true to the vision kept morale high and produced focused, authentic work.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { form: 1, morale: 2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'album_artist_cover':
      return [
        {
          key: 'commission',
          label: 'Commission the Cover',
          result_description: 'The commission lifted form and morale — the artist felt the effort was worth it.',
          outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { form: 1, morale: 2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'skip',
          label: 'Use Standard Artwork',
          result_description: 'Using standard artwork saved money and cost nothing — no gain, no loss.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'album_videographer':
      return [
        {
          key: 'commission',
          label: 'Commission the Video',
          result_description: 'The video investment paid off — marketability jumped and the artist believed in it.',
          outcome: { money_delta: -12_000, reputation_delta: 1, stat_deltas: { marketability: 3, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Skip It',
          result_description: 'Skipping the video kept cash in the budget with no real cost either way.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'selling_different_sound':
      return [
        {
          key: 'spin_it',
          label: 'Spin the New Direction',
          result_description: 'Spinning the new direction found its story — reputation and marketability both moved.',
          outcome: { money_delta: -750, reputation_delta: 1, stat_deltas: { marketability: 2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'do_nothing',
          label: 'Let It Be',
          result_description: 'Letting the confusion grow cost both reputation and marketability.',
          outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'selling_song_traction':
      return [
        {
          key: 'capitalize',
          label: 'Capitalise on the Moment',
          result_description: 'Capitalising turned the traction into a real moment — marketability and morale both climbed.',
          outcome: { money_delta: -750, reputation_delta: 2, stat_deltas: { marketability: 5, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'ignore',
          label: 'Let It Ride',
          result_description: 'Letting it ride still delivered a natural lift — the song did the work without the spend.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'selling_music_video':
      return [
        {
          key: 'commission',
          label: 'Commission a Music Video',
          result_description: 'The video drove a significant reputation and marketability jump — the investment paid off.',
          outcome: { money_delta: -3_000, reputation_delta: 3, stat_deltas: { marketability: 5, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'weak_video',
              label: 'Weak Execution',
              description: 'The video underdelivered — still some exposure though.',
              chance: 0.4,
              marketability_modifier: 0,
              outcome: { money_delta: -3_000, reputation_delta: 1, stat_deltas: { marketability: 2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'skip',
          label: 'Skip It',
          result_description: 'Skipping the video kept costs flat with no immediate damage.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'rising_weekday_slot':
      return [
        {
          key: 'take_it',
          label: 'Take the Slot',
          result_description: 'The slot brought in money and a small marketability boost, but form and morale paid for the grind.',
          outcome: { money_delta: 500, reputation_delta: 0, stat_deltas: { marketability: 1, form: -1, morale: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'pass',
          label: 'Pass',
          result_description: 'Passing on the slot cost nothing and preserved energy for a better opportunity.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'rising_blog_interview':
      return [
        {
          key: 'speak_honestly',
          label: 'Speak Honestly',
          result_description: 'The honesty landed well — reputation, marketability, and morale all got a small lift.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 1, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'thoughtful_critique',
          label: 'Offer a Thoughtful Critique',
          result_description: 'The critique landed and reputation climbed — but it walked a line with the local scene.',
          outcome: { money_delta: 0, reputation_delta: 3, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'backfired',
              label: 'Backfired',
              description: 'The critique landed badly in the local scene.',
              chance: 0.45,
              marketability_modifier: -0.2,
              outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'rising_playlist_paytoplay':
      return [
        {
          key: 'pay',
          label: 'Pay for the Placement',
          result_description: 'The paid placement moved marketability significantly — the risk of exposure is now out there.',
          outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { marketability: 4 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'exposed',
              label: 'Exposed',
              description: 'The pay-to-play deal became public knowledge.',
              chance: 0.5,
              marketability_modifier: 0,
              outcome: { money_delta: -750, reputation_delta: -3, stat_deltas: { marketability: 4 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Stay Organic',
          result_description: 'Staying organic kept the reputation clean with nothing lost.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'rising_last_minute_opener':
      return [
        {
          key: 'do_it',
          label: 'Take the Opportunity',
          result_description: 'The unprepared slot delivered — reputation and form both climbed from the raw energy.',
          outcome: { money_delta: 0, reputation_delta: 2, stat_deltas: { form: 2, marketability: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'bombed',
              label: 'Bombed',
              description: 'The lack of prep showed — it was rough.',
              chance: 0.5,
              marketability_modifier: -0.2,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'pass',
          label: 'Pass on It',
          result_description: 'Passing cost a small morale dip but preserved prep time for a better show.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: -1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'peak_buy_back':
      return [
        {
          key: 'purchase',
          label: 'Buy Back the Rights',
          result_description: 'Buying back the rights cost heavily but morale shot up and reputation followed.',
          outcome: { money_delta: -12_000, reputation_delta: 2, stat_deltas: { morale: 5 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'pass',
          label: 'Pass',
          result_description: 'Passing on the buyback kept the money and left the situation unchanged.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'peak_artist_trend':
      return [
        {
          key: 'invest',
          label: 'Invest in the Moment',
          result_description: 'The investment captured the trend — marketability surged and morale climbed with it.',
          outcome: { money_delta: -3_000, reputation_delta: 3, stat_deltas: { marketability: 8, morale: 2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'let_ride',
          label: 'Let It Ride',
          result_description: 'Letting it ride still delivered a strong natural return with no spend.',
          outcome: { money_delta: 0, reputation_delta: 2, stat_deltas: { marketability: 5, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'declining_old_post':
      return [
        {
          key: 'let_play_out',
          label: 'Let It Play Out',
          result_description: 'Letting it play out delivered a small marketability lift — but the risk of a pile-on is still live.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: 3 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'cancellation_wave',
              label: 'Cancellation Wave',
              description: 'The revival became a pile-on instead.',
              chance: 0.5,
              marketability_modifier: -0.3,
              outcome: { money_delta: 0, reputation_delta: -3, stat_deltas: { marketability: -4, morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'get_ahead',
          label: 'Get Ahead of It',
          result_description: 'Getting ahead of it cost money but stabilised the situation — reputation held and morale steadied.',
          outcome: { money_delta: -750, reputation_delta: 1, stat_deltas: { morale: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'neutral_outcome',
              label: 'Contained',
              description: 'The response stopped the bleed but gained nothing.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { marketability: -1, morale: 1 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'declining_generational_shift':
      return [
        {
          key: 'adapt_to_new_audience',
          label: 'Adapt to the New Audience',
          result_description: 'Adapting picked up marketability at the cost of morale — the new audience took notice.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 3, morale: -2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'lost_both',
              label: 'Lost Both Audiences',
              description: 'The adaptation pleased neither the old fans nor the new.',
              chance: 0.45,
              marketability_modifier: -0.3,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -3, morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'stay_authentic',
          label: 'Stay Authentic',
          result_description: 'Staying authentic cost marketability but form and morale both recovered.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { form: 2, morale: 2, marketability: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'general_work_life_balance':
      return [
        {
          key: 'support_them',
          label: 'Support Them',
          result_description: 'The support cost money but form and morale both came back stronger.',
          outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { morale: 3, form: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'intervention_backfired',
              label: 'Backfired',
              description: 'The intervention upset the artist more than it helped.',
              chance: 0.4,
              marketability_modifier: 0,
              outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { morale: -3 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'push_through',
          label: 'Push Through',
          result_description: 'Pushing through kept the schedule but form and morale both paid for it.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { form: -2, morale: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'rising_open_for_band':
      return [
        {
          key: 'open_for_them',
          label: 'Open for Them',
          result_description: 'Opening for them cost upfront but marketability and form climbed from the exposure.',
          outcome: { money_delta: -750, reputation_delta: 1, stat_deltas: { marketability: 3, form: 1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'poor_reception',
              label: 'Poor Reception',
              description: 'The new audience didn\'t warm to the sound.',
              chance: 0.4,
              marketability_modifier: -0.2,
              outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { marketability: 1, morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Decline',
          result_description: 'Declining kept things flat — no cost, no gain.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'rising_commercial_producer':
      return [
        {
          key: 'let_reshape',
          label: 'Let Them Reshape the Sound',
          result_description: 'The commercial reshape boosted marketability even as morale took a hit from the compromise.',
          outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { marketability: 4, morale: -2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'creative_damage',
              label: 'Creative Damage',
              description: 'The commercial reshaping satisfied neither side.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { morale: -4, marketability: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'self_produce',
          label: 'Self-Produce',
          result_description: 'Self-producing recovered form and morale at a slight marketability cost.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { form: 2, morale: 2, marketability: -1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'rising_merch_print_run':
      return [
        {
          key: 'invest',
          label: 'Invest in the Print Run',
          result_description: 'The print run paid off — reputation and marketability both ticked up.',
          outcome: { money_delta: -750, reputation_delta: 1, stat_deltas: { marketability: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'unsold_stock',
              label: 'Unsold Stock',
              description: 'The merch didn\'t move — left holding the inventory.',
              chance: 0.5,
              marketability_modifier: 0,
              outcome: { money_delta: -750, reputation_delta: -1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'pass',
          label: 'Pass',
          result_description: 'Passing on the merch kept costs flat with no downside.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'rising_larger_city_show':
      return [
        {
          key: 'go',
          label: 'Take the Show There',
          result_description: 'The city show paid off — reputation and marketability both climbed from the new audience.',
          outcome: { money_delta: -2_000, reputation_delta: 2, stat_deltas: { marketability: 5 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'no_audience',
              label: 'No Audience',
              description: 'The city didn\'t know who they were — money gone, nothing gained.',
              chance: 0.45,
              marketability_modifier: -0.1,
              outcome: { money_delta: -2_000, reputation_delta: -1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'stay_local',
          label: 'Stay Local',
          result_description: 'Staying local kept everything flat — no spend, no gain.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'album_leak':
      return [
        {
          key: 'embrace_release',
          label: 'Embrace It — Release Now',
          result_description: 'Embracing the leak turned the crisis into a moment — marketability and morale both lifted.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 4, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'fight_suppress',
          label: 'Fight to Suppress It',
          result_description: 'Fighting the leak cost money; whether the suppression holds is another matter.',
          outcome: { money_delta: -3_000, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'leak_spread',
              label: 'Leak Spread Anyway',
              description: 'The suppression failed and the story spread further.',
              chance: 0.5,
              marketability_modifier: 0,
              outcome: { money_delta: -3_000, reputation_delta: -2, stat_deltas: { marketability: 2, morale: -1 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'selling_too_polished':
      return [
        {
          key: 'defend_new_direction',
          label: 'Defend the New Direction',
          result_description: 'Defending the direction earned form and morale — the criticism didn\'t stick.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { form: 2, morale: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'fans_leave',
              label: 'Old Fans Left',
              description: 'Some long-time fans couldn\'t forgive the direction.',
              chance: 0.4,
              marketability_modifier: -0.3,
              outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: -3, morale: 1 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'ignore_criticism',
          label: 'Ignore the Criticism',
          result_description: 'Ignoring the criticism let the narrative settle against them — marketability dipped.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'tour_private_plane':
      return [
        {
          key: 'rent_it',
          label: 'Rent the Plane',
          result_description: 'The upgrade cost heavily but morale shot up and reputation got a small boost.',
          outcome: { money_delta: -8_000, reputation_delta: 1, stat_deltas: { morale: 5 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Decline',
          result_description: 'Declining saved the money but morale took a real hit from the grind.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: -4 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'tour_emotionally_draining':
      return [
        {
          key: 'take_break',
          label: 'Give Them a Break',
          result_description: 'The break gave them room to recover — form and morale both bounced back strongly.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: 6, form: 3 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'push_through',
          label: 'Push Through',
          result_description: 'Pushing through cost both form and morale — the schedule held but the toll was real.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { form: -3, morale: -3 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'multi_client_fight':
      return [
        {
          key: 'ignore_fight',
          label: 'Ignore It',
          result_description: 'Ignoring the fight let it fester — reputation paid the price.',
          outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'intervene',
          label: 'Intervene',
          result_description: 'The intervention landed and reputation climbed — though there was always a chance it backfired.',
          outcome: { money_delta: 0, reputation_delta: 2, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'made_it_worse',
              label: 'Made It Worse',
              description: 'The intervention backfired publicly.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: 0, reputation_delta: -4, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'sponsor_brand_commercialize':
      return [
        {
          key: 'cancel_contract',
          label: 'Cancel the Contract',
          result_description: 'Cancelling the sponsor deal freed them from the pressure and morale recovered sharply.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { morale: 4 }, morale_delta: 0, activates_contract_id: null, terminate_contract_scope: 'sponsor' },
          push_risk: null,
        },
        {
          key: 'keep_it',
          label: 'Keep the Deal',
          result_description: 'Keeping the deal protected the money but morale and marketability both dipped.',
          outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -3, marketability: -1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'label_interview_talking_points':
      return [
        {
          key: 'follow_script',
          label: 'Follow the Script',
          result_description: 'Following the script delivered a small marketability lift — but it walked a line with authenticity.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'backfired',
              label: 'Audience Saw Through It',
              description: 'Fans sensed the inauthenticity.',
              chance: 0.45,
              marketability_modifier: -0.3,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -3 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'answer_honestly',
          label: 'Answer Honestly',
          result_description: 'Answering honestly paid off — reputation, marketability, and morale all gained.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 2, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'decline_interview',
          label: 'Decline the Interview',
          result_description: 'Declining the interview kept morale steady at the cost of a small reputation dip.',
          outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: 2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'label_daily_content':
      return [
        {
          key: 'comply',
          label: 'Comply',
          result_description: 'Complying pushed marketability but the artist\'s morale took the hit.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 3, morale: -3 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'refuse',
          label: 'Refuse',
          result_description: 'Refusing took a small reputation dip but kept the artist\'s morale intact.',
          outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'label_budget_shift':
      return [
        {
          key: 'demand_meeting',
          label: 'Demand a Meeting',
          result_description: 'Demanding a meeting held reputation — but the label could easily ignore the pushback.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'failed_demand',
              label: 'Fell on Deaf Ears',
              description: 'The label ignored the pushback.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'collaborate',
          label: 'Collaborate with the New Artist',
          result_description: 'Collaborating pulled marketability up — though there was a risk of being overshadowed.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 3 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'overshadowed',
              label: 'Overshadowed',
              description: 'The collaboration only highlighted the new signing.',
              chance: 0.45,
              marketability_modifier: -0.3,
              outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: { marketability: -3 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'do_nothing',
          label: 'Do Nothing',
          result_description: 'Doing nothing let the shift play out — marketability quietly slipped.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'label_album_rejects':
      return [
        {
          key: 'delay_comply',
          label: 'Delay and Comply',
          result_description: 'Delaying and complying cost morale but held reputation with the label.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { morale: -3 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'submit_anyway',
          label: 'Submit Anyway',
          result_description: 'Submitting anyway kept morale intact — the label\'s reaction was the unknown.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: 1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'rejected',
              label: 'Label Pushed Back',
              description: 'The label didn\'t accept the direction.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'label_album_first_single':
      return [
        {
          key: 'follow_label_plan',
          label: 'Follow the Label\'s Plan',
          result_description: 'Following the label\'s lead brought in money and a reputation tick.',
          outcome: { money_delta: 1_000, reputation_delta: 1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'insist_artist_track',
          label: 'Insist on the Artist\'s Track',
          result_description: 'Insisting on the artist\'s track held reputation and moved marketability and morale.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 2, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'label_album_two_songs_not_ready':
      return [
        {
          key: 'release_on_schedule',
          label: 'Release on Schedule',
          result_description: 'Releasing on schedule held reputation with nothing else sacrificed.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'request_delay',
          label: 'Request a Delay',
          result_description: 'Requesting a delay cost reputation, morale, and marketability.',
          outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -1, marketability: -1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'remove_unfinished',
          label: 'Remove the Unfinished Tracks',
          result_description: 'Cutting the unfinished tracks kept the album focused, though the gap was a risk.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { form: 1, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'quality_gap',
              label: 'Quality Gap',
              description: 'The missing tracks left a noticeable hole in the album.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'label_album_collab':
      return [
        {
          key: 'accept',
          label: 'Accept the Collaboration',
          result_description: 'Accepting the collaboration moved marketability at a small morale cost.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 3, morale: -1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'refuse',
          label: 'Refuse',
          result_description: 'Refusing held form and morale with no marketability downside.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { form: 1, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'label_album_fake_feud':
      return [
        {
          key: 'fake_feud',
          label: 'Stage a Fake Feud',
          result_description: 'The manufactured buzz drove a big marketability spike — whether it gets exposed is the bet.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: 6 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'manufactured',
              label: 'Seen as Manufactured',
              description: 'The public called out the fake feud.',
              chance: 0.4,
              marketability_modifier: -0.3,
              outcome: { money_delta: 0, reputation_delta: -3, stat_deltas: { marketability: 3, morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'normal_promotion',
          label: 'Normal Promotion',
          result_description: 'Normal promotion delivered a safe reputation and marketability gain.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 3 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'playful_exchange',
          label: 'Playful Public Exchange',
          result_description: 'The playful exchange earned reputation and a solid marketability lift.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 4, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'label_extend_tour':
      return [
        {
          key: 'add_dates',
          label: 'Add More Dates',
          result_description: 'Adding dates brought in money but form and morale both paid for the extra grind.',
          outcome: { money_delta: 2_000, reputation_delta: 0, stat_deltas: { form: -2, morale: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'refuse',
          label: 'Refuse',
          result_description: 'Refusing cost a reputation dip but morale recovered from the relief.',
          outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: 2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'label_opening_act':
      return [
        {
          key: 'close_friend',
          label: 'Close Friend\'s Band',
          result_description: 'The friend\'s band lifted form but cost marketability — loyalty over optics.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { form: 2, marketability: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'trendy_rising_act',
          label: 'Trendy Rising Act',
          result_description: 'The trendy opener boosted reputation and marketability, though there was always a risk of being overshadowed.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 3 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'overshadowed',
              label: 'Overshadowed',
              description: 'The opening act outshone the headliner.',
              chance: 0.4,
              marketability_modifier: -0.3,
              outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: { marketability: -1, morale: -1 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'label_hometown_venue':
      return [
        {
          key: 'book_large',
          label: 'Book the Large Venue',
          result_description: 'Booking the large venue paid off — reputation and marketability both surged with the crowd.',
          outcome: { money_delta: 2_000, reputation_delta: 3, stat_deltas: { marketability: 4, morale: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'failed_fill',
              label: 'Couldn\'t Fill It',
              description: 'The venue was visibly empty — a public misstep.',
              chance: 0.4,
              marketability_modifier: -0.4,
              outcome: { money_delta: 0, reputation_delta: -3, stat_deltas: { marketability: -3, morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'book_smaller',
          label: 'Book the Smaller Venue',
          result_description: 'Booking smaller was the safer call — a solid crowd, a real lift, no embarrassment risk.',
          outcome: { money_delta: 1_000, reputation_delta: 2, stat_deltas: { morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'label_deluxe_edition':
      return [
        {
          key: 'agree',
          label: 'Agree to the Deluxe Edition',
          result_description: 'Agreeing brought in money and boosted both reputation and marketability.',
          outcome: { money_delta: 1_500, reputation_delta: 2, stat_deltas: { marketability: 2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'refuse',
          label: 'Refuse',
          result_description: 'Refusing protected the artistic integrity — form and morale both recovered.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { form: 2, morale: 2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'platform_rights_dispute':
      return [
        {
          key: 'fight_it',
          label: 'Fight the Dispute',
          result_description: 'Fighting the dispute cost money but earned reputation and held marketability.',
          outcome: { money_delta: -3_000, reputation_delta: 2, stat_deltas: { marketability: 1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'legal_defeat',
              label: 'Legal Defeat',
              description: 'The dispute dragged on and damaged the brand.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: -3_000, reputation_delta: -2, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'let_it_be',
          label: 'Let It Be',
          result_description: 'Letting it go cost reputation and marketability — but saved the legal fees.',
          outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 're_record_older_songs':
      return [
        {
          key: 'record_them',
          label: 'Record the New Versions',
          result_description: 'The re-recordings cost money but paid off — marketability and morale both climbed.',
          outcome: { money_delta: -2_000, reputation_delta: 1, stat_deltas: { marketability: 3, morale: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'fell_short',
              label: 'Fell Short',
              description: 'The re-recordings couldn\'t match the emotional weight of the originals.',
              chance: 0.45,
              marketability_modifier: -0.2,
              outcome: { money_delta: -2_000, reputation_delta: 0, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'pass',
          label: 'Leave Them as They Are',
          result_description: 'Leaving the originals alone cost nothing and changed nothing.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'photographed_with_someone':
      return [
        {
          key: 'let_people_talk',
          label: 'Let People Talk',
          result_description: 'Letting it run picked up a small marketability gain but morale took the heat of the speculation.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: 2, morale: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'pr_manage',
          label: 'PR Management',
          result_description: 'Managing the story cost money but earned reputation and steadied morale.',
          outcome: { money_delta: -750, reputation_delta: 1, stat_deltas: { morale: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'contained',
              label: 'Contained',
              description: 'The PR response stopped the bleed but gained nothing extra.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'first_interview':
      return [
        {
          key: 'let_it_happen',
          label: 'Let the Interview Run',
          result_description: 'Letting the interview run paid off — a real marketability and morale boost.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 3, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'bombed_interview',
              label: 'Interview Went Badly',
              description: 'Word spread that they don\'t interview well.',
              chance: 0.4,
              marketability_modifier: -0.3,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -3, morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'prepare_them',
          label: 'Prep Them Beforehand',
          result_description: 'Prepping beforehand reduced the risk and delivered a solid reputation and morale gain.',
          outcome: { money_delta: -500, reputation_delta: 1, stat_deltas: { marketability: 2, morale: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'bombed_anyway',
              label: 'Fell Flat Despite Prep',
              description: 'The preparation couldn\'t mask the nerves.',
              chance: 0.25,
              marketability_modifier: -0.2,
              outcome: { money_delta: -500, reputation_delta: 0, stat_deltas: { morale: -1 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'leave_the_label':
      return [
        {
          key: 'leave',
          label: 'Leave the Label',
          result_description: 'Leaving cost money and a reputation dip, but form, morale, and independence all came back.',
          outcome: { money_delta: -2_000, reputation_delta: -1, stat_deltas: { form: 2, morale: 4, marketability: -1 }, morale_delta: 0, activates_contract_id: null, terminate_contract_scope: 'label' },
          push_risk: null,
        },
        {
          key: 'stay',
          label: 'Stay with the Label',
          result_description: 'Staying with the label kept everything steady — nothing changed.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'mixtape_budget_constraint':
      return [
        {
          key: 'one_polished_single',
          label: 'One Polished Single',
          result_description: 'Focusing on one polished track built form and gave the artist something to stand behind.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { form: 2, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'multiple_simpler_songs',
          label: 'Multiple Simpler Songs',
          result_description: 'Going wider moved marketability — more material, more reach.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: 2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'home_equipment',
          label: 'Invest in Home Equipment',
          result_description: 'Investing in home equipment cost money but built form and morale for the long game.',
          outcome: { money_delta: -750, reputation_delta: 0, stat_deltas: { form: 1, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'label_album_delay':
      return [
        {
          key: 'agree_to_delay',
          label: 'Agree to the Delay',
          result_description: 'Agreeing to the delay brought in money and a reputation bump — the label was pleased.',
          outcome: { money_delta: 1_000, reputation_delta: 1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'argue_against',
          label: 'Argue Against It',
          result_description: 'Arguing against it held morale — though the label may not have forgotten.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: 1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'label_unhappy',
              label: 'Label Pushed Back',
              description: 'The label wasn\'t pleased with the resistance.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -1 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'label_single_bigger_artist':
      return [
        {
          key: 'give_it_up',
          label: 'Give Up the Track',
          result_description: 'Selling the track brought in serious money at a real morale cost.',
          outcome: { money_delta: 8_000, reputation_delta: 0, stat_deltas: { morale: -3 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'keep_it',
          label: 'Keep the Track',
          result_description: 'Keeping the track protected morale and form — and held the creative ownership.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { morale: 2, form: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'replace_musician_tvshow':
      return [
        {
          key: 'send_experienced',
          label: 'Send the More Experienced Artist',
          result_description: 'The experienced act delivered on the stage — reputation climbed.',
          outcome: { money_delta: 0, reputation_delta: 2, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'off_night',
              label: 'Off Night',
              description: 'They had an off night on the biggest stage.',
              chance: 0.3,
              marketability_modifier: -0.2,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'send_hungry',
          label: 'Send the Hungrier Artist',
          result_description: 'The hungry act made the most of the moment.',
          outcome: { money_delta: 0, reputation_delta: 3, stat_deltas: { marketability: 3, morale: 2 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'fell_flat',
              label: 'Fell Flat',
              description: 'The inexperience showed on the biggest stage.',
              chance: 0.45,
              marketability_modifier: -0.3,
              outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: { morale: -1 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'sound_system_fails':
      return [
        {
          key: 'improvise_acoustic',
          label: 'Improvise an Acoustic Set',
          result_description: 'The acoustic improvisation became a memorable moment.',
          outcome: { money_delta: 0, reputation_delta: 2, stat_deltas: { form: 2, marketability: 3 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'not_strong_enough',
              label: 'Couldn\'t Pull It Off',
              description: 'Without the PA the performance fell apart.',
              chance: 0.45,
              marketability_modifier: -0.3,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -2, marketability: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'stop_the_show',
          label: 'Stop the Show',
          result_description: 'Stopping the show was the safe call.',
          outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'overseas_networking':
      return [
        {
          key: 'attend',
          label: 'Attend the Event',
          result_description: 'Attending cost money but opened a new contact and moved reputation.',
          outcome: { money_delta: -2_000, reputation_delta: 2, stat_deltas: { marketability: 1 }, morale_delta: 0, activates_contract_id: null, add_prospect: true },
          random_outcomes: [
            {
              key: 'nothing_useful',
              label: 'Nothing Came of It',
              description: 'The connections didn\'t materialise into anything real.',
              chance: 0.4,
              marketability_modifier: 0,
              outcome: { money_delta: -2_000, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'skip',
          label: 'Skip It',
          result_description: 'Skipping kept costs flat with nothing gained or lost.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'dropped_by_label':
      return [
        {
          key: 'accept_gracefully',
          label: 'Accept the News',
          result_description: 'Accepting the news cleanly cost reputation but let morale recover on its own terms.',
          outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: 3 }, morale_delta: 0, activates_contract_id: null, terminate_contract_scope: 'label' },
          push_risk: null,
        },
        {
          key: 'try_to_fight_it',
          label: 'Fight to Stay',
          result_description: 'Fighting to stay held morale and reputation, though the label\'s final call is still pending.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { morale: 1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'label_dropped_anyway',
              label: 'Dropped Anyway',
              description: 'The label wouldn\'t budge and the split became public and messy.',
              chance: 0.6,
              marketability_modifier: 0,
              outcome: { money_delta: 0, reputation_delta: -3, stat_deltas: { morale: -3 }, morale_delta: 0, activates_contract_id: null, terminate_contract_scope: 'label' },
            },
          ],
          push_risk: null,
        },
      ];

    case 'rising_join_touring_band':
      return [
        {
          key: 'join',
          label: 'Join the Tour',
          result_description: 'Joining the tour brought in money and built form and marketability, at the cost of morale.',
          outcome: { money_delta: 1_500, reputation_delta: 1, stat_deltas: { form: 4, marketability: 2, morale: -2 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Decline',
          result_description: 'Declining kept morale intact with nothing else lost.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'rising_cafe_slot':
      return [
        {
          key: 'accept',
          label: 'Accept the Residency',
          result_description: 'The residency brought in steady money and tightened form, though morale and marketability dipped slightly.',
          outcome: { money_delta: 750, reputation_delta: 0, stat_deltas: { form: 1, morale: -2, marketability: -1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Turn It Down',
          result_description: 'Turning it down kept everything flat — no cost, no grind.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'rising_exploitative_venue':
      return [
        {
          key: 'accept_anyway',
          label: 'Accept Anyway',
          result_description: 'Accepting the exploitative offer built form and brought in money — but morale took a real hit and reputation dipped.',
          outcome: { money_delta: 400, reputation_delta: -1, stat_deltas: { form: 3, morale: -4 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Walk Away',
          result_description: 'Walking away kept reputation clean and morale stable.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'no_campaign_inspiration':
      return [
        {
          key: 'finance_album',
          label: 'Finance an Album',
          result_description: 'Financing the album cost money up front but form, morale, and marketability all climbed.',
          outcome: { money_delta: -3_000, reputation_delta: 0, stat_deltas: { form: 4, morale: 3, marketability: 1 }, morale_delta: 0, activates_contract_id: null, start_campaign_key: 'mixtape_drop' },
          push_risk: null,
        },
        {
          key: 'finance_single',
          label: 'Finance a Single',
          result_description: 'Financing the single cost less and still delivered a solid form and morale gain.',
          outcome: { money_delta: -1_000, reputation_delta: 0, stat_deltas: { form: 2, morale: 2 }, morale_delta: 0, activates_contract_id: null, start_campaign_key: 'single_release' },
          push_risk: null,
        },
        {
          key: 'pass',
          label: 'Let the Moment Pass',
          result_description: 'Letting the moment pass cost nothing — the window closed without consequences.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'family_friend_recording':
      return [
        {
          key: 'help_out',
          label: 'Help Them Out',
          result_description: 'Helping out brought in a small fee and kept the relationship solid.',
          outcome: { money_delta: 500, reputation_delta: 0, stat_deltas: { morale: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Pass',
          result_description: 'Passing kept things neutral — no spend, no benefit.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'concert_crew_work':
      return [
        {
          key: 'take_job',
          label: 'Take the Crew Job',
          result_description: 'Taking the crew job brought in money and built form, with a small morale dip from the grind.',
          outcome: { money_delta: 750, reputation_delta: 0, stat_deltas: { form: 1, morale: -1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'industry_connection',
              label: 'Made a Connection',
              description: 'The time backstage led to a useful contact.',
              chance: 0.4,
              marketability_modifier: 0,
              outcome: { money_delta: 750, reputation_delta: 1, stat_deltas: { form: 1 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Turn It Down',
          result_description: 'Turning it down kept things flat — no income, no cost.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'agent_input_recording':
      return [
        {
          key: 'provide_input',
          label: 'Weigh In',
          result_description: 'Weighing in built form and morale — though there was always a chance it steered things wrong.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { form: 2, morale: 1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'bad_call',
              label: 'Bad Call',
              description: 'The input steered them in the wrong direction.',
              chance: 0.4,
              marketability_modifier: 0,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { form: -2, morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'skip',
          label: 'Stay Out of It',
          result_description: 'Staying out of it left everything unchanged — no risk, no reward.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'festival_underpaid_invite':
      return [
        {
          key: 'accept',
          label: 'Accept the Slot',
          result_description: 'Accepting the underpaid slot earned reputation and built form and marketability.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { form: 2, marketability: 2 }, morale_delta: 0, activates_contract_id: null, start_campaign_key: 'perform_gigs' },
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Decline',
          result_description: 'Declining kept everything flat — no exposure gained, no principle compromised.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'community_festival':
      return [
        {
          key: 'apply',
          label: 'Apply for a Slot',
          result_description: 'Applying paid off — reputation, form, morale, and marketability all got a lift.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { form: 2, morale: 2, marketability: 2 }, morale_delta: 0, activates_contract_id: null, start_campaign_key: 'perform_gigs' },
          push_risk: null,
        },
        {
          key: 'pass',
          label: 'Pass',
          result_description: 'Passing kept everything flat with no downside.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'scouting_local_concert':
      return [
        {
          key: 'go',
          label: 'Go',
          result_description: 'The concert trip opened a new prospect — worth the spend.',
          outcome: { money_delta: -500, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null, add_prospect: true },
          random_outcomes: [
            {
              key: 'nothing_found',
              label: 'Nothing Stood Out',
              description: 'An evening well spent, but nobody remarkable.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: -500, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'skip',
          label: 'Skip It',
          result_description: 'Skipping saved the money with nothing lost.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'scouting_pub':
      return [
        {
          key: 'go',
          label: 'Head Over',
          result_description: 'Heading over cost a small amount and added a prospect to the list.',
          outcome: { money_delta: -300, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null, add_prospect: true },
          random_outcomes: [
            {
              key: 'nothing_found',
              label: 'Nothing Stood Out',
              description: 'A quiet night — nobody worth approaching.',
              chance: 0.5,
              marketability_modifier: 0,
              outcome: { money_delta: -300, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'skip',
          label: 'Skip It',
          result_description: 'Skipping saved the money with nothing lost.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'friend_song':
      return [
        {
          key: 'listen_seriously',
          label: 'Listen and Take Notes',
          result_description: 'Taking the song seriously earned a reputation tick and opened a new prospect.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null, add_prospect: true },
          push_risk: null,
        },
        {
          key: 'pass',
          label: 'Not Interested',
          result_description: 'Passing kept everything flat — no relationship strain, no new lead.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'desperate_offer':
      return [
        {
          key: 'accept',
          label: 'Take Them On',
          result_description: 'Taking them on earned a reputation bump and opened a new prospect.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null, add_prospect: true },
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Pass',
          result_description: 'Passing kept the roster stable with no downside.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'scouting_park':
      return [
        {
          key: 'stop_listen',
          label: 'Stop and Listen',
          result_description: 'Stopping to listen earned reputation and a new prospect — the talent was worth noticing.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null, add_prospect: true },
          random_outcomes: [
            {
              key: 'nothing_special',
              label: 'Nothing There',
              description: 'They had a moment, but it didn\'t hold up on closer listen.',
              chance: 0.65,
              marketability_modifier: 0,
              outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'walk_past',
          label: 'Walk Past',
          result_description: 'Walking past kept everything neutral — no time spent, no opportunity missed.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'surprise_release':
      return [
        {
          key: 'get_behind_it',
          label: 'Get Behind It',
          result_description: 'Getting behind the release cost money but moved marketability and morale sharply.',
          outcome: { money_delta: -750, reputation_delta: 1, stat_deltas: { marketability: 3, morale: 2 }, morale_delta: 0, activates_contract_id: null, start_campaign_key: 'single_release' },
          push_risk: null,
        },
        {
          key: 'let_it_run',
          label: 'Let It Run',
          result_description: 'Letting it run delivered a small natural marketability gain without the spend.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: 1 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'tour_spot_talent':
      return [
        {
          key: 'approach',
          label: 'Approach After the Show',
          result_description: 'Approaching after the show earned a reputation tick and opened a new prospect.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null, add_prospect: true },
          push_risk: null,
        },
        {
          key: 'ignore',
          label: 'Let It Pass',
          result_description: 'Letting it pass kept everything neutral.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'substance_abuse_album':
      return [
        {
          key: 'let_it_be',
          label: 'Let It Be',
          result_description: 'Letting it be kept morale steady but form declined from the distraction.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: 3, form: -3 }, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
        {
          key: 'intervene',
          label: 'Intervene and Pay for Help',
          result_description: 'The intervention cost money but form and morale both recovered strongly.',
          outcome: { money_delta: -3_000, reputation_delta: 0, stat_deltas: { morale: 4, form: 3 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'rejected',
              label: 'Rejection',
              description: 'The intervention was rejected — the artist spiraled instead.',
              chance: 0.45,
              marketability_modifier: 0,
              outcome: { money_delta: -3_000, reputation_delta: 0, stat_deltas: { morale: -5, form: -4 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    case 'local_opener_request':
      return [
        {
          key: 'accept',
          label: 'Give Them the Slot',
          result_description: 'Giving the local act the slot cost money but earned reputation and marketability.',
          outcome: { money_delta: -500, reputation_delta: 2, stat_deltas: { marketability: 3 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'no_uplift',
              label: 'No Real Impact',
              description: 'The opener filled time but didn\'t drive the crowd.',
              chance: 0.5,
              marketability_modifier: 0,
              outcome: { money_delta: -500, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'decline',
          label: 'Pass',
          result_description: 'Passing kept costs flat with no downside.',
          outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
          push_risk: null,
        },
      ];

    case 'stage_invader':
      return [
        {
          key: 'call_security',
          label: 'Call Security',
          result_description: 'Calling security kept the situation controlled — reputation held.',
          outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { morale: -1 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'ugly_removal',
              label: 'Ugly Removal',
              description: 'The removal looked rough on camera — clips are circulating.',
              chance: 0.4,
              marketability_modifier: 0,
              outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: { marketability: -2, morale: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
        {
          key: 'see_how_it_goes',
          label: 'See How It Goes',
          result_description: 'Rolling with it turned into a genuine moment — reputation and marketability both climbed.',
          outcome: { money_delta: 0, reputation_delta: 2, stat_deltas: { form: 3, marketability: 3 }, morale_delta: 0, activates_contract_id: null },
          random_outcomes: [
            {
              key: 'turned_ugly',
              label: 'Turned Ugly',
              description: 'The crowd didn\'t react well — the moment killed the energy.',
              chance: 0.5,
              marketability_modifier: -0.3,
              outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -3, marketability: -2 }, morale_delta: 0, activates_contract_id: null },
            },
          ],
          push_risk: null,
        },
      ];

    default:
      return buildDefaultOptions();
  }
};

const defaultOutcomeForTemplate = (templateKey: string): DecisionOutcome => {
  switch (templateKey) {
    case 'scandal_denial':
    case 'press_scandal_response':
      return { money_delta: 0, reputation_delta: -2, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'tour_guitarist_leaves':
      return { money_delta: 0, reputation_delta: -2, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'tour_technical_accident':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'album_great_idea':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'album_better_studio':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'album_producer_reshape':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { form: 1, morale: 2 }, morale_delta: 0, activates_contract_id: null };
    case 'album_artist_cover':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'album_videographer':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'selling_different_sound':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'selling_song_traction':
      return { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 2 }, morale_delta: 0, activates_contract_id: null };
    case 'selling_music_video':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'rising_weekday_slot':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'rising_blog_interview':
      return { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 1 }, morale_delta: 0, activates_contract_id: null };
    case 'rising_playlist_paytoplay':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'rising_last_minute_opener':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: -1 }, morale_delta: 0, activates_contract_id: null };
    case 'peak_buy_back':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'peak_artist_trend':
      return { money_delta: 0, reputation_delta: 2, stat_deltas: { marketability: 5 }, morale_delta: 0, activates_contract_id: null };
    case 'declining_old_post':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -2, morale: -1 }, morale_delta: 0, activates_contract_id: null };
    case 'declining_generational_shift':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'general_work_life_balance':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { form: -2, morale: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'rising_open_for_band':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'rising_commercial_producer':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: -1 }, morale_delta: 0, activates_contract_id: null };
    case 'rising_merch_print_run':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'rising_larger_city_show':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'album_leak':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -1 }, morale_delta: 0, activates_contract_id: null };
    case 'selling_too_polished':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -3 }, morale_delta: 0, activates_contract_id: null };
    case 'tour_private_plane':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: -4 }, morale_delta: 0, activates_contract_id: null };
    case 'tour_emotionally_draining':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { form: -2, morale: -3 }, morale_delta: 0, activates_contract_id: null };
    case 'multi_client_fight':
      return { money_delta: 0, reputation_delta: -2, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'sponsor_brand_commercialize':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -3 }, morale_delta: 0, activates_contract_id: null };
    case 'label_interview_talking_points':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -1 }, morale_delta: 0, activates_contract_id: null };
    case 'label_daily_content':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -1, morale: -1 }, morale_delta: 0, activates_contract_id: null };
    case 'label_budget_shift':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'label_album_rejects':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'label_album_first_single':
      return { money_delta: 1_000, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'label_album_two_songs_not_ready':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -1 }, morale_delta: 0, activates_contract_id: null };
    case 'label_album_collab':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: 1 }, morale_delta: 0, activates_contract_id: null };
    case 'label_album_fake_feud':
      return { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 3 }, morale_delta: 0, activates_contract_id: null };
    case 'label_extend_tour':
      return { money_delta: 1_000, reputation_delta: -1, stat_deltas: { form: -1, morale: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'label_opening_act':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: 1 }, morale_delta: 0, activates_contract_id: null };
    case 'label_hometown_venue':
      return { money_delta: 500, reputation_delta: 1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'label_deluxe_edition':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'platform_rights_dispute':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { marketability: -3 }, morale_delta: 0, activates_contract_id: null };
    case 're_record_older_songs':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'photographed_with_someone':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: -1 }, morale_delta: 0, activates_contract_id: null };
    case 'first_interview':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: -1 }, morale_delta: 0, activates_contract_id: null };
    case 'leave_the_label':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'mixtape_budget_constraint':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'label_album_delay':
      return { money_delta: 1_000, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'label_single_bigger_artist':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'replace_musician_tvshow':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'sound_system_fails':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'overseas_networking':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'dropped_by_label':
      return { money_delta: 0, reputation_delta: -2, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null, terminate_contract_scope: 'label' };
    case 'rising_join_touring_band':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: 1 }, morale_delta: 0, activates_contract_id: null };
    case 'rising_cafe_slot':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'rising_exploitative_venue':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: 1 }, morale_delta: 0, activates_contract_id: null };
    case 'no_campaign_inspiration':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'family_friend_recording':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'concert_crew_work':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'agent_input_recording':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'dropped_by_label':
      return { money_delta: 0, reputation_delta: -2, stat_deltas: { morale: -2 }, morale_delta: 0, activates_contract_id: null, terminate_contract_scope: 'label' };
    case 'festival_underpaid_invite':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'community_festival':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'scouting_local_concert':
    case 'scouting_pub':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'friend_song':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'desperate_offer':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'scouting_park':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'surprise_release':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { marketability: 1 }, morale_delta: 0, activates_contract_id: null };
    case 'tour_spot_talent':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'substance_abuse_album':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: 2, form: -2 }, morale_delta: 0, activates_contract_id: null };
    case 'local_opener_request':
      return { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    case 'stage_invader':
      return { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -1 }, morale_delta: 0, activates_contract_id: null };
    default:
      return { money_delta: 0, reputation_delta: -1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
  }
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

  // Label album option: approve activates extension (existing label deal expires);
  // reject terminates the label contract and costs reputation.
  if (item.type === 'label_option') {
    if (optionKey === 'approve' && item.contract_draft) {
      let s2 = activateContract(s, item.contract_draft, manifest);
      s2 = expireRenewedContract(s2, item);
      return resolveBoardItem(s2, item, optionKey, item.options[0].outcome, 'Accepted', 'The album option has been exercised. A new label deal is now active.');
    }
    // reject or default: terminate the label contract + rep penalty
    const rejectOutcome = { money_delta: 0, reputation_delta: -2, stat_deltas: {}, morale_delta: 0, activates_contract_id: null };
    let s2 = applyReputationDelta(s, rejectOutcome.reputation_delta);
    if (item.contract_id) {
      s2 = { ...s2, contracts: s2.contracts.map(c => c.id === item.contract_id ? { ...c, duration_remaining: 0 } : c) };
    }
    return resolveBoardItem(s2, item, optionKey, rejectOutcome, 'Refused', 'The label has walked away from the deal.');
  }

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
    // Labels enforce iron-clad exclusivity: a new label offer is withdrawn if the
    // client is already bound to an active label deal (renewals are exempt).
    if (
      optionKey === 'approve'
      && item.type !== 'renewal'
      && item.contract_draft?.exclusivity_scope === 'label'
      && clientHasActiveScope(s, item.contract_draft.client_id, 'label')
    ) {
      return resolveBoardItem(
        s, item, 'reject',
        { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
        'Withdrawn',
        'The label withdrew — this artist is already under an exclusive label contract.',
      );
    }

    const option = item.options.find(o => o.key === optionKey);
    const result = resolveOptionOutcome(s, item, option);
    s = applyOutcome(s, item, result.outcome);
    s = applyReleaseQualityDelta(s, item, optionKey, result.description !== null);

    const exclusivityReplacements = optionKey === 'approve' && item.contract_draft
      ? exclusiveContractsForDraft(s, item.contract_draft)
      : [];

    if (optionKey === 'approve' && item.contract_draft) {
      s = activateContract(s, item.contract_draft, manifest);
      s = expireRenewedContract(s, item);
    }

    s = applyDecisionTraitGrants(s, item, optionKey, manifest);
    return resolveBoardItem(
      s,
      item,
      optionKey,
      result.outcome,
      result.label,
      result.description ?? (
        optionKey === 'approve'
          ? describeContractSigning(item, exclusivityReplacements)
          : null
      ),
    );
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
  if (outcome.terminate_contract_scope && item.client_id) {
    const scope = outcome.terminate_contract_scope;
    s = {
      ...s,
      contracts: s.contracts.map(c =>
        c.client_id === item.client_id && c.exclusivity_scope === scope && c.duration_remaining > 0
          ? { ...c, duration_remaining: 0 }
          : c,
      ),
    };
  }
  if (outcome.add_prospect) {
    const usedNames = new Set([...s.roster.map(c => c.name), ...s.prospects.map(p => p.name)]);
    const [newProspect] = generateProspects(
      1, usedNames, s.reputation, s.turn_number,
      s.agent.stats.stat_scouting, s.agent.stats.insight_scouting,
    );
    if (newProspect) {
      s = { ...s, prospects: [...s.prospects, refreshProspectFog(newProspect, s.agent)] };
    }
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

  return { outcome: option.outcome, label: option.label, description: option.result_description ?? null };
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

const releaseQualityDeltaForDecision = (
  item: DecisionItem,
  optionKey: string,
  wasRandomBranch: boolean,
): number => {
  if (wasRandomBranch) return 0;

  if (item.template_key === 'album_great_idea' && optionKey === 'sponsor_it') return 5;
  if (item.template_key === 'album_better_studio' && optionKey === 'upgrade') return 8;
  if (item.template_key === 'album_producer_reshape' && optionKey === 'let_them') return 4;
  if (item.template_key === 'album_producer_reshape' && optionKey === 'decline') return 2;
  if (item.template_key === 'label_album_collab' && optionKey === 'accept') return -4;
  if (item.template_key === 'label_album_collab' && optionKey === 'refuse') return 4;
  if (item.template_key === 'label_album_two_songs_not_ready' && optionKey === 'request_delay') return 8;
  if (item.template_key === 'album_leak' && optionKey === 'embrace_release') return -5;
  if (item.template_key === 'mixtape_budget_constraint' && optionKey === 'one_polished_single') return 8;
  if (item.template_key === 'mixtape_budget_constraint' && optionKey === 'multiple_simpler_songs') return 3;
  if (item.template_key === 'label_single_bigger_artist' && optionKey === 'keep_it') return 5;

  return 0;
};

const applyReleaseQualityDelta = (
  state: RunState,
  item: DecisionItem,
  optionKey: string,
  wasRandomBranch: boolean,
): RunState => {
  const qualityDelta = releaseQualityDeltaForDecision(item, optionKey, wasRandomBranch);
  if (qualityDelta === 0 || !item.campaign_id) return state;

  return {
    ...state,
    campaigns: state.campaigns.map(campaign =>
      campaign.id === item.campaign_id && campaign.release_plan
        ? {
            ...campaign,
            release_plan: {
              ...campaign.release_plan,
              songs: campaign.release_plan.songs.map(song => ({
                ...song,
                quality: Math.max(1, Math.min(100, song.quality + qualityDelta)),
              })),
            },
          }
        : campaign,
    ),
  };
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

const expireRenewedContract = (state: RunState, item: DecisionItem): RunState => {
  if (item.type !== 'renewal' || !item.contract_id) return state;

  return {
    ...state,
    contracts: state.contracts.map(c =>
      c.id === item.contract_id ? { ...c, duration_remaining: 0 } : c,
    ),
  };
};

const describeContractSigning = (
  item: DecisionItem,
  replacedContracts: Contract[],
): string | null => {
  const draft = item.contract_draft;
  if (!draft) return null;
  if (item.type === 'renewal') {
    return 'Renewed. The current contract will be replaced by the new term.';
  }
  if (replacedContracts.length === 0 || draft.exclusivity_scope == null) {
    return 'Signed. The contract is now active.';
  }

  const scope = draft.exclusivity_scope.replace(/_/g, ' ');
  const count = replacedContracts.length;
  const noun = count === 1 ? 'contract' : 'contracts';
  return `Signed. This exclusive ${scope} agreement ended ${count} existing ${scope} ${noun}.`;
};

export type ApplyBoardDefaults = (state: RunState, manifest: VariantManifest) => RunState;

export const applyBoardDefaults: ApplyBoardDefaults = (state, manifest) => {
  let s = state;
  for (const item of s.decision_board) {
    if (!item.is_resolved) {
      s = applyOutcome(s, item, item.default_on_ignore);
      const isDeclined = (item.type === 'contract_offer' || item.type === 'renewal')
        && item.contract_draft?.default_on_ignore === 'reject';
      s = resolveBoardItem(
        s,
        item,
        '__default__',
        item.default_on_ignore,
        isDeclined ? 'Declined' : 'Ignored',
        isDeclined
          ? 'The offer was withdrawn — no action was taken.'
          : `Ignored: ${item.description}`,
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
    album_option:      draft.album_option,
  };

  const contractsWithExclusivityEnforced = draft.exclusivity_scope == null
    ? state.contracts
    : state.contracts.map(c =>
        c.client_id === draft.client_id
        && c.exclusivity_scope === draft.exclusivity_scope
        && c.duration_remaining > 0
          ? { ...c, duration_remaining: 0 }
          : c,
      );

  let s: RunState = { ...state, contracts: [...contractsWithExclusivityEnforced, newContract] };

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
      if (prospect && s.roster.length < s.agent.roster_capacity) {
        const stub: Client = {
          id:               prospect.id,
          name:             prospect.name,
          gender:           prospect.gender,
          portrait:         prospect.portrait,
          age_weeks:        prospect.age_weeks,
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
    const exclusivityReplacements = exclusiveContractsForDraft(state, acceptedDraft);
    let s = activateContract(state, acceptedDraft, manifest);
    s = expireRenewedContract(s, item);
    return {
      ...s,
      decision_board: s.decision_board.map(i =>
        i.id === itemId
          ? {
              ...i,
              contract_draft: acceptedDraft,
              is_resolved: true,
              chosen_option_key: 'counter_accepted',
              resolved_result_label: 'Accepted',
              resolved_result_description: describeContractSigning(
                { ...item, contract_draft: acceptedDraft },
                exclusivityReplacements,
              ),
            }
          : i,
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

  const prospectRefusedAgentContract =
    item.contract_draft.tier === 'agent_client'
    && state.prospects.some(p => p.id === item.contract_draft?.client_id);
  const s = applyReputationDelta({
    ...state,
    prospects: prospectRefusedAgentContract
      ? state.prospects.filter(p => p.id !== item.contract_draft?.client_id)
      : state.prospects,
  }, -1);
  return {
    ...s,
    decision_board: s.decision_board.map(i =>
      i.id === itemId ? { ...i, is_resolved: true, chosen_option_key: 'counter_rejected' } : i,
    ),
  };
};

// ─── Label album option injection ────────────────────────────────────────────
// Called from campaign.ts when an album_cycle campaign closes with a successful
// average roll and the client's label contract has an album_option clause.

const hasPendingAlbumOption = (state: RunState, clientId: string): boolean =>
  state.decision_board.some(i => i.type === 'label_option' && i.client_id === clientId && !i.is_resolved);

export type InjectAlbumOptionDecision = (
  state: RunState,
  clientId: string,
  labelContract: import('../types/contract').Contract,
) => RunState;

export const injectAlbumOptionDecision: InjectAlbumOptionDecision = (state, clientId, labelContract) => {
  const option = labelContract.album_option;
  if (!option) return state;
  if (hasPendingAlbumOption(state, clientId)) return state;

  const client = state.roster.find(c => c.id === clientId);
  if (!client) return state;

  const posture: import('../types/contract').FoggedPosture = {
    true_value: 0.5,
    is_revealed: false,
    observed_min: null,
    observed_max: null,
  };

  const draft: ContractDraft = {
    tier: labelContract.tier,
    client_id: clientId,
    entity_id: labelContract.entity_id,
    payout_type: labelContract.payout_type,
    your_cut: labelContract.your_cut,
    amount: labelContract.amount,
    duration: option.duration,
    objectives: labelContract.objectives.map(o => ({
      description: o.description,
      payout: o.payout,
      condition_key: o.condition_key,
      is_paid: false,
    })),
    obligations_per_turn: labelContract.obligations_per_turn,
    counterparty_posture: posture,
    default_on_ignore: 'client_leaves',
    expires_in: 3,
    exclusivity_scope: labelContract.exclusivity_scope,
    album_option: null,
  };

  const item: DecisionItem = {
    id: generateId(),
    type: 'label_option',
    template_key: 'label_album_option',
    campaign_id: null,
    client_id: clientId,
    contract_id: labelContract.id,
    contract_draft: draft,
    description: `${client.name}'s label is exercising their album option — they want a second record.`,
    options: [
      {
        key: 'approve',
        label: 'Accept',
        outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
        push_risk: null,
      },
      {
        key: 'reject',
        label: 'Refuse',
        outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
        push_risk: null,
      },
    ],
    default_on_ignore: { money_delta: 0, reputation_delta: -2, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
    expires_in: 3,
    is_resolved: false,
    chosen_option_key: null,
    resolved_outcome: null,
    resolved_result_label: null,
    resolved_result_description: null,
  };

  return { ...state, decision_board: [...state.decision_board, item] };
};

// ─── Shelf-life management ────────────────────────────────────────────────────

export type TickBoardItemExpiry = (state: RunState) => RunState;

export const tickBoardItemExpiry: TickBoardItemExpiry = (state) => {
  const board = state.decision_board
    .map(i => i.expires_in !== null ? { ...i, expires_in: i.expires_in - 1 } : i)
    .filter(i => i.expires_in === null || i.expires_in > 0 || i.is_resolved);
  return { ...state, decision_board: board };
};
