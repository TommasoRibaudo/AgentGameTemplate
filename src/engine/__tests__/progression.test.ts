import {
  computeOperationsMultiplier,
  computeNegotiationModifier,
  computeAgentStatUpgradeCost,
  upgradeAgentStat,
  computeInfrastructureUpgradeCost,
  upgradeInfrastructure,
  downgradeInfrastructure,
  applyBuildingDevelopment,
  boostClientStat,
  applyContractSatisfaction,
  CLIENT_BOOST_AMOUNT,
  CLIENT_BOOST_COST,
} from '../progression';
import { makeRunState, makeManifest, makeAgentState, makeClient, makeClientStats, makeContract } from './fixtures';

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
      agent: makeAgentState({ stats: { stat_scouting: 0, insight_scouting: 0, negotiation: 0, operations: 2, coaching: 0 } }),
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

describe('progression — downgradeInfrastructure', () => {
  it('removes the defense track when downgrading from level 1 to 0', () => {
    const state = makeRunState({
      agent: makeAgentState({ defense_tracks: [{ key: 'medical', level: 1, per_turn_cost: 200 }] }),
    });
    const result = downgradeInfrastructure(state, 'medical', makeManifest());
    expect(result.agent.defense_tracks.find(t => t.key === 'medical')).toBeUndefined();
    expect(result.money).toBeGreaterThan(state.money);
  });

  it('decrements level and recalculates per_turn_cost when downgrading above level 1', () => {
    const state = makeRunState({
      agent: makeAgentState({ defense_tracks: [{ key: 'legal', level: 2, per_turn_cost: 350 }] }),
    });
    const result = downgradeInfrastructure(state, 'legal', makeManifest());
    const track = result.agent.defense_tracks.find(t => t.key === 'legal');
    expect(track).toBeDefined();
    expect(track!.level).toBe(1);
    expect(track!.per_turn_cost).toBe(250); // base recurring for legal at level 1
    expect(result.money).toBeGreaterThan(state.money);
  });

  it('refunds 50% of the cost paid for the last upgrade level', () => {
    // insurance base money = 2000; upgrading from level 0 multiplier = 1.0 → cost = 2000
    const state = makeRunState({
      agent: makeAgentState({ defense_tracks: [{ key: 'insurance', level: 1, per_turn_cost: 200 }] }),
    });
    const result = downgradeInfrastructure(state, 'insurance', makeManifest());
    expect(result.money - state.money).toBe(1000); // 50% of 2000
  });

  it('does nothing when track does not exist', () => {
    const state = makeRunState();
    const result = downgradeInfrastructure(state, 'pr', makeManifest());
    expect(result).toBe(state);
  });

  it('decrements roster_capacity and refunds when roster has room', () => {
    // default makeRunState has empty roster and roster_capacity ≥ 1
    const state = makeRunState({ money: 0 });
    const initialCapacity = state.agent.roster_capacity;
    const result = downgradeInfrastructure(state, 'roster_slot', makeManifest());
    expect(result.agent.roster_capacity).toBe(initialCapacity - 1);
    expect(result.money).toBeGreaterThan(0);
  });

  it('refuses to sell roster_slot when capacity equals current roster size', () => {
    const client = makeClient();
    const state = makeRunState({
      roster: [client],
      agent: makeAgentState({ roster_capacity: 1, defense_tracks: [] }),
    });
    const result = downgradeInfrastructure(state, 'roster_slot', makeManifest());
    expect(result.agent.roster_capacity).toBe(1);
    expect(result.money).toBe(state.money);
  });

  it('only changes the targeted track when multiple tracks exist', () => {
    const state = makeRunState({
      agent: makeAgentState({
        defense_tracks: [
          { key: 'pr',    level: 2, per_turn_cost: 420 },
          { key: 'legal', level: 1, per_turn_cost: 250 },
        ],
      }),
    });
    const result = downgradeInfrastructure(state, 'pr', makeManifest());
    expect(result.agent.defense_tracks.find(t => t.key === 'pr')!.level).toBe(1);
    expect(result.agent.defense_tracks.find(t => t.key === 'legal')!.level).toBe(1);
  });
});

