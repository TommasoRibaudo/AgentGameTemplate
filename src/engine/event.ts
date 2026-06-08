import { GameEvent, EventOutcome } from '../types/event';
import { EventCategory, EventSeverity } from '../types/primitives';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';

// INVARIANTS (PRD §3.4):
// - Events interrupt the decision board as modals during Phase 3.
// - Every event has a mandatory default outcome — player can ignore a modal by ending the turn.
// - Frequency targets roughly 0–2 per turn, weighted toward 0–1.
// - Probability SCALES with exposure — roster size, Peak-client count, high-value contracts.
//   Success generates its own volatility. This is the emergent difficulty curve.
// - Traits bias both event probability (per-client) and outcome severity.
// - Defense tracks reduce frequency and/or soften severity per event category.

export const TARGET_EVENTS_PER_TURN_MIN = 0;
export const TARGET_EVENTS_PER_TURN_MAX = 2;

// ─── Exposure ─────────────────────────────────────────────────────────────────

// Compute the current exposure score used as the probability multiplier.
// Exposure = f(roster_size, peak_client_count, high_value_contract_count).
// Open question §6.4: exact weighting of these three components.
export type ComputeExposure = (state: RunState) => number;

// Compute the probability that at least one event fires this turn, given exposure.
// Applied per event category. Defense track levels reduce this probability.
export type ComputeEventProbability = (
  state: RunState,
  category: EventCategory,
  manifest: VariantManifest,
) => number;  // 0–1

// ─── Event generation ────────────────────────────────────────────────────────

// Roll and assemble the set of events for this turn's Decision phase.
// For each category, rolls against ComputeEventProbability.
// If a client has a trait with event_bias > 1 for a category, that client's
// probability for that category is additionally biased.
// Returns between 0 and TARGET_EVENTS_PER_TURN_MAX events, ordered by severity desc.
export type GenerateEvents = (
  state: RunState,
  manifest: VariantManifest,
) => GameEvent[];

// Select which client (if any) a client-category event is targeting.
// Weighted by each client's trait event_bias for the event category.
export type SelectEventTarget = (
  state: RunState,
  category: EventCategory,
  manifest: VariantManifest,
) => string | null;  // client_id or null for non-client events

// ─── Severity scaling ─────────────────────────────────────────────────────────

// Apply defense track mitigation to an event outcome before it resolves.
// A higher defense level on the matching track reduces money_delta and reputation_delta magnitude.
// For severity = 'crisis', a high enough defense can downgrade to 'major'.
export type MitigateEventOutcome = (
  state: RunState,
  event: GameEvent,
  manifest: VariantManifest,
) => EventOutcome;

// ─── Resolution ──────────────────────────────────────────────────────────────

// Resolve a pending event with the chosen option key (or the default if ignored).
// Applies the outcome, moves the event from pending_events → resolved_events,
// and records a news item.
export type ResolveEvent = (
  state: RunState,
  eventId: string,
  optionKey: string | null,   // null = apply default_outcome
  manifest: VariantManifest,
) => RunState;

// Apply the default outcomes for all events still pending when the turn ends.
export type ApplyEventDefaults = (
  state: RunState,
  manifest: VariantManifest,
) => RunState;

// ─── Windfall injection ──────────────────────────────────────────────────────

// Windfall events can inject a high-value item onto the decision board.
// Called after a windfall event resolves — adds the injected board item if present.
export type InjectWindfallBoardItem = (
  state: RunState,
  event: GameEvent,
  manifest: VariantManifest,
) => RunState;
