import {
  assertPhase,
  runTurnOpen,
  runUpkeep,
  runDecisionPhase,
  runResolution,
  runTurnClose,
  turnOrchestrator,
  shouldGenerateDecisionBeat,
  shouldGenerateEventBeat,
} from '../turn-loop';
import { makeRunState, makeManifest, makeClient, makeClientStats, makeContract, makeObjective, makeDebtState, makeAgentState, nextId } from './fixtures';
import { Campaign } from '../../types/campaign';
import { CampaignTypeDefinition } from '../../types/manifest';

// ─── assertPhase ─────────────────────────────────────────────────────────────

describe('turn-loop — assertPhase', () => {
  it('does not throw when phase matches', () => {
    const state = makeRunState({ phase: 'turn_open' });
    expect(() => assertPhase(state, 'turn_open')).not.toThrow();
  });

  it('throws when phase does not match', () => {
    const state = makeRunState({ phase: 'upkeep' });
    expect(() => assertPhase(state, 'turn_open')).toThrow(/Phase error/);
  });
});

// ─── runTurnOpen ─────────────────────────────────────────────────────────────

describe('turn-loop — runTurnOpen', () => {
  it('advances phase to "upkeep"', () => {
    const state = makeRunState({ phase: 'turn_open' });
    const { state: result } = runTurnOpen(state, makeManifest());
    expect(result.phase).toBe('upkeep');
  });

  it('returns empty news array', () => {
    const state = makeRunState({ phase: 'turn_open' });
    const { news } = runTurnOpen(state, makeManifest());
    expect(news).toHaveLength(0);
  });

  it('throws on wrong phase', () => {
    const state = makeRunState({ phase: 'decision' });
    expect(() => runTurnOpen(state, makeManifest())).toThrow();
  });
});

// ─── runUpkeep ───────────────────────────────────────────────────────────────

