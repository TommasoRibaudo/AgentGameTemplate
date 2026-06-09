import {
  applyTalentGrowthDecay,
  BASE_GROWTH_CHANCE,
  GROWTH_CHANCE_PER_TF_LVL,
  BASE_GROWTH_AMOUNT,
  GROWTH_AMOUNT_PER_TF_LVL,
  BASE_DECAY_CHANCE,
  BASE_DECAY_AMOUNT,
  TALENT_SNAP_BACK_AMOUNT,
} from '../client';
import { makeClient, makeClientStats, makeAgentState } from './fixtures';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const clientWithTalent = (talent: number, maxPotential: number, stage: 'rising' | 'peak' | 'declining' = 'rising') =>
  makeClient({
    arc_stage: stage,
    max_potential: maxPotential,
    stats: makeClientStats({ talent, morale: 70, form: 70 }),
  });

const agentWithCoaching = (coaching: number) =>
  makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 0, operations: 0, coaching } });

const agentWithTF = (tfLevel: number) =>
  makeAgentState({ defense_tracks: [{ key: 'training_facility', level: tfLevel, per_turn_cost: 300 }] });

// ─── No-change guard ─────────────────────────────────────────────────────────

describe('applyTalentGrowthDecay — no growth when roll fails', () => {
  it('returns the same client reference when roll fails', () => {
    jest.spyOn(Math, 'random').mockReturnValue(1); // roll always fails
    const client = clientWithTalent(60, 80);
    const result = applyTalentGrowthDecay(client, makeAgentState());
    expect(result).toBe(client);
    jest.restoreAllMocks();
  });

  it('returns the same client reference when declining roll fails', () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const client = clientWithTalent(60, 80, 'declining');
    const result = applyTalentGrowthDecay(client, makeAgentState());
    expect(result).toBe(client);
    jest.restoreAllMocks();
  });
});

// ─── Growth fires ─────────────────────────────────────────────────────────────

describe('applyTalentGrowthDecay — growth', () => {
  it('increases talent when roll passes', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // roll always passes
    const client = clientWithTalent(60, 80);
    const result = applyTalentGrowthDecay(client, makeAgentState());
    expect(result.stats.talent.true_value).toBeGreaterThan(60);
    jest.restoreAllMocks();
  });

  it('growth does not exceed max_potential', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const client = clientWithTalent(79, 80); // one point below ceiling
    const result = applyTalentGrowthDecay(client, makeAgentState());
    expect(result.stats.talent.true_value).toBeLessThanOrEqual(80);
    jest.restoreAllMocks();
  });

  it('talent already at max_potential does not grow', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const client = clientWithTalent(80, 80);
    const result = applyTalentGrowthDecay(client, makeAgentState());
    expect(result.stats.talent.true_value).toBe(80);
    jest.restoreAllMocks();
  });

  it('higher coaching produces a larger growth amount', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const base   = clientWithTalent(50, 100);
    const lowCoach  = applyTalentGrowthDecay(base, agentWithCoaching(0));
    const highCoach = applyTalentGrowthDecay(base, agentWithCoaching(5));
    expect(highCoach.stats.talent.true_value).toBeGreaterThan(lowCoach.stats.talent.true_value);
    jest.restoreAllMocks();
  });

  it('training_facility level increases growth amount', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const base  = clientWithTalent(50, 100);
    const noTF  = applyTalentGrowthDecay(base, makeAgentState());
    const withTF = applyTalentGrowthDecay(base, agentWithTF(3));
    expect(withTF.stats.talent.true_value).toBeGreaterThan(noTF.stats.talent.true_value);
    jest.restoreAllMocks();
  });

  it('peak clients grow just like rising clients', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const rising = makeClient({ arc_stage: 'rising', max_potential: 100, stats: makeClientStats({ talent: 60 }) });
    const peak   = makeClient({ arc_stage: 'peak',   max_potential: 100, stats: makeClientStats({ talent: 60 }) });
    const rResult = applyTalentGrowthDecay(rising, makeAgentState());
    const pResult = applyTalentGrowthDecay(peak,   makeAgentState());
    expect(rResult.stats.talent.true_value).toBeGreaterThan(60);
    expect(pResult.stats.talent.true_value).toBeGreaterThan(60);
    jest.restoreAllMocks();
  });
});

// ─── Decay fires ──────────────────────────────────────────────────────────────

