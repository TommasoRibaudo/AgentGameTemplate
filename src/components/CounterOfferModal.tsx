import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { ContractDraft, CounterTerms } from '../types/contract';
import { PayoutType } from '../types/primitives';
import { computeCounterRange } from '../engine/decision-queue';
import { Colors, FontSize, Spacing, Radius, formatMoney } from '../theme';

export type CounterResult = 'accepted' | 'revised' | 'rejected';

interface Props {
  visible: boolean;
  draft: ContractDraft;
  negotiationLevel: number;
  reputationLabel?: string;
  result: CounterResult | null;
  onSubmit: (counter: CounterTerms) => void;
  onClose: () => void;
}

const AMOUNT_LABEL: Record<string, string> = {
  per_week:     'Weekly Payment',
  lump_sum:      'Lump Sum',
  per_objective: 'Milestone Payout',
};
const AMOUNT_DESC: Record<string, string> = {
  per_week:     'Paid to you each week the contract is active',
  lump_sum:      'Paid once immediately when the contract is signed',
  per_objective: 'Base value for each milestone payout',
};

export function CounterOfferModal({
  visible,
  draft,
  negotiationLevel,
  reputationLabel = 'Reputation',
  result,
  onSubmit,
  onClose,
}: Props) {
  const [payoutType,  setPayoutType]  = useState<PayoutType>(draft.payout_type);
  const [amount,      setAmount]      = useState('');
  const [cut,         setCut]         = useState('');
  const [duration,    setDuration]    = useState('');
  const [obligations, setObligations] = useState('');

  useEffect(() => {
    if (visible) {
      setPayoutType(draft.payout_type);
      setAmount(String(draft.amount));
      setCut(draft.your_cut !== null ? String(draft.your_cut) : '');
      setDuration(String(draft.duration));
      setObligations(String(draft.obligations_per_turn));
    }
  }, [visible, draft]);

  const counter = useMemo((): CounterTerms => {
    const t: CounterTerms = {};
    if (payoutType !== draft.payout_type)
      t.payout_type = payoutType;
    const amt = parseInt(amount, 10);
    if (!isNaN(amt) && amt > 0 && amt !== draft.amount)
      t.amount = amt;
    if (draft.your_cut !== null) {
      const c = parseInt(cut, 10);
      if (!isNaN(c) && c !== draft.your_cut)
        t.your_cut = Math.max(0, Math.min(50, c));
    }
    const dur = parseInt(duration, 10);
    if (!isNaN(dur) && dur > 0 && dur !== draft.duration)
      t.duration = dur;
    const obl = parseInt(obligations, 10);
    if (!isNaN(obl) && obl >= 0 && obl !== draft.obligations_per_turn)
      t.obligations_per_turn = obl;
    return t;
  }, [payoutType, amount, cut, duration, obligations, draft]);

  const hasChanges = Object.keys(counter).length > 0;

  const { probText, probColor } = useMemo(() => {
    if (!hasChanges) return { probText: '—', probColor: Colors.textDim };
    const { observed_min, observed_max } = computeCounterRange(negotiationLevel, draft, counter);
    const text  = `${Math.round(observed_min * 100)}–${Math.round(observed_max * 100)}%`;
    const color = observed_min >= 0.55 ? Colors.positive
                : observed_min >= 0.30 ? Colors.warning
                : Colors.negative;
    return { probText: text, probColor: color };
  }, [hasChanges, counter, negotiationLevel, draft]);

  const amountLabel = AMOUNT_LABEL[payoutType] ?? 'Amount';
  const amountDesc  = AMOUNT_DESC[payoutType]  ?? 'Total contract value';
  const canSwitchPayoutType = draft.payout_type !== 'per_objective';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheet}
        >
          <View style={styles.handle} />

          {result !== null ? (
            <ResultView result={result} reputationLabel={reputationLabel} onClose={onClose} />
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>Counter Offer</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.cancelBtn}>Cancel</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.body}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
              >
                {canSwitchPayoutType && (
                  <View style={styles.field}>
                    <View style={styles.fieldMeta}>
                      <View style={styles.fieldTextBlock}>
                        <Text style={styles.fieldLabel}>Payment Structure</Text>
                        <Text style={styles.fieldDesc}>Propose a different payout arrangement</Text>
                      </View>
                    </View>
                    <View style={styles.payoutToggle}>
                      {(['per_week', 'lump_sum'] as PayoutType[]).map(type => (
                        <TouchableOpacity
                          key={type}
                          style={[styles.payoutOption, payoutType === type && styles.payoutOptionActive]}
                          onPress={() => setPayoutType(type)}
                        >
                          <Text style={[styles.payoutOptionText, payoutType === type && styles.payoutOptionTextActive]}>
                            {AMOUNT_LABEL[type]}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                <Field
                  label={amountLabel}
                  description={amountDesc}
                  value={amount}
                  onChangeText={setAmount}
                  hint={`Current: ${formatMoney(draft.amount)}`}
                />

                {draft.your_cut !== null && (
                  <Field
                    label="Your Cut %"
                    description="Your share of the client's entity earnings you keep as commission"
                    value={cut}
                    onChangeText={setCut}
                    hint={`Current: ${draft.your_cut}%`}
                  />
                )}

                <Field
                  label="Duration (weeks)"
                  description="Number of weeks this contract runs before it expires"
                  value={duration}
                  onChangeText={setDuration}
                  hint={`Current: ${draft.duration}w`}
                />

                <Field
                  label="Obligations / turn"
                  description="Recurring cost you pay each turn while this contract is active"
                  value={obligations}
                  onChangeText={setObligations}
                  hint={`Current: ${formatMoney(draft.obligations_per_turn)}`}
                />

                <View style={styles.probRow}>
                  <View>
                    <Text style={styles.probLabel}>Acceptance chance</Text>
                    <Text style={styles.probSubLabel}>
                      {hasChanges ? 'Estimated range based on your Negotiation skill' : 'Change a term to see odds'}
                    </Text>
                  </View>
                  <Text style={[styles.probValue, { color: probColor }]}>{probText}</Text>
                </View>
              </ScrollView>

              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.submitBtn, !hasChanges && styles.submitBtnDisabled]}
                  onPress={() => hasChanges && onSubmit(counter)}
                  disabled={!hasChanges}
                >
                  <Text style={styles.submitText}>Send Counter</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function ResultView({
  result,
  reputationLabel,
  onClose,
}: {
  result: CounterResult;
  reputationLabel: string;
  onClose: () => void;
}) {
  const config = {
    accepted: {
      symbol: '✓',
      symbolColor: Colors.positive,
      headline: 'Accepted',
      headlineColor: Colors.positive,
      body: 'The counterparty agreed to your terms. The contract is now active.',
    },
    revised: {
      symbol: '↺',
      symbolColor: Colors.warning,
      headline: 'Revised',
      headlineColor: Colors.warning,
      body: 'They moved partway toward your terms. Review the updated offer — you can approve it, reject it, or counter again.',
    },
    rejected: {
      symbol: '✗',
      symbolColor: Colors.negative,
      headline: 'Rejected',
      headlineColor: Colors.negative,
      body: `They walked away from negotiations. Your ${reputationLabel.toLowerCase()} took a small hit (-1).`,
    },
  }[result];

  return (
    <View style={styles.resultContainer}>
      <Text style={[styles.resultSymbol, { color: config.symbolColor }]}>{config.symbol}</Text>
      <Text style={[styles.resultHeadline, { color: config.headlineColor }]}>{config.headline}</Text>
      <Text style={styles.resultBody}>{config.body}</Text>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

function Field({
  label, description, value, onChangeText, hint,
}: {
  label: string;
  description: string;
  value: string;
  onChangeText: (v: string) => void;
  hint: string;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldMeta}>
        <View style={styles.fieldTextBlock}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Text style={styles.fieldDesc}>{description}</Text>
        </View>
        <Text style={styles.fieldHint}>{hint}</Text>
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        selectTextOnFocus
        placeholderTextColor={Colors.textDim}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
    borderColor: Colors.border,
    maxHeight: '88%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  cancelBtn: {
    color: Colors.textDim,
    fontSize: FontSize.md,
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  field: {
    gap: Spacing.xs,
  },
  fieldMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  fieldTextBlock: {
    flex: 1,
    gap: 2,
  },
  fieldLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  fieldDesc: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  fieldHint: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    paddingTop: 2,
  },
  input: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  payoutToggle: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  payoutOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  payoutOptionActive: {
    backgroundColor: Colors.accent,
  },
  payoutOptionText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  payoutOptionTextActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  probRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.md,
  },
  probLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  probSubLabel: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  probValue: {
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  footer: {
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  submitBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.35,
  },
  submitText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  // ── Result view ──────────────────────────────────────────────────────────────
  resultContainer: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  resultSymbol: {
    fontSize: 48,
    fontWeight: '700',
  },
  resultHeadline: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  resultBody: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  closeBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  closeBtnText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
