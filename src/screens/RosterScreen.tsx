import React from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RosterStackParamList } from '../navigation/types';
import { useRunState, useManifest, useRoster, useMoney, useReputation, useTurnNumber, useRunStore } from '../store/useRunStore';
import { TopBar }     from '../components/TopBar';
import { ClientRow }  from '../components/ClientRow';
import { Client }     from '../types/client';
import { Colors, FontSize, Spacing } from '../theme';

export type RosterScreenProps = NativeStackScreenProps<RosterStackParamList, 'RosterList'>;

export function RosterScreen() {
  const nav      = useNavigation<NativeStackNavigationProp<RosterStackParamList>>();
  const runState = useRunState();
  const manifest = useManifest();
  const roster   = useRoster();
  const money    = useMoney();
  const rep      = useReputation();
  const turnNum  = useTurnNumber();

  if (!runState || !manifest) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No active run.</Text>
      </View>
    );
  }

  const labels = manifest.labels;

  const hasActiveCampaign = (clientId: string) =>
    runState.campaigns.some(c => c.client_id === clientId && c.turns_remaining > 0);

  const contractStatus = (clientId: string): 'active' | 'expiring' | 'none' => {
    const contract = runState.contracts.find(
      c => c.client_id === clientId && c.tier === 'agent_client',
    );
    if (!contract) return 'none';
    if (contract.duration_remaining <= 2) return 'expiring';
    return 'active';
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        money={money}
        reputation={rep}
        rosterCount={roster.length}
        rosterCapacity={runState.agent.roster_capacity}
        turnNumber={turnNum}
        careerLength={runState.career_length}
        isInDebt={runState.debt.is_active}
        lowMoneyWarning={runState.low_money_warning}
        moneyLabel={labels.money}
        reputationLabel={labels.reputation}
      />
      <FlatList
        data={roster}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyTitle}>No {labels.client}s signed yet</Text>
            <Text style={styles.emptyHint}>Visit the Scout tab to find prospects.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ClientRow
            client={item}
            talentLabel={labels.stat_labels.talent}
            formLabel={labels.stat_labels.form}
            audienceLabel={labels.audience}
            hasCampaign={hasActiveCampaign(item.id)}
            contractStatus={contractStatus(item.id)}
            onPress={id => nav.navigate('ClientDetail', { clientId: id })}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  list: {
    padding: Spacing.md,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg,
  },
  emptyText: {
    color: Colors.textDim,
    fontSize: FontSize.md,
  },
  emptyList: {
    paddingTop: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  emptyHint: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
