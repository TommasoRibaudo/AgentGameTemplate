# Agent Game Template — Implementation TODO

Spec files are complete. This tracks the build from bootstrap through playtest-ready.
Engine first (pure functions, fully unit-testable), then state layer, then UI.

---

## Phase 0 — Project Bootstrap

- [ ] Init Expo project with TypeScript template into this directory
      `npx create-expo-app . --template expo-template-blank-typescript`
- [ ] Install core dependencies
      - `@react-navigation/native`, `@react-navigation/bottom-tabs`, `@react-navigation/native-stack`
      - `react-native-screens`, `react-native-safe-area-context`
      - `zustand`
      - `@react-native-async-storage/async-storage`
- [ ] Install dev dependencies
      - `jest`, `@testing-library/react-native`, `@testing-library/jest-native`
- [ ] Move `src/` spec files into the Expo project root
- [ ] Configure `tsconfig.json` path aliases (`@types`, `@engine`, `@components`, `@screens`, `@store`)
- [ ] Configure Jest for React Native + TypeScript

---

## Phase 1 — Engine (pure functions, no UI dependency)

All engine functions are `(RunState, VariantManifest?) → RunState` or similar pure signatures.
Each sub-section has a corresponding test file.

### 1a — Resource system (`src/engine/resource.ts`)

- [ ] `applyMoneyDelta` — apply delta, clamp to 0, open debt state if result ≤ 0
- [ ] `applyReputationDelta` — apply delta, clamp to `[MIN_REPUTATION, MAX_REPUTATION]`
- [ ] `computeMonthlyIncome` — sum `per_month` contract amounts × `your_cut` for all active contracts
- [ ] `computeMonthlyExpenses` — overhead + obligations + defense track recurring costs, scaled by Operations multiplier
- [ ] `earnLumpSum` — named wrapper around `applyMoneyDelta` for one-time payouts
- [ ] `settleObjectivePayouts` — find met objectives, pay out, mark `is_met = true`
- [ ] `computeRepTier` — map raw Reputation → `RepTier` enum
- [ ] `computeCreditCeiling` — `(rep × rep_weight) + (roster_asset_value × asset_weight)`
- [ ] `estimateClientAssetValue` — remaining duration × payout × arc multiplier per client
- [ ] **Tests:** `src/engine/__tests__/resource.test.ts`

### 1b — Client system (`src/engine/client.ts`)

The fog model is the most critical math in the codebase — resolve open question §6.2 here
with placeholder weights that can be tuned later.

- [ ] `computeObservedStat` — the fog narrowing formula
      - Inputs: `scouting_invested`, agent skill level (stat vs insight), `turns_on_roster`
      - Hard stats (Talent): uses `stat_scouting`; floor at `FOG_FLOOR_HARD` (band never collapses)
      - Soft stats (Form/Morale/Marketability): uses `insight_scouting`; floor at `FOG_FLOOR_SOFT`
      - Tenure contribution: asymptotic curve (most gain in first ~12 turns on roster)
- [ ] `refreshClientFog` — recompute all four stats via `computeObservedStat`
- [ ] `refreshProspectFog` — same but `turns_on_roster = 0`
- [ ] `investScouting` — increment `scouting_invested` on a stat, trigger `refreshClientFog`
- [ ] `evaluateArcProgression` — check `turns_at_stage + form_modifier` against manifest arc config thresholds; return new stage
- [ ] `applyArcMultipliers` — scale observed band by `stage_multipliers` from manifest
- [ ] `applyClientStatDeltas` — apply `StatDeltas` to `true_value`, clamp to [0, 100], refresh fog
- [ ] `checkTraitGrant` — check `trigger_condition_key` + `trigger_threshold` against roll result
- [ ] `grantTrait` — look up `TraitDefinition` from manifest, cache modifiers onto client, no-op if already granted
- [ ] `signClient` — convert `Prospect → Client`, activate agent↔client contract, fill roster slot
- [ ] `releaseClient` — compute severance if contract active, apply money/rep impact, remove from roster
- [ ] **Tests:** `src/engine/__tests__/client.test.ts`

### 1c — Campaign system (`src/engine/campaign.ts`)

