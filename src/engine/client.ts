import { Client, ClientStats, FoggedStat, Prospect } from '../types/client';
import { pickPortrait } from '../portraits';
import { AgentState } from '../types/agent';
import { ArcStage, CoreStatKey, StatDeltas } from '../types/primitives';
import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { CampaignHistoryItem, CatalogRelease, ReleaseSong } from '../types/campaign';

// INVARIANTS (PRD §3.2):
// - Every stat has a true_value the engine knows and an observed [min, max] the player sees.
// - Talent has two distinct values: true_value (current, dynamic) and max_potential (fixed hidden ceiling).
// - Talent grows toward max_potential during rising/peak and decays during declining.
// - Talent can reach perfect knowledge at sufficient scouting investment and tenure.
// - Three fog-narrowing sources: agent scouting skills, per-prospect spend, roster tenure.

export const FOG_FLOOR_HARD = 0;   // Talent band half-width floor (0 → can reach perfect knowledge)
export const FOG_FLOOR_SOFT = 0;   // Soft stat half-width floor (0 → can reach perfect knowledge)
export const SIGNING_FOG_BOOST = 200; // scouting_invested credited to all stats at signing
export const WEEKS_PER_YEAR = 52;
export const PROSPECT_LIFESPAN = 10;  // turns a prospect stays in the pool before expiring

const ARC_AGE_RANGES_YEARS: Record<ArcStage, [number, number]> = {
  rising:    [16, 24],
  peak:      [24, 32],
  declining: [32, 42],
};

// Initial half-band widths before any scouting (placeholder for open question §6.2)
const INITIAL_HALF_BAND_HARD = 32;
const INITIAL_HALF_BAND_SOFT = 40;

export function ageWeeksForArcStage(stage: ArcStage): number {
  const [min, max] = ARC_AGE_RANGES_YEARS[stage];
  const minWeeks = min * WEEKS_PER_YEAR;
  const maxWeeks = max * WEEKS_PER_YEAR - 1;
  return minWeeks + Math.floor(Math.random() * Math.max(1, maxWeeks - minWeeks + 1));
}

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

// ─── Audience decay ───────────────────────────────────────────────────────────

// Passive per-turn loss — artists fade without active campaigns.
// Rates are stage-weighted: rising artists build slowly, declining artists shed fans faster.
export const AUDIENCE_DECAY_RATE: Record<ArcStage, number> = {
  rising:    0.001, // 0.1 % per turn
  peak:      0.003, // 0.3 % per turn
  declining: 0.005, // 0.5 % per turn
};

export type ApplyAudienceDecay = (client: Client) => Client;

