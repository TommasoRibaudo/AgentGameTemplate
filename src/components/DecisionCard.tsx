import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DecisionItem } from '../types/decision';
import { Contract, ContractDraft } from '../types/contract';
import { ContractSummary } from './ContractSummary';
import { canCounterDecisionItem } from './decision-card-rules';
import { Colors, FontSize, Spacing, Radius, formatDelta, formatMoney } from '../theme';

export interface DecisionCardProps {
  item: DecisionItem;
  clientName?: string;
  clientLabel?: string;
  entityLabel?: string;
  agentCutPercent?: number | null;
  isPushEnabled: boolean;
  previousContract?: Contract | null;
  onResolve: (itemId: string, optionKey: string) => void;
  onOpenCounter: (itemId: string, draft: ContractDraft) => void;
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
  agentCutPercent,
  isPushEnabled,
  previousContract,
  onResolve,
  onOpenCounter,
}: DecisionCardProps) {
  const isExpiringSoon = item.expires_in !== null && item.expires_in <= 1;
  const typeColor = TYPE_COLORS[item.type] ?? Colors.textSecondary;
  const visibleOptions = item.options.filter(
    o => o.key !== 'push' || isPushEnabled,
  );
  const canCounter = canCounterDecisionItem(item);
  const resolvedSummary = formatOutcomeSummary(item.resolved_outcome);

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
            agentCutPercent={agentCutPercent}
            previousContract={previousContract}
          />
        </View>
      )}

      {item.is_resolved ? (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>{item.resolved_result_label ?? 'Resolved'}</Text>
          <Text style={styles.resultBody}>
            {item.resolved_result_description ?? resolvedSummary}
          </Text>
          {item.resolved_result_description && item.resolved_outcome && (
            <Text style={styles.resultDelta}>{resolvedSummary}</Text>
          )}
        </View>
      ) : (
        <View style={styles.options}>
          {visibleOptions.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.optionBtn, optionStyle(opt.key)]}
              onPress={() => onResolve(item.id, opt.key)}
              accessibilityLabel={opt.label}
            >
              <Text style={[styles.optionText, opt.key === 'reject' && styles.optionRejectText]}>
                {formatOptionLabel(opt)}
              </Text>
            </TouchableOpacity>
          ))}
          {canCounter && item.contract_draft && (
            <TouchableOpacity
              style={[styles.optionBtn, styles.counterBtn]}
              onPress={() => onOpenCounter(item.id, item.contract_draft!)}
              accessibilityLabel="Counter offer"
            >
              <Text style={styles.optionText}>Counter</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function formatOptionLabel(option: DecisionItem['options'][number]): string {
  const deltas: string[] = [];
  const outcome = option.outcome;
  if (outcome.money_delta !== 0) deltas.push(formatMoney(outcome.money_delta));
  if (outcome.reputation_delta !== 0) deltas.push(`${formatDelta(outcome.reputation_delta)} rep`);
  if (option.key === 'push' && option.push_risk) deltas.push('uncertain');
  if (option.random_outcomes?.length) {
    deltas.push('chance');
  }
  return deltas.length ? `${option.label} (${deltas.join(', ')})` : option.label;
}

function formatOutcomeSummary(outcome?: DecisionItem['resolved_outcome']): string {
  if (!outcome) return 'No immediate change.';
  const deltas: string[] = [];
  if (outcome.money_delta !== 0) deltas.push(formatMoney(outcome.money_delta));
  if (outcome.reputation_delta !== 0) deltas.push(`${formatDelta(outcome.reputation_delta)} rep`);
  for (const [key, delta] of Object.entries(outcome.stat_deltas)) {
    if (delta !== 0) deltas.push(`${formatDelta(delta)} ${key}`);
  }
  return deltas.length ? deltas.join(', ') : 'No immediate change.';
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
  counterBtn: {
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  result: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  resultTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  resultBody: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  resultDelta: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
