import { ArcStage, CoreStatKey, StatDeltas } from './primitives';

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
  stats: ClientStats;
  traits: AppliedTrait[];
  // turns spent on your roster — longer tenure narrows fog independently of scouting spend
  turns_on_roster: number;
  active_campaign_id: string | null;
  // the agent<->client contract currently in force; null if unsigned or released
  agent_contract_id: string | null;
}

// Lightweight prospect record before signing — stats are maximally fogged
export interface Prospect {
  id: string;
  name: string;
  arc_stage: ArcStage;
  stats: ClientStats;
  scouting_invested: number;    // total spend so far narrowing this prospect's fog
}
