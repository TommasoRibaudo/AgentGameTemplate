import { applyMoneyDelta, applyReputationDelta, computeMonthlyIncome, computeMonthlyExpenses, computeRepTier, settleObjectivePayouts, evaluateObjectiveConditions, estimateClientAssetValue, MAX_REPUTATION, MIN_REPUTATION } from '../resource';
import { makeRunState, makeClient, makeContract, makeManifest, makeObjective, makeClientStats, makeAgentState, nextId } from './fixtures';

describe('resource — applyMoneyDelta', () => {
  it('adds positive delta', () => {
    const s = applyMoneyDelta(makeRunState({ money: 1000 }), 500);
    expect(s.money).toBe(1500);
  });

  it('subtracts negative delta', () => {
    const s = applyMoneyDelta(makeRunState({ money: 1000 }), -300);
    expect(s.money).toBe(700);
  });

  it('clamps money to 0 — never negative', () => {
    const s = applyMoneyDelta(makeRunState({ money: 100 }), -500);
    expect(s.money).toBe(0);
  });

  it('sets low_money_warning when money first hits 0', () => {
    const s = applyMoneyDelta(makeRunState({ money: 100, low_money_warning: false }), -100);
    expect(s.low_money_warning).toBe(true);
  });

  it('does not set low_money_warning when money stays above 0', () => {
    const s = applyMoneyDelta(makeRunState({ money: 1000, low_money_warning: false }), -500);
    expect(s.low_money_warning).toBe(false);
  });

  it('accumulates total_earnings on positive delta', () => {
    const s = applyMoneyDelta(makeRunState({ total_earnings: 5000 }), 2000);
    expect(s.total_earnings).toBe(7000);
  });

  it('does not change total_earnings on negative delta', () => {
    const s = applyMoneyDelta(makeRunState({ total_earnings: 5000 }), -1000);
    expect(s.total_earnings).toBe(5000);
  });
});

describe('resource — applyReputationDelta', () => {
  it('adds positive delta', () => {
    const s = applyReputationDelta(makeRunState({ reputation: 50 }), 10);
    expect(s.reputation).toBe(60);
  });

  it('clamps to MAX_REPUTATION', () => {
    const s = applyReputationDelta(makeRunState({ reputation: 95 }), 20);
    expect(s.reputation).toBe(MAX_REPUTATION);
  });

  it('clamps to MIN_REPUTATION', () => {
    const s = applyReputationDelta(makeRunState({ reputation: 5 }), -20);
    expect(s.reputation).toBe(MIN_REPUTATION);
  });

  it('updates peak_reputation when new value is higher', () => {
    const s = applyReputationDelta(makeRunState({ reputation: 50, peak_reputation: 50 }), 10);
    expect(s.peak_reputation).toBe(60);
  });

  it('does not lower peak_reputation', () => {
    const s = applyReputationDelta(makeRunState({ reputation: 70, peak_reputation: 70 }), -20);
    expect(s.peak_reputation).toBe(70);
  });
});

describe('resource — computeMonthlyIncome', () => {
  it('returns 0 with empty roster', () => {
    expect(computeMonthlyIncome(makeRunState())).toBe(0);
  });

  it('computes cut from entity contracts', () => {
    const clientId = nextId();
    const agentContractId = nextId();
    const client = makeClient({ id: clientId, agent_contract_id: agentContractId });
    const agentContract = makeContract({
      id: agentContractId, tier: 'agent_client', client_id: clientId,
      your_cut: 20, payout_type: 'per_month', amount: 0,
    });
    const entityContract = makeContract({
      tier: 'client_entity', client_id: clientId, entity_id: nextId(),
      payout_type: 'per_month', amount: 10_000, your_cut: null,
    });
    const state = makeRunState({ roster: [client], contracts: [agentContract, entityContract] });
    // 20% of 10,000 = 2,000
    expect(computeMonthlyIncome(state)).toBe(2000);
  });

  it('ignores lump_sum and per_objective contracts in monthly income', () => {
    const clientId = nextId();
    const agentContractId = nextId();
    const client = makeClient({ id: clientId, agent_contract_id: agentContractId });
    const agentContract = makeContract({ id: agentContractId, tier: 'agent_client', client_id: clientId, your_cut: 15 });
    const lumpContract  = makeContract({ tier: 'client_entity', client_id: clientId, payout_type: 'lump_sum', amount: 50_000 });
    const state = makeRunState({ roster: [client], contracts: [agentContract, lumpContract] });
    expect(computeMonthlyIncome(state)).toBe(0);
  });

  it('skips client when agent contract has your_cut === null', () => {
    const clientId = nextId();
    const agentCtId = nextId();
    const client = makeClient({ id: clientId, agent_contract_id: agentCtId });
    // your_cut: null — this client's entity contracts should not contribute
    const agentContract  = makeContract({ id: agentCtId, tier: 'agent_client', client_id: clientId, your_cut: null });
    const entityContract = makeContract({ tier: 'client_entity', client_id: clientId, payout_type: 'per_month', amount: 10_000 });
    const state = makeRunState({ roster: [client], contracts: [agentContract, entityContract] });
    expect(computeMonthlyIncome(state)).toBe(0);
  });
});

