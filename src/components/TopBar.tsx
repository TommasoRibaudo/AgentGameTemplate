import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing } from '../theme';
import { formatMoney } from '../theme';

export interface TopBarProps {
  money: number;
  reputation: number;
  rosterCount: number;
  rosterCapacity: number;
  turnNumber: number;
  careerLength: number;
  isInDebt: boolean;
  lowMoneyWarning: boolean;
  moneyLabel: string;
  reputationLabel: string;
}

export function TopBar({
  money,
  reputation,
  rosterCount,
  rosterCapacity,
  turnNumber,
  careerLength,
  isInDebt,
  lowMoneyWarning,
  moneyLabel,
  reputationLabel,
}: TopBarProps) {
  return (
    <View style={[styles.bar, lowMoneyWarning && styles.warnBg]}>
      <Cell label={moneyLabel} value={formatMoney(money)} valueStyle={money < 0 ? styles.negative : undefined} />
      <Divider />
      <Cell label={reputationLabel} value={String(reputation)} />
      <Divider />
      <Cell label="Roster" value={`${rosterCount}/${rosterCapacity}`} />
      <Divider />
      <Cell label="Turn" value={`${turnNumber}/${careerLength}`} />
      {isInDebt && (
        <View style={styles.debtBadge}>
          <Text style={styles.debtText}>DEBT</Text>
        </View>
      )}
    </View>
  );
}

function Cell({ label, value, valueStyle }: { label: string; value: string; valueStyle?: object }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, valueStyle]}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  warnBg: {
    backgroundColor: '#1A1208',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  cellLabel: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cellValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  negative: {
    color: Colors.negative,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
  debtBadge: {
    backgroundColor: Colors.negative,
    borderRadius: 3,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  debtText: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
