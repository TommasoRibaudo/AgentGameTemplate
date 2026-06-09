import { Client, ClientStats, FoggedStat, Prospect } from '../types/client';
import { AgentState } from '../types/agent';
import { ArcStage, CoreStatKey, StatDeltas } from '../types/primitives';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';

// INVARIANTS (PRD §3.2):
// - Every stat has a true_value the engine knows and an observed [min, max] the player sees.
// - Talent has two distinct values: true_value (current, dynamic) and max_potential (fixed hidden ceiling).
// - Talent grows toward max_potential during rising/peak and decays during declining.
// - Talent can NEVER be perfectly known (FOG_FLOOR_HARD enforced).
// - Three fog-narrowing sources: agent scouting skills, per-prospect spend, roster tenure.

export const FOG_FLOOR_HARD = 3;   // Talent band half-width floor (±3 → 6-wide minimum)
export const FOG_FLOOR_SOFT = 1;   // Form/Morale/Marketability half-width floor

// Initial half-band widths before any scouting (placeholder for open question §6.2)
const INITIAL_HALF_BAND_HARD = 35;
const INITIAL_HALF_BAND_SOFT = 40;

const scoutingBuildingLevel = (agentState: AgentState, statKey: CoreStatKey): number => {
  const key =
    statKey === 'talent' || statKey === 'form' ? 'training_facility'
      : statKey === 'marketability' ? 'media_studio'
        : 'wellness_suite';
  return agentState.defense_tracks.find(track => track.key === key)?.level ?? 0;
};

// ─── Fog model ────────────────────────────────────────────────────────────────

export type ComputeObservedStat = (
  stat: FoggedStat,
  statKey: CoreStatKey,
  agentState: AgentState,
  turnsOnRoster: number,
) => Pick<FoggedStat, 'observed_min' | 'observed_max'>;

export const computeObservedStat: ComputeObservedStat = (stat, statKey, agentState, turnsOnRoster) => {
  const isHard = statKey === 'talent';
  const skillLevel  = isHard ? agentState.stats.stat_scouting : agentState.stats.insight_scouting;
  const floor       = isHard ? FOG_FLOOR_HARD : FOG_FLOOR_SOFT;
  const initialHalf = isHard ? INITIAL_HALF_BAND_HARD : INITIAL_HALF_BAND_SOFT;

  // Three narrowing sources (placeholder weights — tuned via open question §6.2)
  const skillContrib    = Math.min(14, skillLevel * 2);
  const investedContrib = Math.min(12, stat.scouting_invested / 50);
  const tenureContrib   = isHard
    ? Math.min(20, turnsOnRoster * 1.0)
    : Math.min(30, turnsOnRoster * 1.5);
  const buildingContrib = Math.min(8, scoutingBuildingLevel(agentState, statKey) * 2);

  const halfBand = Math.max(floor, initialHalf - skillContrib - investedContrib - tenureContrib - buildingContrib);
  return {
    observed_min: Math.max(0,   Math.round(stat.true_value - halfBand)),
    observed_max: Math.min(100, Math.round(stat.true_value + halfBand)),
  };
};

export type RefreshClientFog = (client: Client, agentState: AgentState) => ClientStats;

export const refreshClientFog: RefreshClientFog = (client, agentState) => {
  const keys: CoreStatKey[] = ['talent', 'form', 'marketability', 'morale'];
  const result = { ...client.stats };
  for (const key of keys) {
    const { observed_min, observed_max } = computeObservedStat(
      client.stats[key], key, agentState, client.turns_on_roster,
    );
    result[key] = { ...client.stats[key], observed_min, observed_max };
  }
  return result;
};

export type RefreshProspectFog = (prospect: Prospect, agentState: AgentState) => Prospect;

