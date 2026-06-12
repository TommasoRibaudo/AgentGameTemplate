import { Client } from '../types/client';
import { RunState } from '../types/run';

export const NARRATOR_SKIP_SLOWDOWN_THRESHOLD = 2;
export const NARRATOR_MOMENTUM_BOOST_MAX = 1.4;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const computeNarratorPacingMultiplier = (state: RunState): number => {
  const skipped = state.narrator_pacing.consecutive_skipped_turns;
  if (skipped >= NARRATOR_SKIP_SLOWDOWN_THRESHOLD) {
    return clamp(1 - (skipped - 1) * 0.25, 0.35, 1);
  }

  if (skipped > 0 || state.narrator_pacing.last_turn_skipped_items > 0) return 1;
  return computeNarratorMomentumMultiplier(state);
};

export const computeNarratorTurnRamp = (turnNumber: number): number => {
  if (turnNumber <= 4) return 0.35;
  if (turnNumber <= 10) return 0.65;
  if (turnNumber <= 20) return 0.85;
  return 1;
};

const hasActiveTour = (state: RunState): boolean =>
  state.campaigns.some(c => c.turns_remaining > 0 && c.type_key.includes('tour'));

const hasRecentAlbumRelease = (state: RunState): boolean =>
  state.roster.some(client =>
    client.catalog_releases.some(release =>
      release.kind === 'album' && release.turns_since_release <= 2,
    ),
  );

export const computeNarratorMomentumMultiplier = (state: RunState): number => {
  let multiplier = 1;
  if (hasActiveTour(state)) multiplier += 0.25;
  if (hasRecentAlbumRelease(state)) multiplier += 0.20;
  return clamp(multiplier, 1, NARRATOR_MOMENTUM_BOOST_MAX);
};

export const computeClientNarrativeWeight = (state: RunState, client: Client): number => {
  const audienceWeight = clamp(Math.log10(Math.max(100, client.audience)) - 2, 0.15, 4);
  const reputationWeight = clamp(state.reputation / 50, 0.4, 2);
  const stageWeight = client.arc_stage === 'peak' ? 1.45 : client.arc_stage === 'declining' ? 1.1 : 1;
  const contractWeight = state.contracts.some(
    c => c.client_id === client.id && c.tier === 'client_entity' && c.duration_remaining > 0,
  ) ? 1.25 : 1;
  const campaignWeight = state.campaigns.some(
    c => c.client_id === client.id && c.turns_remaining > 0,
  ) ? 1.35 : 1;
  const tenureWeight = clamp(0.65 + client.turns_on_roster / 16, 0.65, 1.3);

  return audienceWeight * reputationWeight * stageWeight * contractWeight * campaignWeight * tenureWeight;
};

export const selectWeightedClient = (
  state: RunState,
  clients: Client[],
  excludedClientIds: Set<string> = new Set(),
): Client | null => {
  const candidates = clients.filter(client => !excludedClientIds.has(client.id));
  const pool = candidates.length > 0 ? candidates : clients;
  if (pool.length === 0) return null;

  const weights = pool.map(client => ({
    client,
    weight: Math.max(0.01, computeClientNarrativeWeight(state, client)),
  }));
  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const item of weights) {
    roll -= item.weight;
    if (roll <= 0) return item.client;
  }
  return weights[weights.length - 1]?.client ?? null;
};
