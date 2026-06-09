import { ArcStage, CoreStatKey, StatDeltas } from './primitives';
import { CampaignHistoryItem, CatalogRelease } from './campaign';

// The engine holds the true value; the player only ever sees [observed_min, observed_max].
// observed_min/max are derived — recomputed whenever scouting_invested, agent skills, or
// turns_on_roster change. Storing them avoids recomputing on every render.
export interface FoggedStat {
  true_value: number;         // 0–100; never exposed to the player
  observed_min: number;
  observed_max: number;
  // cumulative spend (Money + Rep) targeting this stat on this client
  scouting_invested: number;
}

// Talent is a fixed ceiling and uses stat_scouting to narrow.
// Form, Marketability, Morale are dynamic and use insight_scouting.
export type ClientStats = Record<CoreStatKey, FoggedStat>;

// Traits are earned from activity; the definition lives in the variant manifest.
// stat_modifiers and event_bias are resolved from the manifest at load time and
// cached here so the engine doesn't need to join every tick.
export interface AppliedTrait {
  trait_id: string;             // references variant manifest trait library
  stat_modifiers: StatDeltas;
  marketability_modifier: number;
  // event_category -> probability multiplier (e.g. 'client' -> 1.5 for Injury Prone)
  event_bias: Partial<Record<string, number>>;
}

export interface Client {
  id: string;
  name: string;
  arc_stage: ArcStage;
  audience: number;
  stats: ClientStats;
  traits: AppliedTrait[];
  // fixed hidden ceiling (0–100) set at prospect generation; talent grows toward this, never shown directly
  max_potential: number;
  // turns spent on your roster — longer tenure narrows fog independently of scouting spend
  turns_on_roster: number;
  // turns spent at the current arc stage — drives arc progression evaluation
  turns_at_stage: number;
  active_campaign_id: string | null;
  campaign_history: CampaignHistoryItem[];
  catalog_releases: CatalogRelease[];
  // the agent<->client contract currently in force; null if unsigned or released
  agent_contract_id: string | null;
  // counts how many times each decision option was chosen for this client;
  // key is "templateKey:optionKey" — used to check decision_trigger trait conditions
  decision_option_counts: Record<string, number>;
}

// Lightweight prospect record before signing — stats are maximally fogged
export interface Prospect {
  id: string;
  name: string;
  arc_stage: ArcStage;
  audience: number;
  stats: ClientStats;
  scouting_invested: number;    // total spend so far narrowing this prospect's fog
  max_potential: number;        // carried over to Client on signing
}