describe('progression building development', () => {
  it('improves matching client stats each turn based on building level', () => {
    const client = makeClient({ stats: makeClientStats({ form: 40, marketability: 50, morale: 60 }) });
    const state = makeRunState({
      roster: [client],
      agent: makeAgentState({
        defense_tracks: [
          { key: 'training_facility', level: 2, per_turn_cost: 300 },
          { key: 'media_studio', level: 1, per_turn_cost: 300 },
        ],
      }),
    });

    const result = applyBuildingDevelopment(state);

    expect(result.roster[0].stats.form.true_value).toBe(42);
    expect(result.roster[0].stats.marketability.true_value).toBe(51);
    expect(result.roster[0].stats.morale.true_value).toBe(60);
  });

  it('does not improve talent because talent is a fixed ceiling', () => {
    const client = makeClient({ stats: makeClientStats({ talent: 40 }) });
    const state = makeRunState({
      roster: [client],
      agent: makeAgentState({
        defense_tracks: [{ key: 'training_facility', level: 3, per_turn_cost: 300 }],
      }),
    });

    const result = applyBuildingDevelopment(state);

    expect(result.roster[0].stats.talent.true_value).toBe(40);
  });
});

describe('progression boostClientStat', () => {
  it('spends money and immediately improves one client stat', () => {
    const client = makeClient({ stats: makeClientStats({ form: 40 }) });
    const state = makeRunState({ money: CLIENT_BOOST_COST, roster: [client] });

    const result = boostClientStat(state, client.id, 'form');

    expect(result.money).toBe(0);
    expect(result.roster[0].stats.form.true_value).toBe(40 + CLIENT_BOOST_AMOUNT);
  });

  it('returns state unchanged if the agency cannot afford the boost', () => {
    const client = makeClient({ stats: makeClientStats({ morale: 40 }) });
    const state = makeRunState({ money: CLIENT_BOOST_COST - 1, roster: [client] });

    const result = boostClientStat(state, client.id, 'morale');

    expect(result).toBe(state);
  });
});

