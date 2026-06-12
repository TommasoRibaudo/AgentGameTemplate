import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Image,
} from 'react-native';
import { resolvePortrait } from '../portraits';
import { useDialog } from '../context/DialogContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScoutStackParamList } from '../navigation/types';
import {
  useRunState, useManifest, useProspects,
  useMoney, useReputation, useTurnNumber, useRunStore,
  useTutorialStep, useTutorialProspectId,
} from '../store/useRunStore';
import { TopBar }   from '../components/TopBar';
import { FogBand }  from '../components/FogBand';
import { canInvestScouting } from '../engine/client';
import { AgentState } from '../types/agent';
import { Prospect } from '../types/client';
import { CoreStatKey } from '../types/primitives';
import { Colors, FontSize, Spacing, Radius, ArcColors, formatAge } from '../theme';

export type ScoutScreenProps = NativeStackScreenProps<ScoutStackParamList, 'ScoutList'>;

export function ScoutScreen() {
  const runState  = useRunState();
  const manifest  = useManifest();
  const prospects = useProspects();
  const money     = useMoney();
  const rep       = useReputation();
  const turnNum   = useTurnNumber();
  const navigation = useNavigation<NativeStackNavigationProp<ScoutStackParamList>>();

  const investScouting    = useRunStore(s => s.investScouting);
  const queueSigningOffer = useRunStore(s => s.queueSigningOffer);
  const advanceTutorial   = useRunStore(s => s.advanceTutorial);
  const tutorialStep       = useTutorialStep();
  const tutorialProspectId = useTutorialProspectId();
  const { showDialog }    = useDialog();

  if (!runState || !manifest) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No active run.</Text>
      </View>
    );
  }

  const labels    = manifest.labels;
  const statLabels = labels.stat_labels;
  const canAfford = money >= 500;
  const rosterFull = runState.roster.length >= runState.agent.roster_capacity;

  const isScoutTutorial = tutorialStep === 'scout_hint' || tutorialStep === 'scout_signing';

  function handleInvest(prospectId: string, statKey: CoreStatKey) {
    if (!canAfford) return;
    investScouting(prospectId, statKey, 500);
    if (tutorialStep === 'scout_hint' && prospectId === tutorialProspectId) {
      advanceTutorial('scout_hint');
    }
  }

  function handleSign(prospectId: string) {
    if (rosterFull) return;
    queueSigningOffer(prospectId);
    if (isScoutTutorial && prospectId === tutorialProspectId) {
      // tutorial_step advances to agency_hint inside queueSigningOffer — no dialog needed
      return;
    }
    showDialog({ title: 'Offer queued', message: 'Check your Decision Board to approve the signing.' });
  }

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
      <FlatList
        data={prospects}
        keyExtractor={p => p.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {isScoutTutorial && (
              <View style={styles.tutorialBanner}>
                <Text style={styles.tutorialBannerText}>
                  {tutorialStep === 'scout_hint'
                    ? 'Tap Scout ($500) on the highlighted prospect to reveal their stats.'
                    : 'Now tap Sign on the prospect to add them to your roster.'}
                </Text>
              </View>
            )}
            {rosterFull && !isScoutTutorial && (
              <View style={styles.warningBanner}>
                <Text style={styles.warningText}>Roster full — upgrade slot in Agency to sign more.</Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyTitle}>No prospects available</Text>
            <Text style={styles.emptyHint}>
              Prospects appear as your {labels.reputation} grows.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ProspectCard
            prospect={item}
            agent={runState.agent}
            statLabels={statLabels}
            audienceLabel={labels.audience}
            canInvest={canAfford}
            canSign={!rosterFull}
            onInvest={handleInvest}
            onSign={handleSign}
            onViewDetail={() => navigation.navigate('ProspectDetail', { prospectId: item.id })}
            highlighted={isScoutTutorial && item.id === tutorialProspectId}
            dimmed={isScoutTutorial && item.id !== tutorialProspectId}
            tutorialFocus={
              isScoutTutorial && item.id === tutorialProspectId
                ? tutorialStep === 'scout_hint' ? 'scout' : 'sign'
                : undefined
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

interface ProspectCardProps {
  prospect: Prospect;
  agent: AgentState;
  statLabels: Record<CoreStatKey, string>;
  audienceLabel: string;
  canInvest: boolean;
  canSign: boolean;
  onInvest: (id: string, key: CoreStatKey) => void;
  onSign: (id: string) => void;
  onViewDetail: () => void;
  highlighted?: boolean;
  dimmed?: boolean;
  tutorialFocus?: 'scout' | 'sign';
}

function ProspectCard({ prospect, agent, statLabels, audienceLabel, canInvest, canSign, onInvest, onSign, onViewDetail, highlighted, dimmed, tutorialFocus }: ProspectCardProps) {
  const arcColor = ArcColors[prospect.arc_stage] ?? Colors.textSecondary;
  const keys: CoreStatKey[] = ['talent', 'form', 'marketability', 'morale'];
  const scoutMaxed = !canInvestScouting(prospect, 'talent', 500, agent);
  const scoutDisabled = !canInvest || scoutMaxed;

  return (
    <View style={[styles.card, highlighted && styles.cardHighlighted, dimmed && styles.cardDimmed]}>
      {/* Row 1: portrait + identity */}
      <View style={styles.topRow}>
        <Image source={resolvePortrait(prospect.portrait, prospect.id)} style={styles.portrait} />
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={styles.prospectName}>{prospect.name}</Text>
            <View style={[styles.arcBadge, { borderColor: arcColor }]}>
              <Text style={[styles.arcText, { color: arcColor }]}>
                {prospect.arc_stage.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.audienceRow}>
            <Text style={styles.audienceLabel}>{audienceLabel} · Age {formatAge(prospect.age_weeks)}</Text>
            <Text style={styles.audienceValue}>{prospect.audience.toLocaleString()}</Text>
          </View>
        </View>
      </View>

      {/* Row 2: stats + actions (full width) */}
      <View style={styles.bottomRow}>
        {keys.map(key => (
          <FogBand key={key} label={statLabels[key]} stat={prospect.stats[key]} size="compact" />
        ))}
        {prospect.scouting_invested > 0 && (
          <Text style={styles.invested}>{prospect.scouting_invested} scouting invested</Text>
        )}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.detailBtn}
            onPress={onViewDetail}
            accessibilityRole="button"
            accessibilityLabel={`View details for ${prospect.name}`}
          >
            <Text style={styles.btnText}>Details</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.investBtn, scoutDisabled && styles.btnDisabled, tutorialFocus === 'scout' && styles.btnTutorial]}
            onPress={() => onInvest(prospect.id, 'talent')}
            disabled={scoutDisabled}
            accessibilityRole="button"
            accessibilityLabel={`Scout ${prospect.name} for $500`}
          >
            <Text style={[styles.btnText, scoutDisabled && styles.btnTextDim]}>
              {scoutMaxed ? 'Max' : 'Scout ($500)'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.signBtn, !canSign && styles.btnDisabled, tutorialFocus === 'sign' && styles.btnTutorial]}
            onPress={() => onSign(prospect.id)}
            disabled={!canSign}
            accessibilityRole="button"
            accessibilityLabel={`Sign ${prospect.name}`}
          >
            <Text style={[styles.btnText, !canSign && styles.btnTextDim]}>Sign</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: Spacing.md, gap: Spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  emptyText: { color: Colors.textDim, fontSize: FontSize.md },
  emptyList: { paddingTop: Spacing.xxl, alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: '600' },
  emptyHint:  { color: Colors.textDim, fontSize: FontSize.sm, textAlign: 'center' },
  tutorialBanner: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  tutorialBannerText: {
    color: Colors.warning,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  warningBanner: {
    backgroundColor: Colors.warning + '22',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  warningText: { color: Colors.warning, fontSize: FontSize.sm, textAlign: 'center' },
  cardHighlighted: {
    borderColor: Colors.warning,
    shadowColor: Colors.warning,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  cardDimmed: {
    opacity: 0.3,
  },
  btnTutorial: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  portrait: {
    width: 64,
    height: 64,
  },
  identity: {
    flex: 1,
    gap: Spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  prospectName: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  arcBadge: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  arcText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  audienceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  audienceLabel: { color: Colors.textDim, fontSize: FontSize.xs, textTransform: 'uppercase' },
  audienceValue: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },
  bottomRow: {
    gap: Spacing.xs,
  },
  invested: { color: Colors.textDim, fontSize: FontSize.xs },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  detailBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  investBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  signBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  btnTextDim: { color: Colors.textDim },
});
