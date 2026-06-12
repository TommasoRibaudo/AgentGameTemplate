import React from 'react';
import {
  View, Text, StyleSheet, FlatList, SafeAreaView,
} from 'react-native';
import { useMetaStore } from '../store/useMetaStore';
import { ACHIEVEMENT_DEFINITIONS } from '../engine/achievements';
import { MANIFEST_REGISTRY } from '../manifest/registry';
import { Colors, FontSize, Spacing, Radius, formatMoney } from '../theme';

const END_LABELS: Record<string, string> = {
  retired:      'Retired',
  bankrupt:     'Bankrupt',
  clock_expired:'Career Complete',
};

const END_COLORS: Record<string, string> = {
  retired:      Colors.positive,
  bankrupt:     Colors.negative,
  clock_expired:Colors.accent,
};

const ICON_MAP: Record<string, string> = Object.fromEntries(
  ACHIEVEMENT_DEFINITIONS.map(d => [d.key, d.icon]),
);

export function LegacyScreen() {
  const completedRuns = useMetaStore(s => s.completed_runs);

  const chronological = [...completedRuns].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={chronological}
        keyExtractor={r => r.run_id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Career History</Text>
            <Text style={styles.headerSub}>{completedRuns.length} career{completedRuns.length !== 1 ? 's' : ''}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No careers recorded</Text>
            <Text style={styles.emptyHint}>Complete your first career to see it here.</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const endColor = END_COLORS[item.end_condition] ?? Colors.textSecondary;
          const endLabel = END_LABELS[item.end_condition] ?? item.end_condition;
          const date = new Date(item.timestamp).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
          });
          const reputationLabel = MANIFEST_REGISTRY[item.variant_id]?.labels.reputation ?? 'Reputation';
          const badges = item.newly_unlocked_achievements ?? [];

          return (
            <View style={styles.card}>
              {/* Timeline connector */}
              <View style={styles.timeline}>
                <View style={[styles.dot, { backgroundColor: endColor }]} />
                {index < chronological.length - 1 && <View style={styles.line} />}
              </View>

              <View style={styles.cardBody}>
                {/* Header row */}
                <View style={styles.cardTop}>
                  <View style={styles.careerMeta}>
                    <Text style={styles.careerNumber}>Career #{index + 1}</Text>
                    <Text style={styles.careerDate}>{date}</Text>
                  </View>
                  <View style={[styles.endBadge, { borderColor: endColor }]}>
                    <Text style={[styles.endLabel, { color: endColor }]}>
                      {endLabel.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Variant + score */}
                <View style={styles.scoreRow}>
                  <Text style={styles.variantLabel}>
                    {item.variant_id.replace(/_v\d+$/, '').replace('_', ' ')}
                  </Text>
                  <Text style={styles.score}>{item.score.toLocaleString()} pts</Text>
                </View>

                {/* Stats */}
                <View style={styles.statsRow}>
                  <StatChip label={`Peak ${reputationLabel}`} value={String(item.peak_reputation)} />
                  <StatChip label="Earned"    value={formatMoney(item.total_earnings)} />
                  <StatChip label="Peaked"    value={`${item.clients_developed}×`} />
                  <StatChip label="Weeks"     value={`W${item.turn_number}`} />
                </View>

                {/* Achievement badges earned this run */}
                {badges.length > 0 && (
                  <View style={styles.badgeRow}>
                    {badges.map(key => (
                      <View key={key} style={styles.badge}>
                        <Text style={styles.badgeIcon}>{ICON_MAP[key] ?? '★'}</Text>
                        <Text style={styles.badgeName}>
                          {ACHIEVEMENT_DEFINITIONS.find(d => d.key === key)?.name ?? key}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  headerRow: { marginBottom: Spacing.lg, gap: Spacing.xs },
  headerTitle: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '700' },
  headerSub:   { color: Colors.textSecondary, fontSize: FontSize.sm },
  empty: { paddingTop: Spacing.xxl, alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: '600' },
  emptyHint:  { color: Colors.textDim, fontSize: FontSize.sm, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  // ── Timeline ────────────────────────────────────────────────────────────────
  timeline: {
    alignItems: 'center',
    width: 20,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.border,
    marginTop: Spacing.xs,
  },
  // ── Card body ───────────────────────────────────────────────────────────────
  cardBody: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  careerMeta: { gap: 2 },
  careerNumber: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  careerDate:   { color: Colors.textDim, fontSize: FontSize.xs },
  endBadge: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  endLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  variantLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  score: { color: Colors.accent, fontSize: FontSize.lg, fontWeight: '700' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  statChip: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
  },
  statValue: { color: Colors.textPrimary, fontSize: FontSize.xs, fontWeight: '700' },
  statLabel: { color: Colors.textDim, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.3 },
  // ── Achievement badges ──────────────────────────────────────────────────────
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent + '1A',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 3,
  },
  badgeIcon: { fontSize: 11, color: Colors.accent },
  badgeName: { fontSize: 10, color: Colors.accent, fontWeight: '600' },
});
