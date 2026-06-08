import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Prospect } from '../types/client';
import { CoreStatKey } from '../types/primitives';
import { AgentState } from '../types/agent';
import { VariantManifest } from '../types/manifest';
import { ScoutStackParamList } from '../navigation/types';

// Tab 3 — two sections (PRD §4.2):
//
//  ── Prospects ──────────────────────────────────────────────────────────────
//  Available prospects under maximum fog. Player invests Money/Rep to narrow
//  ranges before committing to sign. Signing initiates the agent<->client
//  contract flow (generates a board item for the next Decision phase).
//
//  ── Open Offers ────────────────────────────────────────────────────────────
//  Entity offers from the Rep-gated pool for currently signed clients.
//  These are contract_offer board items that can also be previewed here,
//  but resolve through the Decision Board (not directly from this tab).

export type ScoutScreenProps = NativeStackScreenProps<ScoutStackParamList, 'ScoutList'>;

export interface ScoutScreenContext {
  prospects: Prospect[];
  agentState: AgentState;
  manifest: VariantManifest;

  // invest into narrowing a specific stat on a prospect; deducts money from RunState
  onInvestScouting: (prospectId: string, statKey: CoreStatKey, amount: number) => void;
  // initiate signing — generates a contract_offer DecisionItem for the next board
  onInitiateSign: (prospectId: string) => void;
  canAffordInvestment: boolean;
}

// ─── Prospect row ─────────────────────────────────────────────────────────────
// Compact: name, arc-stage badge, all four stats as tight FogBands (maximally fogged
// until invested), total scouting_invested, and an "Invest" action.
export interface ProspectRowProps {
  prospect: Prospect;
  manifest: VariantManifest;
  onInvest: (prospectId: string) => void;  // opens ProspectDetail or inline invest sheet
  onSign: (prospectId: string) => void;
}
