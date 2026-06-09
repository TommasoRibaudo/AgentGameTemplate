import {
  Campaign,
  CampaignHistoryItem,
  CampaignInstallmentResult,
  CampaignSetup,
  CampaignSize,
  CatalogRelease,
  CreativeReleasePlan,
  ReleaseKind,
} from '../types/campaign';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { grantTrait, checkTraitGrant, applyClientStatDeltas, refreshClientFog } from './client';
import { computeAgencyPayout, getAgentCutPercent } from './resource';

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
}> = {
  small:  { payout: 0.75, audience: 0.75, eventRisk: 0.75, budget: 0.65 },
  medium: { payout: 1.00, audience: 1.00, eventRisk: 1.00, budget: 1.00 },
  large:  { payout: 1.45, audience: 1.60, eventRisk: 1.50, budget: 1.70 },
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
) => CampaignSetup;

export const buildCampaignSetup: BuildCampaignSetup = (typeDef, size = 'medium', length, budget) => {
  const chosenLength = Math.max(1, Math.round(length ?? typeDef.total_turns));
  const sizeConfig = SIZE_CONFIG[size];
  const baselineBudget = Math.max(500, Math.round(typeDef.base_payout * chosenLength * 0.25 * sizeConfig.budget));
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

const computeFanMarketabilityBonus = (audience: number): number =>
  clamp((Math.log10(Math.max(100, audience)) - 4) * 8, -8, 20);

const computeEffectiveMarketability = (marketability: number, audience: number): number =>
  clamp(marketability + computeFanMarketabilityBonus(audience), 0, 100);

const isReleaseCampaign = (typeDef: VariantManifest['campaign_types'][number]): typeDef is VariantManifest['campaign_types'][number] & { release_kind: ReleaseKind } =>
  typeDef.release_kind === 'album' || typeDef.release_kind === 'single';

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
    : setup.size === 'large' ? 12 : setup.size === 'small' ? 8 : 10;
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

  const formContrib = effectiveForm * typeDef.form_weight;
  const raw         = normalRandom(formContrib, typeDef.variance);
  const roll_result = Math.max(0, Math.min(100, Math.round(raw)));

  // Determine outcome_key from roll
  const outcome_key = roll_result >= 70 ? 'great'
    : roll_result >= 40 ? 'average'
    : 'poor';

  // Per-installment stat deltas from campaign type definition
  const stat_deltas = typeDef.per_installment_stat_deltas;

  // Money: proportional to roll for per_month; 0 for lump/objective (paid at close)
  const releaseCampaign = isReleaseCampaign(typeDef);
  const money_delta = !releaseCampaign && typeDef.payout_type === 'per_month'
    ? Math.round((roll_result / 100) * typeDef.base_payout * setup.payout_multiplier)
    : 0;

  // Reputation nudge based on outcome
  const reputation_delta = roll_result >= 70 ? 2 : roll_result < 40 ? -1 : 0;

  const result: CampaignInstallmentResult = {
    turn_number:            state.turn_number,
    roll_result,
    outcome_key,
    stat_deltas,
    money_delta,
    reputation_delta,
    triggered_event_id:  null,
    triggered_trait_id:  null,
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
  const setup = buildCampaignSetup(typeDef, setupOptions?.size, setupOptions?.length, setupOptions?.budget);
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
    pending_objective_ids: linkedObjectiveIds,
  };

  return {
    ...state,
    money:     state.money - setup.budget,
    campaigns: [...state.campaigns, campaign],
    roster:    state.roster.map(c =>
      c.id === clientId ? { ...c, active_campaign_id: campaign.id } : c,
    ),
  };
};

export type AdvanceCampaigns = (state: RunState, manifest: VariantManifest) => RunState;

