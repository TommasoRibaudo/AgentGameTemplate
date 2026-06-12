import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Image,
} from 'react-native';
import { resolvePortrait } from '../portraits';
import { useDialog } from '../context/DialogContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RosterStackParamList } from '../navigation/types';
import { useRunState, useManifest, useMoney, useReputation, useTurnNumber, useRunStore, useTutorialStep, useTutorialFriendId } from '../store/useRunStore';
import { TopBar }          from '../components/TopBar';
import { StatRow }         from '../components/StatRow';
import { ContractSummary } from '../components/ContractSummary';
import { DeltaText }       from '../components/DeltaText';
import { CoreStatKey }     from '../types/primitives';
import { Client }          from '../types/client';
import { Contract }        from '../types/contract';
import { Campaign, CampaignHistoryItem, CampaignSetup, CampaignSize, CatalogRelease } from '../types/campaign';
import { CampaignCategoryDefinition, CampaignTypeDefinition, VariantManifest } from '../types/manifest';
import { buildCampaignSetup, clientMeetsCampaignContractRequirements, deriveCampaignSize, resolveCampaignCategory, SIZE_AUDIENCE_GATES } from '../engine/campaign';
import { RENEWAL_NOTICE_TURNS } from '../engine/decision-queue';
import { CLIENT_BOOST_AMOUNT, CLIENT_BOOST_COST } from '../engine/progression';
import { Colors, FontSize, Spacing, Radius, ArcColors, formatMoney, formatAge } from '../theme';

// Interpolates textPrimary → warning (gold) as the great-streak grows.
// Full gold is reached at STREAK_GOLD_MAX, matching the rising-arc streak cap.
const STREAK_GOLD_MAX = 6;
const STREAK_BASE_R = 240, STREAK_BASE_G = 239, STREAK_BASE_B = 248; // #F0EFF8
const STREAK_GOLD_R = 240, STREAK_GOLD_G = 168, STREAK_GOLD_B =  51; // #F0A833

function streakTextColor(streak: number): string {
  if (streak <= 0) return Colors.textPrimary;
  const t = Math.min(streak / STREAK_GOLD_MAX, 1.0);
  const r = Math.round(STREAK_BASE_R + t * (STREAK_GOLD_R - STREAK_BASE_R));
  const g = Math.round(STREAK_BASE_G + t * (STREAK_GOLD_G - STREAK_BASE_G));
  const b = Math.round(STREAK_BASE_B + t * (STREAK_GOLD_B - STREAK_BASE_B));
  return `rgb(${r}, ${g}, ${b})`;
}

export type ClientDetailScreenProps = NativeStackScreenProps<RosterStackParamList, 'ClientDetail'>;

type Tab = 'overview' | 'stats' | 'contracts' | 'campaign';

