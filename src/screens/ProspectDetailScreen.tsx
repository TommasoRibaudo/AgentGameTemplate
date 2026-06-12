import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Image,
} from 'react-native';
import { resolvePortrait } from '../portraits';
import { useDialog } from '../context/DialogContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScoutStackParamList } from '../navigation/types';
import {
  useRunState, useManifest, useMoney, useReputation,
  useTurnNumber, useRunStore,
  useTutorialStep, useTutorialProspectId,
} from '../store/useRunStore';
import { TopBar }  from '../components/TopBar';
import { FogBand } from '../components/FogBand';
import { canInvestScouting } from '../engine/client';
import { CoreStatKey } from '../types/primitives';
import { Colors, FontSize, Spacing, Radius, ArcColors, formatAge } from '../theme';

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
  const advanceTutorial   = useRunStore(s => s.advanceTutorial);
  const tutorialStep       = useTutorialStep();
  const tutorialProspectId = useTutorialProspectId();
  const { showDialog }    = useDialog();

  const isTutorialProspect =
    (tutorialStep === 'scout_hint' || tutorialStep === 'scout_signing') &&
    prospectId === tutorialProspectId;

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
    if (tutorialStep === 'scout_hint' && isTutorialProspect) {
      advanceTutorial('scout_hint');
    }
  }

  function handleSign() {
    if (rosterFull) return;
    queueSigningOffer(prospectId);
    if (isTutorialProspect) {
      navigation.goBack();
      return;
    }
    showDialog({ title: 'Offer queued', message: 'Check your Decision Board to approve the signing.' });
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
        {isTutorialProspect && (
          <View style={styles.tutorialBanner}>
            <Text style={styles.tutorialBannerText}>
              {tutorialStep === 'scout_hint'
                ? 'Tap Scout on a stat to reveal more about this artist.'
                : 'Now sign them — they\'re asking for nothing.'}
            </Text>
          </View>
        )}
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Image source={resolvePortrait(prospect.portrait, prospect.id)} style={styles.portrait} />
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
          <View style={styles.audienceRow}>
            <Text style={styles.audienceLabel}>{labels.audience}</Text>
            <Text style={styles.audienceValue}>{prospect.audience.toLocaleString()}</Text>
          </View>
          <View style={styles.audienceRow}>
            <Text style={styles.audienceLabel}>Age</Text>
            <Text style={styles.audienceValue}>{formatAge(prospect.age_weeks)}</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${fogPct}%` as any }]} />
          </View>
          <Text style={styles.progressLabel}>{fogPct}% revealed</Text>
        </View>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stats</Text>
          <View style={styles.statsGrid}>
            {keys.map(key => {
              const scoutMaxed = !canInvestScouting(prospect, key, SCOUT_COST, runState.agent);
              const scoutDisabled = !canAfford || scoutMaxed;
              return (
                <View key={key} style={styles.statRow}>
                  <FogBand label={statLabels[key]} stat={prospect.stats[key]} size="compact" />
                  <TouchableOpacity
                    style={[styles.scoutBtn, scoutDisabled && styles.btnDisabled, isTutorialProspect && tutorialStep === 'scout_hint' && !scoutDisabled && styles.scoutBtnTutorial]}
                    onPress={() => handleInvest(key)}
                    disabled={scoutDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={`Scout ${statLabels[key]} for ${SCOUT_COST}`}
                  >
                    <Text style={[styles.scoutBtnText, scoutDisabled && styles.textDim]}>
                      {scoutMaxed ? 'Max' : 'Scout'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
          {!canAfford && (
            <Text style={styles.cantAfford}>Need ${SCOUT_COST.toLocaleString()} to invest.</Text>
          )}
        </View>

        {/* ── Sign CTA ───────────────────────────────────────────────────── */}
        <View style={styles.ctaSection}>
          {rosterFull && (
            <Text style={styles.rosterFullNote}>
              Roster full — upgrade slot in Agency to sign more {labels.client}s.
            </Text>
          )}
          <TouchableOpacity
            style={[styles.signBtn, rosterFull && styles.btnDisabled, isTutorialProspect && tutorialStep === 'scout_signing' && styles.signBtnTutorial]}
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
    gap: Spacing.md,
  },
  portrait: {
    width: 64,
    height: 64,
  },
  headerLeft: { gap: Spacing.xs, flex: 1 },
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
  audienceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  audienceLabel: { color: Colors.textDim, fontSize: FontSize.xs, textTransform: 'uppercase' },
  audienceValue: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },

  statsGrid: { gap: Spacing.sm },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tutorialBanner: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.md,
  },
  tutorialBannerText: {
    color: Colors.warning,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  scoutBtn: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  scoutBtnTutorial: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
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
  signBtnTutorial: {
    backgroundColor: Colors.warning,
    shadowColor: Colors.warning,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  signBtnText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
  textDim: { color: Colors.textDim },
});
