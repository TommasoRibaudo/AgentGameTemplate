import { Client } from '../types/client';
import { CoreStatKey } from '../types/primitives';

// Roster list item. Compact: name, arc-stage badge, two key fogged stats (Talent + Form),
// morale indicator dot, active-campaign indicator, contract-status label.
// Tapping navigates to ClientDetailScreen.

export interface ClientRowProps {
  client: Client;
  // variant display labels for the two stats shown in compact view
  talentLabel: string;
  formLabel: string;
  // whether this client currently has an active campaign
  hasCampaign: boolean;
  // 'active' | 'expiring' (≤ 2 turns) | 'none'
  contractStatus: 'active' | 'expiring' | 'none';
  onPress: (clientId: string) => void;
}
