import {
  resolveDecisionItem,
  applyBoardDefaults,
  activateContract,
  tickBoardItemExpiry,
  executePush,
  hydrateContractOffer,
  generateDecisionBoard,
  generateContractRenewalOffers,
  BOARD_MIN_ITEMS,
  BOARD_MAX_ITEMS,
  EARLY_BOARD_MAX_ITEMS,
  RENEWAL_NOTICE_TURNS,
  RENEWAL_MORALE_THRESHOLD,
  computeDecisionBoardTargetCount,
  computeCounterAggressiveness,
  computeCounterAcceptanceProbability,
  applyCounterTerms,
  resolveCounteroffer,
  queueContractRenewalOffer,
  FOG_HALF_BASE,
  COUNTER_REVISED_WINDOW,
  injectAlbumOptionDecision,
} from '../decision-queue';
import { makeRunState, makeClient, makeContract, makeManifest, makeClientStats, makeAgentState, nextId } from './fixtures';
import { DecisionItem, DecisionOutcome, PushRisk } from '../../types/decision';
import { ContractDraft, CounterTerms } from '../../types/contract';
import { ContractTemplate } from '../../types/contract';
import { Campaign, CatalogRelease } from '../../types/campaign';

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
  payout_type: 'per_week',
  your_cut: 15,
  amount: 10_000,
  duration: 12,
  objectives: [],
  obligations_per_turn: 500,
  counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null },
  default_on_ignore: 'reject',
  expires_in: null,
  exclusivity_scope: null,
  album_option: null,
  ...overrides,
});

const makeReleaseCampaign = (overrides?: Partial<Campaign>): Campaign => ({
  id: `cmp_${nextId()}`,
  client_id: nextId(),
  type_key: 'album_cycle',
  release_plan: {
    kind: 'album',
    title: 'Test Album',
    songs: [
      { id: 'song_1', title: 'Track 1', quality: 70 },
      { id: 'song_2', title: 'Track 2', quality: 96 },
    ],
  },
  total_turns: 4,
  turns_remaining: 2,
  installment_results: [],
  pending_objective_ids: [],
  ...overrides,
});

