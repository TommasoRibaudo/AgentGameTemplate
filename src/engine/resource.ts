import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { computeOperationsMultiplier } from './progression';

// INVARIANTS (PRD §3.1):
// - Money hitting 0 opens the debt state; it does NOT end the run.
// - Reputation cannot kill the player — it only gates access and offer quality.
// - Reputation is a single global number in core.

export type RepTier = 'grassroots' | 'regional' | 'national' | 'elite';

export const MAX_REPUTATION = 100;
export const MIN_REPUTATION = 0;
export const DEFAULT_AGENT_CUT = 15;

export const getAgentCutPercent = (state: RunState, clientId: string | null): number => {
  if (!clientId) return DEFAULT_AGENT_CUT;
  const client = state.roster.find(c => c.id === clientId);
  if (!client?.agent_contract_id) return DEFAULT_AGENT_CUT;
  const agentContract = state.contracts.find(c => c.id === client.agent_contract_id);
  if (!agentContract) return DEFAULT_AGENT_CUT;
  return agentContract.your_cut ?? 0;
};

export const computeAgencyPayout = (
  state: RunState,
  contract: Pick<RunState['contracts'][number], 'tier' | 'client_id'>,
  grossAmount: number,
): number =>
  contract.tier === 'client_entity'
    ? Math.round(grossAmount * (getAgentCutPercent(state, contract.client_id) / 100))
    : grossAmount;

// ─── Money ───────────────────────────────────────────────────────────────────

export type ApplyMoneyDelta = (state: RunState, delta: number) => RunState;

export const applyMoneyDelta: ApplyMoneyDelta = (state, delta) => {
  const raw = state.money + delta;
  const money = Math.max(0, raw);
  const hitZero = raw <= 0 && state.money > 0;
  return {
    ...state,
    money,
    total_earnings: delta > 0 ? state.total_earnings + delta : state.total_earnings,
    low_money_warning: hitZero || state.low_money_warning,
  };
};

export type EarnLumpSum = (state: RunState, amount: number, sourceContractId: string) => RunState;

export const earnLumpSum: EarnLumpSum = (state, amount, _sourceContractId) =>
  applyMoneyDelta(state, amount);

// ─── Reputation ──────────────────────────────────────────────────────────────

export type ApplyReputationDelta = (state: RunState, delta: number) => RunState;

export const applyReputationDelta: ApplyReputationDelta = (state, delta) => {
  const reputation = Math.max(MIN_REPUTATION, Math.min(MAX_REPUTATION, state.reputation + delta));
  return {
    ...state,
    reputation,
    peak_reputation: Math.max(state.peak_reputation, reputation),
  };
};

// ─── Monthly income / expenses ────────────────────────────────────────────────

export type ComputeMonthlyIncome = (state: RunState) => number;

// Income = sum over all clients of: entity_contract.amount × (agent_contract.your_cut / 100)
export const computeMonthlyIncome: ComputeMonthlyIncome = (state) => {
  let total = 0;
  for (const client of state.roster) {
    if (!client.agent_contract_id) continue;
    const agentContract = state.contracts.find(c => c.id === client.agent_contract_id);
    if (!agentContract || agentContract.your_cut === null) continue;

    const entityContracts = state.contracts.filter(
      c => c.tier === 'client_entity'
        && c.client_id === client.id
        && c.payout_type === 'per_month',
    );
    for (const ec of entityContracts) {
      total += ec.amount * (agentContract.your_cut / 100);
    }
  }
  return Math.round(total);
};

export type ComputeMonthlyExpenses = (state: RunState, manifest: VariantManifest) => number;

// Expenses = overhead + client obligations, both reduced by Operations level.
// Defense track recurring costs are NOT reduced by Operations (they're infrastructure costs).
export const computeMonthlyExpenses: ComputeMonthlyExpenses = (state, manifest) => {
  const opsMult = computeOperationsMultiplier(state.agent.stats.operations);
  let total = manifest.economy.overhead_per_turn * opsMult;

  for (const client of state.roster) {
    if (!client.agent_contract_id) continue;
    const ac = state.contracts.find(c => c.id === client.agent_contract_id);
    if (ac) total += ac.obligations_per_turn * opsMult;
  }

  for (const track of state.agent.defense_tracks) {
    total += track.per_turn_cost;
  }

  return Math.round(total);
};

// ─── Objective payouts ────────────────────────────────────────────────────────

export type SettleObjectivePayouts = (
  state: RunState,
  manifest: VariantManifest,
) => { state: RunState; settledContractIds: string[] };

