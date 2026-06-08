import { Campaign, CampaignInstallmentResult } from '../types/campaign';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { grantTrait, checkTraitGrant, applyClientStatDeltas, refreshClientFog } from './client';

// INVARIANTS (PRD §3.5):
// - One installment resolves per turn during Upkeep.
// - Installment rolls use Form true_value (not observed) for resolution math.
// - Results are append-only.

const generateId = (): string =>
  `cmp_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

// Box-Muller normal distribution
const normalRandom = (mean: number, stdDev: number): number => {
  const u1 = Math.random() || Number.EPSILON;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
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
  const money_delta = typeDef.payout_type === 'per_month'
    ? Math.round((roll_result / 100) * typeDef.base_payout)
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

  if (result.roll_result >= typeDef.event_trigger_threshold) return state;

  // Build a minimal client event from the event library
  const clientEvents = manifest.events.filter(
    e => e.category === 'client' && e.severity !== 'crisis',
  );
  if (clientEvents.length === 0) return state;

  const def = clientEvents[Math.floor(Math.random() * clientEvents.length)];
  const eventId = `evt_cmp_${generateId()}`;

  const newEvent: import('../types/event').GameEvent = {
    id:               eventId,
    template_key:     def.key,
    category:         'client',
    severity:         def.severity,
    client_id:        campaign.client_id,
    description:      def.description_template,
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
      // Mark as met and pay out
      s = { ...s, money: s.money + obj.payout, total_earnings: s.total_earnings + obj.payout };
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
) => RunState;

export const startCampaign: StartCampaign = (state, clientId, campaignTypeKey, linkedObjectiveIds, manifest) => {
  const typeDef = manifest.campaign_types.find(t => t.key === campaignTypeKey);
  if (!typeDef) return state;

  const campaign: Campaign = {
    id:                   generateId(),
    client_id:            clientId,
    type_key:             campaignTypeKey,
    total_turns:          typeDef.total_turns,
    turns_remaining:      typeDef.total_turns,
    installment_results:  [],
    pending_objective_ids: linkedObjectiveIds,
  };

  return {
    ...state,
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
    const result = rollInstallment(s, campaign.id, manifest);

    // Apply stat deltas to client
    const client = s.roster.find(c => c.id === campaign.client_id);
    if (client && Object.keys(result.stat_deltas).length > 0) {
      const updated = applyClientStatDeltas(client, result.stat_deltas, s.agent);
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

export type CloseCampaign = (
  state: RunState,
  campaignId: string,
  manifest: VariantManifest,
) => RunState;

export const closeCampaign: CloseCampaign = (state, campaignId, manifest) => {
  let s = settleCampaignObjectives(state, campaignId, manifest);
  return {
    ...s,
    campaigns: s.campaigns.filter(c => c.id !== campaignId),
    roster:    s.roster.map(c =>
      c.active_campaign_id === campaignId ? { ...c, active_campaign_id: null } : c,
    ),
  };
};
