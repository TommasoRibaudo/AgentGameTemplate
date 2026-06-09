// Defense tracks are agency infrastructure — bought with Money, often recurring cost.
// They are distinct from agent stats (personal skills grown with Money + Rep).
export interface DefenseTrack {
  // 'insurance' | 'pr' | 'legal' | 'medical' — variant may rename but core has these four
  key: string;
  level: number;
  per_turn_cost: number;
}

export interface AgentStats {
  // narrows the fog on hard/fixed stats (Talent, domain performance sub-attributes)
  stat_scouting: number;
  // narrows the fog on soft/dynamic reads (Form, Morale, Arc stage)
  insight_scouting: number;
  // improves both contract tiers AND reveals counterparty posture
  negotiation: number;
  // lowers overhead and client costs
  operations: number;
  // multiplies talent growth probability and amount for all roster clients
  coaching: number;
}

export interface AgentState {
  stats: AgentStats;
  // hard cap on roster size; starts low, grown by buying infrastructure slots
  roster_capacity: number;
  defense_tracks: DefenseTrack[];
}
