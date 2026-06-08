import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Client } from '../types/client';
import { Contract } from '../types/contract';
import { Campaign } from '../types/campaign';
import { AgentState } from '../types/agent';
import { CoreStatKey } from '../types/primitives';
import { VariantManifest } from '../types/manifest';
import { RosterStackParamList } from '../navigation/types';

// Client detail — four-tab sub-screen reached from RosterScreen (PRD §4.2).

export type ClientDetailScreenProps = NativeStackScreenProps<RosterStackParamList, 'ClientDetail'>;

export interface ClientDetailContext {
  client: Client;
  // agent<->client contract in force for this client
  agentContract: Contract | null;
  // all client<->entity contracts brokered for this client
  entityContracts: Contract[];
  activeCampaign: Campaign | null;
  agentState: AgentState;
  manifest: VariantManifest;

  onInvestScouting: (statKey: CoreStatKey, amount: number) => void;
  onRelease: () => void;   // navigates back to RosterScreen on success
}

// ─── Overview tab ────────────────────────────────────────────────────────────
// Shows: arc stage badge, Morale indicator, active campaign summary (if any),
//        agent<->client contract summary, trait chips.
export interface ClientOverviewTabProps {
  client: Client;
  agentContract: Contract | null;
  activeCampaign: Campaign | null;
  manifest: VariantManifest;
}

// ─── Stats tab ────────────────────────────────────────────────────────────────
// Shows all four core stats as StatRows with FogBands.
// Each row has an optional "Invest" button (compact spend → narrows fog immediately).
// scouting_invested shown under each stat so player can track spend.
export interface ClientStatsTabProps {
  client: Client;
  agentState: AgentState;
  manifest: VariantManifest;
  onInvestScouting: (statKey: CoreStatKey, amount: number) => void;
  canAffordInvestment: boolean;
}

// ─── Contracts tab ────────────────────────────────────────────────────────────
// Lists the agent<->client contract, then all brokered client<->entity contracts.
// Expired contracts shown in a collapsed section for reference.
export interface ClientContractsTabProps {
  agentContract: Contract | null;
  entityContracts: Contract[];
  manifest: VariantManifest;
}

// ─── Campaign tab ─────────────────────────────────────────────────────────────
// Shows the active campaign's installment history as a result list.
// Each result shows: turn number, outcome label, stat deltas, money/rep impact.
// If no active campaign: shows a message and the client's campaign history.
export interface ClientCampaignTabProps {
  activeCampaign: Campaign | null;
  manifest: VariantManifest;
}
