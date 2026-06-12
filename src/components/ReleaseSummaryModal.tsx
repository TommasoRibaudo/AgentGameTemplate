import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { ReleaseSummaryNotification } from '../types/campaign';
import { Colors, FontSize, Spacing, Radius, formatMoney } from '../theme';

export interface ReleaseSummaryModalProps {
  notification: ReleaseSummaryNotification;
  onDismiss: (id: string) => void;
}

const KIND_LABEL: Record<string, string> = {
  album:   'Album',
  single:  'Single',
  mixtape: 'Mixtape',
};

const qualityLabel = (q: number): string => {
  if (q >= 80) return 'Exceptional';
  if (q >= 65) return 'Strong';
  if (q >= 50) return 'Solid';
  if (q >= 35) return 'Mediocre';
  return 'Weak';
};

const qualityColor = (q: number): string => {
  if (q >= 65) return Colors.positive;
  if (q >= 45) return Colors.warning;
  return Colors.negative;
};

export function ReleaseSummaryModal({ notification, onDismiss }: ReleaseSummaryModalProps) {
  const {
    id, client_name, campaign_label, release_title,
    release_kind, avg_quality, initial_revenue,
  } = notification;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => onDismiss(id)}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.accentBar} />
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.typeLabel}>RELEASE OUT</Text>
              <Text style={styles.clientName}>{client_name}</Text>
            </View>

            <View style={styles.titleBlock}>
              <Text style={styles.releaseTitle}>{release_title}</Text>
              <Text style={styles.releaseMeta}>
                {KIND_LABEL[release_kind] ?? release_kind} · {campaign_label}
              </Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Quality</Text>
                <Text style={[styles.statValue, { color: qualityColor(avg_quality) }]}>
                  {avg_quality}/100
                </Text>
                <Text style={[styles.statSubLabel, { color: qualityColor(avg_quality) }]}>
                  {qualityLabel(avg_quality)}
                </Text>
              </View>

              {initial_revenue > 0 && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Advance</Text>
                  <Text style={[styles.statValue, { color: Colors.positive }]}>
                    {formatMoney(initial_revenue)}
                  </Text>
                  <Text style={styles.statSubLabel}>paid now</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => onDismiss(id)}
              accessibilityLabel="Dismiss release summary"
            >
              <Text style={styles.closeBtnText}>Nice</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
    overflow: 'hidden',
  },
  accentBar: {
    height: 4,
    backgroundColor: Colors.accent,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  header: {
    gap: Spacing.xs,
  },
  typeLabel: {
    color: Colors.accent,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  clientName: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  titleBlock: {
    gap: Spacing.xs,
  },
  releaseTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: '700',
    lineHeight: 28,
  },
  releaseMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stat: {
    gap: 2,
  },
  statLabel: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  statSubLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  closeBtn: {
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
});
