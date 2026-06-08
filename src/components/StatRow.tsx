import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CoreStatKey } from '../types/primitives';
import { FoggedStat } from '../types/client';
import { FogBand } from './FogBand';
import { Colors, FontSize, Spacing, Radius } from '../theme';

export interface StatRowProps {
  statKey: CoreStatKey;
  label: string;
  stat: FoggedStat;
  onInvest?: (statKey: CoreStatKey, amount: number) => void;
  canInvest?: boolean;
}

const INVEST_AMOUNT = 500;

export function StatRow({ statKey, label, stat, onInvest, canInvest }: StatRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.band}>
        <FogBand label={label} stat={stat} size="full" showInvested />
      </View>
      {onInvest && (
        <TouchableOpacity
          style={[styles.btn, !canInvest && styles.btnDisabled]}
          onPress={() => onInvest(statKey, INVEST_AMOUNT)}
          disabled={!canInvest}
          accessibilityLabel={`Invest ${INVEST_AMOUNT} in ${label}`}
        >
          <Text style={[styles.btnText, !canInvest && styles.btnTextDisabled]}>
            Invest
          </Text>
          <Text style={[styles.btnSub, !canInvest && styles.btnTextDisabled]}>
            ${INVEST_AMOUNT}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  band: {
    flex: 1,
  },
  btn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    minWidth: 64,
  },
  btnDisabled: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnText: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  btnSub: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    opacity: 0.8,
  },
  btnTextDisabled: {
    color: Colors.textDim,
  },
});
