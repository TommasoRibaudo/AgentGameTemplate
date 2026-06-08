import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RunEndCondition } from '../types/primitives';
import { RootParamList } from '../navigation/types';

// Outside-run screen. Unlocked after the player's first career ends (PRD §3.7).
// The first run is solo onboarding; competition opens once the player knows the game.

export type LeaderboardScreenProps = NativeStackScreenProps<RootParamList, 'Leaderboard'>;

export interface LeaderboardEntry {
  rank: number;
  agentName: string;
  variantId: string;            // which game variant (music, football, etc.)
  careerScore: number;
  peakReputation: number;
  totalEarnings: number;
  clientsDeveloped: number;
  hallOfFameClients: number;
  endCondition: RunEndCondition;
  turnsPlayed: number;
}

export interface LeaderboardScreenContext {
  entries: LeaderboardEntry[];
  // highlight the player's own entry if present
  playerEntryRank: number | null;
  // filter by variant; null = all variants
  activeVariantFilter: string | null;
  onChangeVariantFilter: (variantId: string | null) => void;
}