describe('progression applyContractSatisfaction', () => {
  // Manifest threshold = 8_000 at peak (income mult 1.0); rising mult = 0.6 → expected = 4_800

  it('reduces morale when a client has no entity contracts', () => {
    const client = makeClient({ arc_stage: 'peak', stats: makeClientStats({ morale: 70 }) });
    const state = makeRunState({ roster: [client], contracts: [] });

    const result = applyContractSatisfaction(state, makeManifest());

    // incomeComponent = -2, fanComponent = 0 → delta = -2
    expect(result.roster[0].stats.morale.true_value).toBe(68);
  });

  it('increases morale when entity income exceeds 1.5× the arc-scaled threshold', () => {
    const client = makeClient({ arc_stage: 'peak', stats: makeClientStats({ morale: 60 }) });
    const entityContract = makeContract({
      tier: 'client_entity',
      client_id: client.id,
      payout_type: 'per_week',
      amount: 13_000, // > 8_000 * 1.5 = 12_000
    });
    const state = makeRunState({ roster: [client], contracts: [entityContract] });

    const result = applyContractSatisfaction(state, makeManifest());

    // incomeComponent = +2, fanComponent = 0 → delta = +2
    expect(result.roster[0].stats.morale.true_value).toBe(62);
  });

  it('gives +1 income component when income meets but does not exceed 1.5× threshold', () => {
    const client = makeClient({ arc_stage: 'peak', stats: makeClientStats({ morale: 50 }) });
    const entityContract = makeContract({
      tier: 'client_entity',
      client_id: client.id,
      payout_type: 'per_week',
      amount: 9_000, // >= 8_000 but < 12_000
    });
    const state = makeRunState({ roster: [client], contracts: [entityContract] });

    const result = applyContractSatisfaction(state, makeManifest());

    // incomeComponent = +1, fanComponent = 0 → delta = +1
    expect(result.roster[0].stats.morale.true_value).toBe(51);
  });

  it('adds fan component when last campaign had positive fan_delta', () => {
    const campaignHistory = [{
      id: 'ch1', type_key: 'tour', label: 'Tour', started_turn: 1, completed_turn: 2,
      total_turns: 2, installment_results: [], release_id: null,
      summary: { money_delta: 0, reputation_delta: 0, fan_delta: 5_000 },
      visible_notes: [],
    }];
    const client = makeClient({
      arc_stage: 'peak', stats: makeClientStats({ morale: 50 }), campaign_history: campaignHistory,
    });
    const entityContract = makeContract({
      tier: 'client_entity', client_id: client.id, payout_type: 'per_week', amount: 9_000,
    });
    const state = makeRunState({ roster: [client], contracts: [entityContract] });

    const result = applyContractSatisfaction(state, makeManifest());

    // incomeComponent = +1, fanComponent = +1 → delta = +2
    expect(result.roster[0].stats.morale.true_value).toBe(52);
  });

  it('subtracts fan component when last campaign had negative fan_delta', () => {
    const campaignHistory = [{
      id: 'ch1', type_key: 'tour', label: 'Tour', started_turn: 1, completed_turn: 2,
      total_turns: 2, installment_results: [], release_id: null,
      summary: { money_delta: 0, reputation_delta: 0, fan_delta: -2_000 },
      visible_notes: [],
    }];
    const client = makeClient({
      arc_stage: 'peak', stats: makeClientStats({ morale: 50 }), campaign_history: campaignHistory,
    });
    const entityContract = makeContract({
      tier: 'client_entity', client_id: client.id, payout_type: 'per_week', amount: 9_000,
    });
    const state = makeRunState({ roster: [client], contracts: [entityContract] });

    const result = applyContractSatisfaction(state, makeManifest());

    // incomeComponent = +1, fanComponent = -1 → delta = 0 → morale unchanged
    expect(result.roster[0].stats.morale.true_value).toBe(50);
  });

  it('clamps total delta to -2 even when both components are negative', () => {
    const campaignHistory = [{
      id: 'ch1', type_key: 'tour', label: 'Tour', started_turn: 1, completed_turn: 2,
      total_turns: 2, installment_results: [], release_id: null,
      summary: { money_delta: 0, reputation_delta: 0, fan_delta: -1_000 },
      visible_notes: [],
    }];
    const client = makeClient({
      arc_stage: 'peak', stats: makeClientStats({ morale: 60 }), campaign_history: campaignHistory,
    });
    const state = makeRunState({ roster: [client], contracts: [] });

    const result = applyContractSatisfaction(state, makeManifest());

    // incomeComponent = -2, fanComponent = -1 → unclamped = -3, clamped to -2
    expect(result.roster[0].stats.morale.true_value).toBe(58);
  });

  it('scales expected income by the arc income multiplier', () => {
    // rising mult = 0.6 → expected = 8_000 * 0.6 = 4_800; 1.5× = 7_200
    const client = makeClient({ arc_stage: 'rising', stats: makeClientStats({ morale: 50 }) });
    const entityContract = makeContract({
      tier: 'client_entity', client_id: client.id, payout_type: 'per_week', amount: 7_500, // > 7_200
    });
    const state = makeRunState({ roster: [client], contracts: [entityContract] });

    const result = applyContractSatisfaction(state, makeManifest());

    // incomeComponent = +2 (exceeds 1.5× scaled threshold), fanComponent = 0 → delta = +2
    expect(result.roster[0].stats.morale.true_value).toBe(52);
  });

  it('returns state unchanged when roster is empty', () => {
    const state = makeRunState({ roster: [] });
    const result = applyContractSatisfaction(state, makeManifest());
    expect(result).toBe(state);
  });
});
