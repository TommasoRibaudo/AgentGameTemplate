import {
  Campaign,
  CampaignHistoryItem,
  CampaignInstallmentResult,
  CampaignSetup,
  CampaignSize,
  CatalogRelease,
  CreativeReleasePlan,
  ReleaseSummaryNotification,
  ReleaseKind,
} from '../types/campaign';
import { RunState, NewsItem } from '../types/run';
import { CampaignCategoryDefinition, VariantManifest } from '../types/manifest';
import { Client } from '../types/client';
import { Contract } from '../types/contract';
import { grantTrait, checkTraitGrant, applyClientStatDeltas, refreshClientFog } from './client';
import { computeAgencyPayout, getAgentCutPercent } from './resource';
import { injectAlbumOptionDecision } from './decision-queue';

// INVARIANTS (PRD §3.5):
// - One installment resolves per turn during Upkeep.
// - Installment rolls use Form true_value (not observed) for resolution math.
// - Results are append-only.

const generateId = (): string =>
  `cmp_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

const SIZE_CONFIG: Record<CampaignSize, {
  payout: number;
  audience: number;
  eventRisk: number;
  budget: number;
  // audience below this applies a roll penalty; 0 = no gate
  audience_gate: number;
  // maximum roll penalty (applied at 0 audience)
  audience_penalty_max: number;
}> = {
  small:  { payout: 0.75, audience: 0.75, eventRisk: 0.75, budget: 0.65, audience_gate: 0,      audience_penalty_max: 0  },
  medium: { payout: 1.00, audience: 1.00, eventRisk: 1.00, budget: 1.00, audience_gate: 5_000,  audience_penalty_max: 15 },
  large:  { payout: 1.45, audience: 1.60, eventRisk: 1.50, budget: 1.70, audience_gate: 50_000, audience_penalty_max: 30 },
};

// Exported so the UI can display audience warnings without duplicating thresholds
export const SIZE_AUDIENCE_GATES: Readonly<Record<CampaignSize, number>> = {
  small:  SIZE_CONFIG.small.audience_gate,
  medium: SIZE_CONFIG.medium.audience_gate,
  large:  SIZE_CONFIG.large.audience_gate,
};

const SONG_TITLE_PARTS = [
  'Neon', 'Midnight', 'Static', 'Golden', 'Runaway', 'Velvet', 'Afterglow', 'Lowlight',
  'Wild', 'Echo', 'Silver', 'Lost', 'Electric', 'Sunday', 'Paper', 'Fever',
];

const SONG_TITLE_NOUNS = [
  'Hearts', 'Weather', 'Signals', 'Rooms', 'Summer', 'Letters', 'City', 'Dreams',
  'Fire', 'Mirrors', 'Radio', 'Ghosts', 'Promises', 'Gravity', 'Crown', 'Noise',
];

const RELEASE_TITLE_PARTS = [
  'Night Drive', 'Bright Static', 'The Long Return', 'Glass Cities', 'Open Frequency',
  'Soft Voltage', 'Second Skyline', 'Wild Signals', 'Northern Heat', 'Permanent Weather',
];

export type BuildCampaignSetup = (
  typeDef: VariantManifest['campaign_types'][number],
  size?: CampaignSize,
  length?: number,
  budget?: number,
  budgetFloors?: Partial<Record<CampaignSize, number>>,
) => CampaignSetup;

export const buildCampaignSetup: BuildCampaignSetup = (typeDef, size = 'medium', length, budget, budgetFloors) => {
  const chosenLength = Math.max(1, Math.round(length ?? typeDef.total_turns));
  const sizeConfig = SIZE_CONFIG[size];
  const floorForSize = budgetFloors?.[size] ?? 500;
  const baselineBudget = Math.max(floorForSize, Math.round(typeDef.base_payout * chosenLength * 0.25 * sizeConfig.budget));
  const chosenBudget = Math.max(0, Math.round(budget ?? baselineBudget));
  const budgetRatio = baselineBudget > 0 ? chosenBudget / baselineBudget : 1;
  const budgetMultiplier = Math.max(0.5, Math.min(1.75, Math.sqrt(Math.max(0.1, budgetRatio))));

  return {
    size,
    length: chosenLength,
    budget: chosenBudget,
    payout_multiplier: sizeConfig.payout * budgetMultiplier,
    audience_multiplier: sizeConfig.audience * budgetMultiplier,
    event_risk_multiplier: sizeConfig.eventRisk * Math.max(0.65, 1.3 - budgetMultiplier * 0.3),
  };
};

// Derives campaign size from budget relative to the campaign type's medium and large baselines.
// Budget >= midpoint(medium, large) → large; >= 75% of medium → medium; otherwise small.
export const deriveCampaignSize = (
  typeDef: VariantManifest['campaign_types'][number],
  length: number,
  budget: number,
  budgetFloors?: Partial<Record<CampaignSize, number>>,
): CampaignSize => {
  const len = Math.max(1, Math.round(length));
  const medBudget = Math.max(budgetFloors?.medium ?? 500, Math.round(typeDef.base_payout * len * 0.25 * SIZE_CONFIG.medium.budget));
  const lgBudget  = Math.max(budgetFloors?.large  ?? 1_000, Math.round(typeDef.base_payout * len * 0.25 * SIZE_CONFIG.large.budget));
  if (budget >= Math.round((medBudget + lgBudget) / 2)) return 'large';
  if (budget >= Math.round(medBudget * 0.75))           return 'medium';
  return 'small';
};

const getCampaignSetup = (
  campaign: Campaign,
  typeDef: VariantManifest['campaign_types'][number],
): CampaignSetup => campaign.setup ?? buildCampaignSetup(typeDef, 'medium', campaign.total_turns);

const campaignGate = (def: { campaign_type_keys?: string[] }): string[] =>
  def.campaign_type_keys?.filter(Boolean) ?? [];

const campaignMatchesGate = (def: { campaign_type_keys?: string[] }, campaignTypeKey: string): boolean => {
  const keys = campaignGate(def);
  return keys.length === 0 || keys.includes(campaignTypeKey);
};

const fillTemplate = (template: string, clientName?: string): string =>
  template.replace(/\{client_name\}/g, clientName ?? 'A client');

// Box-Muller normal distribution
const normalRandom = (mean: number, stdDev: number): number => {
  const u1 = Math.random() || Number.EPSILON;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

// Returns the length of the trailing consecutive run of 'great' outcomes.
export const computeCurrentStreak = (results: CampaignInstallmentResult[]): number => {
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].outcome_key !== 'great') break;
    streak++;
  }
  return streak;
};

// Returns the longest consecutive run of 'great' outcomes across all results.
export const computeBestStreak = (results: CampaignInstallmentResult[]): number => {
  let best = 0, current = 0;
  for (const r of results) {
    current = r.outcome_key === 'great' ? current + 1 : 0;
    if (current > best) best = current;
  }
  return best;
};

// Arc-gated streak bonus: fractional multiplier applied when streak >= 2.
// Rising gets the strongest reward because momentum matters most early in a career.
const STREAK_RATE: Record<string, number> = { rising: 0.12, peak: 0.04, declining: 0 };
const STREAK_CAP:  Record<string, number> = { rising: 0.60, peak: 0.15, declining: 0 };

export const computeStreakBonus = (streak: number, arcStage: string): number => {
  if (streak < 2) return 0;
  const rate = STREAK_RATE[arcStage] ?? 0;
  const cap  = STREAK_CAP[arcStage]  ?? 0;
  return Math.min((streak - 1) * rate, cap);
};

const computeFanMarketabilityBonus = (audience: number): number =>
  clamp((Math.log10(Math.max(100, audience)) - 4) * 8, -8, 20);

const computeEffectiveMarketability = (marketability: number, audience: number): number =>
  clamp(marketability + computeFanMarketabilityBonus(audience), 0, 100);

const isReleaseCampaign = (typeDef: VariantManifest['campaign_types'][number]): typeDef is VariantManifest['campaign_types'][number] & { release_kind: ReleaseKind } =>
  typeDef.release_kind === 'album' || typeDef.release_kind === 'single' || typeDef.release_kind === 'mixtape';

const RISING_TALENT_GROWTH_CAMPAIGNS = new Set(['perform_gigs', 'mixtape_drop']);
const TALENT_GROWTH_BASE_CHANCE = 0.15;
const TALENT_GROWTH_CHANCE_PER_COACHING = 0.10;

const rollRisingCampaignTalentDelta = (
  client: RunState['roster'][number],
  campaignTypeKey: string,
  coaching: number,
): number => {
  if (client.arc_stage !== 'rising') return 0;
  if (!RISING_TALENT_GROWTH_CAMPAIGNS.has(campaignTypeKey)) return 0;
  if (client.stats.talent.true_value >= client.max_potential) return 0;
  const chance = clamp(TALENT_GROWTH_BASE_CHANCE + coaching * TALENT_GROWTH_CHANCE_PER_COACHING, 0, 0.85);
  return Math.random() < chance ? 1 : 0;
};

export const clientHasActiveLabelContract = (state: RunState, clientId: string): boolean =>
  state.contracts.some(
    c => c.client_id === clientId && c.tier === 'client_entity' && c.exclusivity_scope === 'label' && c.duration_remaining > 0,
  );

export const clientMeetsCampaignContractRequirements = (
  state: RunState,
  clientId: string,
  typeDef: VariantManifest['campaign_types'][number],
): boolean =>
  !typeDef.requires_label_contract || clientHasActiveLabelContract(state, clientId);

export const resolveCampaignCategory = (
  categoryDef: CampaignCategoryDefinition,
  client: Client,
  activeContracts: Contract[],
  length: number,
): { type_key: string; size_names: Record<CampaignSize, string> } | null => {
  const hasLabel = activeContracts.some(
    c => c.client_id === client.id && c.tier === 'client_entity' && c.exclusivity_scope === 'label' && c.duration_remaining > 0,
  );
  for (const rule of categoryDef.routing_rules) {
    const { conditions } = rule;
    if (conditions.has_label !== undefined && conditions.has_label !== hasLabel) continue;
    if (conditions.min_audience !== undefined && client.audience < conditions.min_audience) continue;
    if (conditions.min_turns !== undefined && length < conditions.min_turns) continue;
    if (conditions.max_turns !== undefined && length > conditions.max_turns) continue;
    if (conditions.valid_arc_stages !== undefined && !conditions.valid_arc_stages.includes(client.arc_stage)) continue;
    return { type_key: rule.type_key, size_names: rule.size_names };
  }
  return null;
};

const generatedSongTitle = (used: Set<string>): string => {
  for (let i = 0; i < 20; i++) {
    const title = `${SONG_TITLE_PARTS[Math.floor(Math.random() * SONG_TITLE_PARTS.length)]} ${SONG_TITLE_NOUNS[Math.floor(Math.random() * SONG_TITLE_NOUNS.length)]}`;
    if (!used.has(title)) {
      used.add(title);
      return title;
    }
  }
  const fallback = `Track ${used.size + 1}`;
  used.add(fallback);
  return fallback;
};

const buildReleasePlan = (
  state: RunState,
  clientId: string,
  typeDef: VariantManifest['campaign_types'][number],
  setup: CampaignSetup,
): CreativeReleasePlan | undefined => {
  if (!isReleaseCampaign(typeDef)) return undefined;
  const client = state.roster.find(c => c.id === clientId);
  if (!client) return undefined;

  const songCount = typeDef.release_kind === 'single'
    ? 1
    : setup.size === 'large' ? 16 : setup.size === 'small' ? 5 : 10;
  const usedTitles = new Set<string>();
  const title = typeDef.release_kind === 'single'
    ? generatedSongTitle(usedTitles)
    : RELEASE_TITLE_PARTS[Math.floor(Math.random() * RELEASE_TITLE_PARTS.length)];

  const songs = Array.from({ length: songCount }, (_, index) => {
    const effectiveMarketability = computeEffectiveMarketability(
      client.stats.marketability.true_value,
      client.audience,
    );
    const baseQuality =
      client.stats.talent.true_value * 0.48 +
      client.stats.form.true_value * 0.32 +
      effectiveMarketability * 0.08 +
      state.agent.stats.negotiation * 1.5;
    return {
      id: `${clientId}_song_${Date.now().toString(36)}_${index}`,
      title: typeDef.release_kind === 'single' && index === 0 ? title : generatedSongTitle(usedTitles),
      quality: Math.round(clamp(normalRandom(baseQuality, 12), 1, 100)),
    };
  });

  return { kind: typeDef.release_kind, title, songs };
};

// ─── Installment resolution ───────────────────────────────────────────────────

export type RollInstallment = (
  state: RunState,
  campaignId: string,
  manifest: VariantManifest,
) => CampaignInstallmentResult;

export const rollInstallment: RollInstallment = (state, campaignId, manifest) => {
  const campaign = state.campaigns.find(c => c.id === campaignId)!;
  const client   = state.roster.find(c => c.id === campaign.client_id)!;
  const typeDef  = manifest.campaign_types.find(t => t.key === campaign.type_key)!;
  const setup    = getCampaignSetup(campaign, typeDef);

  // Apply trait Form modifiers before rolling
  const formModifierFromTraits = client.traits.reduce(
    (acc, t) => acc + (t.stat_modifiers.form ?? 0), 0,
  );
  const effectiveForm = Math.max(0, Math.min(100, client.stats.form.true_value + formModifierFromTraits));

  // Audience-adequacy penalty: unknown artists running oversized campaigns roll worse.
  const audienceGate    = SIZE_CONFIG[setup.size].audience_gate;
  const audiencePenalty = audienceGate > 0 && client.audience < audienceGate
    ? Math.round(((audienceGate - client.audience) / audienceGate) * SIZE_CONFIG[setup.size].audience_penalty_max)
    : 0;

  const formContrib = effectiveForm * typeDef.form_weight;
  const raw         = normalRandom(formContrib - audiencePenalty, typeDef.variance);
  const roll_result = Math.max(0, Math.min(100, Math.round(raw)));

  // Determine outcome_key from roll
  const outcome_key = roll_result >= 70 ? 'great'
    : roll_result >= 40 ? 'average'
    : 'poor';

  // Per-installment stat deltas from campaign type definition
  const stat_deltas = typeDef.per_installment_stat_deltas;

  // Money: proportional to roll for per_week; 0 for lump/objective (paid at close)
  const releaseCampaign = isReleaseCampaign(typeDef);
  const money_delta = !releaseCampaign && typeDef.payout_type === 'per_week'
    ? Math.round((roll_result / 100) * typeDef.base_payout * setup.payout_multiplier)
    : 0;

  // Reputation nudge based on outcome
  const reputation_delta = roll_result >= 70 ? 3 : roll_result < 40 ? -1 : 0;

  const result: CampaignInstallmentResult = {
    turn_number:            state.turn_number,
    roll_result,
    outcome_key,
    stat_deltas,
    money_delta,
    reputation_delta,
    triggered_event_id:  null,
    triggered_trait_id:  null,
    audience_gain:       0,
  };

  return result;
};

// ─── Post-installment checks ──────────────────────────────────────────────────

export type CheckInstallmentEventTrigger = (
  state: RunState,
  result: CampaignInstallmentResult,
  campaignId: string,
  manifest: VariantManifest,
) => RunState;

export const checkInstallmentEventTrigger: CheckInstallmentEventTrigger = (
  state, result, campaignId, manifest,
) => {
  const campaign = state.campaigns.find(c => c.id === campaignId);
  if (!campaign) return state;
  const typeDef = manifest.campaign_types.find(t => t.key === campaign.type_key);
  if (!typeDef) return state;

  const setup = getCampaignSetup(campaign, typeDef);
  const adjustedThreshold = typeDef.event_trigger_threshold * setup.event_risk_multiplier;
  if (result.roll_result >= adjustedThreshold) return state;

  // Build a minimal client event from the event library. Prefer campaign-specific
  // definitions, then fall back to generic client events.
  const matchingClientEvents = manifest.events.filter(
    e => e.category === 'client' && e.severity !== 'crisis' && campaignMatchesGate(e, campaign.type_key),
  );
  const campaignSpecificEvents = matchingClientEvents.filter(
    e => campaignGate(e).length > 0,
  );
  const clientEvents = campaignSpecificEvents.length > 0 ? campaignSpecificEvents : matchingClientEvents;
  if (clientEvents.length === 0) return state;

  const def = clientEvents[Math.floor(Math.random() * clientEvents.length)];
  const eventId = `evt_cmp_${generateId()}`;
  const clientName = state.roster.find(c => c.id === campaign.client_id)?.name;

  const newEvent: import('../types/event').GameEvent = {
    id:               eventId,
    template_key:     def.key,
    campaign_id:      campaign.id,
    category:         'client',
    severity:         def.severity,
    client_id:        campaign.client_id,
    description:      fillTemplate(def.description_template, clientName),
    options:          def.options.map(o => ({
      key: o.key, label: o.label,
      outcome: { ...o.outcome, injects_board_item_key: null },
    })),
    default_outcome:  { ...def.default_outcome, injects_board_item_key: null },
    defense_track_key: def.defense_track_key,
    is_resolved:      false,
    chosen_option_key: null,
  };

  return { ...state, pending_events: [...state.pending_events, newEvent] };
};

export type CheckInstallmentTraitTrigger = (
  state: RunState,
  result: CampaignInstallmentResult,
  campaignId: string,
  manifest: VariantManifest,
) => RunState;

export const checkInstallmentTraitTrigger: CheckInstallmentTraitTrigger = (
  state, result, campaignId, manifest,
) => {
  const campaign = state.campaigns.find(c => c.id === campaignId);
  if (!campaign) return state;
  const typeDef = manifest.campaign_types.find(t => t.key === campaign.type_key);
  if (!typeDef || result.roll_result < typeDef.trait_trigger_threshold) return state;

  const client = state.roster.find(c => c.id === campaign.client_id);
  if (!client) return state;

  const traitId = checkTraitGrant(client, campaign.type_key, result.roll_result, manifest);
  if (!traitId) return state;

  const updatedClient = grantTrait(client, traitId, manifest);
  return {
    ...state,
    roster: state.roster.map(c => c.id === client.id ? updatedClient : c),
  };
};

// ─── Objective settlement ─────────────────────────────────────────────────────

export type SettleCampaignObjectives = (
  state: RunState,
  campaignId: string,
  manifest: VariantManifest,
) => RunState;

export const settleCampaignObjectives: SettleCampaignObjectives = (state, campaignId, manifest) => {
  const campaign = state.campaigns.find(c => c.id === campaignId);
  if (!campaign || campaign.pending_objective_ids.length === 0) return state;

  let s = state;
  const updatedContracts = s.contracts.map(contract => {
    if (!contract.objectives.length) return contract;
    let changed = false;
    const updatedObjectives = contract.objectives.map(obj => {
      if (!campaign.pending_objective_ids.includes(obj.id) || obj.is_paid) return obj;
      // Mark as met and pay the agency's share of company-side deals.
      const payout = computeAgencyPayout(s, contract, obj.payout);
      s = { ...s, money: s.money + payout, total_earnings: s.total_earnings + payout };
      changed = true;
      return { ...obj, is_met: true, is_paid: true };
    });
    return changed ? { ...contract, objectives: updatedObjectives } : contract;
  });

  return { ...s, contracts: updatedContracts };
};

// ─── Expectation-based fan delta ─────────────────────────────────────────────
// Expectations are set by the client's personal best (highest average roll across
// all prior completed campaigns). The dead zone prevents noise from near-average
// deviations; investment weight means a low-budget 1-turn promo doesn't count for
// much even if it flops, while a large-budget album campaign does.

const EXPECTATION_DEAD_ZONE = 15;
const EXPECTATION_TURN_BASELINE = 4;
const EXPECTATION_BUDGET_BASELINE = 2000;
const EXPECTATION_AUDIENCE_DIVISOR = 5;
const EXPECTATION_SCALE = 100;

export const computeExpectationFanDelta = (
  priorHistory: CampaignHistoryItem[],
  installmentResults: CampaignInstallmentResult[],
  totalTurns: number,
  budget: number,
  audience: number,
): number => {
  const validPrior = priorHistory.filter(h => h.installment_results.length > 0);
  if (validPrior.length === 0 || installmentResults.length === 0) return 0;

  const currentAvg =
    installmentResults.reduce((sum, r) => sum + r.roll_result, 0) / installmentResults.length;
  const personalBest = Math.max(
    ...validPrior.map(
      h => h.installment_results.reduce((sum, r) => sum + r.roll_result, 0) / h.installment_results.length,
    ),
  );

  const gap = currentAvg - personalBest;
  if (Math.abs(gap) < EXPECTATION_DEAD_ZONE) return 0;

  const investmentScore = Math.sqrt(
    Math.max(0.1, (totalTurns / EXPECTATION_TURN_BASELINE) * (budget / EXPECTATION_BUDGET_BASELINE)),
  );
  const audienceScale = Math.log10(Math.max(100, audience)) / EXPECTATION_AUDIENCE_DIVISOR;
  const magnitude = (Math.abs(gap) - EXPECTATION_DEAD_ZONE) * investmentScore * audienceScale * EXPECTATION_SCALE;

  return gap > 0 ? Math.round(magnitude) : -Math.round(magnitude);
};

// ─── Campaign lifecycle ───────────────────────────────────────────────────────

export type StartCampaign = (
  state: RunState,
  clientId: string,
  campaignTypeKey: string,
  linkedObjectiveIds: string[],
  manifest: VariantManifest,
  setup?: Partial<Pick<CampaignSetup, 'size' | 'length' | 'budget'>>,
) => RunState;

export const startCampaign: StartCampaign = (state, clientId, campaignTypeKey, linkedObjectiveIds, manifest, setupOptions) => {
  const typeDef = manifest.campaign_types.find(t => t.key === campaignTypeKey);
  if (!typeDef) return state;
  const client = state.roster.find(c => c.id === clientId);
  if (!client || client.active_campaign_id) return state;
  if (!clientMeetsCampaignContractRequirements(state, clientId, typeDef)) return state;

  // Auto-link objectives from a commission-style contract if the campaign type declares a scope.
  // Also serves as a hard gate: if the scope is configured but no matching contract is active,
  // the campaign cannot start (there's nothing to deliver against).
  const autoLinkedIds: string[] = [];
  if (typeDef.auto_link_contract_scope) {
    for (const c of state.contracts) {
      if (c.client_id === clientId && c.exclusivity_scope === typeDef.auto_link_contract_scope && c.duration_remaining > 0) {
        for (const obj of c.objectives) {
          if (!obj.is_paid) autoLinkedIds.push(obj.id);
        }
      }
    }
    if (autoLinkedIds.length === 0) return state;
  }
  const allLinkedIds = [...linkedObjectiveIds, ...autoLinkedIds];

  const setup = buildCampaignSetup(typeDef, setupOptions?.size, setupOptions?.length, setupOptions?.budget, manifest.budget_floors);
  if (state.money < setup.budget) return state;

  const campaign: Campaign = {
    id:                   generateId(),
    client_id:            clientId,
    type_key:             campaignTypeKey,
    setup,
    release_plan:         buildReleasePlan(state, clientId, typeDef, setup),
    total_turns:          setup.length,
    turns_remaining:      setup.length,
    installment_results:  [],
    pending_objective_ids: allLinkedIds,
  };

  const budgetNews: NewsItem[] = setup.budget > 0
    ? [{
        id:               `news_cmp_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        turn_number:      state.turn_number,
        type:             'campaign_installment',
        description:      `${client.name}: ${typeDef.label ?? campaignTypeKey.replace(/_/g, ' ')} launch`,
        money_delta:      -setup.budget,
        reputation_delta: null,
        client_id:        clientId,
        fan_delta:        null,
      }]
    : [];

  return {
    ...state,
    money:     state.money - setup.budget,
    campaigns: [...state.campaigns, campaign],
    roster:    state.roster.map(c =>
      c.id === clientId ? { ...c, active_campaign_id: campaign.id } : c,
    ),
    news_feed: [...state.news_feed, ...budgetNews],
  };
};