const makeAlbumRelease = (overrides?: Partial<CatalogRelease>): CatalogRelease => ({
  id: `rel_${nextId()}`,
  campaign_id: `cmp_${nextId()}`,
  kind: 'album',
  type_key: 'album_cycle',
  title: 'Test Album',
  songs: [{ id: 'song_1', title: 'Track 1', quality: 70 }],
  released_turn: 12,
  turns_since_release: 0,
  album_units_sold: 0,
  total_streams: 0,
  album_income_total: 0,
  stream_income_total: 0,
  latest_turn_album_units: 0,
  latest_turn_streams: 0,
  latest_turn_income: 0,
  latest_turn_fan_gain: 0,
  total_fan_gain: 0,
  is_selling_albums: true,
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

  it('blocks a new label deal when the client is already under an active label contract', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const existingLabel = makeContract({
      client_id: clientId,
      tier: 'client_entity',
      entity_id: 'label_old',
      exclusivity_scope: 'label',
      duration_remaining: 6,
    });
    const draft = makeContractDraft({
      tier: 'client_entity',
      client_id: clientId,
      entity_id: 'label_new',
      your_cut: null,
      exclusivity_scope: 'label',
    });
    const item = makeDecisionItem({ client_id: clientId, contract_draft: draft });
    const state = makeRunState({ roster: [client], contracts: [existingLabel], decision_board: [item] });

    const result = resolveDecisionItem(state, item.id, 'approve', makeManifest());

    expect(result.decision_board[0].resolved_result_label).toBe('Withdrawn');
    expect(result.decision_board[0].resolved_result_description).toContain('already under an exclusive label contract');
    // Existing label contract must not be cancelled
    expect(result.contracts.find(c => c.id === existingLabel.id)?.duration_remaining).toBe(6);
    // No new contract activated
    expect(result.contracts).toHaveLength(1);
  });

  it('allows a label renewal even when an active label contract exists', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const currentLabel = makeContract({
      client_id: clientId,
      tier: 'client_entity',
      entity_id: 'label_current',
      exclusivity_scope: 'label',
      duration_remaining: 2,
    });
    const renewalDraft = makeContractDraft({
      tier: 'client_entity',
      client_id: clientId,
      entity_id: 'label_current',
      your_cut: null,
      exclusivity_scope: 'label',
    });
    const item = makeDecisionItem({
      type: 'renewal',
      client_id: clientId,
      contract_id: currentLabel.id,
      contract_draft: renewalDraft,
    });
    const state = makeRunState({ roster: [client], contracts: [currentLabel], decision_board: [item] });

    const result = resolveDecisionItem(state, item.id, 'approve', makeManifest());

    expect(result.decision_board[0].resolved_result_label).not.toBe('Withdrawn');
    // Renewal activates a new contract
    expect(result.contracts.length).toBeGreaterThan(0);
  });

  it('accepting a renewal expires the current contract and activates the renewed term', () => {
    const clientId = nextId();
    const currentContract = makeContract({
      client_id: clientId,
      tier: 'agent_client',
      amount: 12_000,
      your_cut: 18,
      obligations_per_turn: 450,
      duration_remaining: 1,
    });
    const client = makeClient({ id: clientId, agent_contract_id: currentContract.id });
    const draft = makeContractDraft({
      tier: 'agent_client',
      client_id: clientId,
      amount: 12_000,
      your_cut: 18,
      obligations_per_turn: 450,
      duration: 10,
    });
    const item = makeDecisionItem({
      type: 'renewal',
      client_id: clientId,
      contract_id: currentContract.id,
      contract_draft: draft,
    });
    const state = makeRunState({
      roster: [client],
      contracts: [currentContract],
      decision_board: [item],
    });

    const result = resolveDecisionItem(state, item.id, 'approve', makeManifest());
    const expired = result.contracts.find(c => c.id === currentContract.id);
    const renewed = result.contracts.find(c => c.id !== currentContract.id);

    expect(expired?.duration_remaining).toBe(0);
    expect(renewed?.amount).toBe(currentContract.amount);
    expect(renewed?.duration_remaining).toBe(10);
    expect(result.roster[0].agent_contract_id).toBe(renewed?.id);
    expect(result.decision_board[0].resolved_result_description).toBe(
      'Renewed. The current contract will be replaced by the new term.',
    );
  });

  it('records random decision branches on the board without adding news clutter', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ marketability: 30 }) });
    const item = makeDecisionItem({
      client_id: clientId,
      options: [
        {
          key: 'deny',
          label: 'Deny It',
          outcome: makeOutcome({ reputation_delta: 1, stat_deltas: { marketability: 1 } }),
          random_outcomes: [
            {
              key: 'backfire',
              label: 'Backfired',
              description: 'The denial drew more scrutiny.',
              chance: 0.35,
              marketability_modifier: 0.5,
              outcome: makeOutcome({ reputation_delta: -4, stat_deltas: { marketability: -5 } }),
            },
          ],
          push_risk: null,
        },
      ],
    });
    const state = makeRunState({ reputation: 50, roster: [client], decision_board: [item] });
    const result = resolveDecisionItem(state, item.id, 'deny', makeManifest());

    expect(result.reputation).toBe(46);
    expect(result.roster[0].stats.marketability.true_value).toBe(25);
    expect(result.decision_board[0].resolved_result_label).toBe('Backfired');
    expect(result.decision_board[0].resolved_result_description).toBe('The denial drew more scrutiny.');
    expect(result.news_feed).toHaveLength(0);
    jest.restoreAllMocks();
  });

  it('applies album-generation choices to the pending release quality, not upfront catalog streams', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const clientId = nextId();
    const campaign = makeReleaseCampaign({ client_id: clientId });
    const client = makeClient({ id: clientId, audience: 10_000 });
    const item = makeDecisionItem({
      template_key: 'album_better_studio',
      campaign_id: campaign.id,
      client_id: clientId,
      options: [
        {
          key: 'upgrade',
          label: 'Upgrade the Studio',
          outcome: makeOutcome({ money_delta: -3_000, stat_deltas: { form: 3, morale: 1 } }),
          random_outcomes: [
            {
              key: 'no_benefit',
              label: 'No Improvement',
              description: 'The better studio didn\'t translate to better output.',
              chance: 0.4,
              marketability_modifier: 0,
              outcome: makeOutcome({ money_delta: -3_000 }),
            },
          ],
          push_risk: null,
        },
      ],
    });
    const state = makeRunState({ roster: [client], campaigns: [campaign], decision_board: [item] });
    const result = resolveDecisionItem(state, item.id, 'upgrade', makeManifest());

    expect(result.campaigns[0].release_plan?.songs.map(song => song.quality)).toEqual([78, 100]);
    expect(result.roster[0].audience).toBe(10_000);
    expect(result.roster[0].catalog_releases).toHaveLength(0);
    jest.restoreAllMocks();
  });

  it('does not boost release quality when the album-generation random branch fails', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const campaign = makeReleaseCampaign({ client_id: clientId });
    const client = makeClient({ id: clientId });
    const item = makeDecisionItem({
      template_key: 'album_better_studio',
      campaign_id: campaign.id,
      client_id: clientId,
      options: [
        {
          key: 'upgrade',
          label: 'Upgrade the Studio',
          outcome: makeOutcome({ money_delta: -3_000, stat_deltas: { form: 3, morale: 1 } }),
          random_outcomes: [
            {
              key: 'no_benefit',
              label: 'No Improvement',
              description: 'The better studio didn\'t translate to better output.',
              chance: 0.4,
              marketability_modifier: 0,
              outcome: makeOutcome({ money_delta: -3_000 }),
            },
          ],
          push_risk: null,
        },
      ],
    });
    const state = makeRunState({ roster: [client], campaigns: [campaign], decision_board: [item] });
    const result = resolveDecisionItem(state, item.id, 'upgrade', makeManifest());

    expect(result.campaigns[0].release_plan?.songs.map(song => song.quality)).toEqual([70, 96]);
    expect(result.decision_board[0].resolved_result_label).toBe('No Improvement');
    jest.restoreAllMocks();
  });

  it('grants a decision-triggered trait after repeatedly choosing the same scandal response', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const manifest = makeManifest({
      traits: [
        {
          key:                    'scandal_hardened',
          label:                  'Scandal Hardened',
          stat_modifiers:         { morale: 2 },
          marketability_modifier: 0,
          event_bias:             { market: 0.75 },
          trigger_condition_key:  'decision_scandal_denial_go_quiet',
          trigger_threshold:      0,
          decision_trigger:       {
            template_key:   'scandal_denial',
            option_key:     'go_quiet',
            required_count: 3,
            probability:    1,
          },
        },
      ],
    });
    const scandalItem = (id: string) => makeDecisionItem({
      id,
      template_key: 'scandal_denial',
      client_id: clientId,
      options: [
        { key: 'go_quiet', label: 'Go Quiet', outcome: makeOutcome(), push_risk: null },
      ],
    });

    let state = makeRunState({ roster: [client], decision_board: [scandalItem('itm_1')] });
    state = resolveDecisionItem(state, 'itm_1', 'go_quiet', manifest);
    state = { ...state, decision_board: [scandalItem('itm_2')] };
    state = resolveDecisionItem(state, 'itm_2', 'go_quiet', manifest);
    state = { ...state, decision_board: [scandalItem('itm_3')] };
    const result = resolveDecisionItem(state, 'itm_3', 'go_quiet', manifest);

    expect(result.roster[0].decision_option_counts['scandal_denial:go_quiet']).toBe(3);
    expect(result.roster[0].traits).toEqual([
      {
        trait_id:               'scandal_hardened',
        stat_modifiers:         { morale: 2 },
        marketability_modifier: 0,
        event_bias:             { market: 0.75 },
      },
    ]);
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

  it('pays only the agency cut for client-entity lump sums', () => {
    const clientId = nextId();
    const agentContractId = nextId();
    const client = makeClient({ id: clientId, agent_contract_id: agentContractId });
    const agentContract = makeContract({
      id: agentContractId, tier: 'agent_client', client_id: clientId,
      your_cut: 20, amount: 0,
    });
    const draft = makeContractDraft({
      tier: 'client_entity', client_id: clientId, entity_id: nextId(),
      payout_type: 'lump_sum', amount: 5_000, your_cut: null,
    });
    const state = makeRunState({ money: 1_000, roster: [client], contracts: [agentContract] });
    const result = activateContract(state, draft, makeManifest());
    expect(result.money).toBe(2_000);
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

  it('expires existing active contracts for the same client and exclusivity scope', () => {
    const clientId = nextId();
    const oldLabel = makeContract({
      client_id: clientId,
      tier: 'client_entity',
      entity_id: 'label_old',
      exclusivity_scope: 'label',
      duration_remaining: 8,
    });
    const oldSponsor = makeContract({
      client_id: clientId,
      tier: 'client_entity',
      entity_id: 'sponsor_old',
      exclusivity_scope: 'sponsor',
      duration_remaining: 8,
    });
    const draft = makeContractDraft({
      tier: 'client_entity',
      client_id: clientId,
      entity_id: 'label_new',
      your_cut: null,
      exclusivity_scope: 'label',
    });
    const state = makeRunState({ contracts: [oldLabel, oldSponsor] });

    const result = activateContract(state, draft, makeManifest());

    expect(result.contracts.find(c => c.id === oldLabel.id)?.duration_remaining).toBe(0);
    expect(result.contracts.find(c => c.id === oldSponsor.id)?.duration_remaining).toBe(8);
    expect(result.contracts[result.contracts.length - 1].duration_remaining).toBe(draft.duration);
  });

  it('does not add a prospect to the roster when already at capacity', () => {
    const prospectId = nextId();
    const prospect = {
      id: prospectId,
      name: 'Over-cap Prospect',
      age_weeks: 20 * 52,
      arc_stage: 'rising' as const,
      audience: 5_000,
      stats: makeClientStats(),
      scouting_invested: 0,
      max_potential: 80,
      expires_in: 5,
      generated_at_reputation: 0,
    };
    const draft = makeContractDraft({ tier: 'agent_client', client_id: prospectId });
    const fullRoster = Array.from({ length: 3 }, () => makeClient());
    const state = makeRunState({
      prospects: [prospect],
      roster: fullRoster,
      agent: makeAgentState({ roster_capacity: 3 }),
    });

    const result = activateContract(state, draft, makeManifest());

    expect(result.roster).toHaveLength(3);
    expect(result.prospects).toHaveLength(1);
  });

  it('does not exceed roster capacity when two signing offers are approved back-to-back', () => {
    const prospect1Id = nextId();
    const prospect2Id = nextId();
    const makeProspect = (id: string) => ({
      id,
      name: `Prospect ${id}`,
      age_weeks: 20 * 52,
      arc_stage: 'rising' as const,
      audience: 5_000,
      stats: makeClientStats(),
      scouting_invested: 0,
      max_potential: 80,
      expires_in: 5,
      generated_at_reputation: 0,
    });
    const draft1 = makeContractDraft({ tier: 'agent_client', client_id: prospect1Id });
    const draft2 = makeContractDraft({ tier: 'agent_client', client_id: prospect2Id });
    const item1 = makeDecisionItem({ client_id: prospect1Id, contract_draft: draft1 });
    const item2 = makeDecisionItem({ client_id: prospect2Id, contract_draft: draft2 });
    const state = makeRunState({
      roster: [makeClient(), makeClient()],
      prospects: [makeProspect(prospect1Id), makeProspect(prospect2Id)],
      decision_board: [item1, item2],
      agent: makeAgentState({ roster_capacity: 3 }),
    });

    const after1 = resolveDecisionItem(state, item1.id, 'approve', makeManifest());
    const after2 = resolveDecisionItem(after1, item2.id, 'approve', makeManifest());

    expect(after2.roster).toHaveLength(3);
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
  payout_type: 'per_week',
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
  exclusivity_scope: null,
  objective_templates: [],
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

  it('generates a per_week draft with expected fields', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const template = makeContractTemplate({ payout_type: 'per_week' });
    const manifest = makeManifest({ contract_templates: [template] });
    const state = makeRunState({ roster: [client] });
    const draft = hydrateContractOffer(state, template.key, clientId, manifest);
    expect(draft).not.toBeNull();
    expect(draft?.payout_type).toBe('per_week');
    expect(draft?.tier).toBe('agent_client');
    expect(draft?.client_id).toBe(clientId);
    expect(typeof draft?.amount).toBe('number');
    expect(draft?.amount).toBeGreaterThan(0);
    expect(draft?.objectives).toHaveLength(0);
  });

  it('generates stronger contract offers for clients with larger fan bases', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const template = makeContractTemplate({
      amount_range: [10_000, 10_000],
      talent_scaling: 0.35,
      form_scaling: 0.35,
      marketability_scaling: 0.30,
    });
    const manifest = makeManifest({ contract_templates: [template] });
    const lowClientId = nextId();
    const highClientId = nextId();
    const lowState = makeRunState({ roster: [makeClient({ id: lowClientId, audience: 1_000, stats: makeClientStats({ talent: 60, form: 60, marketability: 60 }) })] });
    const highState = makeRunState({ roster: [makeClient({ id: highClientId, audience: 1_000_000, stats: makeClientStats({ talent: 60, form: 60, marketability: 60 }) })] });
    const lowDraft = hydrateContractOffer(lowState, template.key, lowClientId, manifest);
    const highDraft = hydrateContractOffer(highState, template.key, highClientId, manifest);
    expect(highDraft?.amount).toBeGreaterThan(lowDraft?.amount ?? 0);
  });

  it('reveals posture when negotiation level >= 5', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const template = makeContractTemplate({ payout_type: 'per_week' });
    const manifest = makeManifest({ contract_templates: [template] });
    const state    = makeRunState({
      roster: [client],
      agent: makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 5, operations: 0, coaching: 0 } }),
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
    const template = makeContractTemplate({ tier: 'client_entity', payout_type: 'per_week', cut_range: null });
    const manifest = makeManifest({ contract_templates: [template] });
    const state    = makeRunState({ roster: [client] });
    const draft = hydrateContractOffer(state, template.key, clientId, manifest);
    expect(draft?.entity_id).not.toBeNull();
  });

  it('uses a named label counterparty for label contracts', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const template = makeContractTemplate({
      tier: 'client_entity',
      payout_type: 'per_week',
      cut_range: null,
      exclusivity_scope: 'label',
    });
    const manifest = makeManifest({ contract_templates: [template] });
    const state    = makeRunState({ roster: [client] });
    const draft = hydrateContractOffer(state, template.key, clientId, manifest);
    expect(draft?.entity_id).toBe('Blue Hour Records');
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

  it('filters out contract offers when client audience is below min_audience', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const contractTmpl = makeContractTemplate({
      key: 'commission_test',
      tier: 'client_entity',
      payout_type: 'per_objective',
      cut_range: null,
      obligations_range: [0, 0],
      rep_gate: 30,
      valid_arc_stages: ['peak', 'declining'],
      exclusivity_scope: 'commission',
      min_audience: 50_000,
    });
    const boardTmpl = {
      key: 'commission_board_item',
      type: 'opportunity' as const,
      description_template: 'A studio wants to commission {client_name}.',
      rep_gate: 30,
      valid_arc_stages: ['peak', 'declining'] as any[],
      contract_template_key: 'commission_test',
      default_on_ignore_key: 'pass',
      expires_in: 3,
    };
    const manifest = makeManifest({ board_item_templates: [boardTmpl], contract_templates: [contractTmpl] });
    const highStats = makeClientStats({ marketability: 75, form: 70, talent: 70 });

    const belowThreshold = makeRunState({
      reputation: 50,
      roster: [makeClient({ arc_stage: 'peak', audience: 10_000, stats: highStats })],
    });
    expect(generateDecisionBoard(belowThreshold, manifest)).toHaveLength(0);

    const aboveThreshold = makeRunState({
      reputation: 50,
      roster: [makeClient({ arc_stage: 'peak', audience: 100_000, stats: highStats })],
    });
    expect(generateDecisionBoard(aboveThreshold, manifest)).toHaveLength(1);
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

  it('keeps the early board small even with many eligible items', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const templates = Array.from({ length: 8 }, (_, i) => ({
      key: `early_tmpl_${i}`,
      type: 'opportunity' as const,
      description_template: 'Early item',
      rep_gate: 0,
      valid_arc_stages: [] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in: null,
    }));
    const manifest = makeManifest({ board_item_templates: templates });
    const state = makeRunState({ turn_number: 2, roster: [makeClient()] });
    const board = generateDecisionBoard(state, manifest);
    expect(board).toHaveLength(EARLY_BOARD_MAX_ITEMS);
  });

  it('lets board pressure grow with time, roster, reputation, campaigns, and entity deals', () => {
    const clientId = nextId();
    const state = makeRunState({
      turn_number: 16,
      reputation: 75,
      roster: [makeClient({ id: clientId }), makeClient(), makeClient()],
      campaigns: [{
        id: nextId(),
        client_id: clientId,
        type_key: 'tour',
        total_turns: 6,
        turns_remaining: 3,
        installment_results: [],
        pending_objective_ids: [],
      }],
      contracts: [makeContract({ tier: 'client_entity', client_id: clientId, duration_remaining: 8, your_cut: null })],
    });
    expect(computeDecisionBoardTargetCount(state)).toBeGreaterThan(BOARD_MIN_ITEMS);
  });

  it('slows board pressure after multiple skipped turns in a row', () => {
    const clientId = nextId();
    const baseState = makeRunState({
      turn_number: 24,
      reputation: 80,
      roster: [makeClient({ id: clientId }), makeClient(), makeClient(), makeClient()],
      campaigns: [{
        id: nextId(),
        client_id: clientId,
        type_key: 'tour',
        total_turns: 6,
        turns_remaining: 3,
        installment_results: [],
        pending_objective_ids: [],
      }],
      contracts: [makeContract({ tier: 'client_entity', client_id: clientId, duration_remaining: 8, your_cut: null })],
    });
    const engagedTarget = computeDecisionBoardTargetCount(baseState);
    const skippedTarget = computeDecisionBoardTargetCount({
      ...baseState,
      narrator_pacing: { consecutive_skipped_turns: 3, last_turn_skipped_items: 2 },
    });
    expect(skippedTarget).toBeLessThan(engagedTarget);
  });

  it('can increase board pressure when an engaged player has a fresh album release', () => {
    const baseline = makeRunState({
      turn_number: 14,
      reputation: 50,
      roster: [makeClient(), makeClient()],
      narrator_pacing: { consecutive_skipped_turns: 0, last_turn_skipped_items: 0 },
    });
    const withAlbum = {
      ...baseline,
      roster: [
        makeClient({ catalog_releases: [makeAlbumRelease()] }),
        makeClient(),
      ],
    };
    expect(computeDecisionBoardTargetCount(withAlbum)).toBeGreaterThan(computeDecisionBoardTargetCount(baseline));
  });

  it('does not generate label or sponsor offers for weak early clients', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const weakClient = makeClient({
      id: clientId,
      arc_stage: 'rising',
      audience: 1_000,
      stats: makeClientStats({ talent: 48, form: 45, marketability: 42 }),
    });
    const labelTemplate = makeContractTemplate({
      key: 'label_basic',
      tier: 'client_entity',
      payout_type: 'per_week',
      cut_range: null,
      exclusivity_scope: 'label',
      rep_gate: 0,
    });
    const sponsorTemplate = makeContractTemplate({
      key: 'sponsor_basic',
      tier: 'client_entity',
      payout_type: 'lump_sum',
      cut_range: null,
      exclusivity_scope: 'sponsor',
      rep_gate: 0,
    });
    const manifest = makeManifest({
      contract_templates: [labelTemplate, sponsorTemplate],
      board_item_templates: [
        {
          key: 'label_offer',
          type: 'contract_offer' as const,
          description_template: 'Label offer',
          rep_gate: 0,
          valid_arc_stages: ['rising'] as any[],
          contract_template_key: 'label_basic',
          default_on_ignore_key: 'reject',
          expires_in: 2,
        },
        {
          key: 'sponsor_offer',
          type: 'opportunity' as const,
          description_template: 'Sponsor offer',
          rep_gate: 0,
          valid_arc_stages: ['rising'] as any[],
          contract_template_key: 'sponsor_basic',
          default_on_ignore_key: 'pass',
          expires_in: 2,
        },
      ],
    });
    const board = generateDecisionBoard(makeRunState({ turn_number: 3, reputation: 20, roster: [weakClient] }), manifest);
    expect(board.some(i => i.template_key === 'label_offer' || i.template_key === 'sponsor_offer')).toBe(false);
  });

  it('can generate a sponsor offer once client marketability and agency reputation are high enough', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const strongClient = makeClient({
      id: clientId,
      arc_stage: 'peak',
      audience: 250_000,
      stats: makeClientStats({ talent: 72, form: 75, marketability: 82 }),
    });
    const sponsorTemplate = makeContractTemplate({
      key: 'sponsor_basic',
      tier: 'client_entity',
      payout_type: 'lump_sum',
      cut_range: null,
      exclusivity_scope: 'sponsor',
      rep_gate: 0,
    });
    const manifest = makeManifest({
      contract_templates: [sponsorTemplate],
      board_item_templates: [{
        key: 'sponsor_offer',
        type: 'opportunity' as const,
        description_template: 'Sponsor offer',
        rep_gate: 0,
        valid_arc_stages: ['peak'] as any[],
        contract_template_key: 'sponsor_basic',
        default_on_ignore_key: 'pass',
        expires_in: 2,
      }],
    });
    const board = generateDecisionBoard(makeRunState({ turn_number: 14, reputation: 50, roster: [strongClient] }), manifest);
    expect(board.some(i => i.template_key === 'sponsor_offer')).toBe(true);
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

describe('decision-queue — generateDecisionBoard campaign-gated templates', () => {
  afterEach(() => jest.restoreAllMocks());

  it('only generates campaign-gated decisions for matching active campaigns', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const campaignId = nextId();
    const campaignTemplate = {
      key: 'tour_press_request',
      type: 'client_request' as const,
      description_template: '{client_name} needs a tour press decision.',
      campaign_type_keys: ['tour'],
      rep_gate: 0,
      valid_arc_stages: [] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in: null,
    };
    const genericTemplate = {
      key: 'generic_request',
      type: 'opportunity' as const,
      description_template: 'A generic request appears.',
      rep_gate: 0,
      valid_arc_stages: [] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in: null,
    };
    const manifest = makeManifest({ board_item_templates: [campaignTemplate, genericTemplate] });

    const withoutCampaign = generateDecisionBoard(
      makeRunState({ roster: [makeClient({ id: clientId })] }),
      manifest,
    );
    expect(withoutCampaign.some(i => i.template_key === 'tour_press_request')).toBe(false);

    const withCampaign = generateDecisionBoard(
      makeRunState({
        roster: [makeClient({ id: clientId, name: 'Client A' })],
        campaigns: [{
          id: campaignId,
          client_id: clientId,
          type_key: 'tour',
          total_turns: 3,
          turns_remaining: 3,
          installment_results: [],
          pending_objective_ids: [],
        }],
      }),
      manifest,
    );
    const gated = withCampaign.find(i => i.template_key === 'tour_press_request');
    expect(gated?.campaign_id).toBe(campaignId);
    expect(gated?.client_id).toBe(clientId);
  });

  it('does not generate post-release selling decisions before a single is released', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const sellingTemplate = {
      key: 'selling_different_sound',
      type: 'client_request' as const,
      description_template: '{client_name} has a post-release issue.',
      requires_catalog_release_kind: ['single' as const],
      rep_gate: 0,
      valid_arc_stages: [] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'do_nothing',
      expires_in: 1,
    };
    const manifest = makeManifest({ board_item_templates: [sellingTemplate] });
    const activeSingle = {
      id: nextId(),
      client_id: clientId,
      type_key: 'single_release',
      total_turns: 2,
      turns_remaining: 1,
      installment_results: [],
      pending_objective_ids: [],
      release_plan: { kind: 'single' as const, title: 'Pending Single', songs: [] },
    };

    const board = generateDecisionBoard(
      makeRunState({
        roster: [makeClient({ id: clientId })],
        campaigns: [activeSingle],
      }),
      manifest,
    );

    expect(board.some(i => i.template_key === 'selling_different_sound')).toBe(false);
  });

  it('generates post-release selling decisions for clients with matching catalog releases', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const sellingTemplate = {
      key: 'selling_different_sound',
      type: 'client_request' as const,
      description_template: '{client_name} has a post-release issue.',
      requires_catalog_release_kind: ['single' as const],
      rep_gate: 0,
      valid_arc_stages: [] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'do_nothing',
      expires_in: 1,
    };
    const manifest = makeManifest({ board_item_templates: [sellingTemplate] });

    const board = generateDecisionBoard(
      makeRunState({
        roster: [makeClient({
          id: clientId,
          catalog_releases: [makeAlbumRelease({ kind: 'single', type_key: 'single_release' })],
        })],
      }),
      manifest,
    );

    const item = board.find(i => i.template_key === 'selling_different_sound');
    expect(item?.client_id).toBe(clientId);
    expect(item?.campaign_id).toBeNull();
  });

  it('generates tour technical accident decisions with selectable options', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const campaignId = nextId();
    const manifest = makeManifest({
      board_item_templates: [{
        key: 'tour_technical_accident',
        type: 'client_request',
        description_template: 'A technical accident mid-set has thrown {client_name} into chaos.',
        campaign_type_keys: ['tour'],
        rep_gate: 0,
        valid_arc_stages: [],
        contract_template_key: null,
        default_on_ignore_key: 'try_resolve',
        expires_in: 1,
      }],
    });

    const board = generateDecisionBoard(
      makeRunState({
        roster: [makeClient({ id: clientId })],
        campaigns: [{
          id: campaignId,
          client_id: clientId,
          type_key: 'tour',
          total_turns: 4,
          turns_remaining: 4,
          installment_results: [],
          pending_objective_ids: [],
        }],
      }),
      manifest,
    );

    const item = board.find(i => i.template_key === 'tour_technical_accident');
    expect(item?.options.map(option => option.key)).toEqual(['embrace_chaos', 'try_resolve']);
    jest.restoreAllMocks();
  });
});