- [ ] `rollInstallment` — `roll = clamp(form_true × form_weight + Normal(0, variance), 0, 100)`; apply trait Form modifiers before roll
- [ ] `advanceCampaigns` — iterate all active campaigns: roll → apply deltas → check triggers → decrement `turns_remaining` → close if 0
- [ ] `checkInstallmentEventTrigger` — roll below `event_trigger_threshold` → generate one client event
- [ ] `checkInstallmentTraitTrigger` — roll above `trait_trigger_threshold` → run `checkTraitGrant`
- [ ] `settleCampaignObjectives` — on close, mark met objectives `is_met = true`, trigger payouts
- [ ] `startCampaign` — create `Campaign` object, link `pending_objective_ids`, attach to client
- [ ] `closeCampaign` — settle objectives, append to history, remove from active, record news item
- [ ] **Tests:** `src/engine/__tests__/campaign.test.ts`

### 1d — Event system (`src/engine/event.ts`)

- [ ] `computeExposure` — placeholder weights for open question §6.4
      `exposure = (roster_size × w1) + (peak_client_count × w2) + (high_value_contract_count × w3)`
- [ ] `computeEventProbability` — `base_rate × exposure × (1 - defense_reduction(track_level))`
- [ ] `selectEventTarget` — weighted random client selection using `event_bias` from traits
- [ ] `generateEvents` — roll per category, cap at `TARGET_EVENTS_PER_TURN_MAX`, sort severity desc
- [ ] `mitigateEventOutcome` — apply defense track reduction to money/rep deltas; downgrade crisis → major if track high enough
- [ ] `resolveEvent` — apply outcome (or default if `optionKey = null`), move to `resolved_events`, record news item
- [ ] `applyEventDefaults` — resolve all `pending_events` with null (default) at turn end
- [ ] `injectWindfallBoardItem` — add a `DecisionItem` to `decision_board` from windfall outcome
- [ ] **Tests:** `src/engine/__tests__/event.test.ts`

### 1e — Decision queue (`src/engine/decision-queue.ts`)

- [ ] `hydrateContractOffer` — sample values from `ContractTemplate` ranges, scale by client stats and agent Rep, produce `ContractDraft`
- [ ] `generateDecisionBoard` — filter templates by rep gate + arc stage, sample weighted pool, carry over persistent items, fill to 2–5 items
- [ ] `executePush` — compute `success_probability` from negotiation level + posture `true_value`; roll and return outcome; placeholder curve for open question §6.3
- [ ] `regeneratePushedDraft` — on successful push, bias draft toward agent-favourable terms using negotiation modifier
- [ ] `resolveDecisionItem` — apply chosen option's `DecisionOutcome`, call `activateContract` if needed, record news item
- [ ] `applyBoardDefaults` — fire `default_on_ignore` for all unresolved items at Resolution phase
- [ ] `activateContract` — promote `ContractDraft → Contract` (assign ID, set timers, fire lump_sum if applicable)
- [ ] `tickBoardItemExpiry` — decrement `expires_in` on persistent items; remove at 0
- [ ] **Tests:** `src/engine/__tests__/decision-queue.test.ts`

### 1f — Progression system (`src/engine/progression.ts`)

- [ ] `computeOperationsMultiplier` — level → cost reduction multiplier; linear placeholder
- [ ] `computeNegotiationModifier` — level → push success modifier + posture fog narrowing
- [ ] `computeAgentStatUpgradeCost` — level-scaled cost curve from manifest economy config
- [ ] `upgradeAgentStat` — deduct cost, increment stat, call `refreshClientFog` for all clients if scouting stat upgraded
- [ ] `computeInfrastructureUpgradeCost` — from manifest config
- [ ] `upgradeInfrastructure` — deduct cost, increment track level, update `per_turn_cost`; roster slot increments `roster_capacity` and logs exposure warning
- [ ] **Tests:** `src/engine/__tests__/progression.test.ts`

### 1g — Failure / debt system (`src/engine/failure.ts`)

