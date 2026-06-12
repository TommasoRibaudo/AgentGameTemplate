import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { resolvePortrait } from '../portraits';
import { Client } from '../types/client';
import { FogBand } from './FogBand';
import { Colors, FontSize, Spacing, Radius, ArcColors, formatAge } from '../theme';

export interface ClientRowProps {
  client: Client;
  talentLabel: string;
  formLabel: string;
  audienceLabel: string;
  hasCampaign: boolean;
  contractStatus: 'active' | 'expiring' | 'none';
  highlighted?: boolean;
  onPress: (clientId: string) => void;
}

export function ClientRow({
  client,
  talentLabel,
  formLabel,
  audienceLabel,
  hasCampaign,
  contractStatus,
  highlighted = false,
  onPress,
}: ClientRowProps) {
  const arcColor = ArcColors[client.arc_stage] ?? Colors.textSecondary;

  return (
    <TouchableOpacity
      style={[styles.row, highlighted && styles.rowHighlighted]}
      onPress={() => onPress(client.id)}
      accessibilityRole="button"
      accessibilityLabel={`View ${client.name}`}
    >
      <View style={styles.inner}>
        <Image source={resolvePortrait(client.portrait, client.id)} style={styles.portrait} />
        <View style={styles.content}>
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
            <View style={styles.audienceRow}>
              <Text style={styles.audienceLabel}>{audienceLabel} · Age {formatAge(client.age_weeks)}</Text>
              <Text style={styles.audienceValue}>{client.audience.toLocaleString()}</Text>
            </View>
            <View style={styles.statItem}>
              <FogBand label={talentLabel} stat={client.stats.talent} size="compact" />
            </View>
            <View style={styles.statItem}>
              <FogBand label={formLabel} stat={client.stats.form} size="compact" />
            </View>
          </View>
          {highlighted && (
            <Text style={styles.tutorialHint}>Tap to open their profile →</Text>
          )}
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
  rowHighlighted: {
    borderColor: Colors.warning,
    shadowColor: Colors.warning,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  tutorialHint: {
    color: Colors.warning,
    fontSize: FontSize.xs,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  portrait: {
    width: 64,
    height: 64,
  },
  content: {
    flex: 1,
    gap: Spacing.xs,
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
  audienceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  audienceLabel: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
  },
  audienceValue: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  statItem: {},
});
