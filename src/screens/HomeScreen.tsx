import React, { useState, useEffect } from 'react';

const NO_RELEASE_SUMMARIES: never[] = [];
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootParamList, TabParamList } from '../navigation/types';
import {
  useRunStore, useRunState, useManifest,
  useDecisionBoard, useNewsFeed,
  usePhase, useMoney, useReputation, useTurnNumber,
  useIsRunActive, useTutorialStep, useTutorialProspectId,
} from '../store/useRunStore';
import { TopBar }             from '../components/TopBar';
import { DecisionCard }       from '../components/DecisionCard';
import { NewsItemRow }        from '../components/NewsItemRow';
import { CounterOfferModal, CounterResult } from '../components/CounterOfferModal';
import { TutorialModal }      from '../components/TutorialModal';
import { ReleaseSummaryModal } from '../components/ReleaseSummaryModal';
import { ContractDraft }      from '../types/contract';
import { NewsItem }           from '../types/run';
import { getAgentCutPercent } from '../engine/resource';
import { Colors, FontSize, Spacing, formatMoney } from '../theme';

function isFinancialSummaryItem(item: NewsItem) {
  return item.type === 'upkeep_summary' || (item.money_delta !== null && item.money_delta !== 0);
}

type FinancialCategory = {
  key: string;
  label: string;
  total: number;
  count: number;
};


function getFinancialCategory(item: NewsItem) {
  if (item.type === 'upkeep_summary') return 'Operating expenses';
  if (item.type === 'debt_repayment') return 'Debt payments';
  if (item.type === 'agency_spend') return 'Agency upgrades';
  if (item.type === 'income_received') {
    if (item.description.toLowerCase().includes('catalog')) return 'Catalog royalties';
    return 'Contract income';
  }
  if (item.type === 'campaign_installment' || item.type === 'campaign_ended') {
    return (item.money_delta ?? 0) >= 0 ? 'Campaign income' : 'Campaign expenses';
  }
  return (item.money_delta ?? 0) >= 0 ? 'Other income' : 'Other expenses';
}

function summarizeFinancialItems(items: NewsItem[]) {
  const categories = new Map<string, FinancialCategory>();
  for (const item of items) {
    const delta = item.money_delta ?? 0;
    if (delta === 0) continue;
    const label = getFinancialCategory(item);
    const existing = categories.get(label);
    if (existing) {
      existing.total += delta;
      existing.count += 1;
    } else {
      categories.set(label, {
        key: label,
        label,
        total: delta,
        count: 1,
      });
    }
  }

  const ordered = Array.from(categories.values()).sort((a, b) => {
    if (a.total >= 0 && b.total < 0) return -1;
    if (a.total < 0 && b.total >= 0) return 1;
    return Math.abs(b.total) - Math.abs(a.total);
  });

  return {
    categories: ordered,
    income: ordered.reduce((sum, category) => category.total > 0 ? sum + category.total : sum, 0),
    expenses: ordered.reduce((sum, category) => category.total < 0 ? sum + category.total : sum, 0),
  };
}