describe('resource — computeMonthlyExpenses', () => {
  it('returns at least the overhead from manifest', () => {
    const manifest = makeManifest();
    const expenses = computeMonthlyExpenses(makeRunState(), manifest);
    expect(expenses).toBeGreaterThan(0);
    expect(expenses).toBeLessThanOrEqual(manifest.economy.overhead_per_turn);
  });

  it('adds client obligation costs', () => {
    const manifest = makeManifest();
    const clientId = nextId();
    const agentContractId = nextId();
    const client = makeClient({ id: clientId, agent_contract_id: agentContractId });
    const agentContract = makeContract({ id: agentContractId, tier: 'agent_client', client_id: clientId, obligations_per_turn: 200 });
    const base = computeMonthlyExpenses(makeRunState(), manifest);
    const withClient = computeMonthlyExpenses(makeRunState({ roster: [client], contracts: [agentContract] }), manifest);
    expect(withClient).toBeGreaterThan(base);
  });

  it('adds per_turn_cost from active defense tracks', () => {
    const manifest = makeManifest();
    const base = computeMonthlyExpenses(makeRunState(), manifest);
    const withTrack = computeMonthlyExpenses(
      makeRunState({ agent: makeAgentState({ defense_tracks: [{ key: 'pr', level: 1, per_turn_cost: 300 }] }) }),
      manifest,
    );
    expect(withTrack).toBe(base + 300);
  });

  it('does not add obligation cost when agent_contract_id is set but contract is missing', () => {
    const manifest = makeManifest();
    const clientId = nextId();
    // Client has agent_contract_id pointing to a non-existent contract
    const client = makeClient({ id: clientId, agent_contract_id: 'ghost_contract_id' });
    const base     = computeMonthlyExpenses(makeRunState(), manifest);
    const withGhost = computeMonthlyExpenses(makeRunState({ roster: [client] }), manifest);
    // Ghost contract not found → ac is falsy → no obligation added
    expect(withGhost).toBe(base);
  });
});

describe('resource — computeRepTier', () => {
  it('grassroots below 25', () => { expect(computeRepTier(0)).toBe('grassroots'); });
  it('regional 25–49',     () => { expect(computeRepTier(25)).toBe('regional'); });
  it('national 50–74',     () => { expect(computeRepTier(50)).toBe('national'); });
  it('elite 75+',          () => { expect(computeRepTier(75)).toBe('elite'); });
  it('elite at max',       () => { expect(computeRepTier(100)).toBe('elite'); });
});

describe('resource — settleObjectivePayouts', () => {
  it('pays out met-but-unpaid objectives', () => {
    const obj = makeObjective({ payout: 5000, is_met: true, is_paid: false });
    const contract = makeContract({ payout_type: 'per_objective', objectives: [obj] });
    const state = makeRunState({ money: 1000, contracts: [contract] });
    const { state: result, settledContractIds } = settleObjectivePayouts(state, makeManifest());
    expect(result.money).toBe(6000);
    expect(settledContractIds).toContain(contract.id);
    expect(result.contracts[0].objectives[0].is_paid).toBe(true);
  });

  it('does not double-pay already-paid objectives', () => {
    const obj = makeObjective({ payout: 5000, is_met: true, is_paid: true });
    const contract = makeContract({ payout_type: 'per_objective', objectives: [obj] });
    const state = makeRunState({ money: 1000, contracts: [contract] });
    const { state: result } = settleObjectivePayouts(state, makeManifest());
    expect(result.money).toBe(1000);
  });
});

// ─── evaluateObjectiveConditions ─────────────────────────────────────────────

