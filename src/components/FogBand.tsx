import { FoggedStat } from '../types/client';

// THE signature UI element (PRD §4.4). Renders a stat as a horizontal confidence
// band that tightens toward a point as scouting narrows observed_min/observed_max.
//
// Visual states:
//   Wide band  |||___  15–20   (low scouting, large uncertainty)
//   Mid band   |||||_  17–19
//   Tight band ||||||  18–19   (high scouting, small uncertainty)
//   Talent floor: band NEVER collapses to a point — see FOG_FLOOR_HARD in client engine.
//
// Must read clearly at mobile thumb-scroll speed on a small screen.

export interface FogBandProps {
  label: string;              // variant display label (e.g. 'Shooting', 'Buzz')
  stat: FoggedStat;
  // full possible range for scaling the visual track; defaults to [0, 100]
  trackMin?: number;
  trackMax?: number;
  // show scouting_invested amount as a sub-label (useful on scout/client-detail screens)
  showInvested?: boolean;
  // compact single-line mode for list rows; full mode for detail screens
  size?: 'compact' | 'full';
}
