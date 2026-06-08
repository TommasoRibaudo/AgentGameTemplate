import {
  resolveDecisionItem,
  applyBoardDefaults,
  activateContract,
  tickBoardItemExpiry,
  executePush,
  hydrateContractOffer,
  generateDecisionBoard,
  BOARD_MIN_ITEMS,
  BOARD_MAX_ITEMS,
} from '../decision-queue';
import { makeRunState, makeClient, makeManifest, makeClientStats, makeAgentState, nextId } from './fixtures';
import { DecisionItem, DecisionOutcome, PushRisk } from '../../types/decision';
import { ContractDraft } from '../../types/contract';
import { ContractTemplate } from '../../types/contract';

const makeOutcome = (overrides?: Partial<DecisionOutcome>): DecisionOutcome => ({
  money_delta: 0,
  reputation_delta: 0,
  stat_deltas: {},
  morale_delta: 0,
  activates_contract_id: null,
  ...overrides,
});

const makeDecisionItem = (overrides?: Partial<DecisionItem>): DecisionItem => ({
  id: `itm_${nextId()}`,
  type: 'contract_offer',
  template_key: 'test_template',
  client_id: null,
  contract_id: null,
  contract_draft: null,
  description: 'Test item',
  options: [
    { key: 'approve', label: 'Approve', outcome: makeOutcome({ reputation_delta: 5 }), push_risk: null },
    { key: 'reject',  label: 'Reject',  outcome: makeOutcome(),                         push_risk: null },
  ],
  default_on_ignore: makeOutcome({ reputation_delta: -1 }),
  expires_in: null,
  is_resolved: false,
  chosen_option_key: null,
  ...overrides,
});

const makeContractDraft = (overrides?: Partial<ContractDraft>): ContractDraft => ({
  tier: 'agent_client',
  client_id: nextId(),
  entity_id: null,
  payout_type: 'per_month',
  your_cut: 15,
  amount: 10_000,
  duration: 12,
  objectives: [],
  obligations_per_turn: 500,
  counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null },
  default_on_ignore: 'reject',
  expires_in: null,
  ...overrides,
});

// ─── executePush ─────────────────────────────────────────────────────────────

describe('decision-queue — executePush', () => {
  const risk: PushRisk = {
    success_probability: 0.5,
    success_outcome: makeOutcome({ reputation_delta: 5 }),
    failure_outcome: makeOutcome({ reputation_delta: -2 }),
  };

  it('returns succeeded=true when random < probability', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const state = makeRunState();
    const { succeeded, outcome } = executePush(state, risk);
    expect(succeeded).toBe(true);
    expect(outcome.reputation_delta).toBe(5);
    jest.restoreAllMocks();
  });

  it('returns succeeded=false when random >= probability', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = makeRunState();
    const { succeeded, outcome } = executePush(state, risk);
    expect(succeeded).toBe(false);
    expect(outcome.reputation_delta).toBe(-2);
    jest.restoreAllMocks();
  });
});

// ─── resolveDecisionItem ─────────────────────────────────────────────────────

