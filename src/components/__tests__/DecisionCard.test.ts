import { canCounterDecisionItem } from '../decision-card-rules';
import { DecisionItem } from '../../types/decision';
import { ContractDraft } from '../../types/contract';

const makeDraft = (overrides?: Partial<ContractDraft>): ContractDraft => ({
  tier: 'client_entity',
  client_id: 'client_1',
  entity_id: 'entity_1',
  payout_type: 'lump_sum',
  your_cut: null,
  amount: 10_000,
  duration: 6,
  objectives: [],
  obligations_per_turn: 200,
  counterparty_posture: {
    true_value: 0.5,
    is_revealed: false,
    observed_min: null,
    observed_max: null,
  },
  default_on_ignore: 'reject',
  expires_in: 2,
  ...overrides,
});

const makeDecisionItem = (overrides?: Partial<DecisionItem>): DecisionItem => ({
  id: 'item_1',
  type: 'contract_offer',
  template_key: 'sponsorship_opportunity',
  client_id: 'client_1',
  contract_id: null,
  contract_draft: makeDraft(),
  description: 'A brand is interested in sponsoring a client.',
  options: [],
  default_on_ignore: {
    money_delta: 0,
    reputation_delta: 0,
    stat_deltas: {},
    morale_delta: 0,
    activates_contract_id: null,
  },
  expires_in: 2,
  is_resolved: false,
  chosen_option_key: null,
  resolved_outcome: null,
  resolved_result_label: null,
  resolved_result_description: null,
  ...overrides,
});

describe('canCounterDecisionItem', () => {
  it('allows any unresolved board item with a contract draft to be countered', () => {
    expect(canCounterDecisionItem(makeDecisionItem({ type: 'contract_offer' }))).toBe(true);
    expect(canCounterDecisionItem(makeDecisionItem({ type: 'opportunity' }))).toBe(true);
    expect(canCounterDecisionItem(makeDecisionItem({ type: 'renewal' }))).toBe(true);
  });

  it('blocks resolved or non-contract board items', () => {
    expect(canCounterDecisionItem(makeDecisionItem({ is_resolved: true }))).toBe(false);
    expect(canCounterDecisionItem(makeDecisionItem({ contract_draft: null }))).toBe(false);
  });
});