// ─── activateContract — extra coverage ───────────────────────────────────────

describe('decision-queue — activateContract (prospect promotion)', () => {
  it('promotes prospect to roster on agent_client contract activation', () => {
    const prospectId = nextId();
    const prospect = { id: prospectId, name: 'Test Prospect', age_weeks: 20 * 52, arc_stage: 'rising' as const, audience: 5_000, stats: makeClientStats(), scouting_invested: 0, max_potential: 80, expires_in: 10, generated_at_reputation: 50 };
    const draft = makeContractDraft({ tier: 'agent_client', client_id: prospectId });
    const state = makeRunState({ roster: [], prospects: [prospect] });
    const result = activateContract(state, draft, makeManifest());
    expect(result.roster).toHaveLength(1);
    expect(result.roster[0].id).toBe(prospectId);
    expect(result.prospects).toHaveLength(0);
  });

  it('preserves prospect portrait and gender on queued signing activation', () => {
    const prospectId = nextId();
    const prospect = {
      id: prospectId,
      name: 'Rare Prospect',
      gender: 'female' as const,
      portrait: 'something_phonehead',
      age_weeks: 20 * 52,
      arc_stage: 'rising' as const,
      audience: 5_000,
      stats: makeClientStats(),
      scouting_invested: 0,
      max_potential: 80,
      expires_in: 10,
      generated_at_reputation: 50,
    };
    const draft = makeContractDraft({ tier: 'agent_client', client_id: prospectId });
    const state = makeRunState({ roster: [], prospects: [prospect] });
    const result = activateContract(state, draft, makeManifest());
    expect(result.roster[0].portrait).toBe('something_phonehead');
    expect(result.roster[0].gender).toBe('female');
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

// ─── generateDecisionBoard — tutorial turn-1 suppression ─────────────────────

describe('decision-queue — generateDecisionBoard tutorial suppression', () => {
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

  it('returns an empty board on turn 1 while tutorial is active', () => {
    const manifest = makeManifest({ board_item_templates: [template] });
    const state = makeRunState({ turn_number: 1, tutorial_step: 'friend_pitch' });
    const board = generateDecisionBoard(state, manifest);
    expect(board).toHaveLength(0);
  });

  it('generates decisions normally on turn 1 when tutorial is done', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const manifest = makeManifest({ board_item_templates: [template] });
    const state = makeRunState({ turn_number: 1, tutorial_step: 'done' });
    const board = generateDecisionBoard(state, manifest);
    expect(board.length).toBeGreaterThan(0);
    jest.restoreAllMocks();
  });

  it('generates decisions normally on turn 1 when tutorial_step is null (no tutorial)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const manifest = makeManifest({ board_item_templates: [template] });
    const state = makeRunState({ turn_number: 1, tutorial_step: null });
    const board = generateDecisionBoard(state, manifest);
    expect(board.length).toBeGreaterThan(0);
    jest.restoreAllMocks();
  });

  it('does not suppress the board on turn 2 even with an active tutorial step', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const manifest = makeManifest({ board_item_templates: [template] });
    const state = makeRunState({ turn_number: 2, tutorial_step: 'roster_highlight' });
    const board = generateDecisionBoard(state, manifest);
    expect(board.length).toBeGreaterThan(0);
    jest.restoreAllMocks();
  });
});

// ─── computeCounterAggressiveness ────────────────────────────────────────────

describe('decision-queue — computeCounterAggressiveness', () => {
  const baseDraft = makeContractDraft();  // amount=10_000, your_cut=15, obligations_per_turn=500, duration=12

  it('returns 0 when no fields are changed', () => {
    expect(computeCounterAggressiveness(baseDraft, {})).toBe(0);
  });

  it('returns positive value when counter requests more money', () => {
    const result = computeCounterAggressiveness(baseDraft, { amount: 20_000 });
    expect(result).toBeGreaterThan(0);
  });

  it('returns negative value when counter proposes less money', () => {
    const result = computeCounterAggressiveness(baseDraft, { amount: 5_000 });
    expect(result).toBeLessThan(0);
  });

  it('returns positive value when counter requests higher cut', () => {
    const result = computeCounterAggressiveness(baseDraft, { your_cut: 25 });
    expect(result).toBeGreaterThan(0);
  });

  it('returns positive value when counter requests fewer obligations', () => {
    const result = computeCounterAggressiveness(baseDraft, { obligations_per_turn: 0 });
    expect(result).toBeGreaterThan(0);
  });

  it('combined aggressive changes produce larger value than a single change', () => {
    const single   = computeCounterAggressiveness(baseDraft, { amount: 20_000 });
    const combined = computeCounterAggressiveness(baseDraft, { amount: 20_000, your_cut: 25 });
    expect(combined).toBeGreaterThan(single);
  });

  it('result stays within [-1, 1]', () => {
    const max = computeCounterAggressiveness(baseDraft, { amount: 1_000_000, your_cut: 30, obligations_per_turn: 0, duration: 100 });
    const min = computeCounterAggressiveness(baseDraft, { amount: 0, your_cut: 0, obligations_per_turn: 10_000, duration: 1 });
    expect(max).toBeLessThanOrEqual(1);
    expect(min).toBeGreaterThanOrEqual(-1);
  });

  it('ignores your_cut contribution when draft.your_cut is null', () => {
    const noCutDraft = makeContractDraft({ your_cut: null });
    const withCut    = computeCounterAggressiveness(baseDraft, { your_cut: 25 });
    const withoutCut = computeCounterAggressiveness(noCutDraft, { your_cut: 25 });
    expect(withCut).toBeGreaterThan(0);
    expect(withoutCut).toBe(0);
  });

  it('ignores counter.your_cut when it is null', () => {
    const result = computeCounterAggressiveness(baseDraft, { your_cut: null });
    expect(result).toBe(0);
  });

  it('duration change increases aggressiveness when asking for longer lock-in', () => {
    const result = computeCounterAggressiveness(baseDraft, { duration: 24 });
    expect(result).toBeGreaterThan(0);
  });
});

// ─── computeCounterAcceptanceProbability ─────────────────────────────────────

describe('decision-queue — computeCounterAcceptanceProbability', () => {
  afterEach(() => jest.restoreAllMocks());

  it('true_probability is within [0.05, 0.95]', () => {
    const draft = makeContractDraft({ counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null } });
    const state = makeRunState();
    const range = computeCounterAcceptanceProbability(state, draft, {});
    expect(range.true_probability).toBeGreaterThanOrEqual(0.05);
    expect(range.true_probability).toBeLessThanOrEqual(0.95);
  });

  it('high posture + no aggressiveness → high probability', () => {
    const draft = makeContractDraft({ counterparty_posture: { true_value: 0.9, is_revealed: true, observed_min: 0.85, observed_max: 0.95 } });
    const state = makeRunState();
    const range = computeCounterAcceptanceProbability(state, draft, {});
    expect(range.true_probability).toBeCloseTo(0.95, 1);
  });

  it('high aggressiveness reduces probability', () => {
    const draft = makeContractDraft({ counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null } });
    const state = makeRunState();
    const rangeNeutral     = computeCounterAcceptanceProbability(state, draft, {});
    const rangeAggressive  = computeCounterAcceptanceProbability(state, draft, { amount: 50_000 });
    expect(rangeAggressive.true_probability).toBeLessThan(rangeNeutral.true_probability);
  });

  it('higher negotiation level produces a narrower observed range', () => {
    const draft = makeContractDraft();
    const lowNeg  = makeRunState({ agent: makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 0, operations: 0, coaching: 0 } }) });
    const highNeg = makeRunState({ agent: makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 5, operations: 0, coaching: 0 } }) });
    const low  = computeCounterAcceptanceProbability(lowNeg,  draft, {});
    const high = computeCounterAcceptanceProbability(highNeg, draft, {});
    const bandLow  = high.observed_max - high.observed_min;
    const bandHigh = low.observed_max  - low.observed_min;
    expect(bandLow).toBeLessThan(bandHigh);
  });

  it('observed_min and observed_max bracket true_probability', () => {
    const draft = makeContractDraft();
    const state = makeRunState();
    const range = computeCounterAcceptanceProbability(state, draft, {});
    expect(range.observed_min).toBeLessThanOrEqual(range.true_probability);
    expect(range.observed_max).toBeGreaterThanOrEqual(range.true_probability);
  });

  it('fog_half reaches floor of 0.05 at negotiation level 5', () => {
    const draft = makeContractDraft({ counterparty_posture: { true_value: 0.5, is_revealed: true, observed_min: 0.45, observed_max: 0.55 } });
    const state = makeRunState({ agent: makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 5, operations: 0, coaching: 0 } }) });
    const range = computeCounterAcceptanceProbability(state, draft, {});
    const halfBand = (range.observed_max - range.observed_min) / 2;
    expect(halfBand).toBeCloseTo(0.05, 1);
  });
});

