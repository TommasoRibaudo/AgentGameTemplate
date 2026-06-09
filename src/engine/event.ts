import { GameEvent, EventOutcome, EventOption } from '../types/event';
import { EventCategory, EventSeverity } from '../types/primitives';  // EventSeverity used in sort ORDER
import { NewsItem, RunState } from '../types/run';
import { EventDefinition, VariantManifest } from '../types/manifest';

// INVARIANTS (PRD §3.4):
// - Frequency targets 0–2 per turn, weighted toward 0–1.
// - Probability scales with exposure — roster size, Peak-client count, high-value contracts.
// - Defense tracks reduce frequency and/or soften severity per event category.

export const TARGET_EVENTS_PER_TURN_MAX = 1;

const generateId = (): string =>
  `evt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

const fillTemplate = (template: string, clientName?: string): string =>
  template.replace(/\{client_name\}/g, clientName ?? 'A client');

const campaignGate = (def: { campaign_type_keys?: string[] }): string[] =>
  def.campaign_type_keys?.filter(Boolean) ?? [];

const matchingActiveCampaigns = (state: RunState, def: { campaign_type_keys?: string[] }) => {
  const keys = campaignGate(def);
  if (keys.length === 0) return [];
  return state.campaigns.filter(c => c.turns_remaining > 0 && keys.includes(c.type_key));
};

const isEventEligibleForState = (state: RunState, def: EventDefinition): boolean =>
  campaignGate(def).length === 0 || matchingActiveCampaigns(state, def).length > 0;

const makeEventNews = (state: RunState, event: GameEvent, outcome: EventOutcome): NewsItem => ({
  id:               `news_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
  turn_number:      state.turn_number,
  type:             'event_fired',
  description:      event.description,
  money_delta:      outcome.money_delta,
  reputation_delta: outcome.reputation_delta,
  client_id:        event.client_id,
});

// ─── Exposure ─────────────────────────────────────────────────────────────────

export type ComputeExposure = (state: RunState) => number;

// Placeholder weights for open question §6.4
export const computeExposure: ComputeExposure = (state) => {
  const rosterSize   = state.roster.length;
  const peakCount    = state.roster.filter(c => c.arc_stage === 'peak').length;
  const highValueCount = state.contracts.filter(
    c => c.tier === 'client_entity' && c.amount >= 50_000,
  ).length;
  const audienceExposure = state.roster.reduce(
    (sum, c) => sum + Math.min(0.6, Math.log10(Math.max(100, c.audience)) / 10),
    0,
  );
  return rosterSize * 0.15 + peakCount * 0.25 + highValueCount * 0.10 + audienceExposure;
};

export type ComputeEventProbability = (
  state: RunState,
  category: EventCategory,
  manifest: VariantManifest,
) => number;

export const computeEventProbability: ComputeEventProbability = (state, category, manifest) => {
  const exposure = computeExposure(state);
  const defenseTrackKey = categoryToDefenseKey(category);
  const track = state.agent.defense_tracks.find(t => t.key === defenseTrackKey);
  const defenseReduction = track ? Math.min(0.6, track.level * 0.12) : 0;
  return Math.min(0.95, manifest.economy.event_base_rate * (1 + exposure) * (1 - defenseReduction));
};

const categoryToDefenseKey = (category: EventCategory): string => {
  const map: Record<EventCategory, string> = {
    client:  'medical',
    market:  'pr',
    agency:  'legal',
    windfall: '',  // windfalls have no defense — they're positive
  };
  return map[category];
};

// ─── Event generation ─────────────────────────────────────────────────────────

export type SelectEventTarget = (
  state: RunState,
  category: EventCategory,
  manifest: VariantManifest,
) => string | null;

export const selectEventTarget: SelectEventTarget = (state, category, _manifest) => {
  if (category !== 'client' || state.roster.length === 0) return null;

  // Weight by each client's event_bias for 'client' category
  const weights = state.roster.map(client => {
    const bias = client.traits.reduce((acc, t) => {
      const b = t.event_bias['client'];
      return acc * (typeof b === 'number' ? b : 1);
    }, 1);
    return { id: client.id, weight: bias };
  });

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const w of weights) {
    roll -= w.weight;
    if (roll <= 0) return w.id;
  }
  return weights[weights.length - 1]?.id ?? null;
};

export type GenerateEvents = (state: RunState, manifest: VariantManifest) => GameEvent[];

export const generateEvents: GenerateEvents = (state, manifest) => {
  if (state.turn_number === 1) return [];

  const categories: EventCategory[] = ['client', 'market', 'agency', 'windfall'];
  const generated: GameEvent[] = [];

  for (const category of categories) {
    if (generated.length >= TARGET_EVENTS_PER_TURN_MAX) break;
    const prob = computeEventProbability(state, category, manifest);
    if (Math.random() > prob) continue;

    const candidates = manifest.events.filter(e => e.category === category && isEventEligibleForState(state, e));
    if (candidates.length === 0) continue;

    const def = candidates[Math.floor(Math.random() * candidates.length)];
    const campaign = matchingActiveCampaigns(state, def)[0] ?? null;
    const clientId = campaign?.client_id ?? selectEventTarget(state, category, manifest);
    const clientName = clientId ? state.roster.find(c => c.id === clientId)?.name : undefined;

    // Map manifest EventOptionDefinition → runtime EventOption
    const options: EventOption[] = def.options.map(o => ({
      key:     o.key,
      label:   o.label,
      outcome: { ...o.outcome, injects_board_item_key: null },
    }));

    generated.push({
      id:            generateId(),
      template_key:  def.key,
      campaign_id:   campaign?.id ?? null,
      category:      def.category,
      severity:      def.severity,
      client_id:     clientId,
      description:   fillTemplate(def.description_template, clientName),
      options,
      default_outcome: { ...def.default_outcome, injects_board_item_key: null },
      defense_track_key: def.defense_track_key,
      is_resolved:   false,
      chosen_option_key: null,
    });
  }

  // Sort by severity (crisis first)
  const ORDER: Record<EventSeverity, number> = { crisis: 0, major: 1, minor: 2 };
  return generated.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
};

