import { Client, ClientStats, FoggedStat, Prospect } from '../types/client';
import { AgentState } from '../types/agent';
import { ArcStage, CoreStatKey, StatDeltas } from '../types/primitives';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';

// INVARIANTS (PRD §3.2):
// - Every stat has a true_value the engine knows and an observed [min, max] the player sees.
// - Talent is a FIXED CEILING — it does not grow. Scouting only narrows the band.
// - Talent can NEVER be perfectly known (FOG_FLOOR_HARD enforced).
// - Three fog-narrowing sources: agent scouting skills, per-prospect spend, roster tenure.

export const FOG_FLOOR_HARD = 3;   // Talent band half-width floor (±3 → 6-wide minimum)
export const FOG_FLOOR_SOFT = 1;   // Form/Morale/Marketability half-width floor

// Initial half-band widths before any scouting (placeholder for open question §6.2)
const INITIAL_HALF_BAND_HARD = 20;
const INITIAL_HALF_BAND_SOFT = 25;

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
  const skillContrib   = Math.min(14, skillLevel * 2);
  const investedContrib = Math.min(12, stat.scouting_invested / 50);
  const tenureContrib  = Math.min(8,  turnsOnRoster * 0.5);

  const halfBand = Math.max(floor, initialHalf - skillContrib - investedContrib - tenureContrib);
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

export const investScouting: InvestScouting = (entity, statKey, amount, agentState) => {
  const turnsOnRoster = 'turns_on_roster' in entity ? entity.turns_on_roster : 0;
  const updatedStat = {
    ...entity.stats[statKey],
    scouting_invested: entity.stats[statKey].scouting_invested + amount,
  };
  const { observed_min, observed_max } = computeObservedStat(
    updatedStat, statKey, agentState, turnsOnRoster,
  );
  const newStats = {
    ...entity.stats,
    [statKey]: { ...updatedStat, observed_min, observed_max },
  };
  return { ...entity, stats: newStats } as Client | Prospect;
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
    if (client.traits.some(t => t.trait_id === def.key)) continue; // already has it
    return def.key;
  }
  return null;
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

export function generateProspects(count: number, usedNames: Set<string>): Prospect[] {
  const available = PROSPECT_NAMES.filter(n => !usedNames.has(n));
  const result: Prospect[] = [];
  const shuffled = [...available].sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const tv = (): number => 20 + Math.floor(Math.random() * 60);
    const fogged = (trueValue: number, isHard: boolean): FoggedStat => {
      const half = isHard ? INITIAL_HALF_BAND_HARD : INITIAL_HALF_BAND_SOFT;
      return {
        true_value:        trueValue,
        observed_min:      Math.max(0,   trueValue - half),
        observed_max:      Math.min(100, trueValue + half),
        scouting_invested: 0,
      };
    };
    result.push({
      id:              `prospect_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}_${i}`,
      name:            shuffled[i],
      arc_stage:       'rising',
      stats: {
        talent:        fogged(tv(), true),
        form:          fogged(tv(), false),
        marketability: fogged(tv(), false),
        morale:        fogged(65 + Math.floor(Math.random() * 25), false),
      },
      scouting_invested: 0,
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
    stats:            refreshClientFog({ ...prospect, traits: [], turns_on_roster: 0, turns_at_stage: 0, active_campaign_id: null, agent_contract_id: contractId } as Client, agentState),
    traits:           [],
    turns_on_roster:  0,
    turns_at_stage:   0,
    active_campaign_id: null,
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
