import { RunState, DebtState } from '../../types/run';
import { Client, ClientStats, FoggedStat } from '../../types/client';
import { Contract, ContractDraft, Objective } from '../../types/contract';
import { Campaign } from '../../types/campaign';
import { GameEvent } from '../../types/event';
import { DecisionItem } from '../../types/decision';
import { AgentState } from '../../types/agent';
import { VariantManifest, EconomyConfig, ArcConfig } from '../../types/manifest';
import { ArcStage, CoreStatKey } from '../../types/primitives';

let _seq = 0;
export const nextId = () => `id_${++_seq}`;
export const resetIds = () => { _seq = 0; };

export const makeFoggedStat = (trueValue: number, overrides?: Partial<FoggedStat>): FoggedStat => ({
  true_value: trueValue,
  observed_min: Math.max(0, trueValue - 20),
  observed_max: Math.min(100, trueValue + 20),
  scouting_invested: 0,
  ...overrides,
});

export const makeClientStats = (values: Partial<Record<CoreStatKey, number>> = {}): ClientStats => ({
  talent:        makeFoggedStat(values.talent        ?? 60),
  form:          makeFoggedStat(values.form          ?? 60),
  marketability: makeFoggedStat(values.marketability ?? 60),
  morale:        makeFoggedStat(values.morale        ?? 70),
});

export const makeClient = (overrides?: Partial<Client>): Client => ({
  id: nextId(),
  name: 'Test Client',
  arc_stage: 'rising',
  stats: makeClientStats(),
  traits: [],
  turns_on_roster: 0,
  turns_at_stage: 0,
  active_campaign_id: null,
  agent_contract_id: null,
  ...overrides,
});

export const makeObjective = (overrides?: Partial<Objective>): Objective => ({
  id: nextId(),
  description: 'Test objective',
  payout: 5000,
  condition_key: 'test_condition',
  is_met: false,
  is_paid: false,
  ...overrides,
});

export const makeContract = (overrides?: Partial<Contract>): Contract => ({
  id: nextId(),
  tier: 'agent_client',
  client_id: nextId(),
  entity_id: null,
  payout_type: 'per_month',
  your_cut: 15,
  amount: 10000,
  duration_remaining: 12,
  objectives: [],
  obligations_per_turn: 500,
  counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null },
  default_on_ignore: 'reject',
  expires_in: null,
  turns_active: 0,
  ...overrides,
});

export const makeDebtState = (overrides?: Partial<DebtState>): DebtState => ({
  is_active: false,
  balance: 0,
  interest_rate: 0.05,
  per_turn_repayment: 0,
  credit_ceiling: 0,
  bankruptcy_warning_turns_remaining: null,
  ...overrides,
});

export const makeAgentState = (overrides?: Partial<AgentState>): AgentState => ({
  stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 0, operations: 0 },
  roster_capacity: 5,
  defense_tracks: [],
  ...overrides,
});

export const makeRunState = (overrides?: Partial<RunState>): RunState => ({
  id: nextId(),
  variant_id: 'music_v1',
  turn_number: 1,
  career_length: 60,
  phase: 'turn_open',
  money: 10_000,
  reputation: 50,
  low_money_warning: false,
  debt: makeDebtState(),
  agent: makeAgentState(),
  roster: [],
  prospects: [],
  contracts: [],
  campaigns: [],
  pending_events: [],
  resolved_events: [],
  decision_board: [],
  news_feed: [],
  is_active: true,
  end_condition: null,
  peak_reputation: 50,
  total_earnings: 0,
  clients_developed: 0,
  ...overrides,
});

const makeEconomy = (): EconomyConfig => ({
  starting_money: 10_000,
  starting_reputation: 50,
  overhead_per_turn: 1_000,
  career_length: 60,
  event_base_rate: 0.15,
  credit_ceiling_rep_weight: 50,
  credit_ceiling_asset_weight: 0.2,
  debt_interest_rate: 0.05,
  agent_stat_upgrade_cost: { money: 2_000, reputation: 5 },
  roster_slot_upgrade_cost: { money: 5_000 },
  defense_track_upgrade_cost: { money: 2_000, per_turn_recurring: 200 },
});

const makeArcConfig = (): ArcConfig => ({
  rising_to_peak_base_turns: 24,
  peak_to_declining_base_turns: 36,
  stage_multipliers: {
    rising:    { talent: 0.8, form: 0.8, marketability: 0.7, income: 0.6 },
    peak:      { talent: 1.0, form: 1.0, marketability: 1.0, income: 1.0 },
    declining: { talent: 0.9, form: 0.7, marketability: 0.8, income: 0.5 },
  },
});

export const makeManifest = (overrides?: Partial<VariantManifest>): VariantManifest => ({
  id: 'test',
  name: 'Test Variant',
  version: '1.0.0',
  labels: {
    client: 'Artist',
    entity: 'Label',
    agent: 'Manager',
    money: 'Cash',
    reputation: 'Clout',
    stat_labels: { talent: 'Talent', form: 'Form', marketability: 'Marketability', morale: 'Morale' },
  },
  stat_sub_attributes: [],
  entity_types: [],
  campaign_types: [],
  traits: [],
  events: [],
  board_item_templates: [],
  contract_templates: [],
  economy: makeEconomy(),
  arc: makeArcConfig(),
  ...overrides,
});