// ─── Outcome mitigation ───────────────────────────────────────────────────────

export type MitigateEventOutcome = (
  state: RunState,
  event: GameEvent,
  manifest: VariantManifest,
) => EventOutcome;

export const mitigateEventOutcome: MitigateEventOutcome = (state, event, _manifest) => {
  const option = event.chosen_option_key
    ? event.options.find(o => o.key === event.chosen_option_key)
    : null;
  const base = option ? option.outcome : event.default_outcome;

  if (!event.defense_track_key) return base;
  const track = state.agent.defense_tracks.find(t => t.key === event.defense_track_key);
  if (!track) return base;

  const reduction = Math.min(0.5, track.level * 0.1);
  return {
    ...base,
    money_delta:      Math.round(base.money_delta * (1 - reduction)),
    reputation_delta: Math.round(base.reputation_delta * (1 - reduction)),
  };
};

// ─── Resolution ───────────────────────────────────────────────────────────────

export type ResolveEvent = (
  state: RunState,
  eventId: string,
  optionKey: string | null,
  manifest: VariantManifest,
) => RunState;

export const resolveEvent: ResolveEvent = (state, eventId, optionKey, manifest) => {
  const event = state.pending_events.find(e => e.id === eventId);
  if (!event) return state;

  const resolved = { ...event, is_resolved: true, chosen_option_key: optionKey };
  const outcome = mitigateEventOutcome(state, resolved, manifest);

  // Apply outcome to state
  let money     = Math.max(0, state.money + outcome.money_delta);
  let reputation = Math.max(0, Math.min(100, state.reputation + outcome.reputation_delta));

  // Apply stat deltas to the target client if set
  let roster = state.roster;
  if (event.client_id && Object.keys(outcome.stat_deltas).length > 0) {
    roster = state.roster.map(c =>
      c.id === event.client_id
        ? {
            ...c,
            audience: applyAudienceDeltaForMarketability(c.audience, outcome.stat_deltas.marketability ?? 0),
            stats: applyStatDeltasToStats(c.stats, outcome.stat_deltas),
          }
        : c,
    );
  }

  let s: RunState = {
    ...state,
    money,
    reputation,
    roster,
    pending_events:  state.pending_events.filter(e => e.id !== eventId),
    resolved_events: [...state.resolved_events, resolved],
    news_feed:       [...state.news_feed, makeEventNews(state, resolved, outcome)],
    low_money_warning: money === 0 && state.money > 0 ? true : state.low_money_warning,
    total_earnings:  outcome.money_delta > 0 ? state.total_earnings + outcome.money_delta : state.total_earnings,
    peak_reputation: Math.max(state.peak_reputation, reputation),
  };

  if (outcome.injects_board_item_key) {
    s = injectWindfallBoardItem(s, event, manifest);
  }

  return s;
};

// Minimal inline stat application (avoids importing client.ts → no cycle)
const applyStatDeltasToStats = (
  stats: import('../types/client').ClientStats,
  deltas: import('../types/primitives').StatDeltas,
) => {
  const result = { ...stats };
  for (const [key, delta] of Object.entries(deltas) as [import('../types/primitives').CoreStatKey, number][]) {
    const stat = result[key];
    result[key] = { ...stat, true_value: Math.max(0, Math.min(100, stat.true_value + delta)) };
  }
  return result;
};

const applyAudienceDeltaForMarketability = (audience: number, marketabilityDelta: number): number => {
  if (marketabilityDelta === 0) return audience;
  const percent = Math.max(-0.20, Math.min(0.20, marketabilityDelta * 0.015));
  return Math.max(0, Math.round(audience * (1 + percent)));
};

export type ApplyEventDefaults = (state: RunState, manifest: VariantManifest) => RunState;

export const applyEventDefaults: ApplyEventDefaults = (state, manifest) => {
  let s = state;
  for (const event of s.pending_events) {
    s = resolveEvent(s, event.id, null, manifest);
  }
  return s;
};

export type InjectWindfallBoardItem = (
  state: RunState,
  event: GameEvent,
  manifest: VariantManifest,
) => RunState;

export const injectWindfallBoardItem: InjectWindfallBoardItem = (state, event, manifest) => {
  const outcome = event.chosen_option_key
    ? event.options.find(o => o.key === event.chosen_option_key)?.outcome
    : event.default_outcome;
  if (!outcome?.injects_board_item_key) return state;

  const template = manifest.board_item_templates.find(t => t.key === outcome.injects_board_item_key);
  if (!template) return state;

  const injected: import('../types/decision').DecisionItem = {
    id:               generateId(),
    type:             template.type,
    template_key:     template.key,
    campaign_id:      event.campaign_id ?? null,
    client_id:        null,
    contract_id:      null,
    contract_draft:   null,
    description:      fillTemplate(template.description_template, event.client_id ? state.roster.find(c => c.id === event.client_id)?.name : undefined),
    options:          [],
    default_on_ignore: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
    expires_in:       template.expires_in,
    is_resolved:      false,
    chosen_option_key: null,
  };

  return { ...state, decision_board: [...state.decision_board, injected] };
};
