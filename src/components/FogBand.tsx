import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FoggedStat } from '../types/client';
import { Colors, FontSize, Spacing, Radius } from '../theme';
import { getFogEstimateTextColor } from './fog-band-colors';
import { formatFogStatDisplay } from './fog-band-display';

export interface FogBandProps {
  label: string;
  stat: FoggedStat;
  trackMin?: number;
  trackMax?: number;
  size?: 'compact' | 'full';
}

export function FogBand({
  label,
  stat,
  trackMin = 0,
  trackMax = 100,
  size = 'full',
}: FogBandProps) {
  const range     = Math.max(trackMax - trackMin, 1);
  const leftPct   = Math.max((stat.observed_min - trackMin) / range, 0);
  const isPerfect = stat.observed_min === stat.observed_max;
  const bandPct   = isPerfect ? 0 : Math.max((stat.observed_max - stat.observed_min) / range, 0.02);
  // clamp so flexes sum ≤ 1
  const rightPct  = Math.max(1 - leftPct - bandPct, 0);

  const statDisplay = formatFogStatDisplay(stat);
  const estimateTextColor = getFogEstimateTextColor(stat, trackMin, trackMax);

  const bandElement = isPerfect
    ? <View style={[styles.band, styles.bandLine]} />
    : <View style={[styles.band, { flex: bandPct }]} />;

  if (size === 'compact') {
    return (
      <View
        style={styles.compactRow}
        accessibilityLabel={`${label} ${statDisplay.isEstimate ? 'estimate ' : ''}${statDisplay.accessibilityValue}`}
      >
        <Text style={styles.compactLabel} numberOfLines={1}>{label}</Text>
        <View style={styles.track}>
          <View style={{ flex: leftPct }} />
          {bandElement}
          <View style={{ flex: rightPct }} />
        </View>
        <Text style={[styles.compactValue, { color: estimateTextColor }]} numberOfLines={1}>{statDisplay.label}</Text>
      </View>
    );
  }

  return (
    <View style={styles.fullWrap}>
      <View style={styles.fullHeader}>
        <Text style={styles.fullLabel}>{label}</Text>
        <Text style={[styles.fullValue, { color: estimateTextColor }]}>{statDisplay.label}</Text>
      </View>
      <View style={styles.trackFull}>
        <View style={{ flex: leftPct }} />
        {bandElement}
        <View style={{ flex: rightPct }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  compactLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    width: 72,
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    height: 6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.fog,
    overflow: 'hidden',
  },
  compactValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    width: 72,
    textAlign: 'right',
  },
  fullWrap: {
    gap: Spacing.xs,
  },
  fullHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fullLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  fullValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  trackFull: {
    flexDirection: 'row',
    height: 10,
    borderRadius: Radius.sm,
    backgroundColor: Colors.fog,
    overflow: 'hidden',
  },
  band: {
    backgroundColor: Colors.accent,
  },
  bandLine: {
    width: 2,
  },
});