export type AdvanceCampaigns = (state: RunState, manifest: VariantManifest) => RunState;

export const advanceCampaigns: AdvanceCampaigns = (state, manifest) => {
  const rosterIds = new Set(state.roster.map(c => c.id));
  let s = {
    ...state,
    campaigns: state.campaigns.filter(c => rosterIds.has(c.client_id)),
  };

  for (const campaign of s.campaigns) {
    const typeDef = manifest.campaign_types.find(t => t.key === campaign.type_key);
    if (!typeDef) continue;
    const setup = getCampaignSetup(campaign, typeDef);
    const result = rollInstallment(s, campaign.id, manifest);

    // Consecutive-great streak bonus (installment campaigns only; 0 for releases or non-great outcomes)
    const isRelease = isReleaseCampaign(typeDef);
    const streakBonus = (!isRelease && result.outcome_key === 'great')
      ? computeStreakBonus(
          computeCurrentStreak(campaign.installment_results) + 1,
          s.roster.find(c => c.id === campaign.client_id)?.arc_stage ?? 'rising',
        )
      : 0;

    // Apply stat deltas to client
    const client = s.roster.find(c => c.id === campaign.client_id);
    let audienceGain = 0;
    if (client) {
      const rawAudienceGain = isRelease
        ? 0
        : computeAudienceGain(client.audience, result.roll_result, client.stats.marketability.true_value, setup.audience_multiplier);
      audienceGain = streakBonus > 0 ? Math.round(rawAudienceGain * (1 + streakBonus)) : rawAudienceGain;
      const updatedStats = Object.keys(result.stat_deltas).length > 0
        ? applyClientStatDeltas(client, result.stat_deltas, s.agent)
        : client;
      const updated = { ...updatedStats, audience: client.audience + audienceGain };
      s = { ...s, roster: s.roster.map(c => c.id === client.id ? updated : c) };
    }

    // Apply money/rep deltas, scaled up for active great streaks
    const scaledMoneyDelta = streakBonus > 0 && result.money_delta > 0
      ? Math.round(result.money_delta * (1 + streakBonus))
      : result.money_delta;
    const scaledRepDelta = streakBonus > 0 && result.reputation_delta > 0
      ? Math.round(result.reputation_delta * (1 + streakBonus))
      : result.reputation_delta;
    s = {
      ...s,
      money:           Math.max(0, s.money + scaledMoneyDelta),
      reputation:      Math.max(0, Math.min(100, s.reputation + scaledRepDelta)),
      total_earnings:  scaledMoneyDelta > 0 ? s.total_earnings + scaledMoneyDelta : s.total_earnings,
      peak_reputation: Math.max(s.peak_reputation, s.reputation),
    };

    // Append installment result and tick down (store streak-scaled values for accurate history summary)
    const updatedCampaign: Campaign = {
      ...campaign,
      turns_remaining:     campaign.turns_remaining - 1,
      installment_results: [
        ...campaign.installment_results,
        { ...result, money_delta: scaledMoneyDelta, reputation_delta: scaledRepDelta, audience_gain: audienceGain },
      ],
    };

    s = { ...s, campaigns: s.campaigns.map(c => c.id === campaign.id ? updatedCampaign : c) };

    // Check event/trait triggers
    s = checkInstallmentEventTrigger(s, result, campaign.id, manifest);
    s = checkInstallmentTraitTrigger(s, result, campaign.id, manifest);

    // Close if finished
    if (updatedCampaign.turns_remaining <= 0) {
      s = closeCampaign(s, campaign.id, manifest);
    }
  }

  return s;
};

