import React, { useState } from 'react';
import { EventModal } from './EventModal';
import { mitigateEventOutcome } from '../engine/event';
import { useActiveEvents, useManifest, useRunState, useRunStore } from '../store/useRunStore';
import { EventOutcome, GameEvent } from '../types/event';

export function RunEventOverlay() {
  const runState = useRunState();
  const manifest = useManifest();
  const events = useActiveEvents();
  const resolveEvent = useRunStore(s => s.resolveEvent);

  const [eventResult, setEventResult] = useState<{
    event: GameEvent;
    outcome: EventOutcome;
    label: string;
    description: string | null;
    eventId: string;
    optionKey: string | null;
  } | null>(null);

  if (!runState || !manifest) return null;

  const activeEvent = events.find(e => !e.is_resolved) ?? null;
  const eventModalEvent = eventResult?.event ?? activeEvent;
  if (!eventModalEvent) return null;

  const clientName = (clientId: string | null) =>
    clientId ? (runState.roster.find(c => c.id === clientId)?.name) : undefined;

  function handleResolveEvent(eventId: string, optionKey: string | null) {
    if (!runState || !manifest) return;
    const event = runState.pending_events.find(e => e.id === eventId);
    if (!event) return;

    const resolvedEvent = { ...event, is_resolved: true, chosen_option_key: optionKey };
    const outcome = mitigateEventOutcome(runState, resolvedEvent, manifest);
    const label = optionKey
      ? event.options.find(option => option.key === optionKey)?.label ?? 'Result'
      : 'Ignored';
    const description = optionKey
      ? event.options.find(option => option.key === optionKey)?.result_description ?? null
      : null;

    setEventResult({ event: resolvedEvent, outcome, label, description, eventId, optionKey });
  }

  function handleCloseResult() {
    if (!eventResult) return;
    resolveEvent(eventResult.eventId, eventResult.optionKey);
    setEventResult(null);
  }

  return (
    <EventModal
      event={eventModalEvent}
      clientName={clientName(eventModalEvent.client_id)}
      clientLabel={manifest.labels.client}
      reputationLabel={manifest.labels.reputation}
      resultOutcome={eventResult?.outcome ?? null}
      resultLabel={eventResult?.label ?? null}
      resultDescription={eventResult?.description ?? null}
      onResolve={handleResolveEvent}
      onCloseResult={handleCloseResult}
    />
  );
}