export const advanceCampaigns: AdvanceCampaigns = (state, manifest) => {
  let s = state;

  for (const campaign of s.campaigns) {
    const typeDef = manifest.campaign_types.find(t => t.key === campaign.type_key);
    if (!typeDef) continue;
    const setup = getCampaignSetup(campaign, typeDef);
    const result = rollInstallment(s, campaign.id, manifest);

    // Apply stat deltas to client
    const client = s.roster.find(c => c.id === campaign.client_id);
    if (client) {
      const audienceGain = isReleaseCampaign(typeDef)
        ? 0
        : computeAudienceGain(client.audience, result.roll_result, client.stats.marketability.true_value, setup.audience_multiplier);
      const updatedStats = Object.keys(result.stat_deltas).length > 0
        ? applyClientStatDeltas(client, result.stat_deltas, s.agent)
        : client;
      const updated = { ...updatedStats, audience: client.audience + audienceGain };
      s = { ...s, roster: s.roster.map(c => c.id === client.id ? updated : c) };
    }

    // Apply money/rep deltas
    s = {
      ...s,
      money:           Math.max(0, s.money + result.money_delta),
      reputation:      Math.max(0, Math.min(100, s.reputation + result.reputation_delta)),
      total_earnings:  result.money_delta > 0 ? s.total_earnings + result.money_delta : s.total_earnings,
      peak_reputation: Math.max(s.peak_reputation, s.reputation),
    };

    // Append installment result and tick down
    const updatedCampaign: Campaign = {
      ...campaign,
      turns_remaining:     campaign.turns_remaining - 1,
      installment_results: [...campaign.installment_results, result],
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

const computeCatalogTurn = (
  release: CatalogRelease,
  audience: number,
  agentCut: number,
): { streams: number; streamIncome: number; albumUnits: number; albumIncome: number; fanGain: number; keepSellingAlbums: boolean } => {
  const quality = averageSongQuality(release);
  const qualityLift = 0.35 + quality / 100;
  const fanBaseLift = Math.max(0.75, Math.min(2.25, Math.log10(Math.max(100, audience)) / 4));
  const songLift = release.kind === 'album'
    ? release.songs.reduce((sum, song) => sum + song.quality / 100, 0)
    : qualityLift;
  const streamDecay = Math.pow(release.kind === 'album' ? 0.88 : 0.91, release.turns_since_release);
  const albumDecay = Math.pow(0.62, release.turns_since_release);

  const streams = Math.max(0, Math.round(audience * (release.kind === 'album' ? 0.026 : 0.16) * songLift * fanBaseLift * streamDecay));
  const streamIncome = Math.round(streams * 0.03 * agentCut);
  const albumUnits = release.kind === 'album' && release.is_selling_albums
    ? Math.max(0, Math.round(audience * 0.018 * qualityLift * fanBaseLift * albumDecay))
    : 0;
  const keepSellingAlbums = release.kind === 'album' && albumUnits >= 10;
  const albumIncome = Math.round(albumUnits * 10 * agentCut);
  const albumFanLift = release.kind === 'album' && release.turns_since_release === 0 ? albumUnits * 0.18 : albumUnits * 0.12;
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
    let clientFanGain = 0;
    const updatedReleases = releases.map(release => {
      const turn = computeCatalogTurn(release, client.audience + clientFanGain, agentCut);
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
          fan_delta: clientFanGain,
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
  const base = 250 + effectiveMarketability * 20;
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
  const release: CatalogRelease | null = campaign.release_plan && releaseId
    ? {
        id: releaseId,
        campaign_id: campaign.id,
        kind: campaign.release_plan.kind,
        type_key: campaign.type_key,
        title: campaign.release_plan.title,
        songs: campaign.release_plan.songs,
        released_turn: s.turn_number,
        turns_since_release: 0,
        album_units_sold: 0,
        total_streams: 0,
        album_income_total: 0,
        stream_income_total: 0,
        latest_turn_album_units: 0,
        latest_turn_streams: 0,
        latest_turn_income: 0,
        is_selling_albums: campaign.release_plan.kind === 'album',
      }
    : null;
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
      money_delta: campaign.installment_results.reduce((sum, r) => sum + r.money_delta, 0),
      reputation_delta: campaign.installment_results.reduce((sum, r) => sum + r.reputation_delta, 0),
      fan_delta: 0,
      album_units_sold: release?.album_units_sold,
      streams: release?.total_streams,
      stream_income: release?.stream_income_total,
    },
    visible_notes: campaign.installment_results
      .filter(r => r.triggered_event_id)
      .map(r => `A release issue affected the campaign on turn ${r.turn_number}.`),
  };

  return {
    ...s,
    campaigns: s.campaigns.filter(c => c.id !== campaignId),
    roster:    s.roster.map(c =>
      c.active_campaign_id === campaignId
        ? {
            ...c,
            active_campaign_id: null,
            campaign_history: [...(c.campaign_history ?? []), history],
            catalog_releases: release ? [...(c.catalog_releases ?? []), release] : (c.catalog_releases ?? []),
          }
        : c,
    ),
  };
};