const averageSongQuality = (release: Pick<CatalogRelease, 'songs'>): number =>
  release.songs.length === 0
    ? 50
    : release.songs.reduce((sum, song) => sum + song.quality, 0) / release.songs.length;

// Returns the perform_gigs sales multiplier for a client actively gigging.
// Rising artists benefit more because their fanbase discovers them through shows.
const computePerformingBoost = (arcStage: string, audience: number): number => {
  if (arcStage === 'rising') {
    return 2.0 + (Math.log10(Math.max(100, audience)) - 2) * 0.2;
  }
  return 1.25;
};

const computeCatalogTurn = (
  release: CatalogRelease,
  audience: number,
  agentCut: number,
  performBoost: number = 1.0,
): { streams: number; streamIncome: number; albumUnits: number; albumIncome: number; fanGain: number; keepSellingAlbums: boolean } => {
  const quality = averageSongQuality(release);
  const qualityLift = 0.35 + quality / 100;
  const fanBaseLift = Math.max(0.75, Math.min(2.25, Math.log10(Math.max(100, audience)) / 4));
  const songLift = release.kind === 'single'
    ? qualityLift
    : release.songs.reduce((sum, song) => sum + song.quality / 100, 0);
  const streamDecayPower = release.kind === 'single' ? 0.5 : release.kind === 'mixtape' ? 0.6 : 0.7;
  const streamDecay = 1 / Math.pow(1 + release.turns_since_release, streamDecayPower);
  const albumDecay = Math.pow(0.62, release.turns_since_release);
  const streamBase = release.kind === 'single' ? 1.6 : release.kind === 'mixtape' ? 0.48 : 0.26;

  const streams = Math.max(0, Math.round(audience * streamBase * songLift * fanBaseLift * streamDecay * performBoost));
  const streamIncome = Math.round(streams * 0.003 * agentCut);
  const hasSales = (release.kind === 'album' || release.kind === 'mixtape') && release.is_selling_albums;
  const albumUnits = hasSales
    ? Math.max(0, Math.round(audience * 0.018 * qualityLift * fanBaseLift * albumDecay * performBoost))
    : 0;
  const keepSellingAlbums = hasSales && albumUnits >= 10;
  const albumIncome = Math.round(albumUnits * 10 * agentCut);
  const albumFanLift = hasSales && release.turns_since_release === 0 ? albumUnits * 0.18 : albumUnits * 0.12;
  const fanGain = Math.round((streams / 1000) * (0.25 + quality / 160) + albumFanLift);

  return { streams, streamIncome, albumUnits, albumIncome, fanGain, keepSellingAlbums };
};

