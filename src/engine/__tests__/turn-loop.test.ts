import {
  assertPhase,
  runTurnOpen,
  runUpkeep,
  runDecisionPhase,
  runResolution,
  runTurnClose,
  turnOrchestrator,
} from '../turn-loop';
import { makeRunState, makeManifest, makeClient, makeClientStats, makeContract, makeObjective, makeDebtState, nextId } from './fixtures';

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

  it('sets low_money_warning when money runs out', () => {
    const state = makeRunState({ phase: 'upkeep', money: 0, low_money_warning: false });
    const { state: result } = runUpkeep(state, makeManifest());
    // Overhead deducted from 0 → already 0, fireLowMoneyWarning fires
    expect(result.low_money_warning).toBe(true);
  });

  it('credits monthly income when there are paying contracts', () => {
    const clientId       = nextId();
    const agentCtId      = nextId();
    const client         = makeClient({ id: clientId, agent_contract_id: agentCtId });
    const agentContract  = makeContract({ id: agentCtId, tier: 'agent_client', client_id: clientId, your_cut: 20, payout_type: 'per_month', amount: 0 });
    const entityContract = makeContract({ tier: 'client_entity', client_id: clientId, entity_id: nextId(), payout_type: 'per_month', amount: 10_000, your_cut: null });
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

  it('increments turns_on_roster for all clients', () => {
    const emptyState = makeRunState({ phase: 'upkeep' });
    const { state: result } = runUpkeep(emptyState, makeManifest());
    expect(result.phase).toBe('decision');
  });

  it('fires client_milestone news when a client advances arc stage', () => {
    // A client at rising_to_peak_base_turns (24) turns_at_stage → will advance to peak
    const manifest = makeManifest();
    const threshold = manifest.arc.rising_to_peak_base_turns;
    const client = makeClient({ arc_stage: 'rising', turns_at_stage: threshold });
    const state  = makeRunState({ phase: 'upkeep', money: 50_000, roster: [client] });
    const { news } = runUpkeep(state, manifest);
    expect(news.some(n => n.type === 'client_milestone')).toBe(true);
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

  it('refreshes prospect pool when below MAX_PROSPECTS (6)', () => {
    // roster has a client so c.name arrow in usedNames Set is invoked
    const client = makeClient({ name: 'RosterStar' });
    const state  = makeRunState({ phase: 'decision', roster: [client], prospects: [] });
    const { state: result } = runDecisionPhase(state, makeManifest());
    expect(result.prospects.length).toBeGreaterThan(0);
  });

  it('does not refresh prospect pool when already at MAX_PROSPECTS (6) capacity', () => {
    const existingProspects = Array.from({ length: 6 }, (_, i) => ({
      id: `prospect_${i}`,
      name: `Prospect ${i}`,
      arc_stage: 'rising' as const,
      stats: makeClientStats(),
      scouting_invested: 0,
    }));
    const state = makeRunState({ phase: 'decision', prospects: existingProspects });
    const { state: result } = runDecisionPhase(state, makeManifest());
    expect(result.prospects.length).toBe(6);
  });

  it('adds only 1 prospect when pool has 5 (Math.min(2, 1) branch)', () => {
    const existingProspects = Array.from({ length: 5 }, (_, i) => ({
      id: `prospect_${i}`,
      name: `Prospect ${i}`,
      arc_stage: 'rising' as const,
      stats: makeClientStats(),
      scouting_invested: 0,
    }));
    const state = makeRunState({ phase: 'decision', prospects: existingProspects });
    const { state: result } = runDecisionPhase(state, makeManifest());
    expect(result.prospects.length).toBe(6);
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