export const applyAudienceDecay: ApplyAudienceDecay = (client) => {
  const loss = Math.round(client.audience * AUDIENCE_DECAY_RATE[client.arc_stage]);
  if (loss <= 0) return client;
  return { ...client, audience: Math.max(0, client.audience - loss) };
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

export function generateProspects(
  count: number,
  usedNames: Set<string>,
  reputation = 50,
  turnNumber = 1,
  statScouting = 0,
  insightScouting = 0,
): Prospect[] {
  const available = PROSPECT_NAMES.filter(n => !usedNames.has(n));
  const result: Prospect[] = [];
  const shuffled = [...available].sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    // Quality ceiling grows with turn progression, reputation, and scouting skill.
    // Better scouts find higher-ceiling prospects that lower-skill agents simply miss.
    const turnProgressBonus = Math.min(30, Math.floor(turnNumber / 2));
    const repBonus          = Math.floor(Math.max(0, Math.min(100, reputation)) / 10);
    const scoutingBonus     = Math.min(15, statScouting + insightScouting);
    const tv = (): number => {
      const min = 10;
      const max = 28 + turnProgressBonus + repBonus + scoutingBonus;
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
    const audience = Math.max(50, Math.round((marketability * 18) + (reputation * 12) + Math.random() * 600));
    const startingTalent = tv();
    const maxPotential = Math.min(100, startingTalent + 5 + Math.floor(Math.random() * 36));
    const { key: portrait, gender } = pickPortrait();
    result.push({
      id:              `prospect_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}_${i}`,
      name:            shuffled[i],
      gender,
      portrait,
      age_weeks:       ageWeeksForArcStage('rising'),
      arc_stage:       'rising',
      audience,
      stats: {
        talent:        fogged(startingTalent, true),
        form:          fogged(tv(), false),
        marketability: fogged(marketability, false),
        morale:        fogged(65 + Math.floor(Math.random() * 25), false),
      },
      scouting_invested:        0,
      max_potential:            maxPotential,
      expires_in:               PROSPECT_LIFESPAN,
      generated_at_reputation:  reputation,
    });
  }
  return result;
}

// ─── Pre-signing history ──────────────────────────────────────────────────────

// Artists with a meaningful existing audience had a career before you signed them.
// Generate plausible past campaign history and catalog entries at sign time so the
// client detail screen is not empty for artists who clearly weren't born yesterday.

const PRE_HISTORY_SONG_TITLES = [
  'Late Night Drive', 'Neon Signs', 'Fade Away', 'Run It Back', 'Ghost Town',
  'Broken Clocks', 'Paper Planes', 'Summer Rain', 'Midnight Call', 'Low Key',
  'Still Standing', 'Wired', 'Control', 'Burning Up', 'Glass', 'Static',
  'Free', 'Heavy', 'Spark', 'Open Road', 'No Signal', 'Colors', 'Waiting',
];

const PRE_HISTORY_RELEASE_TITLES = [
  'Arrival', 'First Steps', 'Raw', 'Unfiltered', 'The Beginning',
  'Chapter One', 'Demo Tape', 'Ground Level', 'Static', 'Open Season',
  'Humble Beginnings', 'Street Level', 'The Come Up', 'Rough Draft', 'Zero',
  'Before Everything', 'Draft One', 'Foundations', 'Early Work', 'Volume 1',
];

function histId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomUnique<T>(arr: T[], exclude: Set<T>): T {
  const filtered = arr.filter(v => !exclude.has(v));
  return filtered.length > 0 ? pickRandom(filtered) : pickRandom(arr);
}

function generatePreSigningHistory(
  prospect: Prospect,
  manifest: VariantManifest,
): { campaign_history: CampaignHistoryItem[]; catalog_releases: CatalogRelease[] } {
  const { audience } = prospect;

  // Tier boundaries tuned to the typical prospect audience range (~780–2200 fans).
  //   < 900  → truly new, no pre-existing record
  //   900–1400 → done some local gigs
  //   1400–1900 → gigs + a mixtape/short release
  //   ≥ 1900 → gigs + single + mixtape (more complete early career)
  if (audience < 900) return { campaign_history: [], catalog_releases: [] };

  const gigType = manifest.campaign_types.find(
    ct => !ct.release_kind && ct.valid_arc_stages.includes('rising'),
  );
  // Prefer a longer-form release (mixtape), fall back to any release type
  const tapeType = manifest.campaign_types.find(
    ct => ct.release_kind && ct.release_kind !== 'album' && ct.total_turns >= 3 && ct.valid_arc_stages.includes('rising'),
  );
  // Prefer a short release (single) that is different from tapeType
  const singleType = manifest.campaign_types.find(
    ct => ct.release_kind && ct.release_kind !== 'album' && ct.total_turns <= 2 && ct.valid_arc_stages.includes('rising') && ct !== tapeType,
  );

  if (!gigType) return { campaign_history: [], catalog_releases: [] };

  const tier = audience < 1400 ? 1 : audience < 1900 ? 2 : 3;
  const campaign_history: CampaignHistoryItem[] = [];
  const catalog_releases: CatalogRelease[] = [];
  const usedTitles = new Set<string>();

  // Earliest to latest; turn offsets are negative (before game start).
  // Tape completed at -3, single at -7, gigs at -12 / -8 / -4.
  const gigEnd   = tier === 3 ? -12 : tier === 2 ? -8 : -4;
  const singleEnd = -7;
  const tapeEnd   = -3;

  // ── Gig campaign ──────────────────────────────────────────────────────────
  const gigFanDelta = 80 + Math.floor(Math.random() * 180);
  const gigMoney    = Math.floor(gigType.base_payout * gigType.total_turns * (0.4 + Math.random() * 0.4));
  const gigCampId   = histId();
  campaign_history.push({
    id:           gigCampId,
    type_key:     gigType.key,
    label:        gigType.label,
    started_turn: gigEnd - gigType.total_turns,
    completed_turn: gigEnd,
    total_turns:  gigType.total_turns,
    setup: {
      size: 'small',
      length: gigType.total_turns,
      budget: Math.floor(gigType.base_payout * 0.5),
      payout_multiplier: 0.8,
      audience_multiplier: 0.8,
      event_risk_multiplier: 1.0,
    },
    installment_results: [],
    release_id:   null,
    summary: {
      money_delta:      gigMoney,
      reputation_delta: 0,
      fan_delta:        gigFanDelta,
    },
    visible_notes: [],
  });

  // ── Single release (tier 3 only) ──────────────────────────────────────────
  if (tier >= 3 && singleType) {
    const singleFanDelta = 150 + Math.floor(Math.random() * 200);
    const singleStreams   = singleFanDelta * 70 + Math.floor(Math.random() * 20_000);
    const singleIncome    = Math.floor(singleStreams * 0.004);
    const singleCampId    = histId();
    const singleRelId     = histId();
    const singleTitle     = pickRandomUnique(PRE_HISTORY_SONG_TITLES, usedTitles);
    usedTitles.add(singleTitle);

    campaign_history.push({
      id:           singleCampId,
      type_key:     singleType.key,
      label:        singleType.label,
      started_turn: singleEnd - singleType.total_turns,
      completed_turn: singleEnd,
      total_turns:  singleType.total_turns,
      setup: {
        size: 'small',
        length: singleType.total_turns,
        budget: Math.floor(singleType.base_payout * 0.5),
        payout_multiplier: 0.8,
        audience_multiplier: 0.8,
        event_risk_multiplier: 1.0,
      },
      installment_results: [],
      release_id:   singleRelId,
      summary: {
        money_delta:      singleIncome,
        reputation_delta: 0,
        fan_delta:        singleFanDelta,
        streams:          singleStreams,
        stream_income:    singleIncome,
      },
      visible_notes: [],
    });

    catalog_releases.push({
      id:                    singleRelId,
      campaign_id:           singleCampId,
      kind:                  singleType.release_kind!,
      type_key:              singleType.key,
      title:                 singleTitle,
      songs: [{
        id:      histId(),
        title:   singleTitle,
        quality: 35 + Math.floor(Math.random() * 35),
      }] as ReleaseSong[],
      released_turn:         singleEnd,
      turns_since_release:   Math.abs(singleEnd),
      album_units_sold:      0,
      total_streams:         singleStreams,
      album_income_total:    0,
      stream_income_total:   singleIncome,
      latest_turn_album_units: 0,
      latest_turn_streams:   Math.floor(singleStreams * 0.04),
      latest_turn_income:    Math.floor(singleStreams * 0.04 * 0.004),
      latest_turn_fan_gain:  1 + Math.floor(Math.random() * 3),
      total_fan_gain:        singleFanDelta,
      is_selling_albums:     false,
    });
  }

  // ── Mixtape / short release (tier 2+) ─────────────────────────────────────
  if (tier >= 2 && tapeType) {
    const tapeFanDelta  = 300 + Math.floor(Math.random() * 400);
    const tapeStreams    = tapeFanDelta * 80 + Math.floor(Math.random() * 60_000);
    const tapeIncome    = Math.floor(tapeStreams * 0.004);
    const tapeCampId    = histId();
    const tapeRelId     = histId();
    const tapeTitle     = pickRandomUnique(PRE_HISTORY_RELEASE_TITLES, usedTitles);
    usedTitles.add(tapeTitle);

    const songCount = 4 + Math.floor(Math.random() * 4);
    const songs: ReleaseSong[] = Array.from({ length: songCount }, () => ({
      id:      histId(),
      title:   pickRandomUnique(PRE_HISTORY_SONG_TITLES, usedTitles),
      quality: 30 + Math.floor(Math.random() * 45),
    }));
    songs.forEach(s => usedTitles.add(s.title));

    campaign_history.push({
      id:           tapeCampId,
      type_key:     tapeType.key,
      label:        tapeType.label,
      started_turn: tapeEnd - tapeType.total_turns,
      completed_turn: tapeEnd,
      total_turns:  tapeType.total_turns,
      setup: {
        size: 'small',
        length: tapeType.total_turns,
        budget: Math.floor(tapeType.base_payout * 0.5),
        payout_multiplier: 0.8,
        audience_multiplier: 0.9,
        event_risk_multiplier: 1.0,
      },
      installment_results: [],
      release_id:   tapeRelId,
      summary: {
        money_delta:      tapeIncome,
        reputation_delta: 0,
        fan_delta:        tapeFanDelta,
        streams:          tapeStreams,
        stream_income:    tapeIncome,
      },
      visible_notes: [],
    });

    catalog_releases.push({
      id:                    tapeRelId,
      campaign_id:           tapeCampId,
      kind:                  tapeType.release_kind!,
      type_key:              tapeType.key,
      title:                 tapeTitle,
      songs,
      released_turn:         tapeEnd,
      turns_since_release:   Math.abs(tapeEnd),
      album_units_sold:      0,
      total_streams:         tapeStreams,
      album_income_total:    0,
      stream_income_total:   tapeIncome,
      latest_turn_album_units: 0,
      latest_turn_streams:   Math.floor(tapeStreams * 0.025),
      latest_turn_income:    Math.floor(tapeStreams * 0.025 * 0.004),
      latest_turn_fan_gain:  2 + Math.floor(Math.random() * 5),
      total_fan_gain:        tapeFanDelta,
      is_selling_albums:     false,
    });
  }

  return { campaign_history, catalog_releases };
}

// ─── Roster operations ────────────────────────────────────────────────────────

export type SignClient = (
  state: RunState,
  prospectId: string,
  contractId: string,
  agentState: AgentState,
  manifest: VariantManifest,
) => RunState;

export const signClient: SignClient = (state, prospectId, contractId, agentState, manifest) => {
  const prospect = state.prospects.find(p => p.id === prospectId);
  if (!prospect) return state;

  const signingBoostKeys: CoreStatKey[] = ['talent', 'form', 'marketability', 'morale'];
  const boostedStats = { ...prospect.stats };
  for (const key of signingBoostKeys) {
    boostedStats[key] = { ...boostedStats[key], scouting_invested: SIGNING_FOG_BOOST };
  }

  const { campaign_history, catalog_releases } = generatePreSigningHistory(prospect, manifest);

  const newClient: Client = {
    id:               prospect.id,
    name:             prospect.name,
    gender:           prospect.gender,
    portrait:         prospect.portrait,
    arc_stage:        prospect.arc_stage,
    audience:         prospect.audience,
    max_potential:    prospect.max_potential,
    stats:            refreshClientFog({ ...prospect, stats: boostedStats, traits: [], turns_on_roster: 0, turns_at_stage: 0, active_campaign_id: null, campaign_history: [], catalog_releases: [], agent_contract_id: contractId, max_potential: prospect.max_potential, decision_option_counts: {} } as Client, agentState),
    age_weeks:        prospect.age_weeks,
    traits:           [],
    decision_option_counts: {},
    turns_on_roster:  0,
    turns_at_stage:   0,
    active_campaign_id: null,
    campaign_history,
    catalog_releases,
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

  // Active contract → severance (2 weeks of obligations) + rep hit
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
    campaigns: s.campaigns.filter(c => c.client_id !== clientId),
    contracts: s.contracts.map(c =>
      c.id === client.agent_contract_id ? { ...c, duration_remaining: 0 } : c,
    ),
  };
};