export const refreshProspectFog: RefreshProspectFog = (prospect, agentState) => {
  const keys: CoreStatKey[] = ['talent', 'form', 'marketability', 'morale'];
  const stats = { ...prospect.stats };
  for (const key of keys) {
    const { observed_min, observed_max } = computeObservedStat(
      prospect.stats[key], key, agentState, 0, // tenure always 0 for prospects
    );
    stats[key] = { ...prospect.stats[key], observed_min, observed_max };
  }
  return { ...prospect, stats };
};

export type InvestScouting = (
  entity: Client | Prospect,
  statKey: CoreStatKey,
  amount: number,
  agentState: AgentState,
) => Client | Prospect;

export const canInvestScouting = (
  entity: Client | Prospect,
  statKey: CoreStatKey,
  amount: number,
  agentState: AgentState,
): boolean => {
  const turnsOnRoster = 'turns_on_roster' in entity ? entity.turns_on_roster : 0;
  const currentObserved = computeObservedStat(
    entity.stats[statKey], statKey, agentState, turnsOnRoster,
  );
  const updatedStat = {
    ...entity.stats[statKey],
    scouting_invested: entity.stats[statKey].scouting_invested + amount,
  };
  const { observed_min, observed_max } = computeObservedStat(
    updatedStat, statKey, agentState, turnsOnRoster,
  );
  return observed_min !== currentObserved.observed_min ||
    observed_max !== currentObserved.observed_max;
};

export const investScouting: InvestScouting = (entity, statKey, amount, agentState) => {
  if (!canInvestScouting(entity, statKey, amount, agentState)) {
    return entity;
  }
  const turnsOnRoster = 'turns_on_roster' in entity ? entity.turns_on_roster : 0;
  const updatedStat = {
    ...entity.stats[statKey],
    scouting_invested: entity.stats[statKey].scouting_invested + amount,
  };
  const { observed_min, observed_max } = computeObservedStat(
    updatedStat, statKey, agentState, turnsOnRoster,
  );
  const nextObservedMin = Math.max(entity.stats[statKey].observed_min, observed_min);
  const nextObservedMax = Math.min(entity.stats[statKey].observed_max, observed_max);
  const newStats = {
    ...entity.stats,
    [statKey]: { ...updatedStat, observed_min: nextObservedMin, observed_max: nextObservedMax },
  };
  return { ...entity, stats: newStats } as Client | Prospect;
};

// ─── Talent growth / decay ────────────────────────────────────────────────────

// Growth: applied each upkeep for rising/peak clients.
// The probability roll makes growth slow and non-guaranteed; all modifiers stack.
export const BASE_GROWTH_CHANCE        = 0.20;  // 20% per turn base probability
export const GROWTH_CHANCE_PER_TF_LVL = 0.10;  // +10% per training_facility level
export const BASE_GROWTH_AMOUNT        = 1;     // talent points gained when growth fires
export const GROWTH_AMOUNT_PER_TF_LVL = 0.5;   // +0.5 pts per training_facility level

// Decay: applied each upkeep for declining clients. Low morale/form decays faster.
export const BASE_DECAY_CHANCE  = 0.25;   // 25% per turn base probability
export const BASE_DECAY_AMOUNT  = 1;      // talent points lost when decay fires

// Snap-back: deterministic per upkeep when talent has exceeded max_potential.
export const TALENT_SNAP_BACK_AMOUNT = 1;

const moraleGrowthMult  = (m: number) => 0.5 + m / 100;          // 0.5–1.5
const formGrowthMult    = (f: number) => 0.6 + (f * 0.8) / 100;  // 0.6–1.4
const coachingGrowthMult = (c: number) => Math.max(0.7, 0.7 + c * 0.15);

const moraleDecayMult = (m: number) => Math.max(0.5, 1.5 - m / 100);         // low morale → higher
const formDecayMult   = (f: number) => Math.max(0.6, 1.4 - (f * 0.8) / 100); // low form  → higher

export type ApplyTalentGrowthDecay = (client: Client, agentState: AgentState) => Client;

