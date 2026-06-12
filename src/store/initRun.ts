import { RunState, DebtState } from '../types/run';
import { AgentState } from '../types/agent';
import { VariantManifest } from '../types/manifest';
import { computeProspectPoolSize, generateProspects } from '../engine/client';

const INITIAL_ROSTER_CAPACITY = 3;

export function createNewRun(manifest: VariantManifest, playerName = manifest.labels.agent): RunState {
  const debt: DebtState = {
    is_active:                          false,
    balance:                            0,
    interest_rate:                      manifest.economy.debt_interest_rate,
    per_turn_repayment:                 0,
    credit_ceiling:                     0,
    bankruptcy_warning_turns_remaining: null,
  };

  const agent: AgentState = {
    stats:            { stat_scouting: 0, insight_scouting: 0, negotiation: 0, operations: 0, coaching: 0 },
    roster_capacity:  INITIAL_ROSTER_CAPACITY,
    defense_tracks:   [],
  };

  return {
    id:               `run_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    player_name:      playerName.trim() || manifest.labels.agent,
    variant_id:       manifest.id,
    turn_number:      1,
    career_length:    manifest.economy.career_length,
    phase:            'turn_open',

    money:             manifest.economy.starting_money,
    reputation:        manifest.economy.starting_reputation,
    low_money_warning: false,
    debt,

    peak_reputation:   manifest.economy.starting_reputation,
    total_earnings:    0,
    clients_developed: 0,

    agent,
    roster:                    [],
    pinned_client_ids:         [],
    dismissed_auto_client_ids: [],
    fired_one_time_keys:       [],
    prospects:                 generateProspects(computeProspectPoolSize(manifest.economy.starting_reputation), new Set(), manifest.economy.starting_reputation, 1),
    contracts:         [],
    campaigns:         [],
    pending_events:    [],
    resolved_events:   [],
    decision_board:    [],
    narrator_pacing:   { consecutive_skipped_turns: 0, last_turn_skipped_items: 0 },
    news_feed:         [],
    pending_release_summaries: [],

    is_active:     true,
    end_condition: null,

    tutorial_step:        manifest.id === 'music_v1' ? 'friend_pitch' : null,
    tutorial_friend_id:   null,
    tutorial_prospect_id: null,
  };
}
