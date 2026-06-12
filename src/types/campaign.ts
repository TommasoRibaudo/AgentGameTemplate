import { StatDeltas } from './primitives';

// Each installment is resolved by the engine (Form + traits + variance) and reported
// in the News Feed. Results are immutable once written — the full history is kept
// so the player can review past installments from the News Feed.
export interface CampaignInstallmentResult {
  turn_number: number;
  roll_result: number;          // resolved 0–100 value
  outcome_key: string;          // variant-defined (e.g. 'sold_out_show', 'poor_match')
  stat_deltas: StatDeltas;
  money_delta: number;
  reputation_delta: number;
  // if the installment triggered a new event or trait, record it here
  triggered_event_id: string | null;
  triggered_trait_id: string | null;
  audience_gain: number;
}

export type CampaignSize = 'small' | 'medium' | 'large';
export type ReleaseKind = 'album' | 'single' | 'mixtape';

export interface ReleaseSong {
  id: string;
  title: string;
  quality: number;
}

export interface CreativeReleasePlan {
  kind: ReleaseKind;
  title: string;
  songs: ReleaseSong[];
}

export interface CampaignSetup {
  size: CampaignSize;
  length: number;
  budget: number;
  payout_multiplier: number;
  audience_multiplier: number;
  event_risk_multiplier: number;
}

export interface Campaign {
  id: string;
  client_id: string;
  // references variant manifest campaign type definition
  type_key: string;
  setup?: CampaignSetup;
  release_plan?: CreativeReleasePlan;
  total_turns: number;
  turns_remaining: number;
  installment_results: CampaignInstallmentResult[];
  // contract objective IDs waiting on this campaign's completion to pay out
  pending_objective_ids: string[];
}

export interface CampaignHistoryItem {
  id: string;
  type_key: string;
  label: string;
  started_turn: number;
  completed_turn: number;
  total_turns: number;
  setup?: CampaignSetup;
  installment_results: CampaignInstallmentResult[];
  release_id: string | null;
  summary: {
    money_delta: number;
    reputation_delta: number;
    fan_delta: number;
    album_units_sold?: number;
    streams?: number;
    stream_income?: number;
  };
  visible_notes: string[];
}

export interface ReleaseSummaryNotification {
  id: string;
  client_id: string;
  client_name: string;
  campaign_label: string;
  release_title: string;
  release_kind: ReleaseKind;
  avg_quality: number;
  initial_revenue: number;
}

export interface CatalogRelease {
  id: string;
  campaign_id: string;
  kind: ReleaseKind;
  type_key: string;
  title: string;
  songs: ReleaseSong[];
  released_turn: number;
  turns_since_release: number;
  album_units_sold: number;
  total_streams: number;
  album_income_total: number;
  stream_income_total: number;
  latest_turn_album_units: number;
  latest_turn_streams: number;
  latest_turn_income: number;
  latest_turn_fan_gain: number;
  total_fan_gain: number;
  is_selling_albums: boolean;
}
