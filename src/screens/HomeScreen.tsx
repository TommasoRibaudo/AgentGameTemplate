import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, SafeAreaView, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootParamList } from '../navigation/types';
import {
  useRunStore, useRunState, useManifest,
  useDecisionBoard, useActiveEvents, useNewsFeed,
  usePhase, useMoney, useReputation, useTurnNumber,
  useIsRunActive,
} from '../store/useRunStore';
import { TopBar }             from '../components/TopBar';
import { DecisionCard }       from '../components/DecisionCard';
import { NewsItemRow }        from '../components/NewsItemRow';
import { EventModal }         from '../components/EventModal';
import { CounterOfferModal, CounterResult } from '../components/CounterOfferModal';
import { ContractDraft }      from '../types/contract';
import { getAgentCutPercent } from '../engine/resource';
import { Colors, FontSize, Spacing, Radius } from '../theme';

export function HomeScreen() {
  const rootNav = useNavigation<NativeStackNavigationProp<RootParamList>>();

  const runState  = useRunState();
  const manifest  = useManifest();
  const board     = useDecisionBoard();
  const events    = useActiveEvents();
  const feed      = useNewsFeed();
  const phase     = usePhase();
  const money     = useMoney();
  const rep       = useReputation();
  const turnNum   = useTurnNumber();
  const isActive  = useIsRunActive();

  const resolveDecision = useRunStore(s => s.resolveDecision);
  const counterOffer    = useRunStore(s => s.counterOffer);
  const resolveEvent    = useRunStore(s => s.resolveEvent);
  const endTurn         = useRunStore(s => s.endTurn);
  const startTurn       = useRunStore(s => s.startTurn);

  const [feedExpanded, setFeedExpanded] = useState(false);
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
      rootNav.navigate('CareerSummary', { runId: state.id });
    }
  }, [isActive]);

  useEffect(() => {
    const current = useRunStore.getState();
    if (current.state?.is_active && current.state.phase === 'turn_open') {
      current.startTurn();
    }
  }, [phase, isActive, startTurn]);

  const handleEndTurn = useCallback(() => {
    const unresolved = board.filter(i => !i.is_resolved);
    if (unresolved.length > 0) {
      Alert.alert(
        'End Turn?',
        'Unresolved items will take their default outcome.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'End Turn', style: 'destructive', onPress: () => endTurn() },
        ],
      );
    } else {
      endTurn();
    }
  }, [board, endTurn]);

  if (!runState || !manifest) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No active run.</Text>
      </View>
    );
  }

  const activeEvent  = events.find(e => !e.is_resolved) ?? null;
  const isDecision   = phase === 'decision';
  const labels       = manifest.labels;
  const shownFeed    = feedExpanded ? feed : feed.slice(-5);

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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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
              />
            ))
          )}
        </View>

        {/* Decision Board */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Decision Board</Text>

          {isDecision && board.length === 0 && (
            <Text style={styles.emptySection}>Board is clear.</Text>
          )}

          {isDecision && board.map(item => {
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
                agentCutPercent={item.contract_draft?.tier === 'client_entity'
                  ? getAgentCutPercent(runState, item.contract_draft.client_id)
                  : null}
                isPushEnabled={runState.agent.stats.negotiation > 0}
                previousContract={previousContract}
                onResolve={resolveDecision}
                onOpenCounter={handleOpenCounter}
              />
            );
          })}
        </View>

        {isDecision && (
          <TouchableOpacity style={styles.endTurnBtn} onPress={handleEndTurn}>
            <Text style={styles.endTurnText}>End Turn</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      {activeEvent && (
        <EventModal
          event={activeEvent}
          clientName={clientName(activeEvent.client_id)}
          clientLabel={labels.client}
          onResolve={resolveEvent}
        />
      )}

      {counterDraft && (
        <CounterOfferModal
          visible={counterItemId !== null}
          draft={counterDraft}
          negotiationLevel={runState.agent.stats.negotiation}
          result={counterResult}
          onSubmit={handleCounterSubmit}
          onClose={handleCounterClose}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content:{ padding: Spacing.md, gap: Spacing.lg },
  section:{ gap: Spacing.sm },
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
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg,
  },
  emptyText: { color: Colors.textDim, fontSize: FontSize.md },
  endTurnBtn: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  endTurnText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '600' },
});
