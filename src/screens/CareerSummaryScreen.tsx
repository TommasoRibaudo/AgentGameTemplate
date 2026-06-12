import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootParamList } from '../navigation/types';
import { useRunStore } from '../store/useRunStore';
import { useMetaStore } from '../store/useMetaStore';
import { computeCareerScore } from '../engine/failure';
import { Colors, FontSize, Spacing, Radius, formatMoney } from '../theme';
import { ACHIEVEMENT_DEFINITIONS } from '../engine/achievements';

export type CareerSummaryScreenProps = NativeStackScreenProps<RootParamList, 'CareerSummary'>;

const END_LABELS: Record<string, string> = {
  retired:      'Career Complete — Retired',
  bankrupt:     'Career Over — Bankrupt',
  clock_expired:'Career Complete — Time\'s Up',
};

const END_COLORS: Record<string, string> = {
  retired:      Colors.positive,
  bankrupt:     Colors.negative,
  clock_expired:Colors.warning,
};

export function CareerSummaryScreen({ navigation }: CareerSummaryScreenProps) {
  const runState = useRunStore(s => s.state);
  const manifest = useRunStore(s => s.manifest);
  const { recordRunCompletion } = useMetaStore();
  const completedRuns  = useMetaStore(s => s.completed_runs);
  const latestRecord   = completedRuns[completedRuns.length - 1];
  const newAchievements = latestRecord?.newly_unlocked_achievements ?? [];

  if (!runState || !manifest) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No run data.</Text>
        <TouchableOpacity style={styles.ctaBtn} onPress={() => navigation.replace('NewCareer')}>
          <Text style={styles.ctaBtnText}>Start New Career</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const endCondition = runState.end_condition ?? 'clock_expired';
  const score = computeCareerScore(runState);
  const endColor = END_COLORS[endCondition] ?? Colors.textSecondary;
  const endLabel = END_LABELS[endCondition] ?? 'Career Over';
  const reputationLabel = manifest.labels.reputation;

  useEffect(() => {
    if (runState.end_condition) {
      recordRunCompletion(runState, manifest);
    }
  }, [runState.id, runState.end_condition, manifest.id, recordRunCompletion]);

  function recordCurrentRun() {
    if (runState && manifest && runState.end_condition) {
      recordRunCompletion(runState, manifest);
    }
  }

  function handleStartNew() {
    recordCurrentRun();
    useRunStore.getState().clearRun();
    navigation.replace('NewCareer');
  }

  function handleLeaderboard() {
    recordCurrentRun();
    navigation.navigate('Leaderboard');
  }

  function handleAchievements() {
    recordCurrentRun();
    navigation.navigate('Achievements');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* End banner */}
        <View style={[styles.banner, { borderColor: endColor }]}>
          <Text style={[styles.bannerTitle, { color: endColor }]}>{endLabel}</Text>
          <Text style={styles.bannerScore}>{score.toLocaleString()}</Text>
          <Text style={styles.bannerScoreLabel}>Career Score</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <StatCell label={`Peak ${reputationLabel}`} value={String(runState.peak_reputation)} />
          <StatCell label="Total Earned" value={formatMoney(runState.total_earnings)} />
          <StatCell label="Weeks"        value={String(runState.turn_number)} />
          <StatCell label="At Peak"      value={String(runState.clients_developed)} />
        </View>

        {/* Roster at end */}
        {runState.roster.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Final Roster</Text>
            {runState.roster.map(c => (
              <View key={c.id} style={styles.rosterRow}>
                <Text style={styles.rosterName}>{c.name}</Text>
                <Text style={styles.rosterArc}>{c.arc_stage}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Newly earned achievements */}
        {newAchievements.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Achievements Unlocked</Text>
            {newAchievements.map(key => {
              const def = ACHIEVEMENT_DEFINITIONS.find(d => d.key === key);
              if (!def) return null;
              return (
                <View key={key} style={styles.achievementRow}>
                  <Text style={styles.achievementIcon}>{def.icon}</Text>
                  <View style={styles.achievementText}>
                    <Text style={styles.achievementName}>{def.name}</Text>
                    <Text style={styles.achievementDesc}>{def.description}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* CTAs */}
        <View style={styles.ctas}>
          <TouchableOpacity style={styles.ctaBtn} onPress={handleStartNew}>
            <Text style={styles.ctaBtnText}>Start New Career</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctaSecondary} onPress={handleLeaderboard}>
            <Text style={styles.ctaSecondaryText}>View Leaderboard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctaSecondary} onPress={handleAchievements}>
            <Text style={styles.ctaSecondaryText}>Achievements</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  empty:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, padding: Spacing.xl, backgroundColor: Colors.bg },
  emptyText: { color: Colors.textDim, fontSize: FontSize.md },
  content: { padding: Spacing.lg, gap: Spacing.xl },
  banner: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
  },
  bannerTitle:     { fontSize: FontSize.sm, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  bannerScore:     { fontSize: FontSize.huge, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1 },
  bannerScoreLabel:{ fontSize: FontSize.sm, color: Colors.textSecondary },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statCell: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statValue: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '700' },
  statLabel: { color: Colors.textSecondary, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  section:      { gap: Spacing.sm },
  sectionTitle: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  rosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rosterName: { color: Colors.textPrimary, fontSize: FontSize.sm },
  rosterArc:  { color: Colors.textSecondary, fontSize: FontSize.sm, textTransform: 'capitalize' },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  achievementIcon: { fontSize: 20, color: Colors.accent, width: 28, textAlign: 'center' },
  achievementText: { flex: 1, gap: 2 },
  achievementName: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
  achievementDesc: { color: Colors.textSecondary, fontSize: FontSize.xs },
  ctas: { gap: Spacing.md },
  ctaBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  ctaBtnText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  ctaSecondary: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
  },
  ctaSecondaryText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '600' },
});
