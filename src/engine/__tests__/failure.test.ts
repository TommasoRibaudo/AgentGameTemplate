import {
  computeCreditCeiling,
  computeCreditHeadroom,
  openDebtState,
  serviceDebt,
  checkFailureCondition,
  computeCareerScore,
  retireVoluntarily,
  takeLoan,
} from '../failure';
import { makeRunState, makeClient, makeContract, makeManifest, makeDebtState, makeAgentState, nextId } from './fixtures';

// ─── computeCreditCeiling ─────────────────────────────────────────────────────

describe('failure — computeCreditCeiling', () => {
  it('returns rep × rep_weight when roster is empty', () => {
    const manifest = makeManifest();
    const state = makeRunState({ reputation: 60 });
    const ceiling = computeCreditCeiling(state, manifest);
    expect(ceiling).toBe(Math.round(60 * manifest.economy.credit_ceiling_rep_weight));
  });

  it('rounds credit ceiling to the displayed thousand bucket', () => {
    const manifest = makeManifest();
    const state = makeRunState({ reputation: 51 });
    expect(computeCreditCeiling(state, manifest)).toBe(3_000);
  });

  it('increases when clients have entity contracts', () => {
    const manifest = makeManifest();
    const clientId = nextId();
    const contractId = nextId();
    const client = makeClient({ id: clientId, agent_contract_id: contractId });
    const agentContract = makeContract({ id: contractId, tier: 'agent_client', client_id: clientId, your_cut: 15 });
    const entityContract = makeContract({ tier: 'client_entity', client_id: clientId, payout_type: 'per_month', amount: 10_000 });
    const stateEmpty = makeRunState({ reputation: 50 });
    const stateWithClient = makeRunState({
      reputation: 50,
      roster: [client],
      contracts: [agentContract, entityContract],
    });
    expect(computeCreditCeiling(stateWithClient, manifest)).toBeGreaterThan(computeCreditCeiling(stateEmpty, manifest));
  });

  it('rounds available credit to the displayed thousand bucket', () => {
    const manifest = makeManifest();
    const state = makeRunState({
      reputation: 100,
      debt: makeDebtState({ is_active: true, balance: 2_500 }),
    });
    expect(computeCreditHeadroom(state, manifest)).toBe(3_000);
  });
});

// ─── openDebtState ────────────────────────────────────────────────────────────

describe('failure — openDebtState', () => {
  it('activates the debt state', () => {
    const state = makeRunState({ money: 0 });
    const result = openDebtState(state, makeManifest());
    expect(result.debt.is_active).toBe(true);
  });

  it('sets credit_ceiling based on current reputation', () => {
    const manifest = makeManifest();
    const state = makeRunState({ reputation: 50 });
    const result = openDebtState(state, manifest);
    expect(result.debt.credit_ceiling).toBeGreaterThan(0);
  });

  it('is idempotent when debt already active', () => {
    const state = makeRunState({ debt: makeDebtState({ is_active: true, balance: 2000 }) });
    const result = openDebtState(state, makeManifest());
    expect(result.debt.balance).toBe(2000);
  });
});

// ─── takeLoan ─────────────────────────────────────────────────────────────────

describe('failure — takeLoan', () => {
  it('adds loan amount to money and debt balance', () => {
    const manifest = makeManifest();
    const state = makeRunState({ money: 0, reputation: 80 }); // gives ceiling ~4000
    const result = takeLoan(state, 1000, manifest);
    expect(result.money).toBe(1000);
    expect(result.debt.balance).toBe(1000);
  });

  it('does nothing if amount exceeds credit headroom', () => {
    const state = makeRunState({ money: 0, reputation: 0 }); // ceiling ~0
    const result = takeLoan(state, 10_000, makeManifest());
    expect(result.money).toBe(0);
  });

  it('allows a loan equal to rounded displayed credit headroom', () => {
    const manifest = makeManifest();
    const state = makeRunState({
      money: 0,
      reputation: 100,
      debt: makeDebtState({ is_active: true, balance: 2_500 }),
    });
    const result = takeLoan(state, 3_000, manifest);
    expect(result.money).toBe(3_000);
    expect(result.debt.balance).toBe(5_500);
  });

  it('does nothing for amount <= 0', () => {
    const state = makeRunState({ reputation: 80 });
    const result = takeLoan(state, 0, makeManifest());
    expect(result.money).toBe(state.money);
  });
});

// ─── serviceDebt ─────────────────────────────────────────────────────────────