- [ ] `fireLowMoneyWarning` — set warning flag immediately when money ≤ 0 (not at Turn Close)
- [ ] `openDebtState` — set `debt.is_active = true`, compute initial credit offer via `computeCreditCeiling`
- [ ] `takeLoan` — validate amount ≤ ceiling headroom, inject money, update debt balance and repayment
- [ ] `serviceDebt` — deduct repayment, apply interest to balance, check missed repayment condition
- [ ] `computeCreditCeiling` — `(rep × rep_weight) + (roster_asset_value × asset_weight)`; falls on asset sale
- [ ] `checkFailureCondition` — called only at Turn Close; bankruptcy = missed repayment + no headroom; grace period = 1 turn warning before end
- [ ] `computeCareerScore` — placeholder formula for open question §6.8
- [ ] `endRun` — set `is_active = false`, `end_condition`, compute final score
- [ ] `retireVoluntarily` — validate in Decision phase, call `endRun('retired')`
- [ ] **Tests:** `src/engine/__tests__/failure.test.ts`

### 1h — Turn loop (`src/engine/turn-loop.ts`)

Implemented last because it orchestrates all of the above.

- [ ] `assertPhase` — throw if `state.phase !== expected`
- [ ] `runTurnOpen` — aggregate last-turn news items into revisitable feed; no state mutations
- [ ] `runUpkeep` — in order: expenses → income → tick contract timers → expire contracts → service debt → advance campaigns → evaluate arc progression → fire low-money warning if triggered
- [ ] `runDecisionPhase` — generate decision board via `generateDecisionBoard`; generate events via `generateEvents`; set phase to `'decision'`
- [ ] `runResolution` — apply board defaults for unresolved items, apply event defaults, record digest news items
- [ ] `runTurnClose` — call `checkFailureCondition`; increment `turn_number`; check `turn_number >= career_length` → `endRun('clock_expired')`; tick board item expiry
- [ ] `TurnOrchestrator.startTurn` — runs phases 1 (Turn Open) + 2 (Upkeep); returns state ready for player
- [ ] `TurnOrchestrator.endTurn` — runs phases 4 (Resolution) + 5 (Turn Close); called when player presses End Turn
- [ ] **Tests:** `src/engine/__tests__/turn-loop.test.ts` — integration test of full turn sequence

---

## Phase 2 — Variant Manifest

### 2a — Manifest validator (`src/manifest/validator.ts`)

- [ ] `validateManifest(manifest: unknown): VariantManifest` — runtime type guard; throws with descriptive error on violation
- [ ] Validation rules:
      - All required fields present
      - `stat_sub_attributes` weights sum to 1.0 per `maps_to` group
      - All `contract_template_key` references in `board_item_templates` resolve to a `contract_templates` entry
      - All `defense_track_key` references in event definitions resolve to a valid infrastructure key
      - `economy.event_base_rate` in [0, 1]
      - Arc config multipliers > 0
- [ ] **Tests:** `src/manifest/__tests__/validator.test.ts`

### 2b — Reference manifest (`src/manifest/variants/music.ts`)

A minimal but fully playable music-industry variant. Placeholder economy values — to be tuned in Phase 5.

- [ ] Domain labels (Artist, Label, Manager, Cash, Clout)
- [ ] Stat sub-attributes: Vocal / Songwriting / Performance → Talent; Buzz → Form; Fanbase / Brand → Marketability
- [ ] Entity types: Record Label (per_month), Streaming Platform (per_objective), Sponsorship (lump_sum)
- [ ] Campaign types: Album Cycle (10 turns), Tour (6 turns), Single Release (2 turns)
- [ ] Trait library: 8 traits (e.g. Viral Moment, Burnout Risk, Critically Acclaimed, Touring Machine)
- [ ] Event library: 12 events covering all 4 categories and all 3 severity tiers
- [ ] Board item templates: 8 templates (2 per item type)
- [ ] Contract templates: 5 templates (label deal, streaming deal, sponsorship, agent signing, renewal)
- [ ] Economy config: placeholder starting values (to be tuned)
- [ ] Arc config: placeholder progression speeds (to be tuned)

---

## Phase 3 — State Layer

### 3a — Zustand store (`src/store/`)

- [ ] `useRunStore` — wraps `RunState`; one action per engine operation (no raw state setters)
      - Actions mirror engine function signatures; each action calls the engine function and replaces state
      - Example: `resolveDecision(itemId, optionKey)` → calls engine → `set(newState)`
