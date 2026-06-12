import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useDialog } from '../context/DialogContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TabParamList } from '../navigation/types';
import { RootParamList } from '../navigation/types';
import {
  useRunState, useManifest, useMoney, useReputation,
  useTurnNumber, useAgentState, useDebtState, useRunStore,
  useTutorialStep,
} from '../store/useRunStore';
import { TopBar } from '../components/TopBar';
import { InfrastructureUpgradeKey } from '../engine/progression';
import {
  computeAgentStatUpgradeCost,
  computeInfrastructureUpgradeCost,
} from '../engine/progression';
import { computeCreditCeiling, computeCreditHeadroom } from '../engine/failure';
import { Colors, FontSize, Spacing, Radius, formatMoney } from '../theme';
import { AgentStats } from '../types/agent';
import { buildDebugStatus } from '../dev/debugStatus';

export type AgencyScreenProps = NativeStackScreenProps<TabParamList, 'Agency'>;

const AGENT_STAT_DESCS: Record<keyof AgentStats, string> = {
  stat_scouting:    'Narrows talent fog bands; each level adds 10% chance to find a new prospect per turn (base 30%, max 90%)',
  insight_scouting: 'Narrows form, marketability, and morale fog bands',
  negotiation:      'Improves contract terms and reveals posture',
  operations:       'Lowers overhead and client costs',
  coaching:         'Boosts talent growth speed and probability for all clients',
};

const INFRA_DESCS: Record<InfrastructureUpgradeKey, string> = {
  roster_slot:       'Increase max roster capacity (+1)',
  insurance:         'Reduces frequency of client health events',
  pr:                'Reduces frequency of public-image events',
  legal:             'Reduces frequency of legal events',
  medical:           'Reduces frequency of medical events',
  training_facility: 'Improves form and sharpens talent/form scouting',
  media_studio:      'Improves marketability and sharpens market reads',
  wellness_suite:    'Improves morale and sharpens morale reads',
};

