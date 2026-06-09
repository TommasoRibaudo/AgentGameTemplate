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
  const turnDate = formatTurnDate(turnNumber);

  return (
    <View style={[styles.bar, lowMoneyWarning && styles.warnBg]}>
      <Cell label={moneyLabel} value={formatMoney(money)} valueStyle={money < 0 ? styles.negative : undefined} />
      <Divider />
      <Cell label={reputationLabel} value={String(reputation)} />
      <Divider />
      <Cell label="Roster" value={`${rosterCount}/${rosterCapacity}`} />
      <Divider />
      <Cell label="Date" value={turnDate} />
      {lowMoneyWarning && (
        <View style={styles.warningBadge}>
          <Text style={styles.warningText}>LOW CASH</Text>
        </View>
      )}
      {isInDebt && (
        <View style={styles.debtBadge}>
          <Text style={styles.debtText}>DEBT</Text>
        </View>
      )}
    </View>
  );
}

function formatTurnDate(turnNumber: number): string {
  const date = new Date(new Date().getFullYear(), 0, 1);
  date.setDate(date.getDate() + Math.max(0, turnNumber - 1) * 7);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  warningBadge: {
    backgroundColor: Colors.warning,
    borderRadius: 3,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  warningText: {
    color: Colors.bg,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