- [ ] `useMetaStore` — cross-career data: completed run records, achievements, leaderboard cache
- [ ] Selector hooks: `useRoster()`, `useDecisionBoard()`, `useActiveEvents()`, `useDebtState()`, etc.

### 3b — Run initializer (`src/store/initRun.ts`)

- [ ] `createNewRun(manifest: VariantManifest): RunState` — build starting state from `manifest.economy`:
      - `money = economy.starting_money`
      - `reputation = economy.starting_reputation`
      - `career_length = economy.career_length`
      - `agent` stats all at 0, `roster_capacity` at minimum
      - Empty roster, empty board, phase = `'turn_open'`
      - Generate initial decision board for turn 1

### 3c — Persistence (`src/store/persistence.ts`)

- [ ] `saveRun(state: RunState)` — serialize to JSON, write to AsyncStorage key `run_active`
- [ ] `loadRun(): RunState | null` — deserialize from AsyncStorage; return null if no save
- [ ] `saveMetaStore(meta: MetaState)` — write to `meta` key
- [ ] Auto-save hook: trigger `saveRun` at every `turn_close` phase transition
- [ ] Version field on serialized state to support future migrations

---

## Phase 4 — UI

### 4a — Navigation setup (`src/navigation/`)

- [ ] `RootNavigator` — switches between Run (tabs) and outside-run screens
- [ ] `TabNavigator` — 4-tab bottom nav (Home / Roster / Scout / Agency)
- [ ] `RosterStackNavigator` — RosterScreen → ClientDetailScreen
- [ ] `ScoutStackNavigator` — ScoutScreen → ProspectDetail (if needed)
- [ ] Wire `TopBar` as a fixed header above the tab navigator (not inside any single tab)

### 4b — FogBand component (`src/components/FogBand.tsx`)

**The most important custom UI element — get this right before anything else.**

- [ ] Horizontal track rendering `[0, trackMax]` range
- [ ] Filled segment representing `[observed_min, observed_max]`
- [ ] Visual confidence style: wide sparse fill → tight dense fill as band narrows
- [ ] Text label: `"15–20"` format (exact number when min === max, floor capped by `FOG_FLOOR_*`)
- [ ] Compact mode: single-line label + mini band; Full mode: larger band with sub-label
- [ ] `showInvested` sub-label: `"Scout invested: $X"` when prop set
- [ ] Snapshot test + visual regression note

### 4c — Atom components

- [ ] `TopBar` — four numbers always visible; debt flag in red; low-money warning tint
- [ ] `StatRow` — label + `FogBand`; optional inline Invest button with amount stepper
- [ ] `NewsItemRow` — icon from `NEWS_ITEM_ICONS` map; money/rep deltas in colour (green/red)
- [ ] `ClientRow` — arc badge, 2 FogBands (Talent + Form), morale dot, campaign dot, contract expiry label

### 4d — Molecule components

- [ ] `ContractSummary` — render both draft and active contract; posture fog band if partially revealed; expiry countdown for active contracts
- [ ] `DecisionCard` — type badge, description, optional ContractSummary, verb buttons (Approve/Reject/Push/custom); expiring-soon urgency indicator
- [ ] `EventModal` — severity-driven header colour; client name substituted in description; option buttons; default path on dismiss

### 4e — HomeScreen (Tab 1)

Core gameplay loop — highest priority screen.

- [ ] Scrollable container: News Feed (top) → Decision Board (below)
- [ ] News Feed: `FlatList` of `NewsItemRow`; collapses to last 5 items when Decision Board has focus
- [ ] Decision Board: `FlatList` of `DecisionCard`; shows item count badge
- [ ] `EventModal` as `Modal` overlay; board non-interactive when modal is open (opacity + pointer-events)
- [ ] End Turn button: floating at bottom; `Alert` confirmation when unresolved items remain
- [ ] Phase indicator: subtle label showing current phase for dev; hidden in release builds

### 4f — Roster screens (Tab 2)

- [ ] `RosterScreen` — `FlatList` of `ClientRow`; empty state → "No clients. Visit Scout tab."
- [ ] `ClientDetailScreen` — tab bar (Overview / Stats / Contracts / Campaign)
      - Overview tab: arc badge, morale bar, campaign summary card, trait chips, agent contract card, Release button
      - Stats tab: `StatRow` list with invest buttons; scouting invested sub-labels
      - Contracts tab: agent contract section + entity contracts list; expired contracts collapsed
      - Campaign tab: installment result list with outcome label, stat delta chips, money/rep delta

