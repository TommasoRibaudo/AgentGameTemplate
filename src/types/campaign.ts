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
}

export interface Campaign {
  id: string;
  client_id: string;
  // references variant manifest campaign type definition
  type_key: string;
  total_turns: number;
  turns_remaining: number;
  installment_results: CampaignInstallmentResult[];
  // contract objective IDs waiting on this campaign's completion to pay out
  pending_objective_ids: string[];
}