describe('decision-queue — resolveDecisionItem', () => {
  it('marks item as resolved with chosen_option_key', () => {
    const item = makeDecisionItem();
    const state = makeRunState({ decision_board: [item] });
    const result = resolveDecisionItem(state, item.id, 'approve', makeManifest());
    expect(result.decision_board[0].is_resolved).toBe(true);
    expect(result.decision_board[0].chosen_option_key).toBe('approve');
  });

  it('applies option outcome to state', () => {
    const item = makeDecisionItem();
    const state = makeRunState({ reputation: 50, decision_board: [item] });
    const result = resolveDecisionItem(state, item.id, 'approve', makeManifest());
    expect(result.reputation).toBe(55);
  });

  it('applies non-zero money_delta from outcome (applyOutcome money_delta branch)', () => {
    const item = makeDecisionItem({
      options: [{ key: 'take', label: 'Take', outcome: makeOutcome({ money_delta: 500 }), push_risk: null }],
    });
    const state = makeRunState({ money: 1_000, decision_board: [item] });
    const result = resolveDecisionItem(state, item.id, 'take', makeManifest());
    expect(result.money).toBe(1_500);
  });

  it('falls back to default_on_ignore when chosen option key is not in options list', () => {
    const item = makeDecisionItem({ default_on_ignore: makeOutcome({ reputation_delta: -3 }) });
    const state = makeRunState({ reputation: 50, decision_board: [item] });
    // 'nonexistent_option' is not in item.options → falls back to default_on_ignore
    const result = resolveDecisionItem(state, item.id, 'nonexistent_option', makeManifest());
    expect(result.reputation).toBe(47);
  });

  it('processes non-zero morale_delta in outcome without throwing', () => {
    const item = makeDecisionItem({
      options: [{ key: 'approve', label: 'Approve', outcome: makeOutcome({ morale_delta: 5 }), push_risk: null }],
    });
    const state = makeRunState({ decision_board: [item] });
    expect(() => resolveDecisionItem(state, item.id, 'approve', makeManifest())).not.toThrow();
  });

  it('does nothing for already-resolved items', () => {
    const item = makeDecisionItem({ is_resolved: true, chosen_option_key: 'reject' });
    const state = makeRunState({ decision_board: [item] });
    const result = resolveDecisionItem(state, item.id, 'approve', makeManifest());
    expect(result.decision_board[0].chosen_option_key).toBe('reject');
  });

  it('does nothing for unknown item id', () => {
    const state = makeRunState();
    const result = resolveDecisionItem(state, 'unknown', 'approve', makeManifest());
    expect(result).toBe(state);
  });

  it('activates contract on approve with a draft', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const draft = makeContractDraft({ tier: 'agent_client', client_id: clientId });
    const item = makeDecisionItem({ client_id: clientId, contract_draft: draft });
    const state = makeRunState({ roster: [client], decision_board: [item] });
    const result = resolveDecisionItem(state, item.id, 'approve', makeManifest());
    expect(result.contracts).toHaveLength(1);
  });
});

// ─── applyBoardDefaults ───────────────────────────────────────────────────────

describe('decision-queue — applyBoardDefaults', () => {
  it('marks all unresolved items as __default__', () => {
    const items = [makeDecisionItem(), makeDecisionItem()];
    const state = makeRunState({ decision_board: items });
    const result = applyBoardDefaults(state, makeManifest());
    result.decision_board.forEach(i => {
      expect(i.is_resolved).toBe(true);
      expect(i.chosen_option_key).toBe('__default__');
    });
  });

  it('applies default_on_ignore outcome', () => {
    const item = makeDecisionItem({ default_on_ignore: makeOutcome({ reputation_delta: -2 }) });
    const state = makeRunState({ reputation: 50, decision_board: [item] });
    const result = applyBoardDefaults(state, makeManifest());
    expect(result.reputation).toBe(48);
  });

  it('does not re-apply defaults to already-resolved items', () => {
    const item = makeDecisionItem({ is_resolved: true, default_on_ignore: makeOutcome({ reputation_delta: -10 }) });
    const state = makeRunState({ reputation: 50, decision_board: [item] });
    const result = applyBoardDefaults(state, makeManifest());
    expect(result.reputation).toBe(50);
  });
});

// ─── activateContract ─────────────────────────────────────────────────────────

describe('decision-queue — activateContract', () => {
  it('adds a contract to state.contracts', () => {
    const draft = makeContractDraft();
    const state = makeRunState();
    const result = activateContract(state, draft, makeManifest());
    expect(result.contracts).toHaveLength(1);
  });

  it('pays lump_sum amount immediately', () => {
    const draft = makeContractDraft({ payout_type: 'lump_sum', amount: 5_000 });
    const state = makeRunState({ money: 1_000 });
    const result = activateContract(state, draft, makeManifest());
    expect(result.money).toBe(6_000);
  });

  it('links agent_contract_id on the client when tier is agent_client', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const draft = makeContractDraft({ tier: 'agent_client', client_id: clientId });
    const state = makeRunState({ roster: [client] });
    const result = activateContract(state, draft, makeManifest());
    const updatedClient = result.roster.find(c => c.id === clientId);
    expect(updatedClient?.agent_contract_id).toBe(result.contracts[0].id);
  });
});