describe('applyTalentGrowthDecay — decay (declining)', () => {
  it('decreases talent when roll passes', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const client = clientWithTalent(60, 80, 'declining');
    const result = applyTalentGrowthDecay(client, makeAgentState());
    expect(result.stats.talent.true_value).toBeLessThan(60);
    jest.restoreAllMocks();
  });

  it('talent never decays below 0', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const client = clientWithTalent(0, 80, 'declining');
    const result = applyTalentGrowthDecay(client, makeAgentState());
    expect(result.stats.talent.true_value).toBeGreaterThanOrEqual(0);
    jest.restoreAllMocks();
  });

  it('declining clients decay not grow', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const client = clientWithTalent(60, 80, 'declining');
    const result = applyTalentGrowthDecay(client, makeAgentState());
    expect(result.stats.talent.true_value).toBeLessThan(60);
    jest.restoreAllMocks();
  });

  it('low morale increases decay probability (produces change more often)', () => {
    // With high morale the decay chance should be lower; run deterministic test
    // by checking that low morale always triggers and high morale does not at threshold roll
    const lowMorale  = makeClient({ arc_stage: 'declining', max_potential: 80, stats: makeClientStats({ talent: 60, morale: 10 }) });
    const highMorale = makeClient({ arc_stage: 'declining', max_potential: 80, stats: makeClientStats({ talent: 60, morale: 90 }) });

    // Low morale (10) chance ≈ 0.25 * 1.4 * 0.84 ≈ 0.294
    // High morale (90) chance ≈ 0.25 * 0.6 * 0.84 ≈ 0.126
    // Roll of 0.20 is between the two: fires for low morale, not for high morale
    jest.spyOn(Math, 'random').mockReturnValue(0.20);
    const lowResult  = applyTalentGrowthDecay(lowMorale,  makeAgentState());
    const highResult = applyTalentGrowthDecay(highMorale, makeAgentState());
    expect(lowResult.stats.talent.true_value).toBeLessThan(60);
    expect(highResult.stats.talent.true_value).toBe(60);
    jest.restoreAllMocks();
  });
});

// ─── Snap-back ────────────────────────────────────────────────────────────────

describe('applyTalentGrowthDecay — snap-back above max_potential', () => {
  it('pulls talent back when above ceiling', () => {
    const client = clientWithTalent(90, 80); // above max_potential
    const result = applyTalentGrowthDecay(client, makeAgentState());
    expect(result.stats.talent.true_value).toBeLessThan(90);
    expect(result.stats.talent.true_value).toBeGreaterThanOrEqual(80);
  });

  it('snap-back is deterministic (no roll)', () => {
    // Even with Math.random returning 1 (which would block growth/decay), snap-back fires
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const client = clientWithTalent(85, 80);
    const result = applyTalentGrowthDecay(client, makeAgentState());
    expect(result.stats.talent.true_value).toBe(85 - TALENT_SNAP_BACK_AMOUNT);
    jest.restoreAllMocks();
  });

  it('snap-back does not overshoot below max_potential', () => {
    const client = clientWithTalent(80 + TALENT_SNAP_BACK_AMOUNT - 1, 80); // just above ceiling
    const result = applyTalentGrowthDecay(client, makeAgentState());
    expect(result.stats.talent.true_value).toBeGreaterThanOrEqual(80);
  });

  it('snap-back takes priority over decay in declining stage', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const client = clientWithTalent(90, 80, 'declining'); // above ceiling + declining
    const result = applyTalentGrowthDecay(client, makeAgentState());
    // Should snap back by TALENT_SNAP_BACK_AMOUNT, not decay by BASE_DECAY_AMOUNT
    expect(result.stats.talent.true_value).toBe(90 - TALENT_SNAP_BACK_AMOUNT);
    jest.restoreAllMocks();
  });
});

// ─── Constants sanity ─────────────────────────────────────────────────────────

describe('talent growth constants', () => {
  it('base growth chance is between 0 and 1', () => {
    expect(BASE_GROWTH_CHANCE).toBeGreaterThan(0);
    expect(BASE_GROWTH_CHANCE).toBeLessThan(1);
  });

  it('base decay chance is between 0 and 1', () => {
    expect(BASE_DECAY_CHANCE).toBeGreaterThan(0);
    expect(BASE_DECAY_CHANCE).toBeLessThan(1);
  });

  it('base growth and decay amounts are positive', () => {
    expect(BASE_GROWTH_AMOUNT).toBeGreaterThan(0);
    expect(BASE_DECAY_AMOUNT).toBeGreaterThan(0);
    expect(TALENT_SNAP_BACK_AMOUNT).toBeGreaterThan(0);
    expect(GROWTH_CHANCE_PER_TF_LVL).toBeGreaterThan(0);
    expect(GROWTH_AMOUNT_PER_TF_LVL).toBeGreaterThan(0);
  });
});
