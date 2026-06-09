import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { RootParamList, TabParamList, RosterStackParamList, ScoutStackParamList } from './types';
import { Colors } from '../theme';

// Screens
import { HomeScreen }          from '../screens/HomeScreen';
import { RosterScreen }        from '../screens/RosterScreen';
import { ClientDetailScreen }  from '../screens/ClientDetailScreen';
import { ScoutScreen }          from '../screens/ScoutScreen';
import { ProspectDetailScreen } from '../screens/ProspectDetailScreen';
import { AgencyScreen }         from '../screens/AgencyScreen';
import { CareerSummaryScreen } from '../screens/CareerSummaryScreen';
import { LeaderboardScreen }   from '../screens/LeaderboardScreen';
import { AchievementsScreen }  from '../screens/AchievementsScreen';
import { LegacyScreen }        from '../screens/LegacyScreen';
import { NewCareerScreen }     from '../screens/NewCareerScreen';

// ─── Navigator instances ──────────────────────────────────────────────────────

const Root        = createNativeStackNavigator<RootParamList>();
const Tab         = createBottomTabNavigator<TabParamList>();
const RosterStack = createNativeStackNavigator<RosterStackParamList>();
const ScoutStack  = createNativeStackNavigator<ScoutStackParamList>();

// ─── Roster sub-stack ─────────────────────────────────────────────────────────

function RosterNavigator() {
  return (
    <RosterStack.Navigator screenOptions={stackOpts}>
      <RosterStack.Screen name="RosterList"   component={RosterScreen}       options={{ title: 'Roster' }} />
      <RosterStack.Screen name="ClientDetail" component={ClientDetailScreen} options={{ title: 'Client' }} />
    </RosterStack.Navigator>
  );
}

// ─── Scout sub-stack ──────────────────────────────────────────────────────────

function ScoutNavigator() {
  return (
    <ScoutStack.Navigator screenOptions={stackOpts}>
      <ScoutStack.Screen name="ScoutList"      component={ScoutScreen}          options={{ title: 'Scout' }} />
      <ScoutStack.Screen name="ProspectDetail" component={ProspectDetailScreen} options={{ title: 'Prospect', headerShown: true, ...headerOpts }} />
    </ScoutStack.Navigator>
  );
}

// ─── Tab navigator (in-run) ───────────────────────────────────────────────────

const TAB_ICONS: Record<string, string> = {
  Home: '⌂', Roster: '◈', Scout: '◉', Agency: '⚙',
};

function RunNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle:            { backgroundColor: Colors.tabBar, borderTopColor: Colors.border },
        tabBarActiveTintColor:  Colors.accent,
        tabBarInactiveTintColor:Colors.textDim,
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 18 }}>{TAB_ICONS[route.name] ?? route.name[0]}</Text>
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ headerShown: true, title: 'Home', ...headerOpts }} />
      <Tab.Screen name="Roster" component={RosterNavigator} />
      <Tab.Screen name="Scout"  component={ScoutNavigator} />
      <Tab.Screen name="Agency" component={AgencyScreen}
        options={{ headerShown: true, title: 'Agency', ...headerOpts }} />
    </Tab.Navigator>
  );
}

// ─── Root stack ───────────────────────────────────────────────────────────────
// Run-ended navigation is handled inside HomeScreen (always mounted while a run
// is active), which has access to rootNav via useNavigation().

export function AppNavigator({ initialRoute = 'NewCareer' }: { initialRoute?: keyof RootParamList }) {
  return (
    <Root.Navigator screenOptions={{ ...stackOpts, headerShown: false }} initialRouteName={initialRoute}>
      <Root.Screen name="NewCareer"     component={NewCareerScreen} />
      <Root.Screen name="Run"           component={RunNavigator} />
      <Root.Screen name="CareerSummary" component={CareerSummaryScreen}
        options={{ headerShown: true, title: 'Career Summary', ...headerOpts }} />
      <Root.Screen name="Leaderboard"  component={LeaderboardScreen}
        options={{ headerShown: true, title: 'Leaderboard',    ...headerOpts }} />
      <Root.Screen name="Achievements" component={AchievementsScreen}
        options={{ headerShown: true, title: 'Achievements',   ...headerOpts }} />
      <Root.Screen name="Legacy"       component={LegacyScreen}
        options={{ headerShown: true, title: 'Career History', ...headerOpts }} />
    </Root.Navigator>
  );
}

const stackOpts = {
  contentStyle:      { backgroundColor: Colors.bg },
  headerStyle:       { backgroundColor: Colors.surface },
  headerTintColor:   Colors.textPrimary,
  headerShadowVisible: false,
} as const;

const headerOpts = {
  headerStyle:       { backgroundColor: Colors.surface },
  headerTintColor:   Colors.textPrimary,
  headerShadowVisible: false,
} as const;