export type CollectCatalogIncome = (state: RunState) => { state: RunState; income: number; fanGain: number };

export const collectCatalogIncome: CollectCatalogIncome = (state) => {
  let totalIncome = 0;
  let totalFanGain = 0;

  const roster = state.roster.map(client => {
    const releases = client.catalog_releases ?? [];
    if (releases.length === 0) return client;

    const agentCut = getAgentCutPercent(state, client.id) / 100;
    const isGigging = state.campaigns.some(
      c => c.client_id === client.id && c.type_key === 'perform_gigs',
    );
    const performBoost = isGigging
      ? computePerformingBoost(client.arc_stage, client.audience)
      : 1.0;
    // Boost only the most recently released record (lowest turns_since_release)
    const latestReleaseId = releases.reduce(
      (best, r) => !best || r.turns_since_release < best.turns_since_release ? r : best,
      null as CatalogRelease | null,
    )?.id ?? null;
    let clientFanGain = 0;
    const updatedReleases = releases.map(release => {
      const boost = release.id === latestReleaseId ? performBoost : 1.0;
      const turn = computeCatalogTurn(release, client.audience + clientFanGain, agentCut, boost);
      const income = turn.streamIncome + turn.albumIncome;
      totalIncome += income;
      totalFanGain += turn.fanGain;
      clientFanGain += turn.fanGain;
      return {
        ...release,
        turns_since_release: release.turns_since_release + 1,
        album_units_sold: release.album_units_sold + turn.albumUnits,
        total_streams: release.total_streams + turn.streams,
        album_income_total: release.album_income_total + turn.albumIncome,
        stream_income_total: release.stream_income_total + turn.streamIncome,
        latest_turn_album_units: turn.albumUnits,
        latest_turn_streams: turn.streams,
        latest_turn_income: income,
        latest_turn_fan_gain: turn.fanGain,
        total_fan_gain: release.total_fan_gain + turn.fanGain,
        is_selling_albums: turn.keepSellingAlbums,
      };
    });
    const history = (client.campaign_history ?? []).map(item => {
      const release = updatedReleases.find(r => r.id === item.release_id);
      if (!release) return item;
      return {
        ...item,
        summary: {
          ...item.summary,
          album_units_sold: release.album_units_sold,
          streams: release.total_streams,
          stream_income: release.stream_income_total,
          money_delta: item.summary.money_delta + release.latest_turn_income,
        },
      };
    });

    return {
      ...client,
      audience: client.audience + clientFanGain,
      catalog_releases: updatedReleases,
      campaign_history: history,
    };
  });

  return {
    state: {
      ...state,
      money: Math.max(0, state.money + totalIncome),
      total_earnings: totalIncome > 0 ? state.total_earnings + totalIncome : state.total_earnings,
      roster,
    },
    income: totalIncome,
    fanGain: totalFanGain,
  };
};