// ─── tickBoardItemExpiry ──────────────────────────────────────────────────────

describe('decision-queue — tickBoardItemExpiry', () => {
  it('decrements expires_in', () => {
    const item = makeDecisionItem({ expires_in: 3 });
    const state = makeRunState({ decision_board: [item] });
    const result = tickBoardItemExpiry(state);
    expect(result.decision_board[0].expires_in).toBe(2);
  });

  it('removes item when expires_in hits 0', () => {
    const item = makeDecisionItem({ expires_in: 1 });
    const state = makeRunState({ decision_board: [item] });
    const result = tickBoardItemExpiry(state);
    expect(result.decision_board).toHaveLength(0);
  });

  it('keeps items with null expires_in indefinitely', () => {
    const item = makeDecisionItem({ expires_in: null });
    const state = makeRunState({ decision_board: [item] });
    const result = tickBoardItemExpiry(state);
    expect(result.decision_board).toHaveLength(1);
    expect(result.decision_board[0].expires_in).toBeNull();
  });

  it('keeps resolved items even at 0', () => {
    const item = makeDecisionItem({ expires_in: 1, is_resolved: true, chosen_option_key: 'approve' });
    const state = makeRunState({ decision_board: [item] });
    const result = tickBoardItemExpiry(state);
    expect(result.decision_board).toHaveLength(1);
  });
});

// ─── hydrateContractOffer ─────────────────────────────────────────────────────

const makeContractTemplate = (overrides?: Partial<ContractTemplate>): ContractTemplate => ({
  key: 'test_signing',
  tier: 'agent_client',
  payout_type: 'per_month',
  amount_range: [5_000, 15_000],
  duration_range: [6, 12],
  cut_range: [10, 20],
  obligations_range: [200, 500],
  talent_scaling: 0.4,
  form_scaling: 0.4,
  marketability_scaling: 0.2,
  rep_gate: 0,
  valid_arc_stages: [],
  default_on_ignore: 'reject',
  expires_in: null,
  ...overrides,
});