export function HomeScreen() {
  const rootNav = useNavigation<NativeStackNavigationProp<RootParamList>>();
  const tabNav  = useNavigation<BottomTabNavigationProp<TabParamList>>();

  const runState     = useRunState();
  const manifest     = useManifest();
  const board        = useDecisionBoard();
  const feed         = useNewsFeed();
  const phase        = usePhase();
  const money        = useMoney();
  const rep          = useReputation();
  const turnNum      = useTurnNumber();
  const isActive     = useIsRunActive();
  const tutorialStep       = useTutorialStep();
  const tutorialProspectId = useTutorialProspectId();

  const resolveDecision        = useRunStore(s => s.resolveDecision);
  const counterOffer           = useRunStore(s => s.counterOffer);
  const startTurn              = useRunStore(s => s.startTurn);
  const acceptFriendArtist     = useRunStore(s => s.acceptFriendArtist);
  const declineFriendArtist    = useRunStore(s => s.declineFriendArtist);
  const dismissReleaseSummary  = useRunStore(s => s.dismissReleaseSummary);
  const releaseSummaries       = useRunStore(s => s.state?.pending_release_summaries ?? NO_RELEASE_SUMMARIES);
  const pendingRelease         = releaseSummaries[0] ?? null;

  const [feedExpanded, setFeedExpanded] = useState(false);
  const [financialExpanded, setFinancialExpanded] = useState(false);
  const [counterItemId, setCounterItemId]   = useState<string | null>(null);
  const [counterDraft,  setCounterDraft]    = useState<ContractDraft | null>(null);
  const [counterResult, setCounterResult]   = useState<CounterResult | null>(null);

  function handleOpenCounter(itemId: string, draft: ContractDraft) {
    setCounterItemId(itemId);
    setCounterDraft(draft);
    setCounterResult(null);
  }

  function handleCounterSubmit(counter: import('../types/contract').CounterTerms) {
    if (!counterItemId) return;
    const result = counterOffer(counterItemId, counter);
    setCounterResult(result);
  }

  function handleCounterClose() {
    setCounterItemId(null);
    setCounterDraft(null);
    setCounterResult(null);
  }

  useEffect(() => {
    if (runState?.player_name) {
      rootNav.setOptions({ title: runState.player_name });
    }
  }, [runState?.player_name]);

  // Navigate to CareerSummary whenever the run ends (covers all end paths:
  // clock expiry, bankruptcy, voluntary retire from AgencyScreen)
  useEffect(() => {
    const state = useRunStore.getState().state;
    if (!isActive && state?.end_condition) {
      rootNav.replace('CareerSummary', { runId: state.id });
    }
  }, [isActive]);

  useEffect(() => {
    const current = useRunStore.getState();
    if (current.state?.is_active && current.state.phase === 'turn_open') {
      current.startTurn();
    }
  }, [phase, isActive, startTurn]);

  // Tutorial navigation side-effects.
  useEffect(() => {
    if (tutorialStep === 'roster_highlight') {
      tabNav.navigate('Roster');
    }
    // scout_hint and agency_hint: the tab is highlighted in RunTabBar — player taps it themselves.
  }, [tutorialStep]);

  if (!runState || !manifest) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No active run.</Text>
      </View>
    );
  }

  const isDecision   = phase === 'decision';
  const labels       = manifest.labels;
  const financialItems = feed.filter(isFinancialSummaryItem);
  const currentTurnFinancialItems = financialItems.filter(item => item.turn_number === runState.turn_number);
  const newsItems      = feed.filter(item => !isFinancialSummaryItem(item));
  const shownFinancial = financialExpanded ? financialItems : currentTurnFinancialItems;
  const financialSummary = summarizeFinancialItems(shownFinancial);
  const shownFeed      = feedExpanded ? newsItems : newsItems.slice(-5);

  const clientName = (clientId: string | null) =>
    clientId ? (runState.roster.find(c => c.id === clientId)?.name) : undefined;

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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {/* Decision Board */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Decision Board</Text>



          {isDecision && board.length === 0 && (
            <Text style={styles.emptySection}>Board is clear.</Text>
          )}

          {isDecision && (() => {
            const tutorialFirstBoard = board.find(i => i.template_key === 'tutorial_first_board' && !i.is_resolved);
            const tutorialSigningContract = tutorialStep === 'contract_approve_hint'
              ? board.find(i => i.template_key === 'agent_signing' && i.client_id === tutorialProspectId && !i.is_resolved)
              : undefined;
            const visibleItems = tutorialFirstBoard
              ? [tutorialFirstBoard]
              : tutorialSigningContract
                ? [tutorialSigningContract]
                : board;
            return (
              <>
                {tutorialSigningContract && visibleItems.includes(tutorialSigningContract) && (
                  <View style={styles.tutorialBanner}>
                    <Text style={styles.tutorialBannerText}>
                      Your new signing is waiting — approve to add them to your roster.
                    </Text>
                  </View>
                )}
                {visibleItems.map(item => {
                  const isTutorial = item.template_key === 'tutorial_first_board' ||
                    (tutorialStep === 'contract_approve_hint' && item.client_id === tutorialProspectId);
                  const previousContract = (item.type === 'renewal' && item.contract_id)
                    ? runState.contracts.find(c => c.id === item.contract_id) ?? null
                    : null;
                  return (
                    <DecisionCard
                      key={item.id}
                      item={item}
                      clientName={clientName(item.client_id)}
                      clientLabel={labels.client}
                      entityLabel={labels.entity}
                      reputationLabel={labels.reputation}
                      agentCutPercent={item.contract_draft?.tier === 'client_entity'
                        ? getAgentCutPercent(runState, item.contract_draft.client_id)
                        : null}
                      isPushEnabled={runState.agent.stats.negotiation > 0}
                      previousContract={previousContract}
                      isTutorial={isTutorial}
                      onResolve={resolveDecision}
                      onOpenCounter={handleOpenCounter}
                    />
                  );
                })}
              </>
            );
          })()}
        </View>

        {/* Income / Expenses */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setFinancialExpanded(e => !e)}
          >
            <Text style={styles.sectionTitle}>Income / Expenses</Text>
            <Text style={styles.sectionToggle}>{financialExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {financialSummary.categories.length === 0 ? (
            <Text style={styles.emptySection}>No income or expenses this turn.</Text>
          ) : (
            <View style={styles.financialSummary}>
              <View style={styles.financialTotals}>
                <View style={styles.financialTotalItem}>
                  <Text style={styles.financialTotalLabel}>Income</Text>
                  <Text style={[styles.financialTotalValue, styles.positiveMoney]}>
                    {formatMoney(financialSummary.income)}
                  </Text>
                </View>
                <View style={styles.financialTotalItem}>
                  <Text style={styles.financialTotalLabel}>Expenses</Text>
                  <Text style={[styles.financialTotalValue, styles.negativeMoney]}>
                    {formatMoney(financialSummary.expenses)}
                  </Text>
                </View>
                <View style={styles.financialTotalItem}>
                  <Text style={styles.financialTotalLabel}>Net</Text>
                  <Text
                    style={[
                      styles.financialTotalValue,
                      financialSummary.income + financialSummary.expenses >= 0 ? styles.positiveMoney : styles.negativeMoney,
                    ]}
                  >
                    {formatMoney(financialSummary.income + financialSummary.expenses)}
                  </Text>
                </View>
              </View>
              {financialSummary.categories.map(category => (
                <View key={category.key} style={styles.financialCategoryRow}>
                  <View style={styles.financialCategoryCopy}>
                    <Text style={styles.financialCategoryLabel}>{category.label}</Text>
                    <Text style={styles.financialCategoryCount}>
                      {category.count === 1 ? '1 entry' : `${category.count} entries`}
                    </Text>
                  </View>
                  <Text style={[
                    styles.financialCategoryAmount,
                    category.total >= 0 ? styles.positiveMoney : styles.negativeMoney,
                  ]}>
                    {formatMoney(category.total)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* News Feed */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setFeedExpanded(e => !e)}
          >
            <Text style={styles.sectionTitle}>News Feed</Text>
            <Text style={styles.sectionToggle}>{feedExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {shownFeed.length === 0 ? (
            <Text style={styles.emptySection}>Nothing yet this career.</Text>
          ) : (
            shownFeed.map(item => (
              <NewsItemRow
                key={item.id}
                item={item}
                clientName={clientName(item.client_id)}
                reputationLabel={labels.reputation}
              />
            ))
          )}
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      <TutorialModal
        visible={tutorialStep === 'friend_pitch'}
        onAccept={acceptFriendArtist}
        onDecline={declineFriendArtist}
      />

      {counterDraft && (
        <CounterOfferModal
          visible={counterItemId !== null}
          draft={counterDraft}
          negotiationLevel={runState.agent.stats.negotiation}
          reputationLabel={labels.reputation}
          result={counterResult}
          onSubmit={handleCounterSubmit}
          onClose={handleCounterClose}
        />
      )}

      {pendingRelease && (
        <ReleaseSummaryModal
          notification={pendingRelease}
          onDismiss={dismissReleaseSummary}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content:{ flexGrow: 1, padding: Spacing.md, paddingBottom: Spacing.xxl * 4, gap: Spacing.lg },
  section:{ gap: Spacing.sm },
  tutorialBanner: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.md,
  },
  tutorialBannerText: {
    color: Colors.warning,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionToggle: { color: Colors.textDim, fontSize: FontSize.xs },
  emptySection: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
    paddingVertical: Spacing.md,
    textAlign: 'center',
  },
  financialSummary: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  financialTotals: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  financialTotalItem: {
    flex: 1,
    gap: 2,
  },
  financialTotalLabel: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  financialTotalValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  financialCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  financialCategoryCopy: {
    flex: 1,
    gap: 2,
  },
  financialCategoryLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  financialCategoryCount: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
  },
  financialCategoryAmount: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  positiveMoney: {
    color: Colors.positive,
  },
  negativeMoney: {
    color: Colors.negative,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg,
  },
  emptyText: { color: Colors.textDim, fontSize: FontSize.md },
});