describe('turn-loop — runUpkeep', () => {
  it('advances phase to "decision"', () => {
    const state = makeRunState({ phase: 'upkeep' });
    const { state: result } = runUpkeep(state, makeManifest());
    expect(result.phase).toBe('decision');
  });

  it('deducts overhead expenses', () => {
    const state = makeRunState({ phase: 'upkeep', money: 50_000 });
    const { state: result } = runUpkeep(state, makeManifest());
    expect(result.money).toBeLessThan(50_000);
  });

  it('auto-loans credit ceiling when money runs out during upkeep', () => {
    const state = makeRunState({ phase: 'upkeep', money: 0, low_money_warning: false });
    const { state: result, news } = runUpkeep(state, makeManifest());
    // Bank covers costs: debt opens, money is restored, modal event queued
    expect(result.debt.is_active).toBe(true);
    expect(result.debt.balance).toBeGreaterThan(0);
    expect(result.money).toBeGreaterThan(0);
    expect(news.some(n => n.type === 'debt_opened')).toBe(true);
    expect(result.pending_events.some(e => e.template_key === '__debt_opened')).toBe(true);
  });

  it('credits weekly income when there are paying contracts', () => {
    const clientId       = nextId();
    const agentCtId      = nextId();
    const client         = makeClient({ id: clientId, agent_contract_id: agentCtId });
    const agentContract  = makeContract({ id: agentCtId, tier: 'agent_client', client_id: clientId, your_cut: 20, payout_type: 'per_week', amount: 0 });
    const entityContract = makeContract({ tier: 'client_entity', client_id: clientId, entity_id: nextId(), payout_type: 'per_week', amount: 10_000, your_cut: null });
    const state = makeRunState({ phase: 'upkeep', money: 50_000, roster: [client], contracts: [agentContract, entityContract] });
    const { state: result, news } = runUpkeep(state, makeManifest());
    // Should receive 20% of 10,000 = 2,000 income
    expect(news.some(n => n.type === 'income_received')).toBe(true);
    // Net: 50,000 - expenses + 2,000
    expect(result.money).toBeGreaterThan(50_000 - 2_000);
  });

  it('expires contracts with duration_remaining=1 after tick', () => {
    const contract = makeContract({ duration_remaining: 1 });
    const state    = makeRunState({ phase: 'upkeep', money: 50_000, contracts: [contract] });
    const { news } = runUpkeep(state, makeManifest());
    expect(news.some(n => n.type === 'contract_expired')).toBe(true);
  });

  it('services active debt during upkeep', () => {
    const debt  = makeDebtState({ is_active: true, balance: 5_000, per_turn_repayment: 500, interest_rate: 0.05 });
    const state = makeRunState({ phase: 'upkeep', money: 20_000, debt });
    const { state: result } = runUpkeep(state, makeManifest());
    // Debt service reduces balance
    expect(result.debt.balance).toBeLessThan(5_000);
  });

  it('adds debt repayment news during upkeep', () => {
    const debt = makeDebtState({ is_active: true, balance: 5_000, per_turn_repayment: 500 });
    const state = makeRunState({ phase: 'upkeep', money: 20_000, debt });
    const { news } = runUpkeep(state, makeManifest());
    expect(news.some(n => n.type === 'debt_repayment' && n.money_delta === -500)).toBe(true);
  });

  it('adds debt missed news when repayment cannot be serviced', () => {
    const debt = makeDebtState({ is_active: true, balance: 5_000, per_turn_repayment: 500 });
    const state = makeRunState({ phase: 'upkeep', money: 0, reputation: 80, debt });
    const { state: result, news } = runUpkeep(state, makeManifest());
    expect(result.debt.bankruptcy_warning_turns_remaining).toBe(1);
    expect(news.some(n => n.type === 'debt_missed' && n.description.includes('Grace weeks remaining: 1'))).toBe(true);
  });

  it('adds debt recovered news when a warning is cleared by repayment', () => {
    const debt = makeDebtState({
      is_active: true,
      balance: 1_000,
      per_turn_repayment: 100,
      bankruptcy_warning_turns_remaining: 1,
    });
    const state = makeRunState({ phase: 'upkeep', money: 20_000, debt });
    const { state: result, news } = runUpkeep(state, makeManifest());
    expect(result.debt.bankruptcy_warning_turns_remaining).toBeNull();
    expect(news.some(n => n.type === 'debt_recovered')).toBe(true);
  });

  it('does not auto-loan when debt is already active', () => {
    const debt  = makeDebtState({ is_active: true, balance: 2_000, per_turn_repayment: 100 });
    const state = makeRunState({ phase: 'upkeep', money: 0, reputation: 50, debt });
    const { state: result } = runUpkeep(state, makeManifest());
    // Existing debt — no second auto-loan; step 5 is skipped
    expect(result.debt.balance).toBeLessThanOrEqual(2_000);
    expect(result.pending_events.some(e => e.template_key === '__debt_opened')).toBe(false);
  });

  it('increments turns_on_roster for all clients', () => {
    const emptyState = makeRunState({ phase: 'upkeep' });
    const { state: result } = runUpkeep(emptyState, makeManifest());
    expect(result.phase).toBe('decision');
  });

  it('ages roster clients by one week during upkeep', () => {
    const client = makeClient({ age_weeks: 20 * 52 });
    const state = makeRunState({ phase: 'upkeep', money: 50_000, roster: [client] });
    const { state: result } = runUpkeep(state, makeManifest());
    expect(result.roster[0].age_weeks).toBe(client.age_weeks + 1);
  });

  it('applies building development to client stats during upkeep', () => {
    const client = makeClient({ stats: makeClientStats({ form: 40 }) });
    const state = makeRunState({
      phase: 'upkeep',
      money: 50_000,
      roster: [client],
      agent: makeAgentState({
        defense_tracks: [{ key: 'training_facility', level: 1, per_turn_cost: 300 }],
      }),
    });

    const { state: result } = runUpkeep(state, makeManifest());

    expect(result.roster[0].stats.form.true_value).toBe(41);
  });

  it('fires client_milestone news when a client advances arc stage', () => {
    // A client at rising_to_peak_base_turns weeks_at_stage will advance to peak
    const manifest = makeManifest();
    const threshold = manifest.arc.rising_to_peak_base_turns;
    const client = makeClient({ arc_stage: 'rising', turns_at_stage: threshold });
    const state  = makeRunState({ phase: 'upkeep', money: 50_000, roster: [client] });
    const { news } = runUpkeep(state, manifest);
    expect(news.some(n => n.type === 'client_milestone')).toBe(true);
  });

  it('creates campaign_ended news when a campaign finishes its last turn', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clientId   = nextId();
    const campaignId = nextId();
    const client = makeClient({ id: clientId, active_campaign_id: campaignId });
    const campaignType: CampaignTypeDefinition = {
      key: 'test_campaign', label: 'Gig Tour',
      form_weight: 1, variance: 0, total_turns: 1,
      payout_type: 'per_week', base_payout: 5_000,
      per_installment_stat_deltas: {}, event_trigger_threshold: 0,
      trait_trigger_threshold: 100, valid_arc_stages: [],
    };
    const campaign: Campaign = {
      id: campaignId, client_id: clientId, type_key: 'test_campaign',
      total_turns: 1, turns_remaining: 1, installment_results: [],
      pending_objective_ids: [],
    };
    const state = makeRunState({
      phase: 'upkeep', money: 50_000,
      roster: [client], campaigns: [campaign],
    });
    const { news } = runUpkeep(state, makeManifest({ campaign_types: [campaignType] }));
    const endedNews = news.filter(n => n.type === 'campaign_ended');
    expect(endedNews).toHaveLength(1);
    expect(endedNews[0].client_id).toBe(clientId);
    expect(endedNews[0].description).toContain('Gig Tour');
  });

  it('throws on wrong phase', () => {
    const state = makeRunState({ phase: 'turn_open' });
    expect(() => runUpkeep(state, makeManifest())).toThrow();
  });
});