// ─── applyCounterTerms ────────────────────────────────────────────────────────

describe('decision-queue — applyCounterTerms', () => {
  it('leaves unspecified fields unchanged', () => {
    const draft = makeContractDraft({ amount: 10_000, your_cut: 15, duration: 12, obligations_per_turn: 500 });
    const result = applyCounterTerms(draft, { amount: 12_000 });
    expect(result.amount).toBe(12_000);
    expect(result.your_cut).toBe(15);
    expect(result.duration).toBe(12);
    expect(result.obligations_per_turn).toBe(500);
  });

  it('applies all specified fields', () => {
    const draft = makeContractDraft({ amount: 10_000, your_cut: 15, duration: 12, obligations_per_turn: 500 });
    const counter: CounterTerms = { amount: 14_000, your_cut: 20, duration: 18, obligations_per_turn: 300 };
    const result = applyCounterTerms(draft, counter);
    expect(result.amount).toBe(14_000);
    expect(result.your_cut).toBe(20);
    expect(result.duration).toBe(18);
    expect(result.obligations_per_turn).toBe(300);
  });

  it('can set your_cut to null', () => {
    const draft = makeContractDraft({ your_cut: 15 });
    const result = applyCounterTerms(draft, { your_cut: null });
    expect(result.your_cut).toBeNull();
  });

  it('returns a new object, not the same reference', () => {
    const draft = makeContractDraft();
    const result = applyCounterTerms(draft, { amount: 20_000 });
    expect(result).not.toBe(draft);
  });
});

