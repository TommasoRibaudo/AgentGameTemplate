import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DecisionItem } from '../types/decision';
import { ContractSummary } from './ContractSummary';
import { Colors, FontSize, Spacing, Radius } from '../theme';

export interface DecisionCardProps {
  item: DecisionItem;
  clientName?: string;
  clientLabel?: string;
  entityLabel?: string;
  isPushEnabled: boolean;
  onResolve: (itemId: string, optionKey: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  contract_offer: 'CONTRACT',
  client_request: 'REQUEST',
  opportunity:    'OPPORTUNITY',
  renewal:        'RENEWAL',
};

const TYPE_COLORS: Record<string, string> = {
  contract_offer: Colors.accent,
  client_request: Colors.warning,
  opportunity:    Colors.positive,
  renewal:        Colors.textSecondary,
};

export function DecisionCard({
  item,
  clientName,
  clientLabel = 'Client',
  entityLabel = 'Entity',
  isPushEnabled,
  onResolve,
}: DecisionCardProps) {
  if (item.is_resolved) return null;

  const isExpiringSoon = item.expires_in !== null && item.expires_in <= 1;
  const typeColor = TYPE_COLORS[item.type] ?? Colors.textSecondary;
  const visibleOptions = item.options.filter(
    o => o.key !== 'push' || isPushEnabled,
  );

  return (
    <View style={[styles.card, isExpiringSoon && styles.cardUrgent]}>
      <View style={styles.header}>
        <View style={[styles.typeBadge, { backgroundColor: typeColor + '22', borderColor: typeColor }]}>
          <Text style={[styles.typeText, { color: typeColor }]}>
            {TYPE_LABELS[item.type] ?? item.type.toUpperCase()}
          </Text>
        </View>
        {clientName && <Text style={styles.clientName}>{clientName}</Text>}
        {item.expires_in !== null && (
          <Text style={[styles.expiry, isExpiringSoon && styles.expiryUrgent]}>
            {item.expires_in === 0 ? 'Expires now' : `${item.expires_in}t left`}
          </Text>
        )}
      </View>

      <Text style={styles.description}>{item.description}</Text>

      {item.contract_draft && (
        <View style={styles.summary}>
          <ContractSummary
            contract={item.contract_draft}
            isDraft
            clientLabel={clientLabel}
            entityLabel={entityLabel}
            showPosture={false}
          />
        </View>
      )}

      <View style={styles.options}>
        {visibleOptions.map(opt => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.optionBtn, optionStyle(opt.key)]}
            onPress={() => onResolve(item.id, opt.key)}
            accessibilityLabel={opt.label}
          >
            <Text style={[styles.optionText, opt.key === 'reject' && styles.optionRejectText]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function optionStyle(key: string): object {
  if (key === 'approve') return { backgroundColor: Colors.positive };
  if (key === 'reject')  return { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border };
  if (key === 'push')    return { backgroundColor: Colors.warning };
  return { backgroundColor: Colors.accent };
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  cardUrgent: {
    borderColor: Colors.warning,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  typeBadge: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  typeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  clientName: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  expiry: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
  },
  expiryUrgent: {
    color: Colors.warning,
    fontWeight: '600',
  },
  description: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  summary: {
    marginTop: Spacing.xs,
  },
  options: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  optionBtn: {
    flex: 1,
    minWidth: 80,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  optionText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  optionRejectText: {
    color: Colors.textSecondary,
  },
});
