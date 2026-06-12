import { RunState } from '../types/run';
import { VariantManifest } from '../types/manifest';
import { Client } from '../types/client';
import { Contract } from '../types/contract';
import { Campaign } from '../types/campaign';
import { CoreStatKey } from '../types/primitives';
import { formatMoney } from '../theme';

const STAT_KEYS: CoreStatKey[] = ['talent', 'form', 'marketability', 'morale'];

export function buildDebugStatus(state: RunState, manifest: VariantManifest): string {
  const lines: string[] = [];
  const labels = manifest.labels;

  lines.push(`# ${manifest.name} debug status`);
  lines.push(`Run: ${state.id}`);
  lines.push(`Player: ${state.player_name}`);
  lines.push(`Week: ${state.turn_number}/${state.career_length}`);
  lines.push(`Phase: ${state.phase}`);
  lines.push(`Active: ${state.is_active}`);
  lines.push(`Money: ${formatMoney(state.money)}`);
  lines.push(`Reputation: ${state.reputation}`);
  lines.push(`Peak reputation: ${state.peak_reputation}`);
  lines.push(`Total earnings: ${formatMoney(state.total_earnings)}`);
  lines.push(`Low money warning: ${state.low_money_warning}`);
  lines.push(`Debt: ${state.debt.is_active ? `${formatMoney(state.debt.balance)} owed, ${formatMoney(state.debt.per_turn_repayment)}/turn, ceiling ${formatMoney(state.debt.credit_ceiling)}` : 'inactive'}`);
  lines.push(`Roster: ${state.roster.length}/${state.agent.roster_capacity}`);
  lines.push(`Prospects: ${state.prospects.length}`);
  lines.push(`Contracts: ${state.contracts.length}`);
  lines.push(`Active campaigns: ${state.campaigns.filter(c => c.turns_remaining > 0).length}`);
  lines.push(`Decision board: ${state.decision_board.filter(item => !item.is_resolved).length} unresolved`);
  lines.push('');

  lines.push('## Agency');
  lines.push(`Agent label: ${labels.agent}`);
  lines.push(`Artist label: ${labels.client}`);
  lines.push(`Stats: ${Object.entries(state.agent.stats).map(([key, value]) => `${key}=${value}`).join(', ')}`);
  lines.push(`Infrastructure: ${state.agent.defense_tracks.map(track => `${track.key}=Lv${track.level}(${formatMoney(track.per_turn_cost)}/turn)`).join(', ') || 'none'}`);
  lines.push(`Pinned artists: ${state.pinned_client_ids.join(', ') || 'none'}`);
  lines.push(`Dismissed campaign bar artists: ${state.dismissed_auto_client_ids.join(', ') || 'none'}`);
  lines.push('');

  lines.push('## Artists');
  if (state.roster.length === 0) {
    lines.push('No signed artists.');
  } else {
    state.roster.forEach(client => {
      lines.push(formatClient(client, state.contracts, state.campaigns, manifest));
      lines.push('');
    });
  }

  lines.push('## Campaigns');
  if (state.campaigns.length === 0) {
    lines.push('No active campaign records.');
  } else {
    state.campaigns.forEach(campaign => {
      lines.push(formatCampaign(campaign, state, manifest));
      lines.push('');
    });
  }

  return lines.join('\n').trim();
}