export const applyTalentGrowthDecay: ApplyTalentGrowthDecay = (client, agentState) => {
  const morale   = client.stats.morale.true_value;
  const form     = client.stats.form.true_value;
  const coaching = agentState.stats.coaching;
  const tfLevel  = agentState.defense_tracks.find(t => t.key === 'training_facility')?.level ?? 0;
  const current  = client.stats.talent.true_value;

  let next = current;

  if (current > client.max_potential) {
    // Deterministic snap-back toward ceiling — no roll needed
    next = Math.max(client.max_potential, current - TALENT_SNAP_BACK_AMOUNT);
  } else if (client.arc_stage === 'declining') {
    const chance = Math.min(0.95, BASE_DECAY_CHANCE * moraleDecayMult(morale) * formDecayMult(form));
    if (Math.random() < chance) {
      next = Math.max(0, current - BASE_DECAY_AMOUNT);
    }
  } else {
    const mMult = moraleGrowthMult(morale);
    const fMult = formGrowthMult(form);
    const cMult = coachingGrowthMult(coaching);
    const chance = Math.min(0.95, (BASE_GROWTH_CHANCE + tfLevel * GROWTH_CHANCE_PER_TF_LVL) * mMult * fMult * cMult);
    if (Math.random() < chance) {
      const amount = (BASE_GROWTH_AMOUNT + tfLevel * GROWTH_AMOUNT_PER_TF_LVL) * mMult * fMult * cMult;
      next = Math.min(client.max_potential, current + amount);
    }
  }

  if (next === current) return client;

  return {
    ...client,
    stats: { ...client.stats, talent: { ...client.stats.talent, true_value: next } },
  };
};

// ─── Arc progression ──────────────────────────────────────────────────────────

export type EvaluateArcProgression = (client: Client, manifest: VariantManifest) => ArcStage;

const formModifier = (formTrue: number, advancing: boolean): number => {
  // High form accelerates Rising→Peak; high form extends Peak; low form has opposite effect
  if (advancing) return formTrue > 70 ? -6 : formTrue < 30 ? 8 : 0;
  return formTrue > 70 ? 8 : formTrue < 30 ? -6 : 0;
};

export const evaluateArcProgression: EvaluateArcProgression = (client, manifest) => {
  const { arc_stage, turns_at_stage, stats } = client;
  const formTrue = stats.form.true_value;

  if (arc_stage === 'rising') {
    const threshold = manifest.arc.rising_to_peak_base_turns + formModifier(formTrue, true);
    return turns_at_stage >= threshold ? 'peak' : 'rising';
  }
  if (arc_stage === 'peak') {
    const threshold = manifest.arc.peak_to_declining_base_turns + formModifier(formTrue, false);
    return turns_at_stage >= threshold ? 'declining' : 'peak';
  }
  return 'declining'; // no further advancement
};

export type ApplyArcMultipliers = (
  stats: ClientStats,
  stage: ArcStage,
  manifest: VariantManifest,
) => ClientStats;

// Arc multipliers scale the observable ranges — they do NOT change true_value.
// Applied after fog computation for display only.
export const applyArcMultipliers: ApplyArcMultipliers = (stats, stage, manifest) => {
  const mults = manifest.arc.stage_multipliers[stage];
  const scale = (stat: FoggedStat, mult: number): FoggedStat => ({
    ...stat,
    observed_min: Math.round(stat.observed_min * mult),
    observed_max: Math.round(stat.observed_max * mult),
  });
  return {
    talent:        scale(stats.talent,        mults.talent),
    form:          scale(stats.form,          mults.form),
    marketability: scale(stats.marketability, mults.marketability),
    morale:        stats.morale, // morale unaffected by arc multipliers
  };
};

// ─── Stat deltas ──────────────────────────────────────────────────────────────