// ─── resolveCounteroffer ──────────────────────────────────────────────────────

describe('decision-queue — resolveCounteroffer', () => {
  afterEach(() => jest.restoreAllMocks());

  const makeBoardItem = (overrides?: Partial<DecisionItem>): DecisionItem => ({
    id: `itm_${nextId()}`,
    type: 'contract_offer',
    template_key: 'test_template',
    client_id: null,
    contract_id: null,
    contract_draft: makeContractDraft(),
    description: 'Test offer',
    options: [],
    default_on_ignore: makeOutcome(),
    expires_in: null,
    is_resolved: false,
    chosen_option_key: null,
    ...overrides,
  });

  it('returns state unchanged for an unknown item id', () => {
    const state = makeRunState();
    const result = resolveCounteroffer(state, 'unknown_id', {}, makeManifest());
    expect(result).toBe(state);
  });

  it('returns state unchanged for an already-resolved item', () => {
    const item = makeBoardItem({ is_resolved: true, chosen_option_key: 'approve' });
    const state = makeRunState({ decision_board: [item] });
    const result = resolveCounteroffer(state, item.id, {}, makeManifest());
    expect(result).toBe(state);
  });

  it('returns state unchanged when item has no contract_draft', () => {
    const item = makeBoardItem({ contract_draft: null });
    const state = makeRunState({ decision_board: [item] });
    const result = resolveCounteroffer(state, item.id, {}, makeManifest());
    expect(result).toBe(state);
  });

  it('accepted path: activates contract and resolves item with counter_accepted', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01); // guaranteed accepted
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const draft    = makeContractDraft({ client_id: clientId, counterparty_posture: { true_value: 0.8, is_revealed: true, observed_min: 0.75, observed_max: 0.85 } });
    const item     = makeBoardItem({ client_id: clientId, contract_draft: draft });
    const state    = makeRunState({ roster: [client], decision_board: [item] });
    const result   = resolveCounteroffer(state, item.id, { amount: 12_000 }, makeManifest());
    expect(result.contracts).toHaveLength(1);
    expect(result.decision_board[0].is_resolved).toBe(true);
    expect(result.decision_board[0].chosen_option_key).toBe('counter_accepted');
  });

  it('accepted path: activated contract reflects the counter terms', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const draft    = makeContractDraft({ client_id: clientId, amount: 10_000, counterparty_posture: { true_value: 0.9, is_revealed: true, observed_min: 0.85, observed_max: 0.95 } });
    const item     = makeBoardItem({ client_id: clientId, contract_draft: draft });
    const state    = makeRunState({ roster: [client], decision_board: [item] });
    const result   = resolveCounteroffer(state, item.id, { amount: 13_000 }, makeManifest());
    expect(result.contracts[0].amount).toBe(13_000);
    // board item's contract_draft must also reflect the accepted counter terms
    expect(result.decision_board[0].contract_draft?.amount).toBe(13_000);
  });

  it('accepted renewal counter expires the current contract', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const clientId = nextId();
    const currentContract = makeContract({ client_id: clientId, tier: 'agent_client', duration_remaining: 1 });
    const client = makeClient({ id: clientId, agent_contract_id: currentContract.id });
    const draft = makeContractDraft({
      client_id: clientId,
      counterparty_posture: { true_value: 0.9, is_revealed: true, observed_min: 0.85, observed_max: 0.95 },
    });
    const item = makeBoardItem({
      type: 'renewal',
      client_id: clientId,
      contract_id: currentContract.id,
      contract_draft: draft,
    });
    const state = makeRunState({
      roster: [client],
      contracts: [currentContract],
      decision_board: [item],
    });

    const result = resolveCounteroffer(state, item.id, { amount: 13_000 }, makeManifest());
    const expired = result.contracts.find(c => c.id === currentContract.id);
    const renewed = result.contracts.find(c => c.id !== currentContract.id);

    expect(expired?.duration_remaining).toBe(0);
    expect(renewed?.amount).toBe(13_000);
    expect(result.decision_board[0].resolved_result_description).toBe(
      'Renewed. The current contract will be replaced by the new term.',
    );
  });

  it('revised path: item stays unresolved and draft is updated toward counter terms', () => {
    // counter {amount: 20_000} vs original 10_000 → aggressiveness ≈ 0.45
    // posture=0.5, negMod=0 → true_prob ≈ 0.23; revised window [0.23, 0.48]
    // Roll 0.35 falls inside the revised window.
    jest.spyOn(Math, 'random').mockReturnValue(0.35);
    const draft = makeContractDraft({ amount: 10_000, counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null } });
    const item  = makeBoardItem({ contract_draft: draft });
    const state = makeRunState({ decision_board: [item] });
    const result = resolveCounteroffer(state, item.id, { amount: 20_000 }, makeManifest());
    expect(result.decision_board[0].is_resolved).toBe(false);
    // Revised amount should be between original and counter
    expect(result.decision_board[0].contract_draft?.amount).toBeGreaterThan(10_000);
    expect(result.decision_board[0].contract_draft?.amount).toBeLessThan(20_000);
  });

  it('rejected path: reputation decremented and item resolved with counter_rejected', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99); // guaranteed rejected
    const draft = makeContractDraft({ counterparty_posture: { true_value: 0.1, is_revealed: false, observed_min: null, observed_max: null } });
    const item  = makeBoardItem({ contract_draft: draft });
    const state = makeRunState({ reputation: 50, decision_board: [item] });
    const result = resolveCounteroffer(state, item.id, { amount: 1_000_000 }, makeManifest());
    expect(result.reputation).toBeLessThan(50);
    expect(result.decision_board[0].is_resolved).toBe(true);
    expect(result.decision_board[0].chosen_option_key).toBe('counter_rejected');
  });

  it('rejected path: removes an unsigned prospect who refuses an agent contract', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99); // guaranteed rejected
    const prospectId = nextId();
    const prospect = {
      id: prospectId,
      name: 'Declining Prospect',
      age_weeks: 20 * 52,
      arc_stage: 'rising' as const,
      audience: 5_000,
      stats: makeClientStats(),
      scouting_invested: 0,
      max_potential: 80,
      expires_in: 5,
      generated_at_reputation: 0,
    };
    const draft = makeContractDraft({
      tier: 'agent_client',
      client_id: prospectId,
      counterparty_posture: { true_value: 0.1, is_revealed: false, observed_min: null, observed_max: null },
    });
    const item  = makeBoardItem({ client_id: prospectId, contract_draft: draft });
    const state = makeRunState({ prospects: [prospect], decision_board: [item] });

    const result = resolveCounteroffer(state, item.id, { amount: 1_000_000 }, makeManifest());

    expect(result.prospects.some(p => p.id === prospectId)).toBe(false);
    expect(result.decision_board[0].chosen_option_key).toBe('counter_rejected');
  });

  it('revised path produces a larger compromise at higher negotiation', () => {
    // aggressiveness ≈ 0.45 from doubling amount; negMod=0 → true_prob≈0.23, window [0.23,0.48]
    // negMod=0.4 → true_prob≈0.31, window [0.31,0.56]. Roll 0.35 lands in both windows.
    const rollValue = 0.35;
    const draft = makeContractDraft({ amount: 10_000, counterparty_posture: { true_value: 0.5, is_revealed: false, observed_min: null, observed_max: null } });

    jest.spyOn(Math, 'random').mockReturnValue(rollValue);
    const lowNegState  = makeRunState({ decision_board: [{ ...makeBoardItem({ contract_draft: draft }), id: 'itm_low' }], agent: makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 0, operations: 0, coaching: 0 } }) });
    const lowResult    = resolveCounteroffer(lowNegState,  'itm_low',  { amount: 20_000 }, makeManifest());

    jest.spyOn(Math, 'random').mockReturnValue(rollValue);
    const highNegState = makeRunState({ decision_board: [{ ...makeBoardItem({ contract_draft: draft }), id: 'itm_high' }], agent: makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 5, operations: 0, coaching: 0 } }) });
    const highResult   = resolveCounteroffer(highNegState, 'itm_high', { amount: 20_000 }, makeManifest());

    const lowRevised  = lowResult.decision_board[0].contract_draft?.amount  ?? 0;
    const highRevised = highResult.decision_board[0].contract_draft?.amount ?? 0;
    expect(highRevised).toBeGreaterThan(lowRevised);
  });

  it('only modifies the target item in a multi-item board', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01); // accepted
    const clientId = nextId();
    const client   = makeClient({ id: clientId });
    const draft    = makeContractDraft({ client_id: clientId, counterparty_posture: { true_value: 0.9, is_revealed: true, observed_min: 0.85, observed_max: 0.95 } });
    const targetItem = makeBoardItem({ id: 'itm_target', client_id: clientId, contract_draft: draft });
    const otherItem  = makeBoardItem({ id: 'itm_other' });
    const state      = makeRunState({ roster: [client], decision_board: [targetItem, otherItem] });
    const result     = resolveCounteroffer(state, 'itm_target', {}, makeManifest());
    expect(result.decision_board.find(i => i.id === 'itm_target')?.is_resolved).toBe(true);
    expect(result.decision_board.find(i => i.id === 'itm_other')?.is_resolved).toBe(false);
  });
});