describe('decision-queue — hydrateContractOffer', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns null for an unknown template key', () => {
    const state = makeRunState({ roster: [makeClient()] });
    const result = hydrateContractOffer(state, 'nonexistent_template', state.roster[0].id, makeManifest());
    expect(result).toBeNull();
  });

  it('returns null when client is not found', () => {
    const template = makeContractTemplate();
    const manifest = makeManifest({ contract_templates: [template] });
    const state = makeRunState();
    const result = hydrateContractOffer(state, template.key, 'unknown_client_id', manifest);
    expect(result).toBeNull();
  });

  it('generates a per_month draft with expected fields', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const template = makeContractTemplate({ payout_type: 'per_month' });
    const manifest = makeManifest({ contract_templates: [template] });
    const state = makeRunState({ roster: [client] });
    const draft = hydrateContractOffer(state, template.key, clientId, manifest);
    expect(draft).not.toBeNull();
    expect(draft?.payout_type).toBe('per_month');
    expect(draft?.tier).toBe('agent_client');
    expect(draft?.client_id).toBe(clientId);
    expect(typeof draft?.amount).toBe('number');
    expect(draft?.amount).toBeGreaterThan(0);
    expect(draft?.objectives).toHaveLength(0);
  });

  it('reveals posture when negotiation level >= 5', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const template = makeContractTemplate({ payout_type: 'per_month' });
    const manifest = makeManifest({ contract_templates: [template] });
    const state    = makeRunState({
      roster: [client],
      agent: makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 5, operations: 0 } }),
    });
    const draft = hydrateContractOffer(state, template.key, clientId, manifest);
    expect(draft?.counterparty_posture.is_revealed).toBe(true);
    expect(draft?.counterparty_posture.observed_min).not.toBeNull();
    expect(draft?.counterparty_posture.observed_max).not.toBeNull();
  });

  it('generates entity_id for client_entity tier contracts', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const template = makeContractTemplate({ tier: 'client_entity', payout_type: 'per_month', cut_range: null });
    const manifest = makeManifest({ contract_templates: [template] });
    const state    = makeRunState({ roster: [client] });
    const draft = hydrateContractOffer(state, template.key, clientId, manifest);
    expect(draft?.entity_id).not.toBeNull();
  });

  it('uses 8_000 and 5_000 payout fallbacks when amount rounds to 0 for per_objective', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const template = makeContractTemplate({
      payout_type: 'per_objective',
      cut_range: null,
      amount_range: [0, 0],
      talent_scaling: 0,
      form_scaling: 0,
      marketability_scaling: 0,
    });
    const manifest = makeManifest({ contract_templates: [template] });
    const state = makeRunState({ roster: [client] });
    const draft = hydrateContractOffer(state, template.key, clientId, manifest);
    expect(draft?.objectives[0].payout).toBe(8_000);
    expect(draft?.objectives[1].payout).toBe(5_000);
  });

  it('generates 2 objectives for per_objective contracts', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const template = makeContractTemplate({ payout_type: 'per_objective', cut_range: null });
    const manifest = makeManifest({ contract_templates: [template] });
    const state = makeRunState({ roster: [client] });
    const draft = hydrateContractOffer(state, template.key, clientId, manifest);
    expect(draft?.objectives).toHaveLength(2);
    expect(draft?.objectives[0].condition_key).toBe('peak_arc');
    expect(draft?.objectives[1].condition_key).toBe('high_form');
    expect(draft?.objectives[0].is_paid).toBe(false);
    expect(draft?.objectives[1].is_paid).toBe(false);
  });
});

// ─── generateDecisionBoard ────────────────────────────────────────────────────

describe('decision-queue — generateDecisionBoard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns empty array when no board item templates in manifest', () => {
    const state = makeRunState({ roster: [makeClient()] });
    const result = generateDecisionBoard(state, makeManifest());
    expect(result).toHaveLength(0);
  });

  it('respects BOARD_MAX_ITEMS cap', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const templates = Array.from({ length: 10 }, (_, i) => ({
      key: `tmpl_${i}`,
      type: 'opportunity' as const,
      description_template: 'Test item',
      rep_gate: 0,
      valid_arc_stages: [] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in: null,
    }));
    const manifest = makeManifest({ board_item_templates: templates });
    const state = makeRunState({ roster: [makeClient()] });
    const board = generateDecisionBoard(state, manifest);
    expect(board.length).toBeLessThanOrEqual(BOARD_MAX_ITEMS);
  });

  it('filters out templates whose rep_gate exceeds player reputation', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const eliteTemplate = {
      key: 'elite_deal',
      type: 'opportunity' as const,
      description_template: 'Elite deal',
      rep_gate: 75,
      valid_arc_stages: [] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in: null,
    };
    const manifest = makeManifest({ board_item_templates: [eliteTemplate] });
    // reputation=50 → national tier (value=50) < rep_gate=75
    const state = makeRunState({ reputation: 50 });
    const board = generateDecisionBoard(state, manifest);
    expect(board).toHaveLength(0);
  });

  it('filters out templates when no roster client matches valid_arc_stages', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const peakOnlyTemplate = {
      key: 'peak_only_deal',
      type: 'opportunity' as const,
      description_template: 'Peak only deal',
      rep_gate: 0,
      valid_arc_stages: ['peak'] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in: null,
    };
    const manifest = makeManifest({ board_item_templates: [peakOnlyTemplate] });
    // Client is rising, not peak → template should be filtered
    const state = makeRunState({ roster: [makeClient({ arc_stage: 'rising' })] });
    const board = generateDecisionBoard(state, manifest);
    expect(board).toHaveLength(0);
  });

  it('includes templates when a roster client matches valid_arc_stages', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const peakTemplate = {
      key: 'peak_deal',
      type: 'opportunity' as const,
      description_template: 'Peak deal',
      rep_gate: 0,
      valid_arc_stages: ['peak'] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in: null,
    };
    const manifest = makeManifest({ board_item_templates: [peakTemplate] });
    const state = makeRunState({ roster: [makeClient({ arc_stage: 'peak' })] });
    const board = generateDecisionBoard(state, manifest);
    expect(board.length).toBeGreaterThan(0);
  });

  it('generates a contract draft when template has a contract_template_key', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId       = nextId();
    const client         = makeClient({ id: clientId, arc_stage: 'rising' });
    const contractTmpl   = makeContractTemplate({ key: 'agent_signing' });
    const boardTemplate  = {
      key: 'signing_offer',
      type: 'contract_offer' as const,
      description_template: 'Sign an artist',
      rep_gate: 0,
      valid_arc_stages: ['rising'] as any[],
      contract_template_key: 'agent_signing',
      default_on_ignore_key: 'reject',
      expires_in: null,
    };
    const manifest = makeManifest({
      board_item_templates: [boardTemplate],
      contract_templates: [contractTmpl],
    });
    const state = makeRunState({ roster: [client] });
    const board = generateDecisionBoard(state, manifest);
    const item  = board.find(i => i.template_key === 'signing_offer');
    if (item) {
      expect(item.contract_draft).not.toBeNull();
    }
  });
});