export function ClientDetailScreen({ route, navigation }: ClientDetailScreenProps) {
  const { clientId } = route.params;
  const [activeTab, setActiveTab] = useState<Tab>(route.params.initialTab ?? 'overview');

  const runState = useRunState();
  const manifest = useManifest();
  const money    = useMoney();
  const rep      = useReputation();
  const turnNum  = useTurnNumber();

  const boostClientStat   = useRunStore(s => s.boostClientStat);
  const releaseClient     = useRunStore(s => s.releaseClient);
  const startCampaign     = useRunStore(s => s.startCampaign);
  const queueRenewalOffer = useRunStore(s => s.queueRenewalOffer);
  const pinClient         = useRunStore(s => s.pinClient);
  const unpinClient       = useRunStore(s => s.unpinClient);
  const advanceTutorial   = useRunStore(s => s.advanceTutorial);
  const { showDialog }    = useDialog();

  const tutorialStep     = useTutorialStep();
  const tutorialFriendId = useTutorialFriendId();

  const client = runState?.roster.find(c => c.id === clientId) ?? null;

  // Navigate away if the client was removed from the roster (e.g. released).
  useEffect(() => {
    if (runState && !client) {
      navigation.goBack();
    }
  }, [client, runState]);

  // Advance tutorial when player first opens the tutorial friend's profile.
  useEffect(() => {
    if (tutorialStep === 'roster_highlight' && clientId === tutorialFriendId) {
      advanceTutorial('roster_highlight');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!runState || !manifest || !client) return null;

  const labels      = manifest.labels;
  const statLabels  = labels.stat_labels;
  const arcColor    = ArcColors[client.arc_stage] ?? Colors.textSecondary;
  const agentContract = runState.contracts.find(
    c => c.client_id === clientId && c.tier === 'agent_client' && c.duration_remaining > 0,
  ) ?? null;
  const entityContracts = runState.contracts.filter(
    c => c.client_id === clientId && c.tier === 'client_entity',
  );
  const activeCampaign = runState.campaigns.find(
    c => c.client_id === clientId && c.turns_remaining > 0,
  ) ?? null;
  const isPinned = runState.pinned_client_ids.includes(clientId);
  const hasPendingRenewal = runState.decision_board.some(item =>
    item.type === 'renewal' && item.client_id === clientId && !item.is_resolved,
  );
  const canOfferRenewal = Boolean(
    agentContract
    && agentContract.duration_remaining > 0
    && agentContract.duration_remaining <= RENEWAL_NOTICE_TURNS
    && !hasPendingRenewal,
  );

  function handleBoost(statKey: Exclude<CoreStatKey, 'talent'>) {
    boostClientStat(clientId, statKey);
  }

  function handleStartCampaign(
    campaignTypeKey: string,
    setup: Partial<Pick<CampaignSetup, 'size' | 'length' | 'budget'>>,
  ) {
    startCampaign(clientId, campaignTypeKey, [], setup);
    if (tutorialStep === 'gig_hint' && clientId === tutorialFriendId) {
      advanceTutorial('gig_hint');
    }
  }

  function handleRelease() {
    showDialog({
      title: `Release ${client!.name}?`,
      message: 'This will end your contract and remove them from your roster.',
      buttons: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Release', style: 'destructive', onPress: () => {
            releaseClient(clientId);
            navigation.goBack();
          },
        },
      ],
    });
  }

  function handleTogglePin() {
    if (isPinned) {
      unpinClient(clientId);
      return;
    }

    pinClient(clientId);
  }

  function handleOfferRenewal() {
    const clientName = useRunStore.getState().state?.roster.find(c => c.id === clientId)?.name ?? labels.client;
    const queued = queueRenewalOffer(clientId);
    showDialog({
      title: queued ? 'Renewal Offered' : 'Renewal Unavailable',
      message: queued
        ? `A renewal offer for ${clientName} is on the decision board.`
        : 'A renewal offer could not be created for this contract.',
      buttons: [{ label: 'OK' }],
    });
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
        <Image source={resolvePortrait(client.portrait, client.id)} style={styles.clientPortrait} />
        <View style={styles.clientHeaderText}>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={[styles.arcStage, { color: arcColor }]}>
            {client.arc_stage.toUpperCase()} · Week {client.turns_on_roster} on roster
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.pinBtn, isPinned && styles.pinBtnActive]} onPress={handleTogglePin}>
            <Text style={[styles.pinBtnText, isPinned && styles.pinBtnTextActive]}>
              {isPinned ? 'Unpin' : 'Pin'}
            </Text>
          </TouchableOpacity>
          {canOfferRenewal && (
            <TouchableOpacity style={styles.headerRenewBtn} onPress={handleOfferRenewal}>
              <Text style={styles.headerRenewBtnText}>Renew</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.releaseBtn} onPress={handleRelease}>
            <Text style={styles.releaseBtnText}>Release</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tutorial hint: tap the Campaign tab */}
      {tutorialStep === 'campaign_tab' && clientId === tutorialFriendId && (
        <View style={styles.tutorialBanner}>
          <Text style={styles.tutorialBannerText}>
            Tap the Campaign tab to book Dev Reyes' first gig.
          </Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(t => {
          const isTutorialTarget = t.key === 'campaign'
            && tutorialStep === 'campaign_tab'
            && clientId === tutorialFriendId;
          const isDimmed = tutorialStep === 'campaign_tab'
            && clientId === tutorialFriendId
            && !isTutorialTarget;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, activeTab === t.key && styles.tabActive, isTutorialTarget && styles.tabTutorial, isDimmed && styles.tabDimmed]}
              onPress={() => {
                if (isTutorialTarget) advanceTutorial('campaign_tab');
                setActiveTab(t.key);
              }}
            >
              <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive, isTutorialTarget && styles.tabTextTutorial]}>
                {t.label}{isTutorialTarget ? ' ✦' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {activeTab === 'overview' && (
          <OverviewTab
            client={client}
            agentContract={agentContract}
            activeCampaign={activeCampaign}
            manifest={manifest}
            labels={labels}
            canOfferRenewal={canOfferRenewal}
            onOfferRenewal={handleOfferRenewal}
          />
        )}
        {activeTab === 'stats' && (
          <StatsTab
            client={client}
            statLabels={statLabels}
            onBoost={handleBoost}
            canAffordBoost={money >= CLIENT_BOOST_COST}
          />
        )}
        {activeTab === 'contracts' && (
          <ContractsTab
            agentContract={agentContract}
            entityContracts={entityContracts}
            labels={labels}
            canOfferRenewal={canOfferRenewal}
            onOfferRenewal={handleOfferRenewal}
          />
        )}
        {activeTab === 'campaign' && tutorialStep === 'gig_hint' && clientId === tutorialFriendId && (
          <View style={styles.tutorialBanner}>
            <Text style={styles.tutorialBannerText}>
              Book a local gig to earn your first income and build some buzz.
            </Text>
          </View>
        )}
        {/* Keep CampaignTab mounted so setup controls (length/budget) survive tab switches */}
        <View style={activeTab !== 'campaign' ? { display: 'none' } : undefined}>
          <CampaignTab
            client={client}
            activeCampaign={activeCampaign}
            runState={runState}
            manifest={manifest}
            money={money}
            onStartCampaign={handleStartCampaign}
            isGigHint={tutorialStep === 'gig_hint' && clientId === tutorialFriendId}
            hideCategoryRecord={tutorialStep !== null && tutorialStep !== 'done'}
          />
        </View>
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Tab content components ───────────────────────────────────────────────────

function OverviewTab({
  client,
  agentContract,
  activeCampaign,
  manifest,
  labels,
  canOfferRenewal,
  onOfferRenewal,
}: {
  client: Client;
  agentContract: Contract | null;
  activeCampaign: Campaign | null;
  manifest: VariantManifest;
  labels: VariantManifest['labels'];
  canOfferRenewal: boolean;
  onOfferRenewal: () => void;
}) {
  return (
    <View style={styles.tabContent}>
      {activeCampaign && (
        <Section title="Active Campaign">
          <InfoRow label="Type"  value={activeCampaign.type_key.replace(/_/g, ' ')} />
          <InfoRow label="Weeks left" value={String(activeCampaign.turns_remaining)} />
        </Section>
      )}
      <Section title="Audience">
        <InfoRow label="Age" value={formatAge(client.age_weeks)} />
        <InfoRow label={labels.audience} value={client.audience.toLocaleString()} />
      </Section>
      <ArtistOverviewShelf
        title="Discography"
        emptyText="No releases yet."
        items={(client.catalog_releases ?? []).slice().reverse()}
        renderItem={release => (
          <ReleaseOverviewRow key={release.id} release={release} />
        )}
      />
      <ArtistOverviewShelf
        title="Concerts"
        emptyText="No concerts booked yet."
        items={(client.campaign_history ?? []).filter(isConcertHistory).slice().reverse()}
        renderItem={item => (
          <LiveOverviewRow
            key={item.id}
            item={item}
            fallbackLabel={manifest.campaign_types.find(c => c.key === item.type_key)?.label}
          />
        )}
      />
      <ArtistOverviewShelf
        title="Gigs"
        emptyText="No gigs played yet."
        items={(client.campaign_history ?? []).filter(isGigHistory).slice().reverse()}
        renderItem={item => (
          <LiveOverviewRow
            key={item.id}
            item={item}
            fallbackLabel={manifest.campaign_types.find(c => c.key === item.type_key)?.label}
          />
        )}
      />
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
          {canOfferRenewal && (
            <TouchableOpacity style={styles.renewBtn} onPress={onOfferRenewal}>
              <Text style={styles.renewBtnText}>Offer Renewal</Text>
            </TouchableOpacity>
          )}
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

function ArtistOverviewShelf<T>({
  title,
  emptyText,
  items,
  renderItem,
}: {
  title: string;
  emptyText: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  return (
    <Section title={title}>
      <View style={styles.spotifyShelf}>
        {items.length === 0 ? (
          <View style={styles.emptyMediaRow}>
            <View style={styles.albumArtPlaceholder}>
              <View style={styles.albumArtCenter} />
            </View>
            <View style={styles.mediaText}>
              <Text style={styles.mediaTitle}>{emptyText}</Text>
              <Text style={styles.mediaMeta}>Reserved for future artwork</Text>
            </View>
          </View>
        ) : (
          items.map(renderItem)
        )}
      </View>
    </Section>
  );
}

function ReleaseOverviewRow({ release }: { release: CatalogRelease }) {
  const kind = release.kind === 'album' ? 'Album' : release.kind === 'mixtape' ? 'Mixtape' : 'Single';
  const performance = (release.kind === 'album' || release.kind === 'mixtape')
    ? `${release.album_units_sold.toLocaleString()} sold - ${release.total_streams.toLocaleString()} streams`
    : `${release.total_streams.toLocaleString()} streams`;

  return (
    <View style={styles.mediaRow}>
      <View style={styles.albumArtPlaceholder}>
        <Text style={styles.albumArtInitial}>{release.title.trim().charAt(0).toUpperCase() || '?'}</Text>
      </View>
      <View style={styles.mediaText}>
        <Text style={styles.mediaTitle} numberOfLines={1}>{release.title}</Text>
        <Text style={styles.mediaMeta} numberOfLines={1}>
          {kind} - Released W{release.released_turn}
        </Text>
        <Text style={styles.mediaSubMeta} numberOfLines={1}>
          {performance}
        </Text>
        <Text style={styles.mediaSubMeta} numberOfLines={1}>
          +{release.total_fan_gain.toLocaleString()} fans
        </Text>
      </View>
      <Text style={styles.mediaValue}>{formatMoney(release.latest_turn_income)}</Text>
    </View>
  );
}

function LiveOverviewRow({
  item,
  fallbackLabel,
}: {
  item: CampaignHistoryItem;
  fallbackLabel?: string;
}) {
  return (
    <View style={styles.mediaRow}>
      <View style={styles.liveArtPlaceholder}>
        <Text style={styles.liveArtText}>{item.type_key === 'tour' ? 'TOUR' : 'GIG'}</Text>
      </View>
      <View style={styles.mediaText}>
        <Text style={styles.mediaTitle} numberOfLines={1}>{item.label || fallbackLabel || item.type_key.replace(/_/g, ' ')}</Text>
        <Text style={styles.mediaMeta} numberOfLines={1}>
          Completed W{item.completed_turn} - {item.total_turns} weeks
        </Text>
        <Text style={styles.mediaSubMeta} numberOfLines={1}>
          {item.summary.fan_delta >= 0 ? '+' : ''}{item.summary.fan_delta.toLocaleString()} fans
        </Text>
      </View>
      <DeltaText value={item.summary.money_delta} kind="money" style={styles.mediaValue} />
    </View>
  );
}

function isConcertHistory(item: CampaignHistoryItem): boolean {
  return item.type_key === 'tour';
}

function isGigHistory(item: CampaignHistoryItem): boolean {
  return item.type_key === 'perform_gigs';
}

function StatsTab({ client, statLabels, onBoost, canAffordBoost }: {
  client: Client;
  statLabels: Record<CoreStatKey, string>;
  onBoost: (statKey: Exclude<CoreStatKey, 'talent'>) => void;
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

function ContractsTab({ agentContract, entityContracts, labels, canOfferRenewal, onOfferRenewal }: any) {
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
          {canOfferRenewal && (
            <TouchableOpacity style={styles.renewBtn} onPress={onOfferRenewal}>
              <Text style={styles.renewBtnText}>Offer Renewal</Text>
            </TouchableOpacity>
          )}
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
  runState,
  manifest,
  money,
  onStartCampaign,
  isGigHint = false,
  hideCategoryRecord = false,
}: {
  client: Client;
  activeCampaign: Campaign | null;
  runState: NonNullable<ReturnType<typeof useRunState>>;
  manifest: VariantManifest;
  money: number;
  onStartCampaign: (
    campaignTypeKey: string,
    setup: Partial<Pick<CampaignSetup, 'size' | 'length' | 'budget'>>,
  ) => void;
  isGigHint?: boolean;
  hideCategoryRecord?: boolean;
}) {
  const rawCategories = manifest.campaign_categories;
  const categories = hideCategoryRecord
    ? rawCategories?.filter(c => c.category !== 'record')
    : rawCategories;

  if (!activeCampaign) {
    return (
      <View style={styles.tabContent}>
        <Section title="Start Campaign">
          {categories && categories.length > 0 ? (
            categories.map(categoryDef => (
              <CategoryCampaignCard
                key={categoryDef.category}
                categoryDef={categoryDef}
                client={client}
                runState={runState}
                manifest={manifest}
                money={money}
                onStartCampaign={onStartCampaign}
                highlighted={isGigHint && categoryDef.category === 'perform'}
                dimmed={isGigHint && categoryDef.category !== 'perform'}
              />
            ))
          ) : (
            (() => {
              const availableCampaigns = manifest.campaign_types.filter(typeDef =>
                !typeDef.event_only
                && typeDef.valid_arc_stages.includes(client.arc_stage)
                && clientMeetsCampaignContractRequirements(runState, client.id, typeDef),
              );
              return availableCampaigns.length === 0 ? (
                <Text style={styles.noContract}>No campaigns available for this career stage.</Text>
              ) : (
                availableCampaigns.map(typeDef => (
                  <CampaignStartRow
                    key={typeDef.key}
                    campaignType={typeDef}
                    money={money}
                    onStart={setup => onStartCampaign(typeDef.key, setup)}
                    highlighted={isGigHint && typeDef.key === 'perform_gigs'}
                    dimmed={isGigHint && typeDef.key !== 'perform_gigs'}
                    budgetFloors={manifest.budget_floors}
                  />
                ))
              );
            })()
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
            <InfoRow label="Size" value={manifest.campaign_types.find(ct => ct.key === activeCampaign.type_key)?.size_labels?.[activeCampaign.setup.size] ?? activeCampaign.setup.size} />
            <InfoRow label="Budget" value={formatMoney(activeCampaign.setup.budget)} />
          </>
        )}
        {activeCampaign.release_plan && (
          <>
            <InfoRow label="Release" value={activeCampaign.release_plan.title} />
            <InfoRow label="Songs" value={String(activeCampaign.release_plan.songs.length)} />
          </>
        )}
        <InfoRow label="Weeks left" value={String(activeCampaign.turns_remaining)} />
      </Section>
      <Section title="Installment History">
        {activeCampaign.installment_results.length === 0 ? (
          <Text style={styles.noContract}>Campaign just started.</Text>
        ) : (() => {
          // Precompute streak length at each position (consecutive greats ending here)
          const streaks = activeCampaign.installment_results.map((r: any, i: number) => {
            if (r.outcome_key !== 'great') return 0;
            let s = 0;
            for (let j = i; j >= 0 && activeCampaign.installment_results[j].outcome_key === 'great'; j--) s++;
            return s;
          });
          return activeCampaign.installment_results.map((r: any, i: number) => (
            <View key={i} style={styles.installmentRow}>
              <Text style={styles.installmentTurn}>W{r.turn_number}</Text>
              <Text style={[styles.installmentKey, { color: streakTextColor(streaks[i]) }]}>
                {r.outcome_key.replace(/_/g, ' ')}
              </Text>
              {r.audience_gain > 0 && (
                <Text style={styles.installmentDelta}>+{r.audience_gain.toLocaleString()} fans</Text>
              )}
              <DeltaText value={r.money_delta} kind="money" style={styles.installmentDelta} />
            </View>
          ));
        })()}
      </Section>
      <CatalogSection client={client} />
      <CampaignHistorySection client={client} />
    </View>
  );
}

function CategoryCampaignCard({
  categoryDef,
  client,
  runState,
  manifest,
  money,
  onStartCampaign,
  highlighted = false,
  dimmed = false,
}: {
  categoryDef: CampaignCategoryDefinition;
  client: Client;
  runState: NonNullable<ReturnType<typeof useRunState>>;
  manifest: VariantManifest;
  money: number;
  onStartCampaign: (
    campaignTypeKey: string,
    setup: Partial<Pick<CampaignSetup, 'size' | 'length' | 'budget'>>,
  ) => void;
  highlighted?: boolean;
  dimmed?: boolean;
}) {
  const lastRule = categoryDef.routing_rules[categoryDef.routing_rules.length - 1];
  const fallbackTypeDef = lastRule
    ? manifest.campaign_types.find(ct => ct.key === lastRule.type_key) ?? null
    : null;
  const initialLength = fallbackTypeDef?.total_turns ?? 2;

  const [length, setLength] = useState(initialLength);
  const [budget, setBudget] = useState(() => {
    const r = resolveCampaignCategory(categoryDef, client, runState.contracts, initialLength);
    const td = r ? manifest.campaign_types.find(ct => ct.key === r.type_key) ?? null : null;
    return td ? buildCampaignSetup(td, 'medium', initialLength, undefined, manifest.budget_floors).budget : 0;
  });
  const budgetWasAdjustedRef = useRef(false);

  const resolved = resolveCampaignCategory(categoryDef, client, runState.contracts, length);
  const typeDef = resolved
    ? manifest.campaign_types.find(ct => ct.key === resolved.type_key) ?? null
    : null;
  const derivedSize = typeDef
    ? deriveCampaignSize(typeDef, length, budget, manifest.budget_floors)
    : 'medium';
  const setup = typeDef
    ? buildCampaignSetup(typeDef, derivedSize, length, budget, manifest.budget_floors)
    : null;
  const canAfford = setup ? money >= setup.budget : false;
  const audienceGate = SIZE_AUDIENCE_GATES[derivedSize];
  const audienceWarning = audienceGate > 0 && client.audience < audienceGate;

  function updateLength(delta: number) {
    const nextLength = Math.max(1, Math.min(12, length + delta));
    setLength(nextLength);
    // Reset budget to medium baseline when type crosses a turn threshold
    const r = resolveCampaignCategory(categoryDef, client, runState.contracts, nextLength);
    const td = r ? manifest.campaign_types.find(ct => ct.key === r.type_key) ?? null : null;
    if (td && !budgetWasAdjustedRef.current) setBudget(buildCampaignSetup(td, 'medium', nextLength, undefined, manifest.budget_floors).budget);
  }

  function updateBudget(delta: number) {
    budgetWasAdjustedRef.current = true;
    setBudget(currentBudget => Math.max(0, currentBudget + delta));
  }

  function handleStart() {
    if (!resolved || !setup) return;
    onStartCampaign(resolved.type_key, { size: derivedSize, length: setup.length, budget: setup.budget });
  }

  const isUnavailable = !resolved || !typeDef || !setup;

  return (
    <View style={[styles.campaignStartRow, highlighted && styles.campaignStartRowHighlighted, dimmed && styles.campaignStartRowDimmed]}>
      <Text style={styles.campaignCategoryLabel}>{categoryDef.display_label}</Text>
      {isUnavailable ? (
        <Text style={styles.noContract}>Not available for this artist right now.</Text>
      ) : (
        <>
          <Text style={styles.campaignName}>{resolved.size_names[derivedSize]}</Text>
          <Text style={styles.campaignMeta}>{campaignTone(typeDef)}</Text>

          <View style={styles.setupControls}>
            <View style={styles.setupControl}>
              <Text style={styles.setupControlLabel}>Length</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => updateLength(-1)}>
                  <Text style={styles.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepValue}>{setup.length} weeks</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => updateLength(1)}>
                  <Text style={styles.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.setupControl}>
              <Text style={styles.setupControlLabel}>Budget</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => updateBudget(-500)}>
                  <Text style={styles.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepValue}>{formatMoney(setup.budget)}</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => updateBudget(500)}>
                  <Text style={styles.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={styles.campaignMeta}>{setupTone(setup)}</Text>
          {audienceWarning && (
            <Text style={styles.campaignWarning}>Low audience — expect weaker results at this scale.</Text>
          )}
          {!canAfford && (
            <Text style={styles.campaignWarning}>Need {formatMoney(setup.budget - money)} more.</Text>
          )}

          <TouchableOpacity
            style={[styles.campaignStartBtn, !canAfford && styles.campaignStartBtnDisabled]}
            onPress={handleStart}
            disabled={!canAfford}
            accessibilityRole="button"
            accessibilityLabel={`Start ${resolved.size_names[derivedSize]}`}
          >
            <Text style={styles.campaignStartBtnText}>Start</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function CampaignStartRow({
  campaignType,
  money,
  onStart,
  highlighted = false,
  dimmed = false,
  budgetFloors,
}: {
  campaignType: CampaignTypeDefinition;
  money: number;
  onStart: (setup: Partial<Pick<CampaignSetup, 'size' | 'length' | 'budget'>>) => void;
  highlighted?: boolean;
  dimmed?: boolean;
  budgetFloors?: VariantManifest['budget_floors'];
}) {
  const [size, setSize] = useState<CampaignSize>('medium');
  const [length, setLength] = useState(campaignType.total_turns);
  const [budget, setBudget] = useState(buildCampaignSetup(campaignType, 'medium', campaignType.total_turns, undefined, budgetFloors).budget);
  const budgetWasAdjustedRef = useRef(false);

  const setup = buildCampaignSetup(campaignType, size, length, budget, budgetFloors);
  const canAfford = money >= setup.budget;

  function updateSize(nextSize: CampaignSize) {
    setSize(nextSize);
    if (!budgetWasAdjustedRef.current) setBudget(buildCampaignSetup(campaignType, nextSize, length, undefined, budgetFloors).budget);
  }

  function updateLength(delta: number) {
    const nextLength = Math.max(1, Math.min(12, length + delta));
    setLength(nextLength);
    if (!budgetWasAdjustedRef.current) setBudget(buildCampaignSetup(campaignType, size, nextLength, undefined, budgetFloors).budget);
  }

  function updateBudget(delta: number) {
    budgetWasAdjustedRef.current = true;
    setBudget(currentBudget => Math.max(0, currentBudget + delta));
  }

  return (
    <View style={[styles.campaignStartRow, highlighted && styles.campaignStartRowHighlighted, dimmed && styles.campaignStartRowDimmed]}>
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
              {campaignType.size_labels?.[option] ?? option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.setupControls}>
        <View style={styles.setupControl}>
          <Text style={styles.setupControlLabel}>Length</Text>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => updateLength(-1)}>
              <Text style={styles.stepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepValue}>{setup.length} weeks</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => updateLength(1)}>
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.setupControl}>
          <Text style={styles.setupControlLabel}>Budget</Text>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => updateBudget(-500)}>
              <Text style={styles.stepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepValue}>{formatMoney(setup.budget)}</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => updateBudget(500)}>
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Text style={styles.campaignMeta}>{setupTone(setup)}</Text>
      {!canAfford && (
        <Text style={styles.campaignWarning}>Need {formatMoney(setup.budget - money)} more.</Text>
      )}

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
  if (campaignType.release_kind === 'mixtape') return 'Mixtape release with post-launch stream income.';
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
            {(release.kind === 'album' || release.kind === 'mixtape')
              ? `${release.album_units_sold.toLocaleString()} sold - ${release.total_streams.toLocaleString()} streams`
              : `${release.total_streams.toLocaleString()} streams`}
          </Text>
          <Text style={styles.releaseMeta}>
            Last week {formatMoney(release.latest_turn_income)} - Total {formatMoney(release.album_income_total + release.stream_income_total)}
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
            Completed W{item.completed_turn} - <DeltaText value={item.summary.money_delta} kind="money" />
            {item.summary.fan_delta !== 0 ? ` - ${item.summary.fan_delta > 0 ? '+' : ''}${item.summary.fan_delta.toLocaleString()} fans` : ''}
            {item.summary.streams !== undefined ? ` - ${item.summary.streams.toLocaleString()} streams` : ''}
            {item.summary.album_units_sold ? ` - ${item.summary.album_units_sold.toLocaleString()} sold` : ''}
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
  clientPortrait: {
    width: 72,
    height: 72,
  },
  clientHeaderText: {
    flex: 1,
    minWidth: 0,
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
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  pinBtn: {
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  pinBtnActive: {
    backgroundColor: Colors.accent,
  },
  pinBtnText: {
    color: Colors.accent,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  pinBtnTextActive: {
    color: Colors.textPrimary,
  },
  headerRenewBtn: {
    borderWidth: 1,
    borderColor: Colors.positive,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  headerRenewBtnText: {
    color: Colors.positive,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  releaseBtn: {
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
  renewBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  renewBtnText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
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
  tabTutorial: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.warning,
  },
  tabTextTutorial: {
    color: Colors.warning,
    fontWeight: '700',
  },
  tabDimmed: {
    opacity: 0.3,
  },
  tutorialBanner: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  tutorialBannerText: {
    color: Colors.warning,
    fontSize: FontSize.sm,
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
    flexDirection: 'column',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  campaignStartRowHighlighted: {
    borderColor: Colors.warning,
    shadowColor: Colors.warning,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  campaignStartRowDimmed: {
    opacity: 0.3,
  },
  campaignCategoryLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
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
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.md,
  },
  segmentBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceRaised,
  },
  segmentBtnText: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  segmentBtnTextActive: {
    color: Colors.accent,
    fontWeight: '700',
  },
  setupControls: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  setupControl: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  setupControlLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    width: '100%',
  },
  stepBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
  },
  stepBtnText: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    lineHeight: 20,
  },
  stepValue: {
    flex: 1,
    textAlign: 'center',
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
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
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
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
  spotifyShelf: {
    gap: Spacing.sm,
    backgroundColor: '#111116',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  mediaRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    padding: Spacing.sm,
  },
  emptyMediaRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    padding: Spacing.sm,
  },
  albumArtPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#24242B',
    borderWidth: 1,
    borderColor: '#343442',
  },
  albumArtCenter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.textDim,
  },
  albumArtInitial: {
    color: Colors.positive,
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  liveArtPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.positive,
  },
  liveArtText: {
    color: '#06120B',
    fontSize: FontSize.xs,
    fontWeight: '900',
  },
  mediaText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  mediaTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  mediaMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
  mediaSubMeta: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
  },
  mediaValue: {
    color: Colors.positive,
    fontSize: FontSize.xs,
    fontWeight: '800',
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
