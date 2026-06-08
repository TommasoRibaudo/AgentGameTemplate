import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RunState } from '../types/run';
import { RunEndCondition } from '../types/primitives';
import { VariantManifest } from '../types/manifest';
import { RootParamList } from '../navigation/types';

// Outside-run screen shown at the end of every career (PRD §4.3, §3.7, §3.8).
// Displayed after: clock expiry, voluntary retirement, or bankruptcy.
// Also serves as the post-bankruptcy analysis screen.

export type CareerSummaryScreenProps = NativeStackScreenProps<RootParamList, 'CareerSummary'>;

export interface CareerSummaryContext {
  runState: RunState;
  careerScore: number;
  endCondition: RunEndCondition;
  manifest: VariantManifest;
  // leaderboard rank if unlocked (null on first career — leaderboard gates on completion)
  leaderboardRank: number | null;
  isLeaderboardUnlocked: boolean;

  onStartNewCareer: () => void;
  onViewLeaderboard: () => void;  // disabled when isLeaderboardUnlocked = false
}

// ─── Summary sections ─────────────────────────────────────────────────────────
// 1. End banner: condition label + icon (Retired / Bankrupt / Career Complete)
// 2. Score breakdown: career_score, peak_reputation, total_earnings,
//                     clients_developed, hall_of_fame_clients
// 3. Roster highlights: best client per stat, longest-tenured client
// 4. Career timeline: turn count, major milestones (first Peak client, first Crisis survived)
// 5. Achievements earned this career
// 6. CTA buttons: Start New Career | View Leaderboard

// Leaderboard gate copy shown on first career completion
export const LEADERBOARD_UNLOCK_COPY =
  'Complete your first career to unlock the leaderboard and compare with other agents.';