// ─── generateContractRenewalOffers ───────────────────────────────────────────

const makeRenewalManifest = () => {
  const contractTemplate = makeContractTemplate({
    key: 'agent_renewal',
    tier: 'agent_client',
    payout_type: 'per_week',
    cut_range: [10, 20],
  });
  const renewalBoardTemplate = {
    key: 'management_renewal',
    type: 'renewal' as const,
    description_template: '{client_name} wants to renew the management deal.',
    rep_gate: 0,
    valid_arc_stages: ['rising', 'peak', 'declining'] as any[],
    contract_template_key: 'agent_renewal',
    default_on_ignore_key: 'let_expire',
    expires_in: 2,
  };
  return makeManifest({
    contract_templates: [contractTemplate],
    board_item_templates: [renewalBoardTemplate],
  });
};

const makeLabelRenewalManifest = () => {
  const contractTemplate = makeContractTemplate({
    key: 'label_renewal_template',
    tier: 'client_entity',
    payout_type: 'per_week',
    cut_range: null,
    exclusivity_scope: 'label',
  });
  const renewalBoardTemplate = {
    key: 'label_renewal',
    type: 'renewal' as const,
    description_template: "{client_name}'s label wants to renew the deal.",
    rep_gate: 0,
    valid_arc_stages: ['rising', 'peak', 'declining'] as any[],
    contract_template_key: 'label_renewal_template',
    default_on_ignore_key: 'let_expire',
    expires_in: 2,
  };
  return makeManifest({
    contract_templates: [contractTemplate],
    board_item_templates: [renewalBoardTemplate],
  });
};