export function AgencyScreen() {
  const rootNav  = useNavigation<NativeStackNavigationProp<RootParamList>>();
  const runState = useRunState();
  const manifest = useManifest();
  const money    = useMoney();
  const rep      = useReputation();
  const turnNum  = useTurnNumber();
  const agent    = useAgentState();
  const debt     = useDebtState();

  const [loanInput, setLoanInput] = useState('');
  const [debugCopied, setDebugCopied] = useState(false);
  const { showDialog } = useDialog();

  const tutorialStep            = useTutorialStep();
  const advanceTutorial         = useRunStore(s => s.advanceTutorial);
  const upgradeAgentStat        = useRunStore(s => s.upgradeAgentStat);
  const upgradeInfrastructure   = useRunStore(s => s.upgradeInfrastructure);
  const downgradeInfrastructure = useRunStore(s => s.downgradeInfrastructure);
  const takeLoan                = useRunStore(s => s.takeLoan);
  const retireVoluntarily       = useRunStore(s => s.retireVoluntarily);

  if (!runState || !manifest || !agent) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No active run.</Text>
      </View>
    );
  }

  const labels  = manifest.labels;
  const phase   = runState.phase;

  const statKeys: (keyof AgentStats)[] = [
    'stat_scouting', 'insight_scouting', 'negotiation', 'operations', 'coaching',
  ];
  const infraKeys: InfrastructureUpgradeKey[] = [
    'roster_slot', 'training_facility', 'media_studio', 'wellness_suite', 'insurance', 'pr', 'legal', 'medical',
  ];

  const creditCeiling = computeCreditCeiling(runState, manifest);
  const creditHeadroom = computeCreditHeadroom(runState, manifest);

  function handleRetire() {
    if (phase !== 'decision') {
      showDialog({ title: 'Wrong phase', message: 'You can only retire during the Decision phase.' });
      return;
    }
    showDialog({
      title: 'Retire now?',
      message: 'Lock in your career score? This cannot be undone.',
      buttons: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Retire', style: 'destructive', onPress: () => {
            retireVoluntarily();
            const state = useRunStore.getState().state;
            if (state?.end_condition) {
              rootNav.navigate('CareerSummary', { runId: state.id });
            }
          },
        },
      ],
    });
  }

  function handleTakeLoan() {
    const amount = parseInt(loanInput, 10);
    if (isNaN(amount) || amount <= 0) {
      showDialog({ title: 'Invalid amount', message: 'Enter a positive number.' });
      return;
    }
    if (amount > creditHeadroom) {
      showDialog({ title: 'No credit available', message: `You can borrow up to ${formatMoney(creditHeadroom)} right now.` });
      return;
    }
    const before = useRunStore.getState().state;
    takeLoan(amount);
    const after = useRunStore.getState().state;
    setLoanInput('');
    if (after && before && after.money > before.money && after.debt.balance > before.debt.balance) {
      showDialog({ title: 'Loan approved', message: `${formatMoney(amount)} added to your balance.` });
    } else {
      showDialog({ title: 'Loan unavailable', message: 'Your current credit headroom is not enough for that loan.' });
    }
  }

  async function handleCopyDebugStatus() {
    const snapshot = useRunStore.getState();
    if (!snapshot.state || !snapshot.manifest) return;

    const didCopy = await Clipboard.setStringAsync(buildDebugStatus(snapshot.state, snapshot.manifest));
    setDebugCopied(didCopy);
    showDialog({
      title: didCopy ? 'Debug status copied' : 'Copy failed',
      message: didCopy
        ? 'Agency, artist, and campaign status is on the clipboard.'
        : 'The clipboard did not accept the debug status.',
      buttons: [{ label: 'OK' }],
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        money={money}
        reputation={rep}
        rosterCount={runState.roster.length}
        rosterCapacity={agent.roster_capacity}
        turnNumber={turnNum}
        careerLength={runState.career_length}
        isInDebt={runState.debt.is_active}
        lowMoneyWarning={runState.low_money_warning}
        moneyLabel={labels.money}
        reputationLabel={labels.reputation}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {tutorialStep === 'agency_hint' && (
          <View style={styles.tutorialBanner}>
            <Text style={styles.tutorialBannerText}>
              {"Welcome to your Agency.\n\nUpgrade your skills to scout better, negotiate stronger deals, and coach clients to their peak.\n\nInfrastructure upgrades protect and improve your roster.\n\nThe Bank lets you take loans when cash is tight."}
            </Text>
            <TouchableOpacity
              style={styles.tutorialGotItBtn}
              onPress={() => advanceTutorial('agency_hint')}
              accessibilityRole="button"
              accessibilityLabel="Got it"
            >
              <Text style={styles.tutorialGotItBtnText}>Got it →</Text>
            </TouchableOpacity>
          </View>
        )}

        {__DEV__ && (
          <Section title="Dev Tools">
            <TouchableOpacity
              style={styles.debugBtn}
              onPress={handleCopyDebugStatus}
              accessibilityRole="button"
              accessibilityLabel="Copy debug status"
            >
              <Text style={styles.debugBtnText}>
                {debugCopied ? 'Copied Debug Status' : 'Copy Debug Status'}
              </Text>
            </TouchableOpacity>
          </Section>
        )}

        {/* Agent Stats */}
        <Section title={`${labels.agent} Skills`}>
          {statKeys.map(key => {
            const cost = computeAgentStatUpgradeCost(runState, key, manifest);
            const level = agent.stats[key];
            const canAfford = money >= cost.money && rep >= cost.reputation;
            return (
              <UpgradeRow
                key={key}
                label={key.replace(/_/g, ' ')}
                level={level}
                description={AGENT_STAT_DESCS[key]}
                costLine={`${formatMoney(cost.money)} · ${cost.reputation} ${labels.reputation}`}
                canAfford={canAfford}
                onUpgrade={() => upgradeAgentStat(key)}
              />
            );
          })}
        </Section>

        {/* Infrastructure */}
        <Section title="Infrastructure">
          {infraKeys.map(key => {
            const cost  = computeInfrastructureUpgradeCost(runState, key, manifest);
            const track = agent.defense_tracks.find(t => t.key === key);
            const level = track?.level ?? 0;
            const canAfford = money >= cost.money;
            const isSlot = key === 'roster_slot';
            const displayLevel = isSlot ? agent.roster_capacity : level;
            const canSell = isSlot
              ? agent.roster_capacity > runState.roster.length
              : level > 0;
            return (
              <UpgradeRow
                key={key}
                label={key.replace(/_/g, ' ')}
                level={displayLevel}
                description={INFRA_DESCS[key]}
                costLine={`${formatMoney(cost.money)}${cost.per_turn_recurring > 0 ? ` + ${formatMoney(cost.per_turn_recurring)}/turn` : ''}`}
                canAfford={canAfford}
                onUpgrade={() => upgradeInfrastructure(key)}
                canSell={canSell}
                onSell={() => downgradeInfrastructure(key)}
              />
            );
          })}
        </Section>

        {/* Bank */}
        <Section title="Bank">
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>Balance</Text>
            <Text style={[styles.bankValue, money < 0 && styles.neg]}>{formatMoney(money)}</Text>
          </View>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>Credit ceiling</Text>
            <Text style={styles.bankValue}>{formatMoney(creditCeiling)}</Text>
          </View>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>Available credit</Text>
            <Text style={styles.bankValue}>{formatMoney(creditHeadroom)}</Text>
          </View>
          {debt && debt.is_active && (
            <>
              <View style={styles.bankRow}>
                <Text style={styles.bankLabel}>Debt balance</Text>
                <Text style={[styles.bankValue, styles.neg]}>{formatMoney(debt.balance)}</Text>
              </View>
              <View style={styles.bankRow}>
                <Text style={styles.bankLabel}>Repayment/turn</Text>
                <Text style={[styles.bankValue, styles.neg]}>{formatMoney(debt.per_turn_repayment)}</Text>
              </View>
            </>
          )}
          <View style={styles.loanRow}>
            <TextInput
              style={styles.loanInput}
              value={loanInput}
              onChangeText={setLoanInput}
              placeholder="Loan amount"
              placeholderTextColor={Colors.textDim}
              keyboardType="numeric"
            />
            <TouchableOpacity
              style={[styles.loanBtn, creditHeadroom <= 0 && styles.btnDisabled]}
              onPress={handleTakeLoan}
              disabled={creditHeadroom <= 0}
            >
              <Text style={[styles.loanBtnText, creditHeadroom <= 0 && styles.textDim]}>Take Loan</Text>
            </TouchableOpacity>
          </View>
        </Section>

        {/* Retire */}
        <Section title="Career">
          <Text style={styles.retireHint}>
            Retiring locks in your score. Only available during the Decision phase.
          </Text>
          <TouchableOpacity
            style={[styles.retireBtn, phase !== 'decision' && styles.btnDisabled]}
            onPress={handleRetire}
          >
            <Text style={styles.retireBtnText}>Retire Voluntarily</Text>
          </TouchableOpacity>
        </Section>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

interface UpgradeRowProps {
  label: string;
  level: number;
  description: string;
  costLine: string;
  canAfford: boolean;
  onUpgrade: () => void;
  canSell?: boolean;
  onSell?: () => void;
}

function UpgradeRow({ label, level, description, costLine, canAfford, onUpgrade, canSell, onSell }: UpgradeRowProps) {
  return (
    <View style={styles.upgradeRow}>
      <View style={styles.upgradeInfo}>
        <View style={styles.upgradeHeader}>
          <Text style={styles.upgradeLabel}>{label.replace(/^\w/, c => c.toUpperCase())}</Text>
          <Text style={styles.upgradeLevel}>Lv {level}</Text>
        </View>
        <Text style={styles.upgradeDesc}>{description}</Text>
        <Text style={styles.upgradeCost}>{costLine}</Text>
      </View>
      {onSell !== undefined && (
        <TouchableOpacity
          style={[styles.upgradeBtnSell, !canSell && styles.btnDisabled]}
          onPress={onSell}
          disabled={!canSell}
        >
          <Text style={[styles.upgradeBtnText, !canSell && styles.textDim]}>↓</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.upgradeBtn, !canAfford && styles.btnDisabled]}
        onPress={onUpgrade}
        disabled={!canAfford}
      >
        <Text style={[styles.upgradeBtnText, !canAfford && styles.textDim]}>↑</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  scroll:  { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.xl },
  empty:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  emptyText: { color: Colors.textDim, fontSize: FontSize.md },
  section: { gap: Spacing.sm },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  upgradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  upgradeInfo:   { flex: 1, gap: 2 },
  upgradeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  upgradeLabel:  { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600', textTransform: 'capitalize' },
  upgradeLevel:  { color: Colors.accent, fontSize: FontSize.sm, fontWeight: '600' },
  upgradeDesc:   { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 18 },
  upgradeCost:   { color: Colors.textDim, fontSize: FontSize.xs, marginTop: 2 },
  upgradeBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBtnSell: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.negative,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBtnText: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '700' },
  bankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  bankLabel: { color: Colors.textSecondary, fontSize: FontSize.sm },
  bankValue:  { color: Colors.textPrimary,  fontSize: FontSize.sm, fontWeight: '600' },
  neg: { color: Colors.negative },
  loanRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  loanInput: {
    flex: 1,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  loanBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
  },
  loanBtnText: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  retireHint: { color: Colors.textDim, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  retireBtn: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.negative,
    padding: Spacing.md,
    alignItems: 'center',
  },
  retireBtnText: { color: Colors.negative, fontSize: FontSize.md, fontWeight: '600' },
  tutorialBanner: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  tutorialBannerText: {
    color: Colors.warning,
    fontSize: FontSize.sm,
    fontWeight: '600',
    lineHeight: 22,
  },
  tutorialGotItBtn: {
    backgroundColor: Colors.warning,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  tutorialGotItBtnText: {
    color: Colors.bg,
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  debugBtn: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.md,
    alignItems: 'center',
  },
  debugBtnText: { color: Colors.warning, fontSize: FontSize.md, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
  textDim: { color: Colors.textDim },
});