describe('resource — evaluateObjectiveConditions', () => {
  it('marks peak_arc objective as is_met when client is at peak stage', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId, arc_stage: 'peak' });
    const obj      = makeObjective({ condition_key: 'peak_arc', is_met: false });
    const contract = makeContract({ client_id: clientId, payout_type: 'per_objective', objectives: [obj] });
    const state    = makeRunState({ roster: [client], contracts: [contract] });
    const result   = evaluateObjectiveConditions(state);
    expect(result.contracts[0].objectives[0].is_met).toBe(true);
  });

  it('does NOT mark peak_arc as is_met when client is rising', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId, arc_stage: 'rising' });
    const obj      = makeObjective({ condition_key: 'peak_arc', is_met: false });
    const contract = makeContract({ client_id: clientId, payout_type: 'per_objective', objectives: [obj] });
    const state    = makeRunState({ roster: [client], contracts: [contract] });
    const result   = evaluateObjectiveConditions(state);
    expect(result.contracts[0].objectives[0].is_met).toBe(false);
  });

  it('marks high_form objective as is_met when client form >= 70', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId, stats: makeClientStats({ form: 75 }) });
    const obj      = makeObjective({ condition_key: 'high_form', is_met: false });
    const contract = makeContract({ client_id: clientId, payout_type: 'per_objective', objectives: [obj] });
    const state    = makeRunState({ roster: [client], contracts: [contract] });
    const result   = evaluateObjectiveConditions(state);
    expect(result.contracts[0].objectives[0].is_met).toBe(true);
  });

  it('does NOT mark high_form as is_met when client form < 70', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId, stats: makeClientStats({ form: 60 }) });
    const obj      = makeObjective({ condition_key: 'high_form', is_met: false });
    const contract = makeContract({ client_id: clientId, payout_type: 'per_objective', objectives: [obj] });
    const state    = makeRunState({ roster: [client], contracts: [contract] });
    const result   = evaluateObjectiveConditions(state);
    expect(result.contracts[0].objectives[0].is_met).toBe(false);
  });

  it('skips objectives that are already met', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId, arc_stage: 'peak' });
    const obj      = makeObjective({ condition_key: 'peak_arc', is_met: true });
    const contract = makeContract({ client_id: clientId, payout_type: 'per_objective', objectives: [obj] });
    const state    = makeRunState({ roster: [client], contracts: [contract] });
    const result   = evaluateObjectiveConditions(state);
    // should return same state reference when nothing changes
    expect(result).toBe(state);
  });

  it('never marks an unknown condition_key as is_met', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId, arc_stage: 'peak' });
    const obj      = makeObjective({ condition_key: 'made_up_condition', is_met: false });
    const contract = makeContract({ client_id: clientId, payout_type: 'per_objective', objectives: [obj] });
    const state    = makeRunState({ roster: [client], contracts: [contract] });
    const result   = evaluateObjectiveConditions(state);
    expect(result.contracts[0].objectives[0].is_met).toBe(false);
  });

  it('integration: evaluate then settle pays out the objective', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId, arc_stage: 'peak' });
    const obj      = makeObjective({ payout: 10_000, condition_key: 'peak_arc', is_met: false, is_paid: false });
    const contract = makeContract({ client_id: clientId, payout_type: 'per_objective', objectives: [obj] });
    const state    = makeRunState({ money: 1_000, roster: [client], contracts: [contract] });
    const evaluated = evaluateObjectiveConditions(state);
    const { state: paid } = settleObjectivePayouts(evaluated, makeManifest());
    expect(paid.money).toBe(11_000);
    expect(paid.contracts[0].objectives[0].is_paid).toBe(true);
  });

  it('marks turns_active_4 when contract turns_active >= 4', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const obj      = makeObjective({ condition_key: 'turns_active_4', is_met: false });
    const contract = makeContract({ client_id: clientId, payout_type: 'per_objective', objectives: [obj], turns_active: 5 });
    const state    = makeRunState({ roster: [client], contracts: [contract] });
    const result   = evaluateObjectiveConditions(state);
    expect(result.contracts[0].objectives[0].is_met).toBe(true);
  });

  it('marks turns_active_8 when contract turns_active >= 8', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const obj      = makeObjective({ condition_key: 'turns_active_8', is_met: false });
    const contract = makeContract({ client_id: clientId, payout_type: 'per_objective', objectives: [obj], turns_active: 8 });
    const state    = makeRunState({ roster: [client], contracts: [contract] });
    const result   = evaluateObjectiveConditions(state);
    expect(result.contracts[0].objectives[0].is_met).toBe(true);
  });
});

