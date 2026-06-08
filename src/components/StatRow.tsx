import { CoreStatKey } from '../types/primitives';
import { FoggedStat } from '../types/client';

// One stat label + FogBand on a single row. Used in ClientStatsTab and ProspectDetail.
// Optionally shows an "Invest scouting" action button inline (scout/detail screens only).

export interface StatRowProps {
  statKey: CoreStatKey;
  label: string;         // variant display label
  stat: FoggedStat;
  // if provided, renders an invest button; amount is deducted from Money by the caller
  onInvest?: (statKey: CoreStatKey, amount: number) => void;
  // disable invest button when player can't afford the minimum investment
  canInvest?: boolean;
}
