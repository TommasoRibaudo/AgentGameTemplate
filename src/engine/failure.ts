import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { estimateClientAssetValue, applyMoneyDelta } from './resource';

// INVARIANTS (PRD §3.8):
// - Money = 0 opens the debt state. It does NOT end the run.
// - Failure checked ONLY at Turn Close.
// - Low-money warning fires IMMEDIATELY when money first drops to ≤ 0.
// - True bankruptcy = missed repayment WITH no credit headroom.
// - One-turn grace period before bankruptcy is final.

// ─── Warnings ─────────────────────────────────────────────────────────────────

export type FireLowMoneyWarning = (state: RunState) => RunState;

export const fireLowMoneyWarning: FireLowMoneyWarning = (state) =>
  state.money <= 0 && !state.low_money_warning
    ? { ...state, low_money_warning: true }
    : state;

// ─── Credit ceiling ───────────────────────────────────────────────────────────

export type ComputeCreditCeiling = (state: RunState, manifest: VariantManifest) => number;

export const roundCreditAmount = (amount: number): number => {
  if (amount <= 0) return 0;
  if (amount < 1_000) return Math.round(amount);
  return Math.round(amount / 1_000) * 1_000;
};

export const computeCreditCeiling: ComputeCreditCeiling = (state, manifest) => {
  const { credit_ceiling_rep_weight, credit_ceiling_asset_weight } = manifest.economy;
  const rosterAssetValue = state.roster.reduce(
    (sum, c) => sum + estimateClientAssetValue(state, c.id, manifest), 0,
  );
  return roundCreditAmount(
    state.reputation * credit_ceiling_rep_weight +
    rosterAssetValue * credit_ceiling_asset_weight,
  );
};

export type ComputeCreditHeadroom = (state: RunState, manifest: VariantManifest) => number;

export const computeCreditHeadroom: ComputeCreditHeadroom = (state, manifest) =>
  roundCreditAmount(computeCreditCeiling(state, manifest) - state.debt.balance);

// ─── Debt state ───────────────────────────────────────────────────────────────

export type OpenDebtState = (state: RunState, manifest: VariantManifest) => RunState;

export const openDebtState: OpenDebtState = (state, manifest) => {
  if (state.debt.is_active) return state;
  const ceiling = computeCreditCeiling(state, manifest);
  return {
    ...state,
    debt: {
      ...state.debt,
      is_active:              true,
      credit_ceiling:         ceiling,
      bankruptcy_warning_turns_remaining: null,
    },
  };
};

export type TakeLoan = (state: RunState, amount: number, manifest: VariantManifest) => RunState;

export const takeLoan: TakeLoan = (state, amount, manifest) => {
  const ceiling = computeCreditCeiling(state, manifest);
  const headroom = computeCreditHeadroom(state, manifest);
  if (amount > headroom || amount <= 0) return state;

  const newBalance     = state.debt.balance + amount;
  const repayment      = Math.round(newBalance * manifest.economy.debt_interest_rate);

  return {
    ...applyMoneyDelta(state, amount),
    debt: {
      ...state.debt,
      is_active:          true,
      balance:            newBalance,
      credit_ceiling:     ceiling,
      per_turn_repayment: repayment,
    },
  };
};

export type ServiceDebt = (state: RunState, manifest: VariantManifest) => RunState;

export const serviceDebt: ServiceDebt = (state, manifest) => {
  if (!state.debt.is_active || state.debt.balance <= 0) return state;

  const repayment = Math.min(state.debt.balance, state.debt.per_turn_repayment);
  const canRepay  = state.money >= repayment;
  const ceiling   = computeCreditCeiling(state, manifest);

  if (!canRepay) {
    // Missed repayment starts/advances the bankruptcy grace loop.
    const turnsLeft = state.debt.bankruptcy_warning_turns_remaining;
    return {
      ...state,
      debt: {
        ...state.debt,
        credit_ceiling: ceiling,
        bankruptcy_warning_turns_remaining: turnsLeft !== null ? turnsLeft - 1 : 1,
      },
      low_money_warning: true,
    };
  }

  // Normal repayment
  const balanceAfterRepayment = Math.max(0, state.debt.balance - repayment);
  const interest = Math.round(balanceAfterRepayment * manifest.economy.debt_interest_rate);
  const newBalance = balanceAfterRepayment > 0 ? balanceAfterRepayment + interest : 0;
  const nextRepayment = Math.round(newBalance * manifest.economy.debt_interest_rate);

  return {
    ...applyMoneyDelta(state, -repayment),
    debt: {
      ...state.debt,
      balance:            newBalance,
      credit_ceiling:     ceiling,
      per_turn_repayment: nextRepayment,
      is_active:          newBalance > 0,
      bankruptcy_warning_turns_remaining: null, // reset warning on successful repayment
    },
  };
};

// ─── Failure check (Turn Close only) ─────────────────────────────────────────

export type CheckFailureCondition = (state: RunState, manifest: VariantManifest) => RunState;

export const checkFailureCondition: CheckFailureCondition = (state, manifest) => {
  if (!state.debt.is_active) return state;

  const { bankruptcy_warning_turns_remaining } = state.debt;

  // Grace period expired → bankruptcy
  if (bankruptcy_warning_turns_remaining !== null && bankruptcy_warning_turns_remaining <= 0) {
    return endRun(state, 'bankrupt', manifest);
  }

  return state;
};

// ─── End of run ───────────────────────────────────────────────────────────────

export type ComputeCareerScore = (state: RunState) => number;

// Placeholder formula for open question §6.8
export const computeCareerScore: ComputeCareerScore = (state) => {
  const repScore        = state.peak_reputation * 100;
  const earningsScore   = Math.round(state.total_earnings / 100);
  const developedScore  = state.clients_developed * 500;
  const fanScore        = Math.round(state.roster.reduce((sum, c) => sum + c.audience, 0) / 100);
  return repScore + earningsScore + developedScore + fanScore;
};

export type EndRun = (
  state: RunState,
  condition: 'retired' | 'bankrupt' | 'clock_expired',
  manifest: VariantManifest,
) => RunState;

export const endRun: EndRun = (state, condition, _manifest) => ({
  ...state,
  is_active:     false,
  end_condition: condition,
  phase:         'turn_close',
});

export type RetireVoluntarily = (state: RunState, manifest: VariantManifest) => RunState;

export const retireVoluntarily: RetireVoluntarily = (state, manifest) =>
  state.phase === 'decision' ? endRun(state, 'retired', manifest) : state;