// ─── estimateClientAssetValue ─────────────────────────────────────────────────

describe('resource — estimateClientAssetValue', () => {
  it('returns 0 for a client with no entity contracts', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const state    = makeRunState({ roster: [client] });
    const value    = estimateClientAssetValue(state, clientId, makeManifest());
    expect(value).toBe(0);
  });

  it('estimates value from a per_month entity contract', () => {
    const clientId      = nextId();
    const agentCtId     = nextId();
    const client        = makeClient({ id: clientId, agent_contract_id: agentCtId });
    const agentContract = makeContract({ id: agentCtId, tier: 'agent_client', client_id: clientId, your_cut: 20 });
    const entityContract = makeContract({ tier: 'client_entity', client_id: clientId, entity_id: nextId(), payout_type: 'per_month', amount: 10_000, your_cut: null, duration_remaining: 6 });
    const state = makeRunState({ roster: [client], contracts: [agentContract, entityContract] });
    const value = estimateClientAssetValue(state, clientId, makeManifest());
    expect(value).toBeGreaterThan(0);
  });

  it('estimates value from a lump_sum entity contract', () => {
    const clientId       = nextId();
    const agentCtId      = nextId();
    const client         = makeClient({ id: clientId, agent_contract_id: agentCtId });
    const agentContract  = makeContract({ id: agentCtId, tier: 'agent_client', client_id: clientId, your_cut: 15 });
    const entityContract = makeContract({ tier: 'client_entity', client_id: clientId, entity_id: nextId(), payout_type: 'lump_sum', amount: 50_000, your_cut: null });
    const state = makeRunState({ roster: [client], contracts: [agentContract, entityContract] });
    const value = estimateClientAssetValue(state, clientId, makeManifest());
    expect(value).toBeGreaterThan(0);
  });

  it('estimates value from a per_objective entity contract', () => {
    const clientId       = nextId();
    const agentCtId      = nextId();
    const client         = makeClient({ id: clientId, agent_contract_id: agentCtId });
    const agentContract  = makeContract({ id: agentCtId, tier: 'agent_client', client_id: clientId, your_cut: 15 });
    const obj1           = makeObjective({ payout: 8_000, is_paid: false });
    const obj2           = makeObjective({ payout: 5_000, is_paid: true });
    const entityContract = makeContract({ tier: 'client_entity', client_id: clientId, entity_id: nextId(), payout_type: 'per_objective', amount: 0, your_cut: null, objectives: [obj1, obj2] });
    const state = makeRunState({ roster: [client], contracts: [agentContract, entityContract] });
    const value = estimateClientAssetValue(state, clientId, makeManifest());
    expect(value).toBeGreaterThan(0);
  });

  it('returns 0 for unknown clientId (client not in roster)', () => {
    const state = makeRunState({ roster: [] });
    expect(estimateClientAssetValue(state, 'unknown_id', makeManifest())).toBe(0);
  });

  it('uses default cut of 15 when client has no agent_contract_id', () => {
    const clientId       = nextId();
    const client         = makeClient({ id: clientId, agent_contract_id: null });
    const entityContract = makeContract({ tier: 'client_entity', client_id: clientId, payout_type: 'per_month', amount: 10_000, your_cut: null, duration_remaining: 6 });
    const state = makeRunState({ roster: [client], contracts: [entityContract] });
    // agentContract null → cut defaults to 15
    const value = estimateClientAssetValue(state, clientId, makeManifest());
    expect(value).toBeGreaterThan(0);
  });

  it('handles per_objective contract with zero objectives without dividing by zero', () => {
    const clientId       = nextId();
    const agentCtId      = nextId();
    const client         = makeClient({ id: clientId, agent_contract_id: agentCtId });
    const agentContract  = makeContract({ id: agentCtId, tier: 'agent_client', client_id: clientId, your_cut: 15 });
    const entityContract = makeContract({ tier: 'client_entity', client_id: clientId, payout_type: 'per_objective', amount: 0, your_cut: null, objectives: [] });
    const state = makeRunState({ roster: [client], contracts: [agentContract, entityContract] });
    // objectives.length = 0 → avgPayout = 0/1 (uses || 1 guard), unpaid = 0 → value = 0
    expect(() => estimateClientAssetValue(state, clientId, makeManifest())).not.toThrow();
    expect(estimateClientAssetValue(state, clientId, makeManifest())).toBe(0);
  });
});