const computeAudienceGain = (currentAudience: number, rollResult: number, marketability: number, multiplier: number): number => {
  const effectiveMarketability = computeEffectiveMarketability(marketability, currentAudience);
  const base = 20 + effectiveMarketability * 1.5;
  const performanceMultiplier = rollResult >= 70 ? 2.0 : rollResult >= 40 ? 1.0 : 0.35;
  const scale = Math.max(0.5, Math.min(3, Math.log10(Math.max(10, currentAudience)) / 4));
  return Math.round(base * performanceMultiplier * scale * multiplier);
};

export type CloseCampaign = (
  state: RunState,
  campaignId: string,
  manifest: VariantManifest,
) => RunState;

export const closeCampaign: CloseCampaign = (state, campaignId, manifest) => {
  let s = settleCampaignObjectives(state, campaignId, manifest);
  const campaign = s.campaigns.find(c => c.id === campaignId);
  if (!campaign) return s;
  const typeDef = manifest.campaign_types.find(t => t.key === campaign.type_key);
  const label = typeDef?.label ?? campaign.type_key.replace(/_/g, ' ');
  const releaseId = campaign.release_plan ? `rel_${generateId()}` : null;
  const releaseArcStage = s.roster.find(c => c.active_campaign_id === campaignId)?.arc_stage;
  const bestStreak = computeBestStreak(campaign.installment_results);
  const releaseStreakBonus = (campaign.release_plan && releaseArcStage)
    ? computeStreakBonus(bestStreak, releaseArcStage)
    : 0;
  const release: CatalogRelease | null = campaign.release_plan && releaseId
    ? {
        id: releaseId,
        campaign_id: campaign.id,
        kind: campaign.release_plan.kind,
        type_key: campaign.type_key,
        title: campaign.release_plan.title,
        songs: releaseStreakBonus > 0
          ? campaign.release_plan.songs.map(song => ({
              ...song,
              quality: Math.round(clamp(song.quality * (1 + releaseStreakBonus), 1, 100)),
            }))
          : campaign.release_plan.songs,
        released_turn: s.turn_number,
        turns_since_release: 0,
        album_units_sold: 0,
        total_streams: 0,
        album_income_total: 0,
        stream_income_total: 0,
        latest_turn_album_units: 0,
        latest_turn_streams: 0,
        latest_turn_income: 0,
        latest_turn_fan_gain: 0,
        total_fan_gain: 0,
        is_selling_albums: campaign.release_plan.kind === 'album' || campaign.release_plan.kind === 'mixtape',
      }
    : null;

  // Label advance: paid at close for album releases, representing the label deal settlement.
  // Scales with song quality, campaign size, and base_payout — rewards investing in a real album.
  const labelAdvance = (release?.kind === 'album' && typeDef && campaign.setup)
    ? Math.round(
        typeDef.base_payout *
        campaign.total_turns *
        campaign.setup.payout_multiplier *
        (0.5 + averageSongQuality(release) / 100) *
        0.6,
      )
    : 0;
  if (labelAdvance > 0) {
    s = { ...s, money: s.money + labelAdvance, total_earnings: s.total_earnings + labelAdvance };
  }

  // Compute expectation delta against prior history before appending the new entry
  const client = s.roster.find(c => c.active_campaign_id === campaignId);
  const expectationFanDelta = client
    ? computeExpectationFanDelta(
        client.campaign_history ?? [],
        campaign.installment_results,
        campaign.total_turns,
        campaign.setup?.budget ?? EXPECTATION_BUDGET_BASELINE,
        client.audience,
      )
    : 0;

  const expectationNote =
    expectationFanDelta > 0
      ? `${expectationFanDelta.toLocaleString()} new fans won over — campaign exceeded expectations.`
      : expectationFanDelta < 0
      ? `Campaign underperformed.`
      : null;

  const talentDelta = client
    ? rollRisingCampaignTalentDelta(client, campaign.type_key, s.agent.stats.coaching)
    : 0;

  const history: CampaignHistoryItem = {
    id: campaign.id,
    type_key: campaign.type_key,
    label,
    started_turn: s.turn_number - campaign.total_turns,
    completed_turn: s.turn_number,
    total_turns: campaign.total_turns,
    setup: campaign.setup,
    installment_results: campaign.installment_results,
    release_id: releaseId,
    summary: {
      money_delta: campaign.installment_results.reduce((sum, r) => sum + r.money_delta, 0) + labelAdvance,
      reputation_delta: campaign.installment_results.reduce((sum, r) => sum + r.reputation_delta, 0),
      fan_delta: campaign.installment_results.reduce((sum, r) => sum + r.audience_gain, 0) + expectationFanDelta,
      album_units_sold: release?.album_units_sold,
      streams: release?.total_streams,
      stream_income: release?.stream_income_total,
    },
    visible_notes: [
      ...campaign.installment_results
        .filter(r => r.triggered_event_id)
        .map(r => `A release issue affected the campaign on turn ${r.turn_number}.`),
      ...(expectationNote ? [expectationNote] : []),
    ],
  };

  // Album option: if the campaign was a successful album_cycle and the label contract
  // has an option clause, inject a label_option decision item.
  const avgRoll = campaign.installment_results.length > 0
    ? campaign.installment_results.reduce((sum, r) => sum + r.roll_result, 0) / campaign.installment_results.length
    : 0;
  const typeDef2 = manifest.campaign_types.find(t => t.key === campaign.type_key);
  const isAlbumCampaign = typeDef2?.release_kind === 'album';
  const labelContract = isAlbumCampaign
    ? s.contracts.find(
        c => c.client_id === campaign.client_id
          && c.exclusivity_scope === 'label'
          && c.duration_remaining > 0
          && c.album_option !== null
          && c.album_option !== undefined
          && avgRoll >= c.album_option.success_threshold,
      ) ?? null
    : null;

  let finalState: RunState = {
    ...s,
    campaigns: s.campaigns.filter(c => c.id !== campaignId),
    roster:    s.roster.map(c =>
      c.active_campaign_id === campaignId
        ? {
            ...c,
            active_campaign_id: null,
            audience: Math.max(0, c.audience + expectationFanDelta),
            stats: talentDelta > 0 ? refreshClientFog(applyClientStatDeltas(c, { talent: talentDelta }, s.agent), s.agent) : c.stats,
            campaign_history: [...(c.campaign_history ?? []), history],
            catalog_releases: release ? [...(c.catalog_releases ?? []), release] : (c.catalog_releases ?? []),
          }
        : c,
    ),
  };

  if (labelContract) {
    finalState = injectAlbumOptionDecision(finalState, campaign.client_id, labelContract);
  }

  if (release) {
    const releasingClient = finalState.roster.find(c => c.id === campaign.client_id);
    const notification: ReleaseSummaryNotification = {
      id: `rel_notif_${generateId()}`,
      client_id: campaign.client_id,
      client_name: releasingClient?.name ?? 'Client',
      campaign_label: label,
      release_title: release.title,
      release_kind: release.kind,
      avg_quality: Math.round(averageSongQuality(release)),
      initial_revenue: labelAdvance,
    };
    finalState = {
      ...finalState,
      pending_release_summaries: [
        ...(finalState.pending_release_summaries ?? []),
        notification,
      ],
    };
  }

  return finalState;
};
