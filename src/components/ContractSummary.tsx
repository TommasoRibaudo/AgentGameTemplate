import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Contract, ContractDraft } from '../types/contract';
import { Colors, FontSize, Spacing, Radius } from '../theme';
import { formatMoney } from '../theme';

export interface ContractSummaryProps {
  contract: Contract | ContractDraft;
  isDraft: boolean;
  clientLabel: string;
  entityLabel: string;
  showPosture: boolean;
  showExpiry?: boolean;
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
}: ContractSummaryProps) {
  const tier    = contract.tier === 'agent_client' ? `You → ${clientLabel}` : `${clientLabel} → ${entityLabel}`;
  const payout  = contract.payout_type.replace(/_/g, ' ');
  const expiry  = !isDraftType(contract) && showExpiry ? contract.duration_remaining : null;
  const posture = contract.counterparty_posture;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>Tier</Text>
        <Text style={styles.value}>{tier}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Payout</Text>
        <Text style={styles.value}>{payout}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Amount</Text>
        <Text style={styles.value}>{formatMoney(contract.amount)}</Text>
      </View>
      {contract.your_cut !== null && (
        <View style={styles.row}>
          <Text style={styles.label}>Your cut</Text>
          <Text style={styles.value}>{Math.round(contract.your_cut * 100)}%</Text>
        </View>
      )}
      <View style={styles.row}>
        <Text style={styles.label}>Duration</Text>
        <Text style={styles.value}>
          {isDraftType(contract) ? contract.duration : contract.duration_remaining} turns
          {expiry !== null && expiry <= 3 ? ' ⚠' : ''}
        </Text>
      </View>
      {contract.obligations_per_turn > 0 && (
        <View style={styles.row}>
          <Text style={styles.label}>Obligations</Text>
          <Text style={styles.value}>{formatMoney(contract.obligations_per_turn)}/turn</Text>
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
  value: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '500',
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
  defaultNote: {
    marginTop: Spacing.xs,
    color: Colors.textDim,
    fontSize: FontSize.xs,
    fontStyle: 'italic',
  },
});
