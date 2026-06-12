import { TurnPhase, RunEndCondition } from './primitives';
import { Client, Prospect } from './client';
import { Contract } from './contract';
import { Campaign, ReleaseSummaryNotification } from './campaign';
import { GameEvent } from './event';
import { DecisionItem } from './decision';
import { AgentState } from './agent';

// The bank/debt state opens when Money hits 0. Play continues, but debt servicing
// competes with all other spending. Bankruptcy fires when debt is unserviceable
// AND credit headroom is exhausted — not before.
export interface DebtState {
  is_active: boolean;
  balance: number;              // total debt owed (positive = in debt)
  interest_rate: number;        // multiplier applied per turn to outstanding balance
  per_turn_repayment: number;   // minimum repayment due each Upkeep
  // ceiling is derived from Reputation + roster asset value; falls when assets are sold
  credit_ceiling: number;
  // set to 1 when a missed repayment fires with no credit left — final turn to recover
  bankruptcy_warning_turns_remaining: number | null;
}

// Tutorial progression — only active for music_v1 runs; null for all other variants.
export type TutorialStep =
  | 'friend_pitch'      // Day-1 modal: friend pitches themselves
  | 'roster_highlight'  // Highlight friend row in Roster
  | 'campaign_tab'      // Highlight Campaign tab in ClientDetail
  | 'gig_hint'          // Hint to start a gig
  | 'end_turn_hint'     // Prompt player to end turn after booking first gig
  | 'post_gig_hint'     // Navigate to Home, highlight dashboard tab, show decision board
  | 'scout_hint'             // Navigate to Scout tab, show tutorial prospect, explain scouting
  | 'scout_signing'          // After scouting, prompt player to sign the tutorial prospect
  | 'contract_approve_hint'  // Auto-navigate to Home, approve the signing contract
  | 'agency_hint'            // After signing, navigate to Agency, explain skills/infra/bank
  | 'done';

// News Feed entries persist so the player can review them from the Turn Open screen.
// They are append-only within a run.
export type NewsItemType =
  | 'campaign_installment'
  | 'campaign_ended'
  | 'income_received'
  | 'client_milestone'
  | 'event_fired'
  | 'contract_activated'
  | 'contract_expired'
  | 'debt_opened'
  | 'debt_repayment'
  | 'debt_missed'
  | 'debt_recovered'
  | 'agency_spend'
  | 'upkeep_summary';

export interface NewsItem {
  id: string;
  turn_number: number;
  type: NewsItemType;
  description: string;
  money_delta: number | null;
  reputation_delta: number | null;
  fan_delta: number | null;
  client_id: string | null;
}

export interface NarratorPacingState {
  consecutive_skipped_turns: number;
  last_turn_skipped_items: number;
}

// Top-level game state. This is the single source of truth persisted between sessions.
export interface RunState {
  id: string;
  player_name: string;
  variant_id: string;             // links saved run back to its manifest via MANIFEST_REGISTRY
  turn_number: number;
  career_length: number;          // total turns available this career (open question §6.1)
  phase: TurnPhase;

  money: number;
  reputation: number;
  // fires immediately when money first drops to ≤ 0 (not just at Turn Close)
  low_money_warning: boolean;
  debt: DebtState;

  // career-long tracking used for final score computation
  peak_reputation: number;
  total_earnings: number;     // cumulative money earned (not current balance)
  clients_developed: number;  // clients who reached Peak during this run

  agent: AgentState;

  roster: Client[];               // signed clients
  pinned_client_ids: string[];     // manually anchored clients in the lower bar
  dismissed_auto_client_ids: string[]; // clients hidden from automatic lower-bar campaign status
  prospects: Prospect[];          // currently being scouted, not yet signed
  // keys of one_time board item templates that have already appeared this run
  fired_one_time_keys: string[];

  contracts: Contract[];          // all active contracts, both tiers
  campaigns: Campaign[];          // all active campaigns

  // pending_events are interrupting modals; resolved_events are kept for the news feed
  pending_events: GameEvent[];
  resolved_events: GameEvent[];

  // items currently on the decision board; 2–5 per turn
  decision_board: DecisionItem[];
  narrator_pacing: NarratorPacingState;

  news_feed: NewsItem[];
  pending_release_summaries: ReleaseSummaryNotification[];

  is_active: boolean;
  end_condition: RunEndCondition | null;

  tutorial_step: TutorialStep | null;
  tutorial_friend_id: string | null;
  tutorial_prospect_id: string | null;
}
