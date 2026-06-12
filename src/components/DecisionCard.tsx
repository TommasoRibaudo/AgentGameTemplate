import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DecisionItem } from '../types/decision';
import { Contract, ContractDraft } from '../types/contract';
import { ContractSummary } from './ContractSummary';
import { canCounterDecisionItem } from './decision-card-rules';
import { Colors, FontSize, Spacing, Radius } from '../theme';
import { DeltaText } from './DeltaText';

export interface DecisionCardProps {
  item: DecisionItem;
  clientName?: string;
  clientLabel?: string;
  entityLabel?: string;
  reputationLabel?: string;
  agentCutPercent?: number | null;
  isPushEnabled: boolean;
  previousContract?: Contract | null;
  isTutorial?: boolean;
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
  reputationLabel = 'Reputation',
  agentCutPercent,
  isPushEnabled,
  previousContract,
  isTutorial = false,
  onResolve,
  onOpenCounter,
}: DecisionCardProps) {
  const isExpiringSoon = item.expires_in !== null && item.expires_in <= 1;
  const typeColor = isTutorial ? Colors.warning : (TYPE_COLORS[item.type] ?? Colors.textSecondary);
  const visibleOptions = item.options.filter(
    o => o.key !== 'push' || isPushEnabled,
  );
  const canCounter = canCounterDecisionItem(item);

  return (
    <View style={[styles.card, isExpiringSoon && styles.cardUrgent, isTutorial && styles.cardTutorial]}>
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
          {item.resolved_result_description ? (
            <Text style={styles.resultBody}>{item.resolved_result_description}</Text>
          ) : (
            <OutcomeSummaryText outcome={item.resolved_outcome} reputationLabel={reputationLabel} style={styles.resultBody} />
          )}
          {item.resolved_result_description && item.resolved_outcome && (
            <OutcomeSummaryText outcome={item.resolved_outcome} reputationLabel={reputationLabel} style={styles.resultDelta} />
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
              <OptionLabel option={opt} isReject={opt.key === 'reject'} reputationLabel={reputationLabel} />
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

type OutcomePart =
  | { type: 'delta'; value: number; kind?: 'money' | 'number'; label?: string }
  | { type: 'text'; text: string };

function OptionLabel({
  option,
  isReject,
  reputationLabel,
}: {
  option: DecisionItem['options'][number];
  isReject: boolean;
  reputationLabel: string;
}) {
  const parts = formatOptionParts(option, reputationLabel);

  if (parts.length === 0) {
    return <Text style={[styles.optionText, isReject && styles.optionRejectText]}>{option.label}</Text>;
  }

  return (
    <Text style={[styles.optionText, isReject && styles.optionRejectText]}>
      {option.label} (
      {parts.map((part, index) => (
        <React.Fragment key={`${part.type}-${index}`}>
          {index > 0 ? ', ' : ''}
          <OutcomePartText part={part} />
        </React.Fragment>
      ))}
      )
    </Text>
  );
}

function OutcomeSummaryText({
  outcome,
  reputationLabel,
  style,
}: {
  outcome?: DecisionItem['resolved_outcome'];
  reputationLabel: string;
  style: object;
}) {
  const parts = formatOutcomeParts(outcome, reputationLabel);

  if (parts.length === 0) {
    return <Text style={style}>No immediate change.</Text>;
  }

  return (
    <Text style={style}>
      {parts.map((part, index) => (
        <React.Fragment key={`${part.type}-${index}`}>
          {index > 0 ? ', ' : ''}
          <OutcomePartText part={part} />
        </React.Fragment>
      ))}
    </Text>
  );
}

function OutcomePartText({ part }: { part: OutcomePart }) {
  if (part.type === 'text') return <Text>{part.text}</Text>;
  return <DeltaText value={part.value} kind={part.kind} label={part.label} />;
}

function formatOptionParts(option: DecisionItem['options'][number], _reputationLabel: string): OutcomePart[] {
  const parts: OutcomePart[] = [];
  const outcome = option.outcome;
  if (outcome.money_delta < 0) parts.push({ type: 'delta', value: outcome.money_delta, kind: 'money' });
  return parts;
}

function formatOutcomeParts(outcome: DecisionItem['resolved_outcome'] | undefined, reputationLabel: string): OutcomePart[] {
  if (!outcome) return [];
  const parts: OutcomePart[] = [];
  if (outcome.money_delta !== 0) parts.push({ type: 'delta', value: outcome.money_delta, kind: 'money' });
  if (outcome.reputation_delta !== 0) parts.push({ type: 'delta', value: outcome.reputation_delta, label: reputationLabel });
  for (const [key, delta] of Object.entries(outcome.stat_deltas)) {
    if (delta !== 0) parts.push({ type: 'delta', value: delta, label: key });
  }
  return parts;
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
  cardTutorial: {
    borderColor: Colors.warning,
    shadowColor: Colors.warning,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
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
