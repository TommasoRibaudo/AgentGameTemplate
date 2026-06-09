import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScoutStackParamList } from '../navigation/types';
import {
  useRunState, useManifest, useProspects,
  useMoney, useReputation, useTurnNumber, useRunStore,
} from '../store/useRunStore';
import { TopBar }   from '../components/TopBar';
import { FogBand }  from '../components/FogBand';
import { canInvestScouting } from '../engine/client';
import { AgentState } from '../types/agent';
import { Prospect } from '../types/client';
import { CoreStatKey } from '../types/primitives';
import { Colors, FontSize, Spacing, Radius, ArcColors, formatMoney } from '../theme';

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

  function handleInvest(prospectId: string, statKey: CoreStatKey) {
    if (!canAfford) return;
    investScouting(prospectId, statKey, 500);
  }

  function handleSign(prospectId: string) {
    if (rosterFull) return;
    queueSigningOffer(prospectId);
    Alert.alert('Offer queued', 'Check your Decision Board to approve the signing.');
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
          rosterFull ? (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>Roster full — upgrade slot in Agency to sign more.</Text>
            </View>
          ) : null
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
}

function ProspectCard({ prospect, agent, statLabels, audienceLabel, canInvest, canSign, onInvest, onSign, onViewDetail }: ProspectCardProps) {
  const arcColor = ArcColors[prospect.arc_stage] ?? Colors.textSecondary;
  const keys: CoreStatKey[] = ['talent', 'form', 'marketability', 'morale'];
  const scoutMaxed = !canInvestScouting(prospect, 'talent', 500, agent);
  const scoutDisabled = !canInvest || scoutMaxed;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.prospectName}>{prospect.name}</Text>
        <View style={[styles.arcBadge, { borderColor: arcColor }]}>
          <Text style={[styles.arcText, { color: arcColor }]}>
            {prospect.arc_stage.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.statGrid}>
        <View style={styles.audienceRow}>
          <Text style={styles.audienceLabel}>{audienceLabel}</Text>
          <Text style={styles.audienceValue}>{prospect.audience.toLocaleString()}</Text>
        </View>
        {keys.map(key => (
          <View key={key} style={styles.statWrap}>
            <FogBand label={statLabels[key]} stat={prospect.stats[key]} size="compact" />
          </View>
        ))}
      </View>

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
          style={[styles.investBtn, scoutDisabled && styles.btnDisabled]}
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
          style={[styles.signBtn, !canSign && styles.btnDisabled]}
          onPress={() => onSign(prospect.id)}
          disabled={!canSign}
          accessibilityRole="button"
          accessibilityLabel={`Sign ${prospect.name}`}
        >
          <Text style={[styles.btnText, !canSign && styles.btnTextDim]}>Sign</Text>
        </TouchableOpacity>
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
  warningBanner: {
    backgroundColor: Colors.warning + '22',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  warningText: { color: Colors.warning, fontSize: FontSize.sm, textAlign: 'center' },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cardHeader: {
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
  statGrid: { gap: Spacing.xs },
  audienceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  audienceLabel: { color: Colors.textDim, fontSize: FontSize.xs, textTransform: 'uppercase' },
  audienceValue: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },
  statWrap: {},
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
