import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootParamList } from '../navigation/types';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMetaStore } from '../store/useMetaStore';
import { MANIFEST_REGISTRY } from '../manifest/registry';
import { Colors, FontSize, Spacing, Radius, formatMoney } from '../theme';

export type LeaderboardScreenProps = NativeStackScreenProps<RootParamList, 'Leaderboard'>;

export interface LeaderboardEntry {
  rank: number;
  agentName: string;
  variantId: string;
  careerScore: number;
  peakReputation: number;
  totalEarnings: number;
  clientsDeveloped: number;
  hallOfFameClients: number;
  endCondition: string;
  turnsPlayed: number;
}

export function LeaderboardScreen() {
  const completedRuns = useMetaStore(s => s.completed_runs);
  const [filter, setFilter] = useState<string | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>();

  const sortedRuns = [...completedRuns]
    .filter(r => filter === null || r.variant_id === filter)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  const variantIds = [...new Set(completedRuns.map(r => r.variant_id))];

  return (
    <SafeAreaView style={styles.safe}>
      {/* Secondary nav */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => navigation.navigate('Legacy')}>
          <Text style={styles.navLink}>Career History →</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Achievements')}>
          <Text style={styles.navLink}>Achievements →</Text>
        </TouchableOpacity>
      </View>

      {/* Variant filter */}
      <View style={styles.filters}>
        <TouchableOpacity
          style={[styles.filterChip, filter === null && styles.filterActive]}
          onPress={() => setFilter(null)}
        >
          <Text style={[styles.filterText, filter === null && styles.filterTextActive]}>All</Text>
        </TouchableOpacity>
        {variantIds.map(id => (
          <TouchableOpacity
            key={id}
            style={[styles.filterChip, filter === id && styles.filterActive]}
            onPress={() => setFilter(id)}
          >
            <Text style={[styles.filterText, filter === id && styles.filterTextActive]}>
              {id.replace(/_v\d+$/, '')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={sortedRuns}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No careers completed yet</Text>
            <Text style={styles.emptyHint}>Finish your first career to see it here.</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const reputationLabel = MANIFEST_REGISTRY[item.variant_id]?.labels.reputation ?? 'Reputation';

          return (
            <View style={styles.row}>
              <View style={styles.rank}>
                <Text style={styles.rankNum}>{index + 1}</Text>
              </View>
              <View style={styles.info}>
                <View style={styles.rowTop}>
                  <Text style={styles.variantLabel}>{item.variant_id.replace(/_v\d+$/, '')}</Text>
                  <Text style={styles.endCond}>{item.end_condition.replace('_', ' ')}</Text>
                </View>
                <View style={styles.rowStats}>
                  <Text style={styles.statItem}>{reputationLabel} {item.peak_reputation}</Text>
                  <Text style={styles.statItem}>{formatMoney(item.total_earnings)}</Text>
                  <Text style={styles.statItem}>{item.clients_developed} peaked</Text>
                  <Text style={styles.statItem}>W{item.turn_number}</Text>
                </View>
              </View>
              <Text style={styles.score}>{item.score.toLocaleString()}</Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  navLink: { color: Colors.accent, fontSize: FontSize.sm, fontWeight: '600' },
  filters: {
    flexDirection: 'row',
    gap: Spacing.xs,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterChip: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  filterActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  filterTextActive: { color: Colors.textPrimary, fontWeight: '600' },
  list: { padding: Spacing.md, gap: Spacing.sm },
  empty: { paddingTop: Spacing.xxl, alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: '600' },
  emptyHint:  { color: Colors.textDim, fontSize: FontSize.sm, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700' },
  info:    { flex: 1, gap: Spacing.xs },
  rowTop:  { flexDirection: 'row', justifyContent: 'space-between' },
  variantLabel: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600', textTransform: 'capitalize' },
  endCond: { color: Colors.textDim, fontSize: FontSize.xs, textTransform: 'capitalize' },
  rowStats: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  statItem: { color: Colors.textSecondary, fontSize: FontSize.xs },
  score:   { color: Colors.accent, fontSize: FontSize.lg, fontWeight: '700' },
});
