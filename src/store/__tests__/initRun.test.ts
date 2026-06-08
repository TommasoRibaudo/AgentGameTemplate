import { createNewRun } from '../initRun';
import { makeManifest } from '../../engine/__tests__/fixtures';

describe('createNewRun', () => {
  const manifest = makeManifest({
    economy: {
      starting_money:              20_000,
      starting_reputation:         30,
      overhead_per_turn:           1_500,
      career_length:               48,
      event_base_rate:             0.15,
      credit_ceiling_rep_weight:   50,
      credit_ceiling_asset_weight: 0.2,
      debt_interest_rate:          0.06,
      agent_stat_upgrade_cost:     { money: 2_000, reputation: 5 },
      roster_slot_upgrade_cost:    { money: 5_000 },
      defense_track_upgrade_cost:  { money: 2_000, per_turn_recurring: 200 },
    },
  });

  it('sets money and reputation from manifest economy', () => {
    const run = createNewRun(manifest);
    expect(run.money).toBe(20_000);
    expect(run.reputation).toBe(30);
  });

  it('sets career_length from manifest economy', () => {
    const run = createNewRun(manifest);
    expect(run.career_length).toBe(48);
  });

  it('starts at turn 1 in turn_open phase', () => {
    const run = createNewRun(manifest);
    expect(run.turn_number).toBe(1);
    expect(run.phase).toBe('turn_open');
  });

  it('starts with all agent stats at 0', () => {
    const run = createNewRun(manifest);
    expect(run.agent.stats.stat_scouting).toBe(0);
    expect(run.agent.stats.insight_scouting).toBe(0);
    expect(run.agent.stats.negotiation).toBe(0);
    expect(run.agent.stats.operations).toBe(0);
  });

  it('starts with empty roster, contracts, and campaigns but seeded prospects', () => {
    const run = createNewRun(manifest);
    expect(run.roster).toHaveLength(0);
    expect(run.prospects.length).toBeGreaterThanOrEqual(4);
    expect(run.contracts).toHaveLength(0);
    expect(run.campaigns).toHaveLength(0);
  });

  it('starts with no pending events and empty news feed', () => {
    const run = createNewRun(manifest);
    expect(run.pending_events).toHaveLength(0);
    expect(run.news_feed).toHaveLength(0);
  });

  it('starts as active with no end condition', () => {
    const run = createNewRun(manifest);
    expect(run.is_active).toBe(true);
    expect(run.end_condition).toBeNull();
  });

  it('sets peak_reputation equal to starting_reputation', () => {
    const run = createNewRun(manifest);
    expect(run.peak_reputation).toBe(30);
  });

  it('initialises debt as inactive with zero balance', () => {
    const run = createNewRun(manifest);
    expect(run.debt.is_active).toBe(false);
    expect(run.debt.balance).toBe(0);
    expect(run.debt.interest_rate).toBe(0.06);
  });

  it('generates a unique id each call', () => {
    const a = createNewRun(manifest);
    const b = createNewRun(manifest);
    expect(a.id).not.toBe(b.id);
  });

  it('sets variant_id from manifest.id', () => {
    const customManifest = makeManifest({ id: 'sports_v1' });
    const run = createNewRun(customManifest);
    expect(run.variant_id).toBe('sports_v1');
  });
});
