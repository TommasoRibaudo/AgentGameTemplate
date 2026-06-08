import { NavigatorScreenParams } from '@react-navigation/native';

// ─── Tab navigator (active run) ───────────────────────────────────────────────
export type TabParamList = {
  Home: undefined;
  Roster: undefined;
  Scout: undefined;
  Agency: undefined;
};

// ─── Roster stack ─────────────────────────────────────────────────────────────
export type RosterStackParamList = {
  RosterList: undefined;
  ClientDetail: { clientId: string };
};

// ─── Scout stack ──────────────────────────────────────────────────────────────
export type ScoutStackParamList = {
  ScoutList: undefined;
  ProspectDetail: { prospectId: string };
};

// ─── Root navigator (wraps run vs. out-of-run destinations) ──────────────────
export type RootParamList = {
  Run: NavigatorScreenParams<TabParamList>;   // the four-tab run experience
  CareerSummary: { runId: string };
  Leaderboard: undefined;
  NewCareer: undefined;                        // variant selection + run init
};
