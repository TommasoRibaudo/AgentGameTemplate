import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Client } from '../types/client';
import { FogBand } from './FogBand';
import { Colors, FontSize, Spacing, Radius, ArcColors } from '../theme';

export interface ClientRowProps {
  client: Client;
  talentLabel: string;
  formLabel: string;
  hasCampaign: boolean;
  contractStatus: 'active' | 'expiring' | 'none';
  onPress: (clientId: string) => void;
}

export function ClientRow({
  client,
  talentLabel,
  formLabel,
  hasCampaign,
  contractStatus,
  onPress,
}: ClientRowProps) {
  const arcColor = ArcColors[client.arc_stage] ?? Colors.textSecondary;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(client.id)}
      accessibilityRole="button"
      accessibilityLabel={`View ${client.name}`}
    >
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>{client.name}</Text>
        <View style={styles.badges}>
          {hasCampaign && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>ON TOUR</Text>
            </View>
          )}
          {contractStatus === 'expiring' && (
            <View style={[styles.badge, styles.badgeWarn]}>
              <Text style={styles.badgeText}>EXPIRING</Text>
            </View>
          )}
          <View style={[styles.arcBadge, { borderColor: arcColor }]}>
            <Text style={[styles.arcText, { color: arcColor }]}>
              {client.arc_stage.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.stats}>
        <View style={styles.statItem}>
          <FogBand label={talentLabel} stat={client.stats.talent} size="compact" />
        </View>
        <View style={styles.statItem}>
          <FogBand label={formLabel} stat={client.stats.form} size="compact" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  name: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  badges: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  badge: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  badgeWarn: {
    backgroundColor: Colors.warning,
  },
  badgeText: {
    color: Colors.textPrimary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  arcBadge: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  arcText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  stats: {
    gap: Spacing.xs,
  },
  statItem: {},
});
