import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { EventOutcome, GameEvent } from '../types/event';
import { Colors, FontSize, Spacing, Radius, SeverityColors } from '../theme';
import { DeltaText } from './DeltaText';

export interface EventModalProps {
  event: GameEvent;
  clientName?: string;
  clientLabel?: string;
  reputationLabel?: string;
  resultOutcome?: EventOutcome | null;
  resultLabel?: string | null;
  resultDescription?: string | null;
  onResolve: (eventId: string, optionKey: string | null) => void;
  onCloseResult?: () => void;
}

const SEVERITY_LABELS: Record<string, string> = {
  minor: 'EVENT',
  major: 'MAJOR EVENT',
  crisis: 'CRISIS',
};

export function EventModal({
  event,
  clientName,
  clientLabel = 'Client',
  reputationLabel = 'Reputation',
  resultOutcome = null,
  resultLabel = null,
  resultDescription = null,
  onResolve,
  onCloseResult,
}: EventModalProps) {
  const severityColor = SeverityColors[event.severity] ?? Colors.warning;
  const options = Array.isArray(event.options) ? event.options : [];
  const isShowingResult = resultOutcome !== null;

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

            {isShowingResult ? (
              <View style={styles.result}>
                <Text style={styles.resultTitle}>{resultLabel ?? 'Result'}</Text>
                {resultDescription && (
                  <Text style={styles.resultBody}>{resultDescription}</Text>
                )}
                <OutcomeSummary outcome={resultOutcome} reputationLabel={reputationLabel} />
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onCloseResult}
                  accessibilityLabel="Close event result"
                >
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.options}>
                {options.length > 0 ? options.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={styles.optionBtn}
                    onPress={() => onResolve(event.id, opt.key)}
                    accessibilityLabel={opt.label}
                  >
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                    <OutcomeCostPreview outcome={opt.outcome} reputationLabel={reputationLabel} compact />
                  </TouchableOpacity>
                )) : (
                  <TouchableOpacity
                    style={styles.optionBtn}
                    onPress={() => onResolve(event.id, null)}
                    accessibilityLabel="Ignore event"
                  >
                    <Text style={styles.optionLabel}>Ignore</Text>
                    <OutcomeCostPreview outcome={event.default_outcome} reputationLabel={reputationLabel} compact />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function OutcomeCostPreview({
  outcome,
  reputationLabel: _reputationLabel,
  compact,
}: {
  outcome: { money_delta: number; reputation_delta: number };
  reputationLabel: string;
  compact?: boolean;
}) {
  const hasMoney = outcome.money_delta < 0;
  if (!hasMoney) return null;

  return (
    <View style={compact ? styles.outcomeLine : styles.outcomeBlock}>
      {hasMoney && (
        <DeltaText value={outcome.money_delta} kind="money" style={styles.delta} />
      )}
    </View>
  );
}

function OutcomeSummary({
  outcome,
  reputationLabel,
}: {
  outcome: EventOutcome;
  reputationLabel: string;
}) {
  const statEntries = Object.entries(outcome.stat_deltas).filter(([, value]) => value !== 0);
  const hasChanges = outcome.money_delta !== 0 || outcome.reputation_delta !== 0 || statEntries.length > 0;

  if (!hasChanges) {
    return <Text style={styles.resultBody}>No immediate change.</Text>;
  }

  return (
    <View style={styles.resultDeltas}>
      {outcome.money_delta !== 0 && (
        <DeltaText value={outcome.money_delta} kind="money" style={styles.delta} />
      )}
      {outcome.reputation_delta !== 0 && (
        <DeltaText value={outcome.reputation_delta} label={reputationLabel} style={styles.delta} />
      )}
      {statEntries.map(([key, value]) => (
        <DeltaText key={key} value={value} label={key} style={styles.delta} />
      ))}
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
  result: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  resultTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  resultBody: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  resultDeltas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  closeBtn: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  closeBtnText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
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
});