// Scans all contracts for objectives that are met but unpaid. Pays and marks is_paid.
// Called by the turn loop during Resolution phase.
export const settleObjectivePayouts: SettleObjectivePayouts = (state, _manifest) => {
  let s = state;
  const settledContractIds: string[] = [];

  const updatedContracts = s.contracts.map(contract => {
    let settled = false;
    const updatedObjectives = contract.objectives.map(obj => {
      if (!obj.is_met || obj.is_paid) return obj;
      s = applyMoneyDelta(s, computeAgencyPayout(s, contract, obj.payout));
      settled = true;
      return { ...obj, is_paid: true };
    });
    if (settled) settledContractIds.push(contract.id);
    return settled ? { ...contract, objectives: updatedObjectives } : contract;
  });

  return { state: { ...s, contracts: updatedContracts }, settledContractIds };
};

// ─── Objective condition evaluation ──────────────────────────────────────────

// Condition keys defined here must match those generated in decision-queue.ts.
// Add new conditions here as new contract types require them.
const checkObjectiveCondition = (
  conditionKey: string,
  clientId: string | null,
  contractTurnsActive: number,
  state: RunState,
): boolean => {
  switch (conditionKey) {
    case 'peak_arc': {
      const client = clientId ? state.roster.find(c => c.id === clientId) : null;
      return client?.arc_stage === 'peak';
    }
    case 'high_form': {
      const client = clientId ? state.roster.find(c => c.id === clientId) : null;
      return (client?.stats.form.true_value ?? 0) >= 70;
    }
    case 'turns_active_4':
      return contractTurnsActive >= 4;
    case 'turns_active_8':
      return contractTurnsActive >= 8;
    default:
      return false;
  }
};

export type EvaluateObjectiveConditions = (state: RunState) => RunState;

// Marks objectives as is_met=true when their condition is satisfied.
// Called during Resolution phase before settleObjectivePayouts.
export const evaluateObjectiveConditions: EvaluateObjectiveConditions = (state) => {
  let changed = false;
  const updatedContracts = state.contracts.map(contract => {
    if (!contract.objectives.length) return contract;
    let contractChanged = false;
    const updatedObjectives = contract.objectives.map(obj => {
      if (obj.is_met) return obj;
      const met = checkObjectiveCondition(obj.condition_key, contract.client_id, contract.turns_active, state);
      if (met) { contractChanged = true; changed = true; }
      return met ? { ...obj, is_met: true } : obj;
    });
    return contractChanged ? { ...contract, objectives: updatedObjectives } : contract;
  });
  return changed ? { ...state, contracts: updatedContracts } : state;
};

// ─── Reputation tier (offer quality gate) ─────────────────────────────────────

export type ComputeRepTier = (reputation: number) => RepTier;

export const computeRepTier: ComputeRepTier = (reputation) => {
  if (reputation >= 75) return 'elite';
  if (reputation >= 50) return 'national';
  if (reputation >= 25) return 'regional';
  return 'grassroots';
};

// ─── Client asset value (used by failure system for credit ceiling) ────────────

export type EstimateClientAssetValue = (
  state: RunState,
  clientId: string,
  manifest: VariantManifest,
) => number;

export const estimateClientAssetValue: EstimateClientAssetValue = (state, clientId, manifest) => {
  const client = state.roster.find(c => c.id === clientId);
  if (!client) return 0;

  const arcMult = manifest.arc.stage_multipliers[client.arc_stage].income;
  const audiencePremium = Math.max(0.85, Math.min(1.4, Math.log10(Math.max(100, client.audience)) / 4));
  const entityContracts = state.contracts.filter(
    c => c.tier === 'client_entity' && c.client_id === clientId,
  );

  let value = 0;
  for (const ec of entityContracts) {
    const cut = getAgentCutPercent(state, clientId);

    if (ec.payout_type === 'per_month') {
      value += ec.amount * (cut / 100) * ec.duration_remaining * arcMult * audiencePremium;
    } else if (ec.payout_type === 'lump_sum') {
      value += ec.amount * (cut / 100) * arcMult * audiencePremium;
    } else {
      // per_objective: estimate half of remaining objectives paying out
      const unpaid = ec.objectives.filter(o => !o.is_paid).length;
      const avgPayout = ec.objectives.reduce((sum, o) => sum + o.payout, 0) / (ec.objectives.length || 1);
      value += (unpaid * 0.5) * avgPayout * (cut / 100) * arcMult * audiencePremium;
    }
  }
  return Math.round(value);
};
