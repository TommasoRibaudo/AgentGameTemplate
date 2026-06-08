import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScoutStackParamList } from '../navigation/types';
import {
  useRunState, useManifest, useMoney, useReputation,
  useTurnNumber, useRunStore,
} from '../store/useRunStore';
import { TopBar }  from '../components/TopBar';
import { FogBand } from '../components/FogBand';
import { CoreStatKey } from '../types/primitives';
import { Colors, FontSize, Spacing, Radius, ArcColors } from '../theme';

export type ProspectDetailScreenProps = NativeStackScreenProps<ScoutStackParamList, 'ProspectDetail'>;

const SCOUT_COST = 500;

export function ProspectDetailScreen({ route, navigation }: ProspectDetailScreenProps) {
  const { prospectId } = route.params;

  const runState = useRunState();
  const manifest = useManifest();
  const money    = useMoney();
  const rep      = useReputation();
  const turnNum  = useTurnNumber();

  const investScouting    = useRunStore(s => s.investScouting);
  const queueSigningOffer = useRunStore(s => s.queueSigningOffer);

  const prospect   = runState?.prospects.find(p => p.id === prospectId);
  const rosterFull = (runState?.roster.length ?? 0) >= (runState?.agent.roster_capacity ?? 0);
  const canAfford  = money >= SCOUT_COST;

  if (!runState || !manifest || !prospect) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>Prospect not found.</Text>
      </View>
    );
  }

  const labels     = manifest.labels;
  const statLabels = labels.stat_labels;
  const arcColor   = ArcColors[prospect.arc_stage] ?? Colors.textSecondary;
  const keys: CoreStatKey[] = ['talent', 'form', 'marketability', 'morale'];

  function handleInvest(statKey: CoreStatKey) {
    if (!canAfford) return;
    investScouting(prospectId, statKey, SCOUT_COST);
  }

  function handleSign() {
    if (rosterFull) return;
    queueSigningOffer(prospectId);
    Alert.alert('Offer queued', 'Check your Decision Board to approve the signing.');
    navigation.goBack();
  }

  const fogPct = prospect.scouting_invested > 0
    ? Math.min(100, Math.round((prospect.scouting_invested / 5000) * 100))
    : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        money={money}
        reputation={rep}
        rosterCount={runState.roster.length}
        rosterCapacity={runState.agent.roster_capacity}
        turnNumber={turnNum}
        careerLength={runState.career_length}
        isInDebt={runState.debt.is_active}
        lowMoneyWarning={runState.low_money_warning}
        moneyLabel={labels.money}
        reputationLabel={labels.reputation}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.name}>{prospect.name}</Text>
            <View style={[styles.arcBadge, { borderColor: arcColor }]}>
              <Text style={[styles.arcText, { color: arcColor }]}>
                {prospect.arc_stage.toUpperCase()}
              </Text>
            </View>
          </View>
          {prospect.scouting_invested > 0 && (
            <View style={styles.investedChip}>
              <Text style={styles.investedText}>
                {prospect.scouting_invested.toLocaleString()} invested
              </Text>
            </View>
          )}
        </View>

        {/* ── Scouting progress ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scouting Progress</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${fogPct}%` as any }]} />
          </View>
          <Text style={styles.progressLabel}>{fogPct}% revealed</Text>
        </View>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stats</Text>
          <View style={styles.statsGrid}>
            {keys.map(key => (
              <View key={key} style={styles.statRow}>
                <FogBand label={statLabels[key]} stat={prospect.stats[key]} size="compact" />
                <TouchableOpacity
                  style={[styles.scoutBtn, !canAfford && styles.btnDisabled]}
                  onPress={() => handleInvest(key)}
                  disabled={!canAfford}
                  accessibilityRole="button"
                  accessibilityLabel={`Scout ${statLabels[key]} for ${SCOUT_COST}`}
                >
                  <Text style={[styles.scoutBtnText, !canAfford && styles.textDim]}>
                    Scout
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          {!canAfford && (
            <Text style={styles.cantAfford}>Need ${SCOUT_COST.toLocaleString()} to invest.</Text>
          )}
        </View>

        {/* ── Traits ─────────────────────────────────────────────────────── */}
        {/* ── Sign CTA ───────────────────────────────────────────────────── */}
        <View style={styles.ctaSection}>
          {rosterFull && (
            <Text style={styles.rosterFullNote}>
              Roster full — upgrade slot in Agency to sign more {labels.client}s.
            </Text>
          )}
          <TouchableOpacity
            style={[styles.signBtn, rosterFull && styles.btnDisabled]}
            onPress={handleSign}
            disabled={rosterFull}
            accessibilityRole="button"
            accessibilityLabel={`Sign ${prospect.name}`}
          >
            <Text style={styles.signBtnText}>
              Sign {prospect.name}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  notFound:{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  notFoundText: { color: Colors.textDim, fontSize: FontSize.md },
  scroll:  { padding: Spacing.md, gap: Spacing.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: { gap: Spacing.xs },
  name: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  arcBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  arcText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  investedChip: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  investedText: { color: Colors.textDim, fontSize: FontSize.xs },

  section: { gap: Spacing.sm },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  progressBar: {
    height: 6,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  progressLabel: { color: Colors.textDim, fontSize: FontSize.xs },

  statsGrid: { gap: Spacing.sm },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  scoutBtn: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  scoutBtnText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },
  cantAfford:   { color: Colors.warning, fontSize: FontSize.xs },

  ctaSection: { gap: Spacing.sm, paddingTop: Spacing.md },
  rosterFullNote: {
    color: Colors.warning,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  signBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  signBtnText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
  textDim: { color: Colors.textDim },
});
