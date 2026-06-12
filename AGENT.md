# Agent Game Template — Project Guide

## What this is
A reusable React Native skeleton for turn-based, text-first agent-management mobile games. The player acts as a talent agent managing a roster of clients (musicians, footballers, actors, etc.). Each specific title extends this template with domain content; the engine is invariant.

## The game (player POV)
You are a talent agent. Each week (turn) you:

1. Review what happened last turn — income received, campaign results, crises.
2. Pay overhead and receive client income during Upkeep. Campaigns tick forward and may produce stat changes or events.
3. Work through a Decision Board of 2–5 items: contract offers to approve or reject, client requests, opportunities, renewals. Pending crisis Events interrupt as modals and must be resolved first.
4. End the turn. Unresolved board items fire their defaults; the bankruptcy check runs.

**Core tension:** Money is the survival currency — you go bankrupt if you miss a debt repayment with no credit headroom. Reputation is the access currency — it gates better contract offers and prospect quality. You can spend Reputation to push a deal to better terms, but a failed push costs both. Clients age through a `rising → peak → declining` arc; a declining client earns less each week, so your roster must keep turning over.

The fog model is the central strategic mechanic: you never know a client's true stats. You see a band (`observed_min`–`observed_max`) that narrows as you invest in scouting. Talent bands never fully close; soft stats (Form, Morale, Marketability) can be known exactly if you invest enough.

## Key documents

| File | Purpose |
|------|---------|
| `Agent_Game_Template_PRD.docx` | Full product requirements — design pillars, core loop, all 8 systems, UI skeleton, extension spec, open questions. **Start here for the "what".** |
| `TODO.md` | Spec checklist — data models, system interfaces, variant manifest, UI component specs. All complete. |
| `TODO_IMPL.md` | Implementation build plan — 6 phases from project bootstrap through playtest. **Active work tracker.** |

## Directory map

```
src/
  types/          — schema definitions only; no logic
  engine/         — pure functions: (RunState, VariantManifest?) → RunState
  manifest/       — runtime validator + per-variant content files
  store/          — Zustand store; calls engine functions and replaces state; handles persistence
  components/     — stateless UI atoms and molecules
  screens/        — read store selectors, dispatch store actions; no game logic
  navigation/     — stack/tab wiring only
```

Tests live alongside their subject: `src/engine/__tests__/`, `src/store/__tests__/`, `src/manifest/__tests__/`, `src/components/__tests__/`.

## Turn phases (fixed order)

| Phase | `TurnPhase` value | What happens |
|---|---|---|
| 1 — Turn Open | `turn_open` | Aggregate last turn's news into the feed; player reviews before acting |
| 2 — Upkeep | `upkeep` | Expenses and income tick; contracts expire; campaigns advance and roll; debt is serviced; arc progression evaluated; low-money warning fires if triggered |
| 3 — Decision | `decision` | Decision board generated; events generated; player resolves items and events |
| 4 — Resolution | `resolution` | Unresolved board items fire defaults; unresolved events fire defaults; digest news items recorded |
| 5 — Turn Close | `turn_close` | Bankruptcy check; turn counter increments; clock-expiry check; board item expiry ticked |

`TurnOrchestrator.startTurn` runs phases 1–2 and returns. `TurnOrchestrator.endTurn` runs phases 4–5 when the player presses End Turn.

## Core concepts

**Fog model** — Every client stat is stored as a `true_value` plus an `observed_min`/`observed_max` band. The band narrows as `scouting_invested` increases and as the client spends time on the roster. Talent uses `stat_scouting`; Form/Morale/Marketability use `insight_scouting`. Hard stats (Talent) have a permanent floor (`FOG_FLOOR_HARD`) — the band never fully collapses. Soft stats can reach certainty. `FogBand` is the UI component that renders these bands.

**Arc stages** — Every client progresses through `rising → peak → declining`. The current stage multiplies true stat values and income via `ArcConfig.stage_multipliers`. `evaluateArcProgression` checks `turns_at_stage + form_modifier` against manifest thresholds each Upkeep.

**Two-currency rule** — `money` and `reputation` serve distinct purposes. Money is survival: hitting 0 opens the debt state (not instant death — a credit line opens with weekly interest and a repayment schedule). Missing a repayment with no credit headroom starts a one-turn grace period, then bankruptcy. Reputation is access: it gates contract offers via `rep_gate` on `BoardItemTemplate` and determines credit ceiling. Only Money is a failure axis.

**Debt state** — `RunState.debt.is_active` flips to true the moment money ≤ 0. Play continues; `serviceDebt` runs each Upkeep. `checkFailureCondition` only runs at Turn Close. The player can take loans up to `credit_ceiling`, which is derived from Reputation and roster asset value.

**Variant manifest** — All domain content (labels, stat sub-attributes, campaign types, traits, events, board templates, contract templates, economy tuning) lives in a `VariantManifest`. The engine is variant-agnostic. `validateManifest` runs at load time. The reference variant is `src/manifest/variants/music.ts`.

## Open questions (intentional placeholders)
Several numeric weights in the engine are placeholders to be resolved in Phase 5 (`TODO_IMPL.md §5c`). Do not replace them with hardcoded constants:
- §6.2 Fog narrowing curve weights
- §6.3 Push risk / negotiation success curve
- §6.4 Exposure formula weights (w1/w2/w3)
- §6.5 Credit-ceiling coefficients
- §6.8 Career score formula

These live in the manifest's `EconomyConfig` and `ArcConfig` so they can be tuned per variant without engine changes.

## Build spec order (complete — see TODO.md)
1. Data model spec — `src/types/` (all schemas done)
2. System specs — `src/engine/` (all 8 systems done)
3. Variant manifest schema — `src/types/manifest.ts` (done)
4. UI component spec — `src/components/`, `src/screens/` (all done)

## Implementation order (see TODO_IMPL.md)
- Phase 0: Project bootstrap (Expo + deps)
- Phase 1: Engine — 8 systems as pure functions, unit tested
- Phase 2: Variant manifest — validator + music reference manifest
- Phase 3: State layer — Zustand store + persistence
- Phase 4: UI — navigation → FogBand → atoms → screens
- Phase 5: Integration & playtest — resolve PRD §6 open questions
- Phase 6: Meta & polish

## Invariants (must not change across variants)
- Turn phase order (5 phases, fixed)
- Fog / observed-value model
- Two-currency rule: Money = survival, Reputation = access; Money is the only failure axis
- Contract and Campaign object schemas
- Resolution / default engine
- Progression vector structure (agent stats vs. agency infrastructure)

## Tech stack
- Platform: React Native (mobile, offline-first)
- Interface: Text-first
