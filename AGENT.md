# Agent Game Template — Project Guide

## What this is
A reusable React Native skeleton for turn-based, text-first agent-management mobile games. The player acts as a talent agent managing a roster of clients (musicians, footballers, actors, etc.). Each specific title extends this template with domain content; the engine is invariant.

## Key documents

| File | Purpose |
|------|---------|
| `Agent_Game_Template_PRD.docx` | Full product requirements — design pillars, core loop, all 8 systems, UI skeleton, extension spec, open questions. **Start here for the "what".** |
| `TODO.md` | Spec checklist — data models, system interfaces, variant manifest, UI component specs. All complete. |
| `TODO_IMPL.md` | Implementation build plan — 6 phases from project bootstrap through playtest. **Active work tracker.** |

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
