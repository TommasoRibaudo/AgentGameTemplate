# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code that depends on Expo APIs, config, build behavior, or SDK conventions.

---

# Agent Game Template - Agent Instructions

This project is a React Native / Expo template for turn-based, text-first
agent-management games. `AGENT.md` explains the product and architecture;
`TODO_IMPL.md` is the active implementation tracker.

## Command Discipline

Keep shell exploration scoped so command output does not consume context.

- Prefer `rg` and `rg --files` over recursive directory listings.
- Do not search generated output directories unless the task explicitly requires it.
  Avoid `coverage/`, `coverage-report/`, `node_modules/`, `.expo/`, `dist/`, and build artifacts.
- Use tight patterns and explicit paths: search `src/engine` or `src/screens`, not the whole tree, when possible.
- Cap long output with PowerShell tools such as `Select-Object -First 80` or `Select-Object -Last 100`.
- If capped output is insufficient, narrow the command rather than increasing the cap.
- Run focused tests first. Full test suites, full builds, and broad typechecks are for cross-cutting changes or explicit requests.

## Windows / PowerShell

All commands must be PowerShell-compatible and written as a single line.

- Do not use bash-only syntax such as `&&`, `||`, `2>/dev/null`, `grep`, or line continuations.
- Use PowerShell equivalents such as `Select-String`, `Where-Object`, `Select-Object`, and semicolon-free single commands when practical.
- Prefer commands the user can paste directly into PowerShell.

## Validation

Match validation to the risk and scope of the change.

- Engine logic edit: run the specific test file under `src/engine/__tests__/`.
- Manifest or variant edit: run the manifest validator tests and any test for the touched variant.
- Store edit: run the focused store test under `src/store/__tests__/`.
- UI component or screen edit: run the focused component/screen test if one exists; otherwise run a TypeScript check.
- Type/schema edit: run the narrowest tests that cover all affected consumers.
- Trivial typo/comment edits may skip validation; say so in the final response.

## Testing Rules

Tests protect gameplay consistency, not just green output.

- Bug fixes should include a regression test when practical.
- Reproduce the bug with the smallest focused test before or while fixing it when feasible.
- When a test fails, investigate production code first.
- Only change a test when you can explain why the expectation was wrong.
- Never weaken assertions, loosen tolerances, or remove checks just to pass.
- Do not mock the function or system being tested; mocks are for dependencies.
- Keep engine tests close to pure behavior. UI tests should verify user-visible behavior, not implementation details.

## Patch Narrowly

Fix the requested behavior or the specific failing path first.

- Do not refactor adjacent code while passing through.
- Do not rename unrelated identifiers or reorganize files unless the task requires it.
- Do not add single-use helpers, wrappers, or config maps unless the inline logic is genuinely unreadable.
- If nearby code is suspicious but out of scope, mention it instead of silently changing it.

## Architecture Boundaries

Keep the template's layers distinct.

- Engine functions in `src/engine/` should stay pure and unit-testable.
- Store actions in `src/store/` should call engine functions and replace state; they should not duplicate engine rules.
- UI screens and components should render state and dispatch actions; they should not encode game mechanics.
- Variants should provide content and tuning only. They should not require engine, store, or UI rule changes.
- Shared runtime shapes live in `src/types/`; schema changes are cross-cutting.

## Before Editing Cross-Cutting Files

Run the relevant invariant checks before patching.

### Editing `src/types/*`

- Check all engine functions that construct or destructure the changed type.
- Check store actions and persistence serialization.
- Check manifest definitions and validator assumptions.
- Check tests and fixtures under `src/**/__tests__/`.

### Editing `src/engine/*`

- Preserve the fixed turn phase order unless the task explicitly changes it.
- Check corresponding tests in `src/engine/__tests__/`.
- Check store actions that wrap the engine function.
- Check UI assumptions if the returned state shape or phase behavior changes.

### Editing `src/types/manifest.ts` or `src/manifest/*`

- Update the runtime validator when schema rules change.
- Update `VARIANT_GUIDE.md` when variant authors need new instructions.
- Check all registered variants.
- Add or update validator tests.

### Editing `src/store/*`

- Ensure store actions remain thin wrappers around engine operations.
- Check persistence versioning if serialized shape changes.
- Check UI callers for action signature changes.

## Logging And Diagnostics

Keep debug output intentional.

- Do not leave noisy unconditional `console.log` calls in production paths.
- Gate temporary diagnostics behind a dev-only flag or remove them before finishing.
- Unconditional logs are acceptable for real errors or permanent user-facing diagnostics.
- Prefer concise, structured messages that identify the feature area and relevant IDs without dumping full state.