function formatClient(
  client: Client,
  contracts: Contract[],
  campaigns: Campaign[],
  manifest: VariantManifest,
): string {
  const lines: string[] = [];
  const activeCampaign = campaigns.find(c => c.id === client.active_campaign_id) ?? null;
  const agentContract = contracts.find(c => c.id === client.agent_contract_id) ?? null;
  const entityContracts = contracts.filter(c => c.client_id === client.id && c.tier === 'client_entity');

  lines.push(`### ${client.name} (${client.id})`);
  lines.push(`Arc: ${client.arc_stage}; age weeks: ${client.age_weeks}; audience: ${client.audience.toLocaleString()}; roster weeks: ${client.turns_on_roster}; stage weeks: ${client.turns_at_stage}; max potential: ${client.max_potential}`);
  lines.push(`Stats: ${STAT_KEYS.map(key => {
    const stat = client.stats[key];
    return `${key}=true ${stat.true_value}, observed ${stat.observed_min}-${stat.observed_max}, scouted ${stat.scouting_invested}`;
  }).join('; ')}`);
  lines.push(`Traits: ${client.traits.map(t => t.trait_id).join(', ') || 'none'}`);
  lines.push(`Active campaign: ${activeCampaign ? `${campaignLabel(activeCampaign.type_key, manifest)} (${activeCampaign.id}), ${activeCampaign.turns_remaining}/${activeCampaign.total_turns} weeks left` : 'none'}`);
  lines.push(`Agent contract: ${agentContract ? formatContract(agentContract) : 'none'}`);
  lines.push(`Entity contracts: ${entityContracts.length > 0 ? entityContracts.map(formatContract).join(' | ') : 'none'}`);
  lines.push(`Catalog: ${client.catalog_releases.length > 0 ? client.catalog_releases.map(release => `${release.title} (${release.kind}, T${release.released_turn}, streams ${release.total_streams.toLocaleString()}, income ${formatMoney(release.album_income_total + release.stream_income_total)})`).join(' | ') : 'none'}`);
  lines.push(`Campaign history: ${client.campaign_history.length > 0 ? client.campaign_history.map(item => `${item.label || campaignLabel(item.type_key, manifest)} T${item.started_turn}-${item.completed_turn}, money ${formatMoney(item.summary.money_delta)}, rep ${item.summary.reputation_delta}, fans ${item.summary.fan_delta}`).join(' | ') : 'none'}`);

  return lines.join('\n');
}

function formatCampaign(campaign: Campaign, state: RunState, manifest: VariantManifest): string {
  const client = state.roster.find(c => c.id === campaign.client_id);
  const lines: string[] = [];

  lines.push(`### ${campaignLabel(campaign.type_key, manifest)} (${campaign.id})`);
  lines.push(`Artist: ${client?.name ?? campaign.client_id}`);
  lines.push(`Weeks: ${campaign.turns_remaining}/${campaign.total_turns} remaining`);
  lines.push(`Setup: ${campaign.setup ? `size ${campaign.setup.size}, length ${campaign.setup.length}, budget ${formatMoney(campaign.setup.budget)}, payout x${campaign.setup.payout_multiplier}, audience x${campaign.setup.audience_multiplier}, risk x${campaign.setup.event_risk_multiplier}` : 'default'}`);
  lines.push(`Release plan: ${campaign.release_plan ? `${campaign.release_plan.title} (${campaign.release_plan.kind}, ${campaign.release_plan.songs.length} songs)` : 'none'}`);
  lines.push(`Pending objectives: ${campaign.pending_objective_ids.join(', ') || 'none'}`);
  lines.push(`Installments: ${campaign.installment_results.length > 0 ? campaign.installment_results.map(result => `T${result.turn_number} ${result.outcome_key} roll ${result.roll_result}, money ${formatMoney(result.money_delta)}, rep ${result.reputation_delta}`).join(' | ') : 'none yet'}`);

  return lines.join('\n');
}

function formatContract(contract: Contract): string {
  const cut = contract.your_cut === null ? 'no cut' : `${contract.your_cut}% cut`;
  return `${contract.id}: ${contract.tier}, ${contract.payout_type}, ${formatMoney(contract.amount)}, ${cut}, ${contract.duration_remaining} weeks left, obligations ${contract.obligations_per_turn}`;
}

function campaignLabel(typeKey: string, manifest: VariantManifest): string {
  return manifest.campaign_types.find(type => type.key === typeKey)?.label ?? typeKey.replace(/_/g, ' ');
}
