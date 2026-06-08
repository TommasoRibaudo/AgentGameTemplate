import { RunState } from '../types/run';
import { AchievementDefinition } from '../types/achievement';
import { computeCareerScore } from './failure';

// Structural subset — compatible with CompletedRunRecord without importing the store
interface RunSummary {
  end_condition: string;
  score: number;
}

// ─── Definitions ──────────────────────────────────────────────────────────────

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    key:         'first_career',
    name:        'First Career',
    description: 'Complete any career.',
    icon:        '★',
  },
  {
    key:         'talent_spotter',
    name:        'Talent Spotter',
    description: 'Develop 3 clients to their peak in a single career.',
    icon:        '◈',
  },
  {
    key:         'peak_machine',
    name:        'Peak Machine',
    description: 'Develop 5 clients to their peak in a single career.',
    icon:        '◆',
  },
  {
    key:         'elite_status',
    name:        'Elite Status',
    description: 'Reach a reputation of 75 or higher.',
    icon:        '♛',
  },
  {
    key:         'hall_of_fame',
    name:        'Hall of Fame',
    description: 'Score 10,000 or more in a single career.',
    icon:        '⬡',
  },
  {
    key:         'gold_rush',
    name:        'Gold Rush',
    description: 'Earn $500,000 or more in total career earnings.',
    icon:        '◉',
  },
  {
    key:         'speed_run',
    name:        'Speed Run',
    description: 'Voluntarily retire within the first 20 turns.',
    icon:        '▷',
  },
  {
    key:         'veteran',
    name:        'Veteran',
    description: 'Complete 5 or more careers.',
    icon:        '◎',
  },
  {
    key:         'debt_lord',
    name:        'Debt Lord',
    description: 'Complete a career (retired or clock) while still carrying debt.',
    icon:        '▲',
  },
  {
    key:         'full_house',
    name:        'Full House',
    description: 'End a career with 4 or more clients on your active roster.',
    icon:        '▪',
  },
];

// ─── Evaluator ────────────────────────────────────────────────────────────────

export type EvaluateAchievements = (
  state:            RunState,
  priorRecords:     RunSummary[],
  alreadyUnlocked:  string[],
) => string[];

export const evaluateAchievements: EvaluateAchievements = (state, priorRecords, alreadyUnlocked) => {
  const newlyEarned: string[] = [];
  const score = computeCareerScore(state);

  const maybe = (key: string, condition: boolean) => {
    if (condition && !alreadyUnlocked.includes(key) && !newlyEarned.includes(key)) {
      newlyEarned.push(key);
    }
  };

  const totalCareersDone = priorRecords.length + 1;
  const nonBankrupt = state.end_condition === 'retired' || state.end_condition === 'clock_expired';

  maybe('first_career',   true);
  maybe('talent_spotter', state.clients_developed >= 3);
  maybe('peak_machine',   state.clients_developed >= 5);
  maybe('elite_status',   state.peak_reputation >= 75);
  maybe('hall_of_fame',   score >= 10_000);
  maybe('gold_rush',      state.total_earnings >= 500_000);
  maybe('speed_run',      state.end_condition === 'retired' && state.turn_number <= 20);
  maybe('veteran',        totalCareersDone >= 5);
  maybe('debt_lord',      nonBankrupt && state.debt.is_active);
  maybe('full_house',     state.roster.length >= 4);

  return newlyEarned;
};
