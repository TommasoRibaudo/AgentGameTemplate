import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Client } from '../types/client';
import { VariantManifest } from '../types/manifest';
import { RosterStackParamList } from '../navigation/types';

// Tab 2 root — scrollable list of all signed clients (PRD §4.2).
// Empty state (0 clients) is fully valid — shows a prompt to visit the Scout tab.
// Tapping a row navigates to ClientDetailScreen within the Roster stack.

export type RosterScreenProps = NativeStackScreenProps<RosterStackParamList, 'RosterList'>;

export interface RosterScreenContext {
  clients: Client[];
  manifest: VariantManifest;
}