export type ApplyClientStatDeltas = (
  client: Client,
  deltas: StatDeltas,
  agentState: AgentState,
) => Client;

export const applyClientStatDeltas: ApplyClientStatDeltas = (client, deltas, agentState) => {
  let stats = { ...client.stats };
  for (const [key, delta] of Object.entries(deltas) as [CoreStatKey, number][]) {
    const stat = stats[key];
    const newTrue = Math.max(0, Math.min(100, stat.true_value + delta));
    const updated = { ...stat, true_value: newTrue };
    const { observed_min, observed_max } = computeObservedStat(
      updated, key, agentState, client.turns_on_roster,
    );
    stats[key] = { ...updated, observed_min, observed_max };
  }
  return { ...client, stats };
};

// ─── Traits ───────────────────────────────────────────────────────────────────

export type CheckTraitGrant = (
  client: Client,
  conditionKey: string,
  rollResult: number,
  manifest: VariantManifest,
) => string | null;

export const checkTraitGrant: CheckTraitGrant = (client, conditionKey, rollResult, manifest) => {
  for (const def of manifest.traits) {
    if (def.trigger_condition_key !== conditionKey) continue;
    if (rollResult < def.trigger_threshold) continue;
    if (client.traits.some(t => t.trait_id === def.key)) continue;
    return def.key;
  }
  return null;
};

export type CheckDecisionTraitGrants = (
  client: Client,
  templateKey: string,
  optionKey: string,
  manifest: VariantManifest,
) => string[];

// client.decision_option_counts must already include the current decision before calling this.
export const checkDecisionTraitGrants: CheckDecisionTraitGrants = (client, templateKey, optionKey, manifest) => {
  const countKey = `${templateKey}:${optionKey}`;
  const count = client.decision_option_counts[countKey] ?? 0;
  const granted: string[] = [];
  for (const def of manifest.traits) {
    const dt = def.decision_trigger;
    if (!dt) continue;
    if (dt.template_key !== templateKey || dt.option_key !== optionKey) continue;
    if (count < dt.required_count) continue;
    if (client.traits.some(t => t.trait_id === def.key)) continue;
    if (Math.random() < dt.probability) granted.push(def.key);
  }
  return granted;
};

export type GrantTrait = (client: Client, traitId: string, manifest: VariantManifest) => Client;

export const grantTrait: GrantTrait = (client, traitId, manifest) => {
  if (client.traits.some(t => t.trait_id === traitId)) return client;
  const def = manifest.traits.find(t => t.key === traitId);
  if (!def) return client;
  return {
    ...client,
    traits: [
      ...client.traits,
      {
        trait_id:             def.key,
        stat_modifiers:       def.stat_modifiers,
        marketability_modifier: def.marketability_modifier,
        event_bias:           def.event_bias,
      },
    ],
  };
};

// ─── Prospect generation ──────────────────────────────────────────────────────

const PROSPECT_NAMES = [
  'Alex Rivera', 'Morgan Chen', 'Jordan Blake', 'Sam Waters', 'Riley Park',
  'Taylor Singh', 'Casey Kim', 'Drew Monroe', 'Avery Cruz', 'Quinn Patel',
  'Dylan Shah', 'Parker Lee', 'Sawyer Fox', 'Harper West', 'Skyler Reyes',
  'Kai Nguyen', 'River Stone', 'Phoenix Moon', 'Sage Cooper', 'Nova Torres',
  'Ash Bennett', 'Rowan Hall', 'Finley Cross', 'Emery Ward', 'Remy Nash',
];

export function computeProspectPoolSize(reputation: number): number {
  if (reputation >= 75) return 6;
  if (reputation >= 50) return 5;
  if (reputation >= 25) return 4;
  return 3;
}

