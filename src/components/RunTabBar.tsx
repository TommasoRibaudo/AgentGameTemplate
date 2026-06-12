import React, { useCallback, useEffect } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { resolvePortrait } from '../portraits';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDecisionBoard, useIsRunActive, useManifest, usePhase, useRunState, useRunStore, useTutorialStep } from '../store/useRunStore';
import { useDialog } from '../context/DialogContext';
import { Colors, FontSize, Radius, Spacing } from '../theme';
import { DeltaText } from './DeltaText';
import { Client } from '../types/client';
import { Campaign } from '../types/campaign';

const TAB_ICONS: Record<string, string> = {
  Home: 'H',
  Roster: 'R',
  Scout: 'S',
  Agency: 'A',
};

export function RunTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const runState = useRunState();
  const manifest = useManifest();
  const board = useDecisionBoard();
  const unresolvedDecisionCount = board.filter(item => !item.is_resolved).length;
  const phase = usePhase();
  const isActive = useIsRunActive();
  const endTurn = useRunStore(s => s.endTurn);
  const advanceTutorial = useRunStore(s => s.advanceTutorial);
  const tutorialStep = useTutorialStep();
  const tutorialBlocksEndTurn =
    tutorialStep !== null &&
    tutorialStep !== 'end_turn_hint' &&
    tutorialStep !== 'done';
  const currentTabName   = state.routes[state.index]?.name ?? '';
  const isScoutTutorial        = tutorialStep === 'scout_hint' || tutorialStep === 'scout_signing';
  const isContractApproveTutorial = tutorialStep === 'contract_approve_hint';
  const isAgencyTutorial       = tutorialStep === 'agency_hint';
  useEffect(() => {
    if (isContractApproveTutorial) {
      navigation.navigate('Home');
    }
  }, [isContractApproveTutorial]);
  const canEndTurn = isActive && phase === 'decision' && !tutorialBlocksEndTurn;
  const { showDialog } = useDialog();
  const campaignTypes = manifest?.campaign_types ?? [];
  const pinnedClientIds = runState?.pinned_client_ids ?? [];
  const dismissedAutoClientIds = runState?.dismissed_auto_client_ids ?? [];
  const allArtistStatuses = (runState?.roster ?? [])
    .map(client => {
      const activeCampaign = runState?.campaigns.find(c => c.client_id === client.id && c.turns_remaining > 0) ?? null;
      return buildArtistStatus(
        client,
        activeCampaign,
        campaignTypes.find(type => type.key === activeCampaign?.type_key)?.label,
        pinnedClientIds.includes(client.id),
      );
    })
    .sort((a, b) => b.priority - a.priority || a.client.name.localeCompare(b.client.name));
  const pinnedArtistStatuses = pinnedClientIds
    .map(clientId => allArtistStatuses.find(item => item.client.id === clientId))
    .filter((item): item is ArtistStatus => item !== undefined);
  const artistStatuses = [
    ...pinnedArtistStatuses,
    ...allArtistStatuses.filter(item =>
      item.priority > 0 &&
      !item.isPinned &&
      !dismissedAutoClientIds.includes(item.client.id),
    ),
  ];

  const handleEndTurn = useCallback(() => {
    if (!canEndTurn) return;

    const doEnd = () => {
      endTurn();
    };

    const unresolved = board.filter(i => !i.is_resolved);
    if (unresolved.length > 0) {
      showDialog({
        title: 'End Week?',
        message: 'Unresolved items will take their default outcome.',
        buttons: [
          { label: 'Cancel', style: 'cancel' },
          { label: 'End Week', style: 'destructive', onPress: doEnd },
        ],
      });
    } else {
      doEnd();
    }
  }, [board, canEndTurn, endTurn, advanceTutorial, showDialog]);

  const openClientCampaign = useCallback((clientId: string) => {
    navigation.navigate('Roster', {
      screen: 'ClientDetail',
      initial: false,
      params: { clientId, initialTab: 'campaign' },
    });
  }, [navigation]);

  const handleArtistLongPress = useCallback((item: ArtistStatus) => {
    const title = item.isPinned ? `Unpin ${item.client.name}?` : `Remove ${item.client.name}?`;
    const message = item.isPinned && item.priority === 0
      ? 'This removes them from the lower bar.'
      : 'This hides their automatic campaign status from the lower bar. You can pin them again from artist details.';

    showDialog({
      title,
      message,
      buttons: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Unpin',
          style: 'destructive',
          onPress: () => {
            if (item.priority > 0) {
              useRunStore.getState().dismissAutoClient(item.client.id);
            } else {
              useRunStore.getState().unpinClient(item.client.id);
            }
          },
        },
      ],
    });
  }, [showDialog]);

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
      {artistStatuses.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={tutorialStep === 'end_turn_hint' ? styles.railDimmed : undefined}
          contentContainerStyle={styles.artistRail}
        >
          {artistStatuses.map(item => (
            <TouchableOpacity
              key={item.client.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.client.name} campaign status`}
              activeOpacity={0.82}
              onPress={() => openClientCampaign(item.client.id)}
              onLongPress={() => handleArtistLongPress(item)}
              style={[styles.artistCard, item.priority > 0 && styles.artistCardActive]}
            >
              <Image
                source={resolvePortrait(item.client.portrait, item.client.id)}
                style={[styles.facePlaceholder, styles.faceImage]}
              />
              <View style={styles.artistText}>
                <Text style={styles.artistStatus} numberOfLines={1}>{item.status}</Text>
                <Text style={styles.artistResult} numberOfLines={1}>{item.result}</Text>
                <Text style={styles.artistName} numberOfLines={1}>{item.client.name}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {tutorialStep === 'end_turn_hint' && canEndTurn && (
        <View style={styles.endTurnHint}>
          <Text style={styles.endTurnHintText}>Dev's gig is running! End the turn to see how it goes.</Text>
        </View>
      )}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: !canEndTurn }}
        activeOpacity={0.82}
        disabled={!canEndTurn}
        onPress={handleEndTurn}
        style={[styles.endTurnBtn, !canEndTurn && styles.endTurnDisabled, tutorialStep === 'end_turn_hint' && canEndTurn && styles.endTurnBtnHighlighted]}
      >
        <Text style={[styles.endTurnText, !canEndTurn && styles.endTurnTextDisabled]}>
          End Week
        </Text>
      </TouchableOpacity>

      {(tutorialStep === 'post_gig_hint' || isContractApproveTutorial) && currentTabName !== 'Home' && (
        <View style={styles.endTurnHint}>
          <Text style={styles.endTurnHintText}>
            {isContractApproveTutorial
              ? 'Go to your Dashboard and approve the signing contract.'
              : 'Check your Dashboard. Your decision board is ready.'}
          </Text>
        </View>
      )}

      {isScoutTutorial && currentTabName !== 'Scout' && (
        <View style={styles.endTurnHint}>
          <Text style={styles.endTurnHintText}>
            {tutorialStep === 'scout_hint'
              ? 'Head to the Scout tab and invest in a prospect.'
              : 'Now sign the prospect. Tap Sign on their card.'}
          </Text>
        </View>
      )}

      {isAgencyTutorial && currentTabName !== 'Agency' && (
        <View style={styles.endTurnHint}>
          <Text style={styles.endTurnHintText}>Check the Agency tab to manage your operation.</Text>
        </View>
      )}

      <View style={[styles.tabs, tutorialStep === 'end_turn_hint' && styles.tabsDimmed]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name;
          const isFocused = state.index === index;
          const isHomeHighlighted   = route.name === 'Home'   && (tutorialStep === 'post_gig_hint' || isContractApproveTutorial);
          const isScoutHighlighted  = route.name === 'Scout'  && isScoutTutorial && !isFocused;
          const isAgencyHighlighted = route.name === 'Agency' && isAgencyTutorial;
          const isTutorialHighlighted = isHomeHighlighted || isScoutHighlighted || isAgencyHighlighted;
          const isPostGigDimmed    = tutorialStep === 'post_gig_hint' && route.name !== 'Home';
          const isContractDimmed   = isContractApproveTutorial       && route.name !== 'Home';
          const isScoutDimmed      = isScoutTutorial                 && route.name !== 'Scout';
          const isAgencyDimmed     = isAgencyTutorial                && route.name !== 'Agency';
          const isTutorialDimmed   = isPostGigDimmed || isContractDimmed || isScoutDimmed || isAgencyDimmed;
          const color = isTutorialHighlighted ? Colors.warning : isFocused ? Colors.accent : Colors.textDim;
          const badgeLabel = unresolvedDecisionCount > 99 ? '99+' : String(unresolvedDecisionCount);
          const accessibleLabel = options.tabBarAccessibilityLabel ??
            (typeof label === 'string' ? label : route.name);

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (event.defaultPrevented) {
              return;
            }

            if (isFocused && route.name === 'Roster') {
              event.preventDefault();

              const nestedStackKey = route.state?.key;
              if (nestedStackKey) {
                navigation.dispatch({
                  ...CommonActions.reset({
                    index: 0,
                    routes: [{ name: 'RosterList' }],
                  }),
                  target: nestedStackKey,
                });
              }
              return;
            }

            if (!isFocused) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={
                route.name === 'Home' && unresolvedDecisionCount > 0
                  ? `${accessibleLabel} (${badgeLabel} decisions)`
                  : options.tabBarAccessibilityLabel
              }
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[styles.tab, isTutorialDimmed && styles.tabDimmedPost, isTutorialHighlighted && styles.tabHomeHighlighted]}
            >
              <Text style={[styles.tabIcon, { color }]}>{TAB_ICONS[route.name] ?? route.name[0]}</Text>
              {route.name === 'Home' && unresolvedDecisionCount > 0 && (
                <View style={styles.decisionBadge}>
                  <Text style={styles.decisionBadgeText}>{badgeLabel}</Text>
                </View>
              )}
              <Text style={[styles.tabLabel, { color }]}>
                {typeof label === 'string' ? label : route.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

type ArtistStatus = {
  client: Client;
  priority: number;
  status: string;
  result: React.ReactNode;
  isPinned: boolean;
};

function buildArtistStatus(client: Client, activeCampaign: Campaign | null, activeCampaignLabel: string | undefined, isPinned: boolean): ArtistStatus {
  if (activeCampaign) {
    const latest = activeCampaign.installment_results.at(-1);
    return {
      client,
      priority: 2,
      status: `${activeCampaignLabel ?? titleize(activeCampaign.type_key)} - ${activeCampaign.turns_remaining} left`,
      result: latest
        ? <>{titleize(latest.outcome_key)} <DeltaText value={latest.money_delta} kind="money" /></>
        : 'Campaign just started',
      isPinned,
    };
  }

  const latestRelease = (client.catalog_releases ?? [])
    .slice()
    .sort((a, b) => b.released_turn - a.released_turn)[0];

  if (latestRelease && (latestRelease.latest_turn_income > 0 || latestRelease.latest_turn_streams > 0 || latestRelease.is_selling_albums)) {
    return {
      client,
      priority: 1,
      status: latestRelease.title,
      result: <>Last week <DeltaText value={latestRelease.latest_turn_income} kind="money" /></>,
      isPinned,
    };
  }

  const latestHistory = (client.campaign_history ?? [])
    .slice()
    .sort((a, b) => b.completed_turn - a.completed_turn)[0];

  return {
    client,
    priority: 0,
    status: latestHistory ? latestHistory.label : 'No campaign',
    result: latestHistory ? <>Last result <DeltaText value={latestHistory.summary.money_delta} kind="money" /></> : 'Tap to plan',
    isPinned,
  };
}

function titleize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.tabBar,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  artistRail: {
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  artistCard: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    minHeight: 68,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    width: 184,
  },
  artistCardActive: {
    borderColor: Colors.warning,
  },
  facePlaceholder: {
    height: 52,
    width: 52,
  },
  facePlaceholderActive: {},
  faceImage: {
    backgroundColor: 'transparent',
    borderRadius: 0,
  },

  artistText: {
    flex: 1,
    minWidth: 0,
  },
  artistStatus: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  artistResult: {
    color: Colors.warning,
    fontSize: FontSize.xs,
    fontWeight: '700',
    marginTop: 1,
  },
  artistName: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 4,
  },
  endTurnHint: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  endTurnHintText: {
    color: Colors.warning,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  endTurnBtn: {
    alignItems: 'center',
    backgroundColor: Colors.warning,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  endTurnBtnHighlighted: {
    shadowColor: Colors.warning,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  endTurnDisabled: {
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderWidth: 1,
  },
  endTurnText: {
    color: Colors.bg,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  endTurnTextDisabled: {
    color: Colors.textDim,
  },
  tabs: {
    flexDirection: 'row',
  },
  tabsDimmed: {
    opacity: 0.3,
  },
  railDimmed: {
    opacity: 0.3,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 48,
    position: 'relative',
  },
  decisionBadge: {
    alignItems: 'center',
    backgroundColor: Colors.warning,
    borderColor: Colors.tabBar,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 5,
    position: 'absolute',
    right: '28%',
    top: 2,
  },
  decisionBadgeText: {
    color: Colors.bg,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
  },
  tabDimmedPost: {
    opacity: 0.3,
  },
  tabHomeHighlighted: {
    backgroundColor: 'rgba(240, 168, 51, 0.10)',
    borderRadius: Radius.sm,
    shadowColor: Colors.warning,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  tabIcon: {
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  tabLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
