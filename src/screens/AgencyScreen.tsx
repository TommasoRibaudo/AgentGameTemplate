import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AgentState, AgentStats } from '../types/agent';
import { DebtState } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { TabParamList } from '../navigation/types';
import { InfrastructureUpgradeKey } from '../engine/progression';

// Tab 4 — three panels (PRD §4.2):
//
//  ── Agent stats ──────────────────────────────────────────────────────────────
//  The four personal skills (Stat Scouting, Insight Scouting, Negotiation, Operations).
//  Each shows current level, what it does, and an Upgrade button with cost.
//
//  ── Infrastructure ───────────────────────────────────────────────────────────
//  Roster slot capacity (current / max) + four event-defense tracks.
//  Each track shows level, per-turn cost, and an Upgrade button.
//  Buying a roster slot surfaces a warning that it raises event exposure.
//
//  ── Bank ─────────────────────────────────────────────────────────────────────
//  Current Money, debt balance (if active), credit ceiling, and a Take Loan button.
//  Voluntary retirement button lives here — strategic choice to lock in score.

export type AgencyScreenProps = NativeStackScreenProps<TabParamList, 'Agency'>;

export interface AgencyScreenContext {
  agentState: AgentState;
  debt: DebtState;
  money: number;
  reputation: number;
  manifest: VariantManifest;

  // upgrade costs are pre-computed by the progression engine and passed in
  agentStatUpgradeCosts: Record<keyof AgentStats, { money: number; reputation: number }>;
  infrastructureUpgradeCosts: Record<InfrastructureUpgradeKey, { money: number; per_turn_recurring: number }>;

  onUpgradeAgentStat: (stat: keyof AgentStats) => void;
  onUpgradeInfrastructure: (key: InfrastructureUpgradeKey) => void;
  onTakeLoan: (amount: number) => void;
  onRetire: () => void;   // opens retire confirmation dialog
}

// Retire confirmation copy
export const RETIRE_CONFIRM_COPY =
  'Retire now and lock in your career score? This cannot be undone.';

// Roster slot upgrade warning copy
export const ROSTER_SLOT_WARNING_COPY =
  'Adding a roster slot increases your event exposure. Bigger roster, more chaos.';
