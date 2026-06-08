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
import { CoreStatKey }     from '../types/primitives';
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
  const releaseClient  = useRunStore(s => s.releaseClient);

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
            statLabels={statLabels}
            onInvest={handleInvest}
            canAffordInvestment={canAffordInvestment}
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
          <CampaignTab activeCampaign={activeCampaign} manifest={manifest} />
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

function StatsTab({ client, statLabels, onInvest, canAffordInvestment }: any) {
  const keys: CoreStatKey[] = ['talent', 'form', 'marketability', 'morale'];
  return (
    <View style={styles.tabContent}>
      {keys.map(key => (
        <StatRow
          key={key}
          statKey={key}
          label={statLabels[key]}
          stat={client.stats[key]}
          onInvest={onInvest}
          canInvest={canAffordInvestment}
        />
      ))}
    </View>
  );
}

function ContractsTab({ agentContract, entityContracts, labels }: any) {
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
            />
          ))}
        </Section>
      )}
    </View>
  );
}

function CampaignTab({ activeCampaign, manifest }: any) {
  if (!activeCampaign) {
    return (
      <View style={styles.tabContent}>
        <Text style={styles.noContract}>No active campaign.</Text>
      </View>
    );
  }
  return (
    <View style={styles.tabContent}>
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
    </View>
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
  pos: { color: Colors.positive },
  neg: { color: Colors.negative },
});