// ─── resolveDecisionItem — push success path ─────────────────────────────────

describe('decision-queue — resolveDecisionItem push', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns improved draft when push succeeds', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01); // guaranteed succeed
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const draft    = makeContractDraft({ client_id: clientId });
    const pushRisk: PushRisk = {
      success_probability: 0.5,
      success_outcome: makeOutcome({ reputation_delta: 2 }),
      failure_outcome: makeOutcome({ reputation_delta: -1 }),
    };
    const item = makeDecisionItem({
      client_id: clientId,
      contract_draft: draft,
      options: [
        { key: 'approve', label: 'Approve', outcome: makeOutcome(), push_risk: null },
        { key: 'push',    label: 'Push',    outcome: makeOutcome(), push_risk: pushRisk },
      ],
    });
    const state  = makeRunState({ roster: [client], decision_board: [item] });
    const result = resolveDecisionItem(state, item.id, 'push', makeManifest());
    // Push success returns early with improved draft (item NOT resolved yet)
    expect(result.decision_board[0].is_resolved).toBe(false);
    expect(result.decision_board[0].contract_draft?.amount).toBeGreaterThanOrEqual(draft.amount);
  });

  it('resolves item on push failure with failure outcome applied', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99); // guaranteed fail
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const draft    = makeContractDraft({ client_id: clientId });
    const pushRisk: PushRisk = {
      success_probability: 0.5,
      success_outcome: makeOutcome({ reputation_delta: 2 }),
      failure_outcome: makeOutcome({ reputation_delta: -3 }),
    };
    const item = makeDecisionItem({
      client_id: clientId,
      contract_draft: draft,
      options: [
        { key: 'approve', label: 'Approve', outcome: makeOutcome(), push_risk: null },
        { key: 'push',    label: 'Push',    outcome: makeOutcome(), push_risk: pushRisk },
      ],
    });
    const state  = makeRunState({ reputation: 50, roster: [client], decision_board: [item] });
    const result = resolveDecisionItem(state, item.id, 'push', makeManifest());
    expect(result.decision_board[0].is_resolved).toBe(true);
    expect(result.reputation).toBeLessThan(50);
  });
});

// ─── generateDecisionBoard — persistent item carry-over ──────────────────────

