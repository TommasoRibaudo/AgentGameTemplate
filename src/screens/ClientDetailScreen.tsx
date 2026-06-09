import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RosterStackParamList } from '../navigation/types';
import { useRunState, useManifest, useMoney, useReputation, useTurnNumber, useRunStore } from '../store/useRunStore';
import { TopBar }          from '../components/TopBar';
import { StatRow }         from '../components/StatRow';
import { ContractSummary } from '../components/ContractSummary';
import { canInvestScouting } from '../engine/client';
import { CoreStatKey }     from '../types/primitives';
import { AgentState }      from '../types/agent';
import { Client }          from '../types/client';
import { Campaign, CampaignSetup, CampaignSize } from '../types/campaign';
import { CampaignTypeDefinition, VariantManifest } from '../types/manifest';
import { buildCampaignSetup } from '../engine/campaign';
import { CLIENT_BOOST_AMOUNT, CLIENT_BOOST_COST } from '../engine/progression';
import { Colors, FontSize, Spacing, Radius, ArcColors, formatMoney } from '../theme';

export type ClientDetailScreenProps = NativeStackScreenProps<RosterStackParamList, 'ClientDetail'>;

type Tab = 'overview' | 'stats' | 'contracts' | 'campaign';

export function ClientDetailScreen({ route, navigation }: ClientDetailScreenProps) {
  const { clientId } = route.params;
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const runState = useRunState();
  const manifest = useManifest();
  const money    = useMoney();
  const rep      = useReputation();
  const turnNum  = useTurnNumber();

  const investScouting = useRunStore(s => s.investScouting);
  const boostClientStat = useRunStore(s => s.boostClientStat);
  const releaseClient  = useRunStore(s => s.releaseClient);
  const startCampaign  = useRunStore(s => s.startCampaign);

  if (!runState || !manifest) return null;

  const client = runState.roster.find(c => c.id === clientId);
  if (!client) {
    navigation.goBack();
    return null;
  }

  const labels      = manifest.labels;
  const statLabels  = labels.stat_labels;
  const arcColor    = ArcColors[client.arc_stage] ?? Colors.textSecondary;
  const agentContract = runState.contracts.find(
    c => c.client_id === clientId && c.tier === 'agent_client',
  ) ?? null;
  const entityContracts = runState.contracts.filter(
    c => c.client_id === clientId && c.tier === 'client_entity',
  );
  const activeCampaign = runState.campaigns.find(
    c => c.client_id === clientId && c.turns_remaining > 0,
  ) ?? null;

  const canAffordInvestment = money >= 500;

  function handleInvest(statKey: CoreStatKey, amount: number) {
    investScouting(clientId, statKey, amount);
  }

  function handleBoost(statKey: Exclude<CoreStatKey, 'talent'>) {
    boostClientStat(clientId, statKey);
  }

  function handleStartCampaign(
    campaignTypeKey: string,
    setup: Partial<Pick<CampaignSetup, 'size' | 'length' | 'budget'>>,
  ) {
    startCampaign(clientId, campaignTypeKey, [], setup);
  }

  function handleRelease() {
    Alert.alert(
      `Release ${client!.name}?`,
      'This will end your contract and remove them from your roster.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release', style: 'destructive', onPress: () => {
            releaseClient(clientId);
            navigation.goBack();
          },
        },
      ],
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',   label: 'Overview'   },
    { key: 'stats',      label: 'Stats'      },
    { key: 'contracts',  label: 'Contracts'  },
    { key: 'campaign',   label: 'Campaign'   },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        money={money}
        reputation={rep}
        rosterCount={runState.roster.length}
        rosterCapacity={runState.agent.roster_capacity}
        turnNumber={turnNum}
        careerLength={runState.career_length}
        isInDebt={runState.debt.is_active}
        lowMoneyWarning={runState.low_money_warning}
        moneyLabel={labels.money}
        reputationLabel={labels.reputation}
      />

      {/* Client header */}
      <View style={styles.clientHeader}>
        <View>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={[styles.arcStage, { color: arcColor }]}>
            {client.arc_stage.toUpperCase()} · Turn {client.turns_on_roster} on roster
          </Text>
        </View>
        <TouchableOpacity style={styles.releaseBtn} onPress={handleRelease}>
          <Text style={styles.releaseBtnText}>Release</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {activeTab === 'overview' && (
          <OverviewTab
            client={client}
            agentContract={agentContract}
            activeCampaign={activeCampaign}
            manifest={manifest}
            labels={labels}
          />
        )}
        {activeTab === 'stats' && (
          <StatsTab
            client={client}
            agent={runState.agent}
            statLabels={statLabels}
            onInvest={handleInvest}
            onBoost={handleBoost}
            canAffordInvestment={canAffordInvestment}
            canAffordBoost={money >= CLIENT_BOOST_COST}
          />
        )}
        {activeTab === 'contracts' && (
          <ContractsTab
            agentContract={agentContract}
            entityContracts={entityContracts}
            labels={labels}
          />
        )}
        {activeTab === 'campaign' && (
          <CampaignTab
            client={client}
            activeCampaign={activeCampaign}
            manifest={manifest}
            money={money}
            onStartCampaign={handleStartCampaign}
          />
        )}
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Tab content components ───────────────────────────────────────────────────

function OverviewTab({ client, agentContract, activeCampaign, manifest, labels }: any) {
  return (
    <View style={styles.tabContent}>
      {activeCampaign && (
        <Section title="Active Campaign">
          <InfoRow label="Type"  value={activeCampaign.type_key.replace(/_/g, ' ')} />
          <InfoRow label="Turns left" value={String(activeCampaign.turns_remaining)} />
        </Section>
      )}
      <Section title="Audience">
        <InfoRow label={labels.audience} value={client.audience.toLocaleString()} />
      </Section>
      {agentContract && (
        <Section title={`Your ${labels.client} Contract`}>
          <ContractSummary
            contract={agentContract}
            isDraft={false}
            clientLabel={labels.client}
            entityLabel={labels.entity}
            showPosture
            showExpiry
          />
        </Section>
      )}
      {client.traits.length > 0 && (
        <Section title="Traits">
          <View style={styles.traitChips}>
            {client.traits.map((t: any) => (
              <View key={t.trait_id} style={styles.traitChip}>
                <Text style={styles.traitText}>{t.trait_id.replace(/_/g, ' ')}</Text>
              </View>
            ))}
          </View>
        </Section>
      )}
    </View>
  );
}

function StatsTab({ client, agent, statLabels, onInvest, onBoost, canAffordInvestment, canAffordBoost }: {
  client: Client;
  agent: AgentState;
  statLabels: Record<CoreStatKey, string>;
  onInvest: (statKey: CoreStatKey, amount: number) => void;
  onBoost: (statKey: Exclude<CoreStatKey, 'talent'>) => void;
  canAffordInvestment: boolean;
  canAffordBoost: boolean;
}) {
  const keys: CoreStatKey[] = ['talent', 'form', 'marketability', 'morale'];
  return (
    <View style={styles.tabContent}>
      {keys.map(key => (
        <View key={key} style={styles.statBlock}>
          <StatRow
            statKey={key}
            label={statLabels[key]}
            stat={client.stats[key]}
            onInvest={onInvest}
            canInvest={canAffordInvestment}
            scoutMaxed={!canInvestScouting(client, key, 500, agent)}
          />
          {key !== 'talent' && (
            <TouchableOpacity
              style={[styles.boostBtn, !canAffordBoost && styles.boostBtnDisabled]}
              onPress={() => onBoost(key)}
              disabled={!canAffordBoost}
              accessibilityRole="button"
              accessibilityLabel={`Boost ${statLabels[key]}`}
            >
              <Text style={styles.boostBtnText}>
                Boost +{CLIENT_BOOST_AMOUNT} for {formatMoney(CLIENT_BOOST_COST)}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

function ContractsTab({ agentContract, entityContracts, labels }: any) {
  const agentCutPercent = agentContract?.your_cut ?? null;

  return (
    <View style={styles.tabContent}>
      {agentContract ? (
        <Section title={`${labels.agent} → ${labels.client}`}>
          <ContractSummary
            contract={agentContract}
            isDraft={false}
            clientLabel={labels.client}
            entityLabel={labels.entity}
            showPosture
            showExpiry
          />
        </Section>
      ) : (
        <Text style={styles.noContract}>No agent contract in force.</Text>
      )}
      {entityContracts.length > 0 && (
        <Section title={`${labels.client} → ${labels.entity} Deals`}>
          {entityContracts.map((c: any) => (
            <ContractSummary
              key={c.id}
              contract={c}
              isDraft={false}
              clientLabel={labels.client}
              entityLabel={labels.entity}
              showPosture={false}
              showExpiry
              agentCutPercent={agentCutPercent}
            />
          ))}
        </Section>
      )}
    </View>
  );
}

function CampaignTab({
  client,
  activeCampaign,
  manifest,
  money,
  onStartCampaign,
}: {
  client: Client;
  activeCampaign: Campaign | null;
  manifest: VariantManifest;
  money: number;
  onStartCampaign: (
    campaignTypeKey: string,
    setup: Partial<Pick<CampaignSetup, 'size' | 'length' | 'budget'>>,
  ) => void;
}) {
  const availableCampaigns = manifest.campaign_types.filter(typeDef =>
    typeDef.valid_arc_stages.includes(client.arc_stage),
  );

  if (!activeCampaign) {
    return (
      <View style={styles.tabContent}>
        <Section title="Start Campaign">
          {availableCampaigns.length === 0 ? (
            <Text style={styles.noContract}>No campaigns available for this career stage.</Text>
          ) : (
            availableCampaigns.map(typeDef => (
              <CampaignStartRow
                key={typeDef.key}
                campaignType={typeDef}
                money={money}
                onStart={setup => onStartCampaign(typeDef.key, setup)}
              />
            ))
          )}
        </Section>
        <CatalogSection client={client} />
        <CampaignHistorySection client={client} />
      </View>
    );
  }
  return (
    <View style={styles.tabContent}>
      <Section title="Active Campaign">
        <InfoRow label="Type" value={activeCampaign.type_key.replace(/_/g, ' ')} />
        {activeCampaign.setup && (
          <>
            <InfoRow label="Size" value={activeCampaign.setup.size} />
            <InfoRow label="Budget" value={formatMoney(activeCampaign.setup.budget)} />
          </>
        )}
        {activeCampaign.release_plan && (
          <>
            <InfoRow label="Release" value={activeCampaign.release_plan.title} />
            <InfoRow label="Songs" value={String(activeCampaign.release_plan.songs.length)} />
          </>
        )}
        <InfoRow label="Turns left" value={String(activeCampaign.turns_remaining)} />
      </Section>
      <Section title="Installment History">
        {activeCampaign.installment_results.length === 0 ? (
          <Text style={styles.noContract}>Campaign just started.</Text>
        ) : (
          activeCampaign.installment_results.map((r: any, i: number) => (
            <View key={i} style={styles.installmentRow}>
              <Text style={styles.installmentTurn}>T{r.turn_number}</Text>
              <Text style={styles.installmentKey}>{r.outcome_key.replace(/_/g, ' ')}</Text>
              <Text style={[styles.installmentDelta, r.money_delta < 0 ? styles.neg : styles.pos]}>
                {formatMoney(r.money_delta)}
              </Text>
            </View>
          ))
        )}
      </Section>
      <CatalogSection client={client} />
      <CampaignHistorySection client={client} />
    </View>
  );
}

function CampaignStartRow({
  campaignType,
  money,
  onStart,
}: {
  campaignType: CampaignTypeDefinition;
  money: number;
  onStart: (setup: Partial<Pick<CampaignSetup, 'size' | 'length' | 'budget'>>) => void;
}) {
  const [size, setSize] = useState<CampaignSize>('medium');
  const [length, setLength] = useState(campaignType.total_turns);
  const [budget, setBudget] = useState(buildCampaignSetup(campaignType).budget);

  const setup = buildCampaignSetup(campaignType, size, length, budget);
  const canAfford = money >= setup.budget;

  function updateSize(nextSize: CampaignSize) {
    setSize(nextSize);
    setBudget(buildCampaignSetup(campaignType, nextSize, length).budget);
  }

  function updateLength(delta: number) {
    const nextLength = Math.max(1, Math.min(12, length + delta));
    setLength(nextLength);
    setBudget(buildCampaignSetup(campaignType, size, nextLength).budget);
  }

  function updateBudget(delta: number) {
    setBudget(Math.max(0, budget + delta));
  }

  return (
    <View style={styles.campaignStartRow}>
      <View style={styles.campaignStartText}>
        <Text style={styles.campaignName}>{campaignType.label}</Text>
        <Text style={styles.campaignMeta}>{campaignTone(campaignType)}</Text>
        <View style={styles.segmentRow}>
          {(['small', 'medium', 'large'] as CampaignSize[]).map(option => (
            <TouchableOpacity
              key={option}
              style={[styles.segmentBtn, size === option && styles.segmentBtnActive]}
              onPress={() => updateSize(option)}
              accessibilityRole="button"
              accessibilityLabel={`Set campaign size to ${option}`}
            >
              <Text style={[styles.segmentBtnText, size === option && styles.segmentBtnTextActive]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.setupRow}>
          <Text style={styles.setupLabel}>Length</Text>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => updateLength(-1)}>
              <Text style={styles.stepBtnText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.stepValue}>{setup.length} turns</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => updateLength(1)}>
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.setupRow}>
          <Text style={styles.setupLabel}>Budget</Text>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => updateBudget(-500)}>
              <Text style={styles.stepBtnText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.stepValue}>{formatMoney(setup.budget)}</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => updateBudget(500)}>
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.campaignMeta}>{setupTone(setup)}</Text>
        {!canAfford && (
          <Text style={styles.campaignWarning}>Need {formatMoney(setup.budget - money)} more.</Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.campaignStartBtn, !canAfford && styles.campaignStartBtnDisabled]}
        onPress={() => onStart({ size, length: setup.length, budget: setup.budget })}
        disabled={!canAfford}
        accessibilityRole="button"
        accessibilityLabel={`Start ${campaignType.label}`}
      >
        <Text style={styles.campaignStartBtnText}>Start</Text>
      </TouchableOpacity>
    </View>
  );
}

function campaignTone(campaignType: CampaignTypeDefinition): string {
  if (campaignType.release_kind === 'album') return 'Album release with post-launch sales and streams.';
  if (campaignType.release_kind === 'single') return 'Single release with post-launch stream income.';
  return 'Live campaign with immediate installments.';
}

function setupTone(setup: CampaignSetup): string {
  const reach = setup.size === 'large' ? 'Broad push' : setup.size === 'small' ? 'Focused push' : 'Standard push';
  const pace = setup.length <= 2 ? 'quick turnaround' : setup.length >= 8 ? 'long runway' : 'steady schedule';
  return `${reach} - ${pace}`;
}

function CatalogSection({ client }: { client: Client }) {
  const releases = client.catalog_releases ?? [];
  if (releases.length === 0) return null;
  return (
    <Section title="Catalog">
      {releases.map(release => (
        <View key={release.id} style={styles.releaseRow}>
          <Text style={styles.releaseTitle}>{release.title}</Text>
          <Text style={styles.releaseMeta}>
            {release.kind === 'album'
              ? `${release.album_units_sold.toLocaleString()} albums - ${release.total_streams.toLocaleString()} streams`
              : `${release.total_streams.toLocaleString()} streams`}
          </Text>
          <Text style={styles.releaseMeta}>
            Last turn {formatMoney(release.latest_turn_income)} - Total {formatMoney(release.album_income_total + release.stream_income_total)}
          </Text>
        </View>
      ))}
    </Section>
  );
}

function CampaignHistorySection({ client }: { client: Client }) {
  const history = client.campaign_history ?? [];
  if (history.length === 0) return null;
  return (
    <Section title="Campaign History">
      {history.slice().reverse().map(item => (
        <View key={item.id} style={styles.historyRow}>
          <Text style={styles.releaseTitle}>{item.label}</Text>
          <Text style={styles.releaseMeta}>
            Completed T{item.completed_turn} - {formatMoney(item.summary.money_delta)}
            {item.summary.streams !== undefined ? ` - ${item.summary.streams.toLocaleString()} streams` : ''}
            {item.summary.album_units_sold !== undefined ? ` - ${item.summary.album_units_sold.toLocaleString()} albums` : ''}
          </Text>
          {item.visible_notes.map(note => (
            <Text key={note} style={styles.releaseNote}>{note}</Text>
          ))}
        </View>
      ))}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  clientName: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  arcStage: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  releaseBtn: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: Colors.negative,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  releaseBtnText: {
    color: Colors.negative,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.accent,
  },
  tabText: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
  },
  tabTextActive: {
    color: Colors.accent,
    fontWeight: '600',
  },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.lg },
  tabContent: { gap: Spacing.lg },
  statBlock: { gap: Spacing.xs },
  boostBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  boostBtnDisabled: {
    opacity: 0.45,
  },
  boostBtnText: {
    color: Colors.accent,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  section: { gap: Spacing.sm },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  noContract: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    paddingVertical: Spacing.md,
    textAlign: 'center',
  },
  campaignStartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  campaignStartText: {
    flex: 1,
    gap: Spacing.xs,
  },
  campaignName: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  campaignMeta: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.xs,
  },
  segmentBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceRaised,
  },
  segmentBtnText: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    textTransform: 'capitalize',
  },
  segmentBtnTextActive: {
    color: Colors.accent,
    fontWeight: '700',
  },
  setupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  setupLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    minWidth: 52,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  stepBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceRaised,
  },
  stepBtnText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  stepValue: {
    minWidth: 78,
    textAlign: 'center',
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  campaignWarning: {
    color: Colors.negative,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  campaignStartBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  campaignStartBtnDisabled: {
    opacity: 0.45,
  },
  campaignStartBtnText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  traitChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  traitChip: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  traitText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    textTransform: 'capitalize',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  infoLabel: { color: Colors.textSecondary, fontSize: FontSize.sm },
  infoValue:  { color: Colors.textPrimary,   fontSize: FontSize.sm },
  installmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  installmentTurn: { color: Colors.textDim, fontSize: FontSize.xs, width: 28 },
  installmentKey: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm, textTransform: 'capitalize' },
  installmentDelta: { fontSize: FontSize.sm, fontWeight: '600' },
  releaseRow: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    padding: Spacing.sm,
    gap: 2,
  },
  historyRow: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  releaseTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  releaseMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
  releaseNote: {
    color: Colors.warning,
    fontSize: FontSize.xs,
  },
  pos: { color: Colors.positive },
  neg: { color: Colors.negative },
});