describe('decision-queue — generateContractRenewalOffers', () => {
  afterEach(() => jest.restoreAllMocks());

  it('generates a renewal offer for a happy client whose contract is almost expired', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ morale: RENEWAL_MORALE_THRESHOLD }) });
    const contract = makeContract({ client_id: clientId, tier: 'agent_client', duration_remaining: RENEWAL_NOTICE_TURNS });
    const state = makeRunState({ roster: [client], contracts: [contract] });
    const offers = generateContractRenewalOffers(state, makeRenewalManifest());
    expect(offers).toHaveLength(1);
    expect(offers[0].type).toBe('renewal');
    expect(offers[0].client_id).toBe(clientId);
    expect(offers[0].contract_id).toBe(contract.id);
  });

  it('does not generate a renewal offer when client morale is below threshold', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ morale: RENEWAL_MORALE_THRESHOLD - 1 }) });
    const contract = makeContract({ client_id: clientId, tier: 'agent_client', duration_remaining: RENEWAL_NOTICE_TURNS });
    const state = makeRunState({ roster: [client], contracts: [contract] });
    const offers = generateContractRenewalOffers(state, makeRenewalManifest());
    expect(offers).toHaveLength(0);
  });

  it('does not generate a renewal offer when contract has many turns remaining', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ morale: 80 }) });
    const contract = makeContract({ client_id: clientId, tier: 'agent_client', duration_remaining: RENEWAL_NOTICE_TURNS + 1 });
    const state = makeRunState({ roster: [client], contracts: [contract] });
    const offers = generateContractRenewalOffers(state, makeRenewalManifest());
    expect(offers).toHaveLength(0);
  });

  it('does not generate a renewal offer for an already-expired contract (duration_remaining = 0)', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ morale: 80 }) });
    const contract = makeContract({ client_id: clientId, tier: 'agent_client', duration_remaining: 0 });
    const state = makeRunState({ roster: [client], contracts: [contract] });
    const offers = generateContractRenewalOffers(state, makeRenewalManifest());
    expect(offers).toHaveLength(0);
  });

  it('does not generate a second renewal when one is already unresolved on the board', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ morale: 80 }) });
    const contract = makeContract({ client_id: clientId, tier: 'agent_client', duration_remaining: 2 });
    const existingRenewal = makeDecisionItem({ type: 'renewal', client_id: clientId, is_resolved: false });
    const state = makeRunState({ roster: [client], contracts: [contract], decision_board: [existingRenewal] });
    const offers = generateContractRenewalOffers(state, makeRenewalManifest());
    expect(offers).toHaveLength(0);
  });

  it('generates a renewal when the existing renewal for this client is already resolved', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ morale: 80 }) });
    const contract = makeContract({ client_id: clientId, tier: 'agent_client', duration_remaining: 2 });
    const resolvedRenewal = makeDecisionItem({ type: 'renewal', client_id: clientId, is_resolved: true, chosen_option_key: 'reject' });
    const state = makeRunState({ roster: [client], contracts: [contract], decision_board: [resolvedRenewal] });
    const offers = generateContractRenewalOffers(state, makeRenewalManifest());
    expect(offers).toHaveLength(1);
  });

  it('does not generate a renewal when no manifest template matches the contract tier', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ morale: 80 }) });
    // Contract is client_entity but manifest only has agent_client renewal template
    const contract = makeContract({ client_id: clientId, tier: 'client_entity', duration_remaining: 2 });
    const state = makeRunState({ roster: [client], contracts: [contract] });
    const offers = generateContractRenewalOffers(state, makeRenewalManifest());
    expect(offers).toHaveLength(0);
  });

  it('generates a label renewal when the label objectives were completed', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client = makeClient({
      id: clientId,
      stats: makeClientStats({ morale: RENEWAL_MORALE_THRESHOLD - 1 }),
    });
    const contract = makeContract({
      client_id: clientId,
      tier: 'client_entity',
      entity_id: 'Northstar Records',
      your_cut: null,
      exclusivity_scope: 'label',
      duration_remaining: 2,
      objectives: [
        {
          id: nextId(),
          description: 'Release one album during the deal',
          payout: 5_000,
          condition_key: 'album_released',
          is_met: true,
          is_paid: true,
        },
      ],
    });
    const state = makeRunState({ roster: [client], contracts: [contract] });
    const offers = generateContractRenewalOffers(state, makeLabelRenewalManifest());
    expect(offers).toHaveLength(1);
    expect(offers[0].contract_id).toBe(contract.id);
    expect(offers[0].contract_draft?.entity_id).toBe('Northstar Records');
    expect(offers[0].contract_draft?.exclusivity_scope).toBe('label');
  });

  it('does not generate a label renewal when the label has no objective or momentum satisfaction', () => {
    const clientId = nextId();
    const client = makeClient({
      id: clientId,
      audience: 10_000,
      catalog_releases: [],
      stats: makeClientStats({ form: 60, morale: 95 }),
    });
    const contract = makeContract({
      client_id: clientId,
      tier: 'client_entity',
      entity_id: 'Northstar Records',
      your_cut: null,
      exclusivity_scope: 'label',
      duration_remaining: 2,
      objectives: [
        {
          id: nextId(),
          description: 'Release one album during the deal',
          payout: 5_000,
          condition_key: 'album_released',
          is_met: false,
          is_paid: false,
        },
      ],
    });
    const state = makeRunState({ roster: [client], contracts: [contract] });
    const offers = generateContractRenewalOffers(state, makeLabelRenewalManifest());
    expect(offers).toHaveLength(0);
  });

  it('includes a contract_draft on the renewal item', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ morale: 80 }) });
    const contract = makeContract({ client_id: clientId, tier: 'agent_client', duration_remaining: 1 });
    const state = makeRunState({ roster: [client], contracts: [contract] });
    const offers = generateContractRenewalOffers(state, makeRenewalManifest());
    expect(offers[0].contract_draft).not.toBeNull();
  });

  it('renewal draft amount is at least the current contract amount', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ morale: 80 }) });
    // Template with rand=0.5 generates ~10k; contract at 24k keeps the floor.
    const contract = makeContract({
      client_id: clientId,
      tier: 'agent_client',
      amount: 24_000,
      your_cut: 23,
      obligations_per_turn: 900,
      duration_remaining: 1,
    });
    const state = makeRunState({ roster: [client], contracts: [contract] });

    const offers = generateContractRenewalOffers(state, makeRenewalManifest());
    const draft = offers[0].contract_draft;

    expect(draft?.amount).toBeGreaterThanOrEqual(contract.amount);
    expect(draft?.obligations_per_turn).toBe(contract.obligations_per_turn);
    expect(draft?.duration).toBeGreaterThan(contract.duration_remaining);
  });

  it('renewal draft cut is never higher than the current contract cut', () => {
    // rand=0.9 pushes template cut toward 20 (top of [10,20] range); contract cut is 12
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ morale: 80 }) });
    const contract = makeContract({
      client_id: clientId,
      tier: 'agent_client',
      your_cut: 12,
      duration_remaining: 1,
    });
    const state = makeRunState({ roster: [client], contracts: [contract] });

    const offers = generateContractRenewalOffers(state, makeRenewalManifest());
    expect(offers[0].contract_draft?.your_cut).toBeLessThanOrEqual(contract.your_cut!);
  });

  it('renewal draft amount grows when template reflects stronger stats than original deal', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ morale: 80 }) });
    // Contract locked in at 5k; template with current stats generates ~10k
    const contract = makeContract({
      client_id: clientId,
      tier: 'agent_client',
      amount: 5_000,
      duration_remaining: 1,
    });
    const state = makeRunState({ roster: [client], contracts: [contract] });

    const offers = generateContractRenewalOffers(state, makeRenewalManifest());
    expect(offers[0].contract_draft?.amount).toBeGreaterThan(contract.amount);
  });
});

