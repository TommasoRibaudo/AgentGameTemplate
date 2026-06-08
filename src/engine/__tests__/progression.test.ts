import {
  computeOperationsMultiplier,
  computeNegotiationModifier,
  computeAgentStatUpgradeCost,
  upgradeAgentStat,
  computeInfrastructureUpgradeCost,
  upgradeInfrastructure,
} from '../progression';
import { makeRunState, makeManifest, makeAgentState } from './fixtures';

describe('progression — computeOperationsMultiplier', () => {
  it('returns 1.0 at level 0',        () => expect(computeOperationsMultiplier(0)).toBeCloseTo(1.0));
  it('returns 0.95 at level 1',       () => expect(computeOperationsMultiplier(1)).toBeCloseTo(0.95));
  it('floors at 0.5 at level 10',     () => expect(computeOperationsMultiplier(10)).toBe(0.5));
  it('stays floored past level 10',   () => expect(computeOperationsMultiplier(20)).toBe(0.5));
});

describe('progression — computeNegotiationModifier', () => {
  it('returns 0 at level 0',          () => expect(computeNegotiationModifier(0)).toBe(0));
  it('returns 0.08 at level 1',       () => expect(computeNegotiationModifier(1)).toBeCloseTo(0.08));
  it('caps at 0.4 at level 5',        () => expect(computeNegotiationModifier(5)).toBeCloseTo(0.4));
  it('stays capped past level 5',     () => expect(computeNegotiationModifier(10)).toBe(0.4));
});

describe('progression — computeAgentStatUpgradeCost', () => {
  it('returns base cost at level 0', () => {
    const manifest = makeManifest();
    const state = makeRunState();
    const cost = computeAgentStatUpgradeCost(state, 'operations', manifest);
    expect(cost.money).toBe(manifest.economy.agent_stat_upgrade_cost.money);
    expect(cost.reputation).toBe(manifest.economy.agent_stat_upgrade_cost.reputation);
  });

  it('scales with current level', () => {
    const manifest = makeManifest();
    const state = makeRunState({
      agent: makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 0, operations: 2 } }),
    });
    const cost = computeAgentStatUpgradeCost(state, 'operations', manifest);
    // multiplier = 1 + 2 * 0.5 = 2.0
    expect(cost.money).toBe(manifest.economy.agent_stat_upgrade_cost.money * 2);
  });
});

describe('progression — upgradeAgentStat', () => {
  it('increments the stat and deducts cost', () => {
    const manifest = makeManifest();
    const state = makeRunState({ money: 10_000, reputation: 50 });
    const result = upgradeAgentStat(state, 'operations', manifest);
    expect(result.agent.stats.operations).toBe(1);
    expect(result.money).toBeLessThan(state.money);
  });

  it('does nothing if insufficient money', () => {
    const manifest = makeManifest();
    const state = makeRunState({ money: 0, reputation: 50 });
    const result = upgradeAgentStat(state, 'operations', manifest);
    expect(result.agent.stats.operations).toBe(0);
    expect(result.money).toBe(0);
  });

  it('does nothing if insufficient reputation', () => {
    const manifest = makeManifest();
    const state = makeRunState({ money: 100_000, reputation: 0 });
    const result = upgradeAgentStat(state, 'stat_scouting', manifest);
    expect(result.agent.stats.stat_scouting).toBe(0);
  });
});

describe('progression — computeInfrastructureUpgradeCost', () => {
  it('returns base cost when track does not exist', () => {
    const state = makeRunState();
    const cost = computeInfrastructureUpgradeCost(state, 'pr', makeManifest());
    expect(cost.money).toBe(2_000);
    expect(cost.per_turn_recurring).toBe(300);
  });

  it('scales cost with existing track level', () => {
    const state = makeRunState({
      agent: makeAgentState({ defense_tracks: [{ key: 'pr', level: 1, per_turn_cost: 300 }] }),
    });
    const cost = computeInfrastructureUpgradeCost(state, 'pr', makeManifest());
    // multiplier = 1 + 1 * 0.4 = 1.4
    expect(cost.money).toBe(Math.round(2_000 * 1.4));
  });
});

describe('progression — upgradeInfrastructure', () => {
  it('roster_slot increments roster_capacity', () => {
    const state = makeRunState({ money: 10_000 });
    const result = upgradeInfrastructure(state, 'roster_slot', makeManifest());
    expect(result.agent.roster_capacity).toBe(state.agent.roster_capacity + 1);
    expect(result.money).toBeLessThan(state.money);
  });

  it('creates a new defense track when first upgrading', () => {
    const state = makeRunState({ money: 10_000 });
    const result = upgradeInfrastructure(state, 'medical', makeManifest());
    const track = result.agent.defense_tracks.find(t => t.key === 'medical');
    expect(track).toBeDefined();
    expect(track!.level).toBe(1);
  });

  it('increments an existing defense track level', () => {
    const state = makeRunState({
      money: 10_000,
      agent: makeAgentState({ defense_tracks: [{ key: 'legal', level: 1, per_turn_cost: 250 }] }),
    });
    const result = upgradeInfrastructure(state, 'legal', makeManifest());
    const track = result.agent.defense_tracks.find(t => t.key === 'legal');
    expect(track!.level).toBe(2);
  });

  it('only upgrades the matched track when multiple tracks exist', () => {
    const state = makeRunState({
      money: 10_000,
      agent: makeAgentState({
        defense_tracks: [
          { key: 'pr',    level: 1, per_turn_cost: 300 },
          { key: 'legal', level: 2, per_turn_cost: 250 },
        ],
      }),
    });
    const result = upgradeInfrastructure(state, 'pr', makeManifest());
    const prTrack    = result.agent.defense_tracks.find(t => t.key === 'pr');
    const legalTrack = result.agent.defense_tracks.find(t => t.key === 'legal');
    expect(prTrack!.level).toBe(2);
    expect(legalTrack!.level).toBe(2); // unchanged
  });

  it('does nothing if insufficient funds', () => {
    const state = makeRunState({ money: 0 });
    const result = upgradeInfrastructure(state, 'roster_slot', makeManifest());
    expect(result.agent.roster_capacity).toBe(state.agent.roster_capacity);
    expect(result.money).toBe(0);
  });
});
