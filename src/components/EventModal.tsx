import { GameEvent } from '../types/event';

// Full-screen modal that interrupts the Decision Board (PRD §3.4, §4.2).
// Shares the same resolution engine as DecisionCard — options + mandatory default.
// Dismissing the modal (back gesture, End Turn) applies default_outcome.
// Severity drives visual weight: 'crisis' gets a distinct header treatment.

export interface EventModalProps {
  event: GameEvent;

  // resolved display data
  clientName?: string;   // if event.client_id is set
  clientLabel?: string;  // variant label

  // null optionKey = apply default_outcome (dismiss / end-turn path)
  onResolve: (eventId: string, optionKey: string | null) => void;
}
