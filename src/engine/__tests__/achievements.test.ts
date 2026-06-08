import { evaluateAchievements, ACHIEVEMENT_DEFINITIONS } from '../achievements';
import { makeRunState, makeClient, makeDebtState } from './fixtures';

const NO_PRIOR: { end_condition: string; score: number }[] = [];
const NO_UNLOCKED: string[] = [];

describe('ACHIEVEMENT_DEFINITIONS', () => {
  it('has 10 definitions', () => {
    expect(ACHIEVEMENT_DEFINITIONS).toHaveLength(10);
  });

  it('each definition has required fields', () => {
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      expect(typeof def.key).toBe('string');
      expect(typeof def.name).toBe('string');
      expect(typeof def.description).toBe('string');
      expect(typeof def.icon).toBe('string');
    }
  });
});

describe('evaluateAchievements — first_career', () => {
  it('always earns first_career on a completed run', () => {
    const state = makeRunState({ is_active: false, end_condition: 'retired' });
    const result = evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED);
    expect(result).toContain('first_career');
  });

  it('does not re-earn first_career if already unlocked', () => {
    const state = makeRunState({ is_active: false, end_condition: 'clock_expired' });
    const result = evaluateAchievements(state, NO_PRIOR, ['first_career']);
    expect(result).not.toContain('first_career');
  });
});

describe('evaluateAchievements — talent_spotter', () => {
  it('earns talent_spotter at 3 clients developed', () => {
    const state = makeRunState({ end_condition: 'retired', clients_developed: 3 });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).toContain('talent_spotter');
  });

  it('does not earn talent_spotter below threshold', () => {
    const state = makeRunState({ end_condition: 'retired', clients_developed: 2 });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).not.toContain('talent_spotter');
  });
});

describe('evaluateAchievements — peak_machine', () => {
  it('earns peak_machine at 5 clients developed', () => {
    const state = makeRunState({ end_condition: 'retired', clients_developed: 5 });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).toContain('peak_machine');
  });
});

describe('evaluateAchievements — elite_status', () => {
  it('earns elite_status at rep 75', () => {
    const state = makeRunState({ end_condition: 'clock_expired', peak_reputation: 75 });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).toContain('elite_status');
  });

  it('does not earn elite_status below 75', () => {
    const state = makeRunState({ end_condition: 'clock_expired', peak_reputation: 74 });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).not.toContain('elite_status');
  });
});

describe('evaluateAchievements — hall_of_fame', () => {
  it('earns hall_of_fame when score >= 10,000', () => {
    // score = peak_rep*100 + total_earnings/100 + clients_developed*500
    // 75*100 + 200000/100 + 5*500 = 7500 + 2000 + 2500 = 12000
    const state = makeRunState({
      end_condition: 'retired',
      peak_reputation: 75,
      total_earnings: 200_000,
      clients_developed: 5,
    });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).toContain('hall_of_fame');
  });
});

describe('evaluateAchievements — gold_rush', () => {
  it('earns gold_rush at earnings >= 500,000', () => {
    const state = makeRunState({ end_condition: 'retired', total_earnings: 500_000 });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).toContain('gold_rush');
  });

  it('does not earn gold_rush below threshold', () => {
    const state = makeRunState({ end_condition: 'retired', total_earnings: 499_999 });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).not.toContain('gold_rush');
  });
});

describe('evaluateAchievements — speed_run', () => {
  it('earns speed_run for voluntary retirement in ≤ 20 turns', () => {
    const state = makeRunState({ end_condition: 'retired', turn_number: 15 });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).toContain('speed_run');
  });

  it('does not earn speed_run if not voluntarily retired', () => {
    const state = makeRunState({ end_condition: 'clock_expired', turn_number: 15 });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).not.toContain('speed_run');
  });

  it('does not earn speed_run if retired after turn 20', () => {
    const state = makeRunState({ end_condition: 'retired', turn_number: 21 });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).not.toContain('speed_run');
  });
});

describe('evaluateAchievements — veteran', () => {
  it('earns veteran on the 5th completed career', () => {
    const prior = Array.from({ length: 4 }, () => ({ end_condition: 'retired', score: 0 }));
    const state = makeRunState({ end_condition: 'retired' });
    expect(evaluateAchievements(state, prior, NO_UNLOCKED)).toContain('veteran');
  });

  it('does not earn veteran with fewer than 5 total', () => {
    const prior = Array.from({ length: 3 }, () => ({ end_condition: 'retired', score: 0 }));
    const state = makeRunState({ end_condition: 'retired' });
    expect(evaluateAchievements(state, prior, NO_UNLOCKED)).not.toContain('veteran');
  });
});

describe('evaluateAchievements — debt_lord', () => {
  it('earns debt_lord when finishing (non-bankrupt) while still in debt', () => {
    const state = makeRunState({
      end_condition: 'clock_expired',
      debt: makeDebtState({ is_active: true, balance: 5_000 }),
    });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).toContain('debt_lord');
  });

  it('does not earn debt_lord on bankruptcy', () => {
    const state = makeRunState({
      end_condition: 'bankrupt',
      debt: makeDebtState({ is_active: true }),
    });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).not.toContain('debt_lord');
  });
});

describe('evaluateAchievements — full_house', () => {
  it('earns full_house with 4+ roster clients at end', () => {
    const state = makeRunState({
      end_condition: 'retired',
      roster: [makeClient(), makeClient(), makeClient(), makeClient()],
    });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).toContain('full_house');
  });

  it('does not earn full_house with 3 or fewer clients', () => {
    const state = makeRunState({
      end_condition: 'retired',
      roster: [makeClient(), makeClient(), makeClient()],
    });
    expect(evaluateAchievements(state, NO_PRIOR, NO_UNLOCKED)).not.toContain('full_house');
  });
});

describe('evaluateAchievements — idempotency', () => {
  it('never returns keys already in alreadyUnlocked', () => {
    const state = makeRunState({
      end_condition: 'retired',
      clients_developed: 5,
      peak_reputation: 80,
      total_earnings: 600_000,
      roster: [makeClient(), makeClient(), makeClient(), makeClient()],
    });
    const allKeys = ACHIEVEMENT_DEFINITIONS.map(d => d.key);
    const result = evaluateAchievements(state, NO_PRIOR, allKeys);
    expect(result).toHaveLength(0);
  });
});