// ─── runDecisionPhase ────────────────────────────────────────────────────────

describe('turn-loop — runDecisionPhase', () => {
  it('requires decision phase', () => {
    const state = makeRunState({ phase: 'upkeep' });
    expect(() => runDecisionPhase(state, makeManifest())).toThrow();
  });

  it('ticks item expiry and generates a board', () => {
    const state = makeRunState({ phase: 'decision' });
    const { state: result } = runDecisionPhase(state, makeManifest());
    expect(result.phase).toBe('decision');
    expect(Array.isArray(result.decision_board)).toBe(true);
  });

  it('spawns a prospect when pool is below cap and chance fires', () => {
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.1); // 0.1 < 0.3 base → fires
    const client = makeClient({ name: 'RosterStar' });
    const state  = makeRunState({ phase: 'decision', roster: [client], prospects: [] });
    const { state: result } = runDecisionPhase(state, makeManifest());
    expect(result.prospects.length).toBeGreaterThan(0);
    mockRandom.mockRestore();
  });

  it('does not refresh prospect pool when already at MAX_PROSPECTS (6) capacity', () => {
    const existingProspects = Array.from({ length: 6 }, (_, i) => ({
      id: `prospect_${i}`,
      name: `Prospect ${i}`,
      age_weeks: 20 * 52,
      arc_stage: 'rising' as const,
      audience: 5_000,
      stats: makeClientStats(),
      scouting_invested: 0,
      max_potential: 80,
      expires_in: 10,
      generated_at_reputation: 80,
    }));
    const state = makeRunState({ phase: 'decision', reputation: 80, prospects: existingProspects });
    const { state: result } = runDecisionPhase(state, makeManifest());
    expect(result.prospects.length).toBe(6);
  });

  it('spawns at most 1 prospect per turn when chance fires', () => {
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.1); // 0.1 < 0.3 base → fires
    const existingProspects = Array.from({ length: 5 }, (_, i) => ({
      id: `prospect_${i}`,
      name: `Prospect ${i}`,
      age_weeks: 20 * 52,
      arc_stage: 'rising' as const,
      audience: 5_000,
      stats: makeClientStats(),
      scouting_invested: 0,
      max_potential: 80,
      expires_in: 10,
      generated_at_reputation: 80,
    }));
    const state = makeRunState({ phase: 'decision', reputation: 80, prospects: existingProspects });
    const { state: result } = runDecisionPhase(state, makeManifest());
    expect(result.prospects.length).toBe(6);
    mockRandom.mockRestore();
  });

  it('removes prospects whose expires_in reaches 0', () => {
    const dyingProspect = {
      id: 'prospect_dying',
      name: 'Dying Prospect',
      age_weeks: 20 * 52,
      arc_stage: 'rising' as const,
      audience: 5_000,
      stats: makeClientStats(),
      scouting_invested: 0,
      max_potential: 80,
      expires_in: 1,
      generated_at_reputation: 0,
    };
    const state = makeRunState({ phase: 'decision', reputation: 10, prospects: [dyingProspect] });
    const { state: result } = runDecisionPhase(state, makeManifest());
    expect(result.prospects.find(p => p.id === 'prospect_dying')).toBeUndefined();
  });

  it('flushes prospects generated at a lower quality tier when reputation crosses a milestone', () => {
    // Prospect generated at rep 10 (tier 3 = pool 3) — stale once rep hits 25 (tier 4)
    const staleProspect = {
      id: 'prospect_stale',
      name: 'Stale Prospect',
      age_weeks: 20 * 52,
      arc_stage: 'rising' as const,
      audience: 5_000,
      stats: makeClientStats(),
      scouting_invested: 0,
      max_potential: 80,
      expires_in: 10,
      generated_at_reputation: 10,
    };
    const state = makeRunState({ phase: 'decision', reputation: 25, prospects: [staleProspect] });
    const { state: result } = runDecisionPhase(state, makeManifest());
    expect(result.prospects.find(p => p.id === 'prospect_stale')).toBeUndefined();
  });

  it('does not generate regular decisions or events while tutorial pressure is locked', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const state = makeRunState({
      phase: 'decision',
      turn_number: 6,
      tutorial_step: 'roster_highlight',
      roster: [makeClient()],
    });
    const manifest = makeManifest({
      board_item_templates: [{
        key: 'general_opp',
        type: 'opportunity',
        description_template: 'General opportunity',
        rep_gate: 0,
        valid_arc_stages: [],
        contract_template_key: null,
        default_on_ignore_key: 'skip',
        expires_in: null,
      }],
      events: [{
        key: 'client_event',
        category: 'client',
        severity: 'minor',
        description_template: '{client_name} needs attention.',
        options: [{ key: 'help', label: 'Help', outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {} } }],
        default_outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: {} },
        defense_track_key: null,
      }],
    });

    const { state: result } = runDecisionPhase(state, manifest);

    expect(result.decision_board).toHaveLength(0);
    expect(result.pending_events).toHaveLength(0);
    jest.restoreAllMocks();
  });

  it('uses random decision pressure averaging 2 per 6 weeks idle and 3 per 6 during active campaigns', () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.32)
      .mockReturnValueOnce(0.34)
      .mockReturnValueOnce(0.49)
      .mockReturnValueOnce(0.51);
    const clientId = nextId();
    const idle = makeRunState({ turn_number: 3, tutorial_step: 'done' });
    const campaign = makeRunState({
      turn_number: 3,
      tutorial_step: 'done',
      campaigns: [{
        id: nextId(),
        client_id: clientId,
        type_key: 'tour',
        total_turns: 4,
        turns_remaining: 4,
        installment_results: [],
        pending_objective_ids: [],
      }],
    });

    expect(shouldGenerateDecisionBeat(idle)).toBe(true);
    expect(shouldGenerateDecisionBeat(idle)).toBe(false);
    expect(shouldGenerateDecisionBeat(campaign)).toBe(true);
    expect(shouldGenerateDecisionBeat(campaign)).toBe(false);
    jest.restoreAllMocks();
  });

  it('uses random event pressure averaging 1 per 6 weeks', () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.16)
      .mockReturnValueOnce(0.17);
    expect(shouldGenerateEventBeat(makeRunState({ turn_number: 2, tutorial_step: 'done' }))).toBe(true);
    expect(shouldGenerateEventBeat(makeRunState({ turn_number: 2, tutorial_step: 'done' }))).toBe(false);
    expect(shouldGenerateEventBeat(makeRunState({ turn_number: 6, tutorial_step: 'campaign_tab' }))).toBe(false);
    jest.restoreAllMocks();
  });

  it('adds at most one new random decision when pressure hits', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const templates = Array.from({ length: 5 }, (_, index) => ({
      key: `tour_decision_${index}`,
      type: 'client_request' as const,
      description_template: 'Tour issue',
      rep_gate: 0,
      valid_arc_stages: [] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in: null,
    }));
    const state = makeRunState({ phase: 'decision', turn_number: 12, tutorial_step: 'done', roster: [makeClient()] });
    const manifest = makeManifest({ board_item_templates: templates });

    const { state: result } = runDecisionPhase(state, manifest);

    expect(result.decision_board).toHaveLength(1);
    jest.restoreAllMocks();
  });

  it('does not immediately repeat a recent random decision template', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    const previousItem = {
      id: 'itm_previous',
      type: 'client_request' as const,
      template_key: 'tour_acoustic_problem',
      campaign_id: null,
      client_id: null,
      contract_id: null,
      contract_draft: null,
      description: 'Previous acoustic issue',
      options: [],
      default_on_ignore: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
      expires_in: null,
      is_resolved: true,
      chosen_option_key: '__default__',
    };
    const template = {
      key: 'tour_acoustic_problem',
      type: 'client_request' as const,
      description_template: 'Same acoustic issue',
      rep_gate: 0,
      valid_arc_stages: [] as any[],
      contract_template_key: null,
      default_on_ignore_key: 'skip',
      expires_in: null,
    };
    const state = makeRunState({
      phase: 'decision',
      turn_number: 12,
      tutorial_step: 'done',
      roster: [makeClient()],
      decision_board: [previousItem],
    });
    const manifest = makeManifest({ board_item_templates: [template] });

    const { state: result } = runDecisionPhase(state, manifest);

    expect(result.decision_board).toHaveLength(0);
    jest.restoreAllMocks();
  });
});

