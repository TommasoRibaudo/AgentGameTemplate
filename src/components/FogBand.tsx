import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FoggedStat } from '../types/client';
import { Colors, FontSize, Spacing, Radius } from '../theme';

export interface FogBandProps {
  label: string;
  stat: FoggedStat;
  trackMin?: number;
  trackMax?: number;
  showInvested?: boolean;
  size?: 'compact' | 'full';
}

export function FogBand({
  label,
  stat,
  trackMin = 0,
  trackMax = 100,
  showInvested,
  size = 'full',
}: FogBandProps) {
  const range   = Math.max(trackMax - trackMin, 1);
  const leftPct = Math.max((stat.observed_min - trackMin) / range, 0);
  const bandPct = Math.max((stat.observed_max - stat.observed_min) / range, 0.02);
  // clamp so flexes sum ≤ 1
  const rightPct = Math.max(1 - leftPct - bandPct, 0);

  const span = stat.observed_max - stat.observed_min;
  const mid  = Math.round((stat.observed_min + stat.observed_max) / 2);
  const rangeLabel = span <= 2 ? `~${mid}` : `${Math.round(stat.observed_min)}–${Math.round(stat.observed_max)}`;

  if (size === 'compact') {
    return (
      <View style={styles.compactRow}>
        <Text style={styles.compactLabel} numberOfLines={1}>{label}</Text>
        <View style={styles.track}>
          <View style={{ flex: leftPct }} />
          <View style={[styles.band, { flex: bandPct }]} />
          <View style={{ flex: rightPct }} />
        </View>
        <Text style={styles.compactValue}>{rangeLabel}</Text>
      </View>
    );
  }

  return (
    <View style={styles.fullWrap}>
      <View style={styles.fullHeader}>
        <Text style={styles.fullLabel}>{label}</Text>
        <Text style={styles.fullValue}>{rangeLabel}</Text>
      </View>
      <View style={styles.trackFull}>
        <View style={{ flex: leftPct }} />
        <View style={[styles.band, { flex: bandPct }]} />
        <View style={{ flex: rightPct }} />
      </View>
      {showInvested && stat.scouting_invested > 0 && (
        <Text style={styles.invested}>{stat.scouting_invested} scouting invested</Text>
      )}
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
    width: 48,
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
  invested: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
  },
});
