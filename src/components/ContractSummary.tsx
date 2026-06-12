import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Contract, ContractDraft } from '../types/contract';
import { Colors, FontSize, Spacing, Radius, formatMoney, formatDuration } from '../theme';

export interface ContractSummaryProps {
  contract: Contract | ContractDraft;
  isDraft: boolean;
  clientLabel: string;
  entityLabel: string;
  showPosture: boolean;
  showExpiry?: boolean;
  agentCutPercent?: number | null;
  previousContract?: Contract | null;
}

function isDraftType(c: Contract | ContractDraft): c is ContractDraft {
  return !('id' in c);
}

export function ContractSummary({
  contract,
  isDraft,
  clientLabel,
  entityLabel,
  showPosture,
  showExpiry,
  agentCutPercent,
  previousContract,
}: ContractSummaryProps) {
  const tier    = contract.tier === 'agent_client' ? `You → ${clientLabel}` : `${clientLabel} → ${entityLabel}`;
  const payout  = contract.payout_type.replace(/_/g, ' ');
  const expiry  = !isDraftType(contract) && showExpiry ? contract.duration_remaining : null;
  const posture = contract.counterparty_posture;
  const isEntityDeal = contract.tier === 'client_entity';
  const agencyTake = isEntityDeal && agentCutPercent !== undefined && agentCutPercent !== null
    ? Math.round(contract.amount * (agentCutPercent / 100))
    : null;

  const newDuration = isDraftType(contract) ? contract.duration : contract.duration_remaining;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>Tier</Text>
        <Text style={styles.value}>{tier}</Text>
      </View>
      {isEntityDeal && contract.entity_id && (
        <View style={styles.row}>
          <Text style={styles.label}>{entityLabel}</Text>
          <Text style={styles.value}>{contract.entity_id}</Text>
        </View>
      )}
      <View style={styles.row}>
        <Text style={styles.label}>Payout</Text>
        <Text style={styles.value}>{payout}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{isEntityDeal ? 'Deal value' : 'Amount'}</Text>
        <View style={styles.valueGroup}>
          <Text style={styles.value}>{formatMoney(contract.amount)}</Text>
          {previousContract && previousContract.amount !== contract.amount && (
            <Text style={styles.diffNote}>was {formatMoney(previousContract.amount)}</Text>
          )}
        </View>
      </View>
      {agencyTake !== null && (
        <View style={styles.row}>
          <Text style={styles.label}>Agency take</Text>
          <Text style={styles.value}>{formatMoney(agencyTake)}</Text>
        </View>
      )}
      {contract.your_cut !== null && (
        <View style={styles.row}>
          <Text style={styles.label}>Your cut</Text>
          <View style={styles.valueGroup}>
            <Text style={styles.value}>{Math.round(contract.your_cut)}%</Text>
            {previousContract && previousContract.your_cut !== null &&
              previousContract.your_cut !== contract.your_cut && (
              <Text style={styles.diffNote}>was {Math.round(previousContract.your_cut)}%</Text>
            )}
          </View>
        </View>
      )}
      <View style={styles.row}>
        <Text style={styles.label}>Duration</Text>
        <View style={styles.valueGroup}>
          <Text style={styles.value}>
            {formatDuration(newDuration)}
            {expiry !== null && expiry <= 3 ? ' ⚠' : ''}
          </Text>
          {previousContract && (
            <Text style={styles.diffNote}>{formatDuration(previousContract.duration_remaining)} left on current</Text>
          )}
        </View>
      </View>
      {contract.obligations_per_turn > 0 && (
        <View style={styles.row}>
          <Text style={styles.label}>Obligations</Text>
          <View style={styles.valueGroup}>
            <Text style={styles.value}>{formatMoney(contract.obligations_per_turn)}/wk</Text>
            {previousContract && previousContract.obligations_per_turn !== contract.obligations_per_turn && (
              <Text style={styles.diffNote}>was {formatMoney(previousContract.obligations_per_turn)}/wk</Text>
            )}
          </View>
        </View>
      )}
      {contract.exclusivity_scope !== null && contract.exclusivity_scope !== undefined && (
        <View style={styles.row}>
          <Text style={styles.label}>Exclusivity</Text>
          <Text style={[styles.value, styles.exclusivityValue]}>
            {contract.exclusivity_scope.replace(/_/g, ' ')}
          </Text>
        </View>
      )}
      {showPosture && (
        <View style={styles.row}>
          <Text style={styles.label}>Posture</Text>
          <Text style={styles.value}>
            {posture.is_revealed
              ? `${Math.round((posture.observed_min ?? 0) * 100)}–${Math.round((posture.observed_max ?? 1) * 100)}%`
              : 'Unknown'}
          </Text>
        </View>
      )}
      {contract.objectives.length > 0 && (
        <View style={styles.objectives}>
          <Text style={styles.label}>Objectives</Text>
          {contract.objectives.map((obj, i) => (
            <View key={i} style={styles.objectiveRow}>
              <Text style={styles.objectiveDesc} numberOfLines={2}>{obj.description}</Text>
              <Text style={styles.objectivePayout}>{formatMoney(obj.payout)}</Text>
            </View>
          ))}
        </View>
      )}
      {isDraft && (
        <Text style={styles.defaultNote}>
          If ignored: {contract.default_on_ignore}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  valueGroup: {
    alignItems: 'flex-end',
    gap: 1,
  },
  value: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '500',
    textAlign: 'right',
  },
  diffNote: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    textAlign: 'right',
  },
  objectives: {
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  objectiveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: Spacing.sm,
    gap: Spacing.sm,
  },
  objectiveDesc: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
  objectivePayout: {
    color: Colors.positive,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  exclusivityValue: {
    color: Colors.warning,
    fontWeight: '600',
  },
  defaultNote: {
    marginTop: Spacing.xs,
    color: Colors.textDim,
    fontSize: FontSize.xs,
    fontStyle: 'italic',
  },
});