### 4g — ScoutScreen (Tab 3)

- [ ] Prospect list: `FlatList` of prospect rows; all FogBands at max width initially
- [ ] Prospect row: name, arc badge, four FogBands, total scouting invested, Invest button
- [ ] Invest sheet: bottom sheet with stat selector + amount input; deducts money immediately
- [ ] Open Offers section: entity offers awaiting board placement (preview only, resolves on board)
- [ ] Sign flow: tapping Sign on a prospect generates a `contract_offer` board item for next turn

### 4h — AgencyScreen (Tab 4)

- [ ] Agent Stats panel: four stat rows with current level, description, cost, Upgrade button (disabled if can't afford)
- [ ] Infrastructure panel: roster slots (current/cap + exposure warning on upgrade); four defense track rows with level + recurring cost
- [ ] Bank panel: current Money, debt balance (shown when debt active), credit ceiling, Take Loan button + amount input; Retire button with confirmation dialog

### 4i — Outside-run screens

- [ ] `CareerSummaryScreen` — end banner (condition-driven icon + copy), score breakdown, roster highlights, achievements, CTA buttons
- [ ] `LeaderboardScreen` — ranked list with variant filter; player's own entry highlighted; locked state on first career

---

## Phase 5 — Integration & Playtest

### 5a — End-to-end turn loop

- [ ] Play through 3 full turns with the music reference manifest
- [ ] Verify phase transitions advance correctly (assert phase guard fires on wrong-phase calls)
- [ ] Verify news feed accumulates correctly across turns
- [ ] Verify decision board generates 2–5 items with correct Rep gating

### 5b — Edge cases

- [ ] Empty roster (0 clients): board generates non-client items only; no events targeting clients
- [ ] Full roster (roster_capacity reached): sign flow blocked; board never shows new client offers
- [ ] Debt entry: money hits 0 mid-upkeep → debt state opens → bank panel activates
- [ ] Bankruptcy recovery: take loan → repay → exit debt state
- [ ] Bankruptcy failure: miss repayment + no credit → grace period → game over
- [ ] Voluntary retirement from Agency tab
- [ ] Campaign completes: objectives settled, news item recorded, client.active_campaign_id = null
- [ ] Trait granted mid-campaign: subsequent installment rolls include modifier
- [ ] Windfall event injects board item into ongoing Decision phase

### 5c — Resolve open questions (PRD §6)

- [ ] §6.1 Career length — pick a starting value (e.g. 60 turns = 5 years), tune in playtesting
- [ ] §6.2 Fog narrowing curve — set weights; confirm Talent never reaches zero band
- [ ] §6.3 Push risk curve — set negotiation level → success_probability table
- [ ] §6.4 Exposure formula — set w1/w2/w3 weights; target ~0.5 events/turn at mid-game
- [ ] §6.5 Credit-ceiling coefficients — set rep_weight and asset_weight
- [ ] §6.8 Leaderboard scoring formula — set component weights

### 5d — Economy tuning pass

- [ ] Adjust music variant starting money/rep so first 3 turns are tight but survivable
- [ ] Verify agent stat upgrade costs feel meaningful but achievable
- [ ] Verify a Rising client → Peak → Declining arc feels like a career, not a sprint

### 5e — Performance

- [ ] Decision Board scrolls at 60 fps on a mid-range device
- [ ] FogBand renders without jank in a 10-item roster list
- [ ] AsyncStorage save completes within 50 ms (RunState is not large)

---

## Phase 6 — Meta & Polish (post-playtest, pre-release)

- [ ] Achievement system — define triggers, grant on engine events, display in CareerSummaryScreen
- [ ] Legacy gallery — persist best client/agent records across careers in MetaStore
- [ ] Leaderboard backend — swap stub with real API (Supabase or similar)
- [ ] NewCareer screen — variant selection UI (music only initially; extensible)
- [ ] Second variant stub — football or acting, to validate the variant-manifest boundary
- [ ] App icon, splash screen, Expo build config
