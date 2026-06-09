import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { GameEvent } from '../types/event';
import { Colors, FontSize, Spacing, Radius, SeverityColors } from '../theme';
import { formatMoney, formatDelta } from '../theme';

export interface EventModalProps {
  event: GameEvent;
  clientName?: string;
  clientLabel?: string;
  onResolve: (eventId: string, optionKey: string | null) => void;
}

const SEVERITY_LABELS: Record<string, string> = {
  minor: 'EVENT',
  major: 'MAJOR EVENT',
  crisis: 'CRISIS',
};

export function EventModal({ event, clientName, clientLabel = 'Client', onResolve }: EventModalProps) {
  const severityColor = SeverityColors[event.severity] ?? Colors.warning;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, event.severity === 'crisis' && styles.sheetCrisis]}>
          <View style={[styles.severityBar, { backgroundColor: severityColor }]} />
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Text style={[styles.severityLabel, { color: severityColor }]}>
                {SEVERITY_LABELS[event.severity] ?? 'EVENT'}
              </Text>
              {clientName && (
                <Text style={styles.clientName}>{clientLabel}: {clientName}</Text>
              )}
            </View>

            <Text style={styles.description}>{event.description}</Text>

            <View style={styles.options}>
              {event.options.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={styles.optionBtn}
                  onPress={() => onResolve(event.id, opt.key)}
                  accessibilityLabel={opt.label}
                >
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                  <OutcomePreview outcome={opt.outcome} compact />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function OutcomePreview({
  outcome,
  compact,
}: {
  outcome: { money_delta: number; reputation_delta: number };
  compact?: boolean;
}) {
  const hasMoney = outcome.money_delta !== 0;
  const hasRep   = outcome.reputation_delta !== 0;
  if (!hasMoney && !hasRep) return null;

  return (
    <View style={compact ? styles.outcomeLine : styles.outcomeBlock}>
      {hasMoney && (
        <Text style={[styles.delta, outcome.money_delta < 0 ? styles.neg : styles.pos]}>
          {formatMoney(outcome.money_delta)}
        </Text>
      )}
      {hasRep && (
        <Text style={[styles.delta, outcome.reputation_delta < 0 ? styles.neg : styles.pos]}>
          {formatDelta(outcome.reputation_delta)} rep
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  sheetCrisis: {
    backgroundColor: '#1A0808',
  },
  severityBar: {
    height: 4,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  header: {
    gap: Spacing.xs,
  },
  severityLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  clientName: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  description: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    lineHeight: 26,
  },
  options: {
    gap: Spacing.sm,
  },
  optionBtn: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.accent,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  optionLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  outcomeLine: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  outcomeBlock: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  delta: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  pos: { color: Colors.positive },
  neg: { color: Colors.negative },
});