describe('decision-queue — queueContractRenewalOffer', () => {
  afterEach(() => jest.restoreAllMocks());

  it('queues a renewal offer for a near-expiry current contract', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client = makeClient({ id: clientId, stats: makeClientStats({ morale: 20 }) });
    const contract = makeContract({
      client_id: clientId,
      tier: 'agent_client',
      amount: 18_000,
      duration_remaining: 1,
    });
    const state = makeRunState({ roster: [client], contracts: [contract] });

    const result = queueContractRenewalOffer(state, contract.id, makeRenewalManifest());

    expect(result.decision_board).toHaveLength(1);
    expect(result.decision_board[0].type).toBe('renewal');
    expect(result.decision_board[0].contract_id).toBe(contract.id);
    expect(result.decision_board[0].contract_draft?.amount).toBe(contract.amount);
  });

  it('does not queue a duplicate unresolved renewal for the same contract', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const contract = makeContract({ client_id: clientId, tier: 'agent_client', duration_remaining: 1 });
    const existingRenewal = makeDecisionItem({
      type: 'renewal',
      client_id: clientId,
      contract_id: contract.id,
      is_resolved: false,
    });
    const state = makeRunState({
      roster: [client],
      contracts: [contract],
      decision_board: [existingRenewal],
    });

    const result = queueContractRenewalOffer(state, contract.id, makeRenewalManifest());

    expect(result).toBe(state);
  });

  it('does not queue a renewal for a contract that is not near expiry', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const contract = makeContract({
      client_id: clientId,
      tier: 'agent_client',
      duration_remaining: RENEWAL_NOTICE_TURNS + 1,
    });
    const state = makeRunState({ roster: [client], contracts: [contract] });

    const result = queueContractRenewalOffer(state, contract.id, makeRenewalManifest());

    expect(result).toBe(state);
  });
});

describe('decision-queue — generateDecisionBoard includes triggered renewals', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renewal item appears on the board for a happy client with near-expiry contract', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client = makeClient({ id: clientId, arc_stage: 'rising', stats: makeClientStats({ morale: 80 }) });
    const contract = makeContract({ client_id: clientId, tier: 'agent_client', duration_remaining: 2 });
    const state = makeRunState({ roster: [client], contracts: [contract] });
    const board = generateDecisionBoard(state, makeRenewalManifest());
    const renewal = board.find(i => i.type === 'renewal');
    expect(renewal).toBeDefined();
    expect(renewal?.client_id).toBe(clientId);
  });

  it('renewal item does not appear for an unhappy client', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId = nextId();
    const client = makeClient({ id: clientId, arc_stage: 'rising', stats: makeClientStats({ morale: RENEWAL_MORALE_THRESHOLD - 1 }) });
    const contract = makeContract({ client_id: clientId, tier: 'agent_client', duration_remaining: 2 });
    const state = makeRunState({ roster: [client], contracts: [contract] });
    const board = generateDecisionBoard(state, makeRenewalManifest());
    expect(board.some(i => i.type === 'renewal')).toBe(false);
  });
});

// ─── injectAlbumOptionDecision ────────────────────────────────────────────────

describe('decision-queue — injectAlbumOptionDecision', () => {
  it('adds a label_option item to the decision board', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const labelContract = makeContract({
      client_id: clientId,
      tier: 'client_entity',
      entity_id: 'Velvet District',
      exclusivity_scope: 'label',
      duration_remaining: 8,
      album_option: { success_threshold: 55, duration: 12 },
    });
    const state = makeRunState({ roster: [client], contracts: [labelContract] });
    const result = injectAlbumOptionDecision(state, clientId, labelContract);
    const item = result.decision_board.find(i => i.type === 'label_option');
    expect(item).toBeDefined();
    expect(item?.client_id).toBe(clientId);
    expect(item?.contract_draft?.duration).toBe(12);
    expect(item?.contract_draft?.entity_id).toBe('Velvet District');
    expect(item?.contract_draft?.exclusivity_scope).toBe('label');
  });

  it('is a no-op when the contract has no album_option', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const labelContract = makeContract({ client_id: clientId, album_option: null });
    const state = makeRunState({ roster: [client], contracts: [labelContract] });
    const result = injectAlbumOptionDecision(state, clientId, labelContract);
    expect(result).toBe(state);
  });

  it('is a no-op when a pending label_option already exists for the client', () => {
    const clientId = nextId();
    const client = makeClient({ id: clientId });
    const labelContract = makeContract({
      client_id: clientId,
      album_option: { success_threshold: 55, duration: 12 },
    });
    const state = makeRunState({ roster: [client], contracts: [labelContract] });
    const first = injectAlbumOptionDecision(state, clientId, labelContract);
    const second = injectAlbumOptionDecision(first, clientId, labelContract);
    expect(second.decision_board.filter(i => i.type === 'label_option')).toHaveLength(1);
  });
});

// ─── resolveDecisionItem — label_option ───────────────────────────────────────

describe('decision-queue — resolveDecisionItem label_option', () => {
  const setupOptionState = () => {
    const clientId = nextId();
    const contractId = nextId();
    const client = makeClient({ id: clientId });
    const labelContract = makeContract({
      id: contractId,
      client_id: clientId,
      tier: 'client_entity',
      entity_id: 'Blue Hour Records',
      exclusivity_scope: 'label',
      duration_remaining: 6,
      album_option: { success_threshold: 55, duration: 12 },
    });
    const draft = makeContractDraft({
      tier: 'client_entity',
      client_id: clientId,
      entity_id: 'Blue Hour Records',
      your_cut: null,
      exclusivity_scope: 'label',
      duration: 12,
      album_option: null,
    });
    const item: DecisionItem = {
      id: nextId(),
      type: 'label_option',
      template_key: 'label_album_option',
      campaign_id: null,
      client_id: clientId,
      contract_id: contractId,
      contract_draft: draft,
      description: `${client.name}'s label is exercising their album option.`,
      options: [
        { key: 'approve', label: 'Accept', outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null }, push_risk: null },
        { key: 'reject', label: 'Refuse', outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: {}, morale_delta: 0, activates_contract_id: null }, push_risk: null },
      ],
      default_on_ignore: { money_delta: 0, reputation_delta: -2, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
      expires_in: 3,
      is_resolved: false,
      chosen_option_key: null,
      resolved_outcome: null,
      resolved_result_label: null,
      resolved_result_description: null,
    };
    const state = makeRunState({
      roster: [client],
      contracts: [labelContract],
      decision_board: [item],
    });
    return { state, item, contractId, clientId };
  };

  it('approve activates a new label contract and expires the old one', () => {
    const { state, item, contractId, clientId } = setupOptionState();
    const result = resolveDecisionItem(state, item.id, 'approve', makeManifest());
    const resolved = result.decision_board.find(i => i.id === item.id);
    expect(resolved?.is_resolved).toBe(true);
    expect(resolved?.chosen_option_key).toBe('approve');
    const newContract = result.contracts.find(c => c.client_id === clientId && c.duration_remaining === 12);
    expect(newContract).toBeDefined();
    const oldContract = result.contracts.find(c => c.id === contractId);
    expect(oldContract?.duration_remaining).toBe(0);
  });

  it('reject terminates the label contract and applies rep penalty', () => {
    const { state, item, contractId } = setupOptionState();
    const result = resolveDecisionItem(state, item.id, 'reject', makeManifest());
    const resolved = result.decision_board.find(i => i.id === item.id);
    expect(resolved?.is_resolved).toBe(true);
    expect(resolved?.chosen_option_key).toBe('reject');
    expect(result.contracts.find(c => c.id === contractId)?.duration_remaining).toBe(0);
    expect(result.reputation).toBeLessThan(state.reputation);
  });
});
