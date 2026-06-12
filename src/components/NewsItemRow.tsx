import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NewsItem, NewsItemType } from '../types/run';
import { Colors, FontSize, Spacing } from '../theme';
import { DeltaText } from './DeltaText';

export interface NewsItemRowProps {
  item: NewsItem;
  clientName?: string;
  reputationLabel?: string;
}

export const NEWS_ITEM_ICONS: Record<NewsItemType, string> = {
  campaign_installment: '★',
  campaign_ended:       '✔',
  income_received:      '$',
  client_milestone:     '◆',
  event_fired:          '!',
  contract_activated:   '✓',
  contract_expired:     '✗',
  debt_opened:          '!',
  debt_repayment:       '$',
  debt_missed:          '!',
  debt_recovered:       '$',
  agency_spend:         '$',
  upkeep_summary:       '↻',
};

export function NewsItemRow({ item, clientName, reputationLabel = 'Reputation' }: NewsItemRowProps) {
  const icon = NEWS_ITEM_ICONS[item.type];
  const hasDelta = item.money_delta !== null || item.reputation_delta !== null || item.fan_delta !== null;

  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.description} numberOfLines={2}>
          {item.description}
          {clientName ? ` · ${clientName}` : ''}
        </Text>
        {hasDelta && (
          <View style={styles.deltas}>
            {item.money_delta !== null && item.money_delta !== 0 && (
              <DeltaText value={item.money_delta} kind="money" style={styles.delta} />
            )}
            {item.reputation_delta !== null && item.reputation_delta !== 0 && (
              <DeltaText value={item.reputation_delta} label={reputationLabel} style={styles.delta} />
            )}
            {item.fan_delta !== null && item.fan_delta !== 0 && (
              <DeltaText value={item.fan_delta} label="fans" style={styles.delta} />
            )}
          </View>
        )}
      </View>
      <Text style={styles.turn}>W{item.turn_number}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  icon: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  description: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  deltas: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  delta: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  turn: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    marginTop: 4,
  },
});