describe('failure — serviceDebt', () => {
  it('repays debt when money is sufficient', () => {
    const manifest = makeManifest();
    const state = makeRunState({
      money: 5_000,
      reputation: 50,
      debt: makeDebtState({ is_active: true, balance: 2_000, per_turn_repayment: 200 }),
    });
    const result = serviceDebt(state, manifest);
    expect(result.money).toBe(4_800);
    expect(result.debt.balance).toBe(1_890);
    expect(result.debt.per_turn_repayment).toBe(95);
  });

  it('closes debt when balance reaches 0', () => {
    const manifest = makeManifest();
    const state = makeRunState({
      money: 5_000,
      debt: makeDebtState({ is_active: true, balance: 100, per_turn_repayment: 200 }),
    });
    const result = serviceDebt(state, manifest);
    expect(result.debt.is_active).toBe(false);
  });

  it('sets bankruptcy_warning when cannot repay even with credit headroom', () => {
    const manifest = makeManifest();
    const state = makeRunState({
      money: 0,
      reputation: 80,
      debt: makeDebtState({ is_active: true, balance: 1_000, per_turn_repayment: 500, credit_ceiling: 4_000 }),
    });
    const result = serviceDebt(state, manifest);
    expect(result.debt.bankruptcy_warning_turns_remaining).toBe(1);
    expect(result.debt.balance).toBe(1_000);
    expect(result.money).toBe(0);
  });

  it('sets bankruptcy_warning when cannot repay and no headroom', () => {
    const manifest = makeManifest();
    const state = makeRunState({
      money: 0,
      reputation: 0, // ceiling = 0
      debt: makeDebtState({ is_active: true, balance: 5_000, per_turn_repayment: 500, credit_ceiling: 0 }),
    });
    const result = serviceDebt(state, manifest);
    expect(result.debt.bankruptcy_warning_turns_remaining).not.toBeNull();
  });

  it('resets bankruptcy warning on successful repayment', () => {
    const manifest = makeManifest();
    const state = makeRunState({
      money: 5_000,
      reputation: 50,
      debt: makeDebtState({
        is_active: true,
        balance: 500,
        per_turn_repayment: 50,
        bankruptcy_warning_turns_remaining: 1,
      }),
    });
    const result = serviceDebt(state, manifest);
    expect(result.debt.bankruptcy_warning_turns_remaining).toBeNull();
  });

  it('returns state unchanged when debt is active but balance is already 0', () => {
    const manifest = makeManifest();
    const state = makeRunState({
      money: 5_000,
      debt: makeDebtState({ is_active: true, balance: 0, per_turn_repayment: 200 }),
    });
    const result = serviceDebt(state, manifest);
    expect(result).toBe(state);
  });

  it('decrements existing bankruptcy_warning_turns_remaining when cannot repay', () => {
    const manifest = makeManifest();
    const state = makeRunState({
      money: 0,
      reputation: 0,
      debt: makeDebtState({
        is_active: true,
        balance: 5_000,
        per_turn_repayment: 500,
        credit_ceiling: 0,
        bankruptcy_warning_turns_remaining: 3,  // already set → should decrement to 2
      }),
    });
    const result = serviceDebt(state, manifest);
    expect(result.debt.bankruptcy_warning_turns_remaining).toBe(2);
  });
});

// ─── checkFailureCondition ────────────────────────────────────────────────────

describe('failure — checkFailureCondition', () => {
  it('does nothing when no debt', () => {
    const state = makeRunState();
    const result = checkFailureCondition(state, makeManifest());
    expect(result.is_active).toBe(true);
  });

  it('ends run with bankrupt when warning_turns_remaining <= 0', () => {
    const state = makeRunState({
      debt: makeDebtState({ is_active: true, bankruptcy_warning_turns_remaining: 0 }),
    });
    const result = checkFailureCondition(state, makeManifest());
    expect(result.is_active).toBe(false);
    expect(result.end_condition).toBe('bankrupt');
  });

  it('does not trigger failure when warning still has turns left', () => {
    const state = makeRunState({
      debt: makeDebtState({ is_active: true, bankruptcy_warning_turns_remaining: 2 }),
    });
    const result = checkFailureCondition(state, makeManifest());
    expect(result.is_active).toBe(true);
  });
});

// ─── computeCareerScore ───────────────────────────────────────────────────────

describe('failure — computeCareerScore', () => {
  it('sums rep, earnings, and development components', () => {
    const state = makeRunState({ peak_reputation: 70, total_earnings: 100_000, clients_developed: 3 });
    const score = computeCareerScore(state);
    const expected = 70 * 100 + Math.round(100_000 / 100) + 3 * 500;
    expect(score).toBe(expected);
  });

  it('adds a fan-base score component', () => {
    const state = makeRunState({ peak_reputation: 0, total_earnings: 0, clients_developed: 0, roster: [makeClient({ audience: 25_000 })] });
    expect(computeCareerScore(state)).toBe(250);
  });

  it('returns 0 for a blank run', () => {
    const state = makeRunState({ peak_reputation: 0, total_earnings: 0, clients_developed: 0 });
    expect(computeCareerScore(state)).toBe(0);
  });
});

// ─── retireVoluntarily ────────────────────────────────────────────────────────

describe('failure — retireVoluntarily', () => {
  it('ends run with "retired" when in decision phase', () => {
    const state = makeRunState({ phase: 'decision' });
    const result = retireVoluntarily(state, makeManifest());
    expect(result.is_active).toBe(false);
    expect(result.end_condition).toBe('retired');
  });

  it('does nothing when not in decision phase', () => {
    const state = makeRunState({ phase: 'turn_open' });
    const result = retireVoluntarily(state, makeManifest());
    expect(result.is_active).toBe(true);
  });
});
