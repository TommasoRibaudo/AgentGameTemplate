import { EventCategory, EventSeverity, StatDeltas } from './primitives';

export interface EventOutcome {
  money_delta: number;
  reputation_delta: number;
  stat_deltas: StatDeltas;
  // windfall events can inject a high-value item directly onto the decision board
  injects_board_item_key: string | null;
}

export interface EventOption {
  key: string;
  label: string;
  outcome: EventOutcome;
}

export interface GameEvent {
  id: string;
  // references variant manifest event library
  template_key: string;
  // set when the event was generated from or gated by an active campaign
  campaign_id?: string | null;
  category: EventCategory;
  severity: EventSeverity;
  // null for market, agency, and windfall events
  client_id: string | null;
  description: string;
  options: EventOption[];
  // fires if the player ignores the modal or ends the turn with it unresolved
  default_outcome: EventOutcome;
  // which infrastructure defense track reduces frequency/severity of this event category
  defense_track_key: string | null;
  is_resolved: boolean;
  chosen_option_key: string | null;
}
