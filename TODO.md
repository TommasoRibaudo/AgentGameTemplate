# Agent Game Template — Build Specs TODO

## Status
- [x] Tech stack decision — React Native (mobile, offline-first)
- [x] PRD locked — v1.0 (June 2026)

---

## 1. Data Model Spec
Define concrete schemas for all core objects the engine operates on.

- [x] `Client` — `src/types/client.ts` (FoggedStat, AppliedTrait, Client, Prospect)
- [x] `Contract` — `src/types/contract.ts` (FoggedPosture, Objective, Contract)
- [x] `Campaign` — `src/types/campaign.ts` (CampaignInstallmentResult, Campaign)
- [x] `Event` — `src/types/event.ts` (EventOutcome, EventOption, GameEvent)
- [x] `DecisionItem` — `src/types/decision.ts` (DecisionOutcome, PushRisk, DecisionOption, DecisionItem)
- [x] `AgentState` — `src/types/agent.ts` (AgentStats, DefenseTrack, AgentState)
- [x] `RunState` — `src/types/run.ts` (DebtState, NewsItem, RunState)
- [x] Primitives/enums — `src/types/primitives.ts` (CoreStatKey, ArcStage, PayoutType, etc.)
- [x] `VariantManifest` — `src/types/manifest.ts` (DomainLabels, TraitDefinition, EventDefinition, EconomyConfig, ArcConfig, etc.)

---

## 2. System Specs (one spec per system, in dependency order)

- [x] **Resource system** — `src/engine/resource.ts`
- [x] **Client system** — `src/engine/client.ts`
- [x] **Turn loop** — `src/engine/turn-loop.ts`
- [x] **Decision queue** — `src/engine/decision-queue.ts`
- [x] **Event system** — `src/engine/event.ts`
- [x] **Campaign system** — `src/engine/campaign.ts`
- [x] **Progression system** — `src/engine/progression.ts`
- [x] **Failure/debt system** — `src/engine/failure.ts`

---

## 3. Variant Manifest Schema
Formal data contract a variant must satisfy to run on the engine (covers PRD §5.1).

- [x] TypeScript interface — `src/types/manifest.ts` (VariantManifest and all sub-types)
- [ ] Validation rules (what makes a manifest invalid — runtime schema guard)
- [ ] Reference example manifest (e.g., a minimal football or music variant stub)

---

## 4. UI Component Spec
Screen-by-screen layout and component definitions.

- [x] Persistent top bar — `src/components/TopBar.tsx`
- [x] Tab 1 — Home/Turn — `src/screens/HomeScreen.tsx` (News Feed + Decision Board + EventModal overlay)
- [x] Tab 2 — Roster — `src/screens/RosterScreen.tsx` + `ClientDetailScreen.tsx` (4-tab detail)
- [x] Tab 3 — Scout/Market — `src/screens/ScoutScreen.tsx`
- [x] Tab 4 — Agency — `src/screens/AgencyScreen.tsx` (stats + infra + bank panels)
- [x] Outside-run screens — `CareerSummaryScreen.tsx`, `LeaderboardScreen.tsx`
- [x] **Fog Band component** — `src/components/FogBand.tsx` (signature custom UI element)
- [x] Event/decision modal — `src/components/EventModal.tsx`
- [x] Supporting components — `DecisionCard.tsx`, `ClientRow.tsx`, `ContractSummary.tsx`, `StatRow.tsx`, `NewsItemRow.tsx`
- [x] Navigation types — `src/navigation/types.ts` (RootParamList, TabParamList, stack param lists)

---

## Open Questions (from PRD §6 — resolve during balancing/prototyping)

- [ ] Career length (turn count) — needs playtesting
- [ ] Fog narrowing curve — relative weight of scouting skill vs. per-prospect spend vs. roster tenure
- [ ] Push risk curve — downside distribution per Negotiation level
- [ ] Exposure formula — exact weighting for event probability
- [ ] Credit-ceiling coefficients — how Rep + roster asset value combine
- [ ] Reserved fifth agent stat — include in core or leave as extension?
- [ ] Reputation segmentation — needed for any launch variant?
- [ ] Leaderboard scoring formula — weighting of peak Rep, earnings, clients developed, Hall-of-Fame clients