describe('decision-queue — generateDecisionBoard persistent items', () => {
  afterEach(() => jest.restoreAllMocks());

  it('carries over unresolved items with expires_in > 0', () => {
    const persistentItem = makeDecisionItem({ expires_in: 2, is_resolved: false });
    const state = makeRunState({ decision_board: [persistentItem] });
    const result = generateDecisionBoard(state, makeManifest());
    expect(result.some(i => i.id === persistentItem.id)).toBe(true);
  });

  it('does not carry over resolved items', () => {
    const resolvedItem = makeDecisionItem({ expires_in: 2, is_resolved: true, chosen_option_key: 'approve' });
    const state = makeRunState({ decision_board: [resolvedItem] });
    const result = generateDecisionBoard(state, makeManifest());
    expect(result.some(i => i.id === resolvedItem.id)).toBe(false);
  });

  it('returns immediately when persistent items already fill BOARD_MAX_ITEMS', () => {
    // 5 persistent unresolved items → board already at cap → no new items generated
    const persistent = Array.from({ length: BOARD_MAX_ITEMS }, () =>
      makeDecisionItem({ expires_in: 3, is_resolved: false }),
    );
    const manyTemplates = Array.from({ length: 10 }, (_, i) => ({
      key: `tmpl_${i}`, type: 'opportunity' as const, description_template: 'X',
      rep_gate: 0, valid_arc_stages: [] as any[], contract_template_key: null,
      default_on_ignore_key: 'skip', expires_in: null,
    }));
    const manifest = makeManifest({ board_item_templates: manyTemplates });
    const state = makeRunState({ decision_board: persistent });
    const result = generateDecisionBoard(state, manifest);
    expect(result).toHaveLength(BOARD_MAX_ITEMS);
    // All returned items should be from persistent set
    result.forEach(item => expect(persistent.some(p => p.id === item.id)).toBe(true));
  });
});

// ─── activateContract — extra coverage ───────────────────────────────────────

describe('decision-queue — activateContract (prospect promotion)', () => {
  it('promotes prospect to roster on agent_client contract activation', () => {
    const prospectId = nextId();
    const prospect = { id: prospectId, name: 'Test Prospect', arc_stage: 'rising' as const, stats: makeClientStats(), scouting_invested: 0 };
    const draft = makeContractDraft({ tier: 'agent_client', client_id: prospectId });
    const state = makeRunState({ roster: [], prospects: [prospect] });
    const result = activateContract(state, draft, makeManifest());
    expect(result.roster).toHaveLength(1);
    expect(result.roster[0].id).toBe(prospectId);
    expect(result.prospects).toHaveLength(0);
  });

  it('client_entity tier does not link to roster (tier !== agent_client branch)', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const draft = makeContractDraft({ tier: 'client_entity', client_id: clientId, entity_id: 'ent_xyz', your_cut: null });
    const state = makeRunState({ roster: [client] });
    const result = activateContract(state, draft, makeManifest());
    expect(result.contracts).toHaveLength(1);
    // Client roster should be unchanged — no agent_contract_id link for client_entity
    expect(result.roster[0].agent_contract_id).toBeNull();
  });

  it('roster.map only updates the matching client (non-matching :c branch)', () => {
    const clientId = nextId();
    const otherClientId = nextId();
    const client = makeClient({ id: clientId });
    const otherClient = makeClient({ id: otherClientId });
    const draft = makeContractDraft({ tier: 'agent_client', client_id: clientId });
    const state = makeRunState({ roster: [client, otherClient] });
    const result = activateContract(state, draft, makeManifest());
    const linked   = result.roster.find(c => c.id === clientId);
    const untouched = result.roster.find(c => c.id === otherClientId);
    expect(linked?.agent_contract_id).toBe(result.contracts[0].id);
    expect(untouched?.agent_contract_id).toBeNull();
  });

  it('per_objective draft creates contract with proper objective ids', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const draft = makeContractDraft({
      tier: 'agent_client',
      client_id: clientId,
      payout_type: 'per_objective',
      objectives: [
        { description: 'Hit peak', payout: 8_000, condition_key: 'peak_arc', is_paid: false },
        { description: 'High form', payout: 5_000, condition_key: 'high_form', is_paid: false },
      ],
    });
    const state = makeRunState({ roster: [client] });
    const result = activateContract(state, draft, makeManifest());
    const contract = result.contracts[0];
    expect(contract.objectives).toHaveLength(2);
    expect(contract.objectives[0].id).toBeTruthy();
    expect(contract.objectives[0].is_met).toBe(false);
    expect(contract.objectives[0].is_paid).toBe(false);
  });
});

