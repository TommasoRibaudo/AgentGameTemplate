import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { TabParamList } from '../navigation/types';

// Tab 1 — the core gameplay screen (PRD §4.2).
//
// Layout (top to bottom):
//   TopBar              (always visible, outside this screen's scroll)
//   ── News Feed ──────  revisitable ScrollView; shown expanded at turn start
//      NewsItemRow[]    one per news item from the current and prior turn
//   ── Decision Board ─  FlatList of 2–5 DecisionCard items
//      DecisionCard[]   player resolves in any order
//      [End Turn]       ConfirmDialog if unresolved items remain → applies defaults
//
// Event modals (EventModal) render as overlays on top of this screen when
// pending_events.length > 0. The board is non-interactive while a modal is open.
//
// The News Feed and Decision Board share the same scroll container. The player
// can pull up to review the feed at any point during the Decision phase.

export type HomeScreenProps = NativeStackScreenProps<TabParamList, 'Home'>;

// Data and callbacks injected via context or a parent container — not passed as nav params.
export interface HomeScreenContext {
  runState: RunState;
  manifest: VariantManifest;
  onResolveDecision: (itemId: string, optionKey: string) => void;
  onResolveEvent: (eventId: string, optionKey: string | null) => void;
  onEndTurn: () => void;
}

// End Turn confirmation copy — shown when unresolved items remain.
export const END_TURN_CONFIRM_COPY =
  'Unresolved items will take their default outcome. End the turn?';
