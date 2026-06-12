import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CoreStatKey } from '../types/primitives';
import { FoggedStat } from '../types/client';
import { FogBand } from './FogBand';
import { Spacing } from '../theme';

export interface StatRowProps {
  statKey: CoreStatKey;
  label: string;
  stat: FoggedStat;
}

export function StatRow({ label, stat }: StatRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.band}>
        <FogBand label={label} stat={stat} size="full" />
      </View>
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
});