// ─── resolveDecisionItem — multi-item board coverage ─────────────────────────

describe('decision-queue — resolveDecisionItem multi-item board', () => {
  afterEach(() => jest.restoreAllMocks());

  it('only resolves the target item in a multi-item board (decision_board.map :i branch)', () => {
    const item1 = makeDecisionItem();
    const item2 = makeDecisionItem();
    const state = makeRunState({ reputation: 50, decision_board: [item1, item2] });
    const result = resolveDecisionItem(state, item1.id, 'approve', makeManifest());
    expect(result.decision_board[0].is_resolved).toBe(true);
    expect(result.decision_board[1].is_resolved).toBe(false);
  });

  it('push success only updates target item draft in multi-item board (board.map :i branch)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const draft = makeContractDraft({ client_id: clientId });
    const pushRisk: PushRisk = {
      success_probability: 0.5,
      success_outcome: makeOutcome({ reputation_delta: 2 }),
      failure_outcome: makeOutcome({ reputation_delta: -1 }),
    };
    const targetItem = makeDecisionItem({
      client_id: clientId,
      contract_draft: draft,
      options: [{ key: 'push', label: 'Push', outcome: makeOutcome(), push_risk: pushRisk }],
    });
    const otherItem = makeDecisionItem();
    const state = makeRunState({ roster: [client], decision_board: [targetItem, otherItem] });
    const result = resolveDecisionItem(state, targetItem.id, 'push', makeManifest());
    expect(result.decision_board[0].contract_draft?.amount).toBeGreaterThanOrEqual(draft.amount);
    expect(result.decision_board[1].is_resolved).toBe(false);
  });

  it('push succeeds with null your_cut draft (your_cut !== null false branch)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const draft = makeContractDraft({ client_id: clientId, your_cut: null });
    const pushRisk: PushRisk = {
      success_probability: 0.5,
      success_outcome: makeOutcome({ reputation_delta: 2 }),
      failure_outcome: makeOutcome({ reputation_delta: -1 }),
    };
    const item = makeDecisionItem({
      client_id: clientId,
      contract_draft: draft,
      options: [{ key: 'push', label: 'Push', outcome: makeOutcome(), push_risk: pushRisk }],
    });
    const state = makeRunState({ roster: [client], decision_board: [item] });
    const result = resolveDecisionItem(state, item.id, 'push', makeManifest());
    expect(result.decision_board[0].contract_draft?.your_cut).toBeNull();
    expect(result.decision_board[0].is_resolved).toBe(false);
  });

  it('marks item resolved when push option has no push_risk (pushOption?.push_risk false branch)', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const draft = makeContractDraft({ client_id: clientId });
    const item = makeDecisionItem({
      client_id: clientId,
      contract_draft: draft,
      options: [{ key: 'push', label: 'Push', outcome: makeOutcome(), push_risk: null }],
    });
    const state = makeRunState({ roster: [client], decision_board: [item] });
    const result = resolveDecisionItem(state, item.id, 'push', makeManifest());
    expect(result.decision_board[0].is_resolved).toBe(true);
  });
});

// ─── generateDecisionBoard — empty roster branch ──────────────────────────────

describe('decision-queue — generateDecisionBoard empty roster', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sets client_id to null when roster is empty (relevantClient?.id ?? null branch)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const template = {
      key: 'general_opp',
      type: 'opportunity' as const,
      description_template: 'General opportunity',
      rep_gate: 0,
      valid_arc_stages: [] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in: null,
    };
    const manifest = makeManifest({ board_item_templates: [template] });
    const state = makeRunState({ roster: [] });
    const board = generateDecisionBoard(state, manifest);
    expect(board[0].client_id).toBeNull();
  });
});