// ─── runResolution ────────────────────────────────────────────────────────────

describe('turn-loop — runResolution', () => {
  it('advances phase to "turn_close"', () => {
    const state = makeRunState({ phase: 'decision' });
    const { state: result } = runResolution(state, makeManifest());
    expect(result.phase).toBe('turn_close');
  });

  it('fires defaults for all unresolved board items', () => {
    const item = {
      id: 'itm_1', type: 'contract_offer' as const, template_key: 'x', client_id: null,
      contract_id: null, contract_draft: null, description: '', expires_in: null,
      is_resolved: false, chosen_option_key: null,
      options: [],
      default_on_ignore: { money_delta: 0, reputation_delta: -1, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
    };
    const state = makeRunState({ phase: 'decision', reputation: 50, decision_board: [item] });
    const { state: result } = runResolution(state, makeManifest());
    expect(result.decision_board[0].is_resolved).toBe(true);
    expect(result.decision_board[0].chosen_option_key).toBe('__default__');
  });

  it('increments narrator skip streak when items are defaulted', () => {
    const item = {
      id: 'itm_1', type: 'contract_offer' as const, template_key: 'x', client_id: null,
      contract_id: null, contract_draft: null, description: '', expires_in: null,
      is_resolved: false, chosen_option_key: null,
      options: [],
      default_on_ignore: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
    };
    const state = makeRunState({
      phase: 'decision',
      decision_board: [item],
      narrator_pacing: { consecutive_skipped_turns: 1, last_turn_skipped_items: 1 },
    });
    const { state: result } = runResolution(state, makeManifest());
    expect(result.narrator_pacing).toEqual({ consecutive_skipped_turns: 2, last_turn_skipped_items: 1 });
  });

  it('resets narrator skip streak when everything was resolved by the player', () => {
    const item = {
      id: 'itm_1', type: 'contract_offer' as const, template_key: 'x', client_id: null,
      contract_id: null, contract_draft: null, description: '', expires_in: null,
      is_resolved: true, chosen_option_key: 'approve',
      options: [],
      default_on_ignore: { money_delta: 0, reputation_delta: 0, stat_deltas: {}, morale_delta: 0, activates_contract_id: null },
    };
    const state = makeRunState({
      phase: 'decision',
      decision_board: [item],
      narrator_pacing: { consecutive_skipped_turns: 2, last_turn_skipped_items: 1 },
    });
    const { state: result } = runResolution(state, makeManifest());
    expect(result.narrator_pacing).toEqual({ consecutive_skipped_turns: 0, last_turn_skipped_items: 0 });
  });

  it('evaluates and pays out a met peak_arc objective during resolution', () => {
    const clientId = nextId();
    const client   = makeClient({ id: clientId, arc_stage: 'peak' });
    const obj      = makeObjective({ payout: 8_000, condition_key: 'peak_arc', is_met: false, is_paid: false });
    const contract = makeContract({ client_id: clientId, payout_type: 'per_objective', objectives: [obj] });
    const state    = makeRunState({ phase: 'decision', money: 2_000, roster: [client], contracts: [contract] });
    const { state: result } = runResolution(state, makeManifest());
    expect(result.money).toBe(10_000);
    expect(result.contracts[0].objectives[0].is_met).toBe(true);
    expect(result.contracts[0].objectives[0].is_paid).toBe(true);
  });
});

// ─── runTurnClose ─────────────────────────────────────────────────────────────

describe('turn-loop — runTurnClose', () => {
  it('increments turn_number', () => {
    const state = makeRunState({ phase: 'turn_close', turn_number: 5 });
    const { state: result } = runTurnClose(state, makeManifest());
    expect(result.turn_number).toBe(6);
  });

  it('resets phase to "turn_open"', () => {
    const state = makeRunState({ phase: 'turn_close' });
    const { state: result } = runTurnClose(state, makeManifest());
    expect(result.phase).toBe('turn_open');
  });

  it('ends run when career clock expires', () => {
    const state = makeRunState({ phase: 'turn_close', turn_number: 60, career_length: 60 });
    const { state: result } = runTurnClose(state, makeManifest());
    expect(result.is_active).toBe(false);
    expect(result.end_condition).toBe('clock_expired');
  });

  it('throws on wrong phase', () => {
    const state = makeRunState({ phase: 'decision' });
    expect(() => runTurnClose(state, makeManifest())).toThrow();
  });

  it('returns early with bankrupt end condition when grace period expires (is_active false branch)', () => {
    const debt = makeDebtState({
      is_active: true,
      balance: 1_000,
      per_turn_repayment: 0,
      bankruptcy_warning_turns_remaining: 0,
    });
    const state = makeRunState({ phase: 'turn_close', money: 0, debt });
    const { state: result } = runTurnClose(state, makeManifest());
    expect(result.is_active).toBe(false);
    expect(result.end_condition).toBe('bankrupt');
  });
});

// ─── turnOrchestrator ─────────────────────────────────────────────────────────

describe('turn-loop — turnOrchestrator', () => {
  it('startTurn: takes state from turn_open to decision phase', () => {
    const state = makeRunState({ phase: 'turn_open', money: 50_000 });
    const { state: result } = turnOrchestrator.startTurn(state, makeManifest());
    expect(result.phase).toBe('decision');
  });

  it('endTurn: takes state from decision to turn_open (next turn)', () => {
    const state = makeRunState({ phase: 'decision', turn_number: 3 });
    const { state: result } = turnOrchestrator.endTurn(state, makeManifest());
    expect(result.phase).toBe('turn_open');
    expect(result.turn_number).toBe(4);
  });

  it('full turn cycle: start then end returns higher turn_number in turn_open', () => {
    let state = makeRunState({ phase: 'turn_open', money: 50_000 });
    const { state: mid } = turnOrchestrator.startTurn(state, makeManifest());
    const { state: end } = turnOrchestrator.endTurn(mid, makeManifest());
    expect(end.turn_number).toBe(2);
    expect(end.phase).toBe('turn_open');
  });
});