export function generateProspects(count: number, usedNames: Set<string>, reputation = 50): Prospect[] {
  const available = PROSPECT_NAMES.filter(n => !usedNames.has(n));
  const result: Prospect[] = [];
  const shuffled = [...available].sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const prestigeBonus = Math.floor(Math.max(0, Math.min(100, reputation)) / 10);
    const tv = (): number => {
      const min = 15 + Math.floor(prestigeBonus / 2);
      const max = 55 + prestigeBonus;
      return min + Math.floor(Math.random() * Math.max(1, max - min));
    };
    const fogged = (trueValue: number, isHard: boolean): FoggedStat => {
      const half = isHard ? INITIAL_HALF_BAND_HARD : INITIAL_HALF_BAND_SOFT;
      return {
        true_value:        trueValue,
        observed_min:      Math.max(0,   trueValue - half),
        observed_max:      Math.min(100, trueValue + half),
        scouting_invested: 0,
      };
    };
    const marketability = tv();
    const audience = Math.max(500, Math.round((marketability * 120) + (reputation * 80) + Math.random() * 3_000));
    const startingTalent = tv();
    const maxPotential = Math.min(100, startingTalent + 5 + Math.floor(Math.random() * 36));
    result.push({
      id:              `prospect_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}_${i}`,
      name:            shuffled[i],
      arc_stage:       'rising',
      audience,
      stats: {
        talent:        fogged(startingTalent, true),
        form:          fogged(tv(), false),
        marketability: fogged(marketability, false),
        morale:        fogged(65 + Math.floor(Math.random() * 25), false),
      },
      scouting_invested: 0,
      max_potential:   maxPotential,
    });
  }
  return result;
}

// ─── Roster operations ────────────────────────────────────────────────────────

export type SignClient = (
  state: RunState,
  prospectId: string,
  contractId: string,
  agentState: AgentState,
) => RunState;

export const signClient: SignClient = (state, prospectId, contractId, agentState) => {
  const prospect = state.prospects.find(p => p.id === prospectId);
  if (!prospect) return state;

  const newClient: Client = {
    id:               prospect.id,
    name:             prospect.name,
    arc_stage:        prospect.arc_stage,
    audience:         prospect.audience,
    max_potential:    prospect.max_potential,
    stats:            refreshClientFog({ ...prospect, traits: [], turns_on_roster: 0, turns_at_stage: 0, active_campaign_id: null, campaign_history: [], catalog_releases: [], agent_contract_id: contractId, max_potential: prospect.max_potential, decision_option_counts: {} } as Client, agentState),
    traits:           [],
    decision_option_counts: {},
    turns_on_roster:  0,
    turns_at_stage:   0,
    active_campaign_id: null,
    campaign_history: [],
    catalog_releases: [],
    agent_contract_id: contractId,
  };

  return {
    ...state,
    roster:    [...state.roster, newClient],
    prospects: state.prospects.filter(p => p.id !== prospectId),
    contracts: state.contracts.map(c =>
      c.id === contractId ? { ...c, client_id: prospect.id } : c,
    ),
  };
};

export type ReleaseClient = (
  state: RunState,
  clientId: string,
  manifest: VariantManifest,
) => RunState;

export const releaseClient: ReleaseClient = (state, clientId, manifest) => {
  const client = state.roster.find(c => c.id === clientId);
  if (!client) return state;

  const agentContract = client.agent_contract_id
    ? state.contracts.find(c => c.id === client.agent_contract_id)
    : null;

  let s = state;

  // Active contract → severance (2 months of obligations) + rep hit
  if (agentContract && agentContract.duration_remaining > 0) {
    const severance = agentContract.obligations_per_turn * 2;
    s = {
      ...s,
      money:      Math.max(0, s.money - severance),
      reputation: Math.max(0, s.reputation - 5),
    };
  }

  return {
    ...s,
    roster:    s.roster.filter(c => c.id !== clientId),
    contracts: s.contracts.map(c =>
      c.id === client.agent_contract_id ? { ...c, duration_remaining: 0 } : c,
    ),
  };
};
