# Plan: Archive Previous Session & Create Test Specs

## Context

The `deep-factor-cli` package (SPEC-01 through SPEC-08) is fully implemented with 10/10 tests passing. The `deep-factor-agent` library has 129/129 tests passing. However, the CLI package has significant test coverage gaps — 7 source files have zero test coverage, and 2 have only partial coverage. The agent library has 5 minor issues (dead code, missing pricing, edge cases). This plan archives the completed CLI implementation phase and creates specs for a comprehensive testing phase.

---

## Step 0: Configure env file for validation

Symlink `~/.env/deep-factor-agent/.env` to the project root so `dotenv/config` can load `OPENAI_API_KEY` during validation runs.

```bash
ln -sf ~/.env/deep-factor-agent/.env /home/ryaneggz/sandbox/2026/feb/deep-factor-agent/.env
```

The `.gitignore` already has `packages/*/.env` but does not ignore the root `.env`. Add `.env` to root `.gitignore` to prevent accidental commits.

Also ensure the CLI package can access the key for end-to-end validation by symlinking into its directory:

```bash
ln -sf ~/.env/deep-factor-agent/.env /home/ryaneggz/sandbox/2026/feb/deep-factor-agent/packages/deep-factor-cli/.env
```

**Acceptance:** `node -e "require('dotenv/config'); console.log(!!process.env.OPENAI_API_KEY)"` prints `true` from both the root and CLI package directories.

---

## Step 1: Archive the previous session

Run the `.ralph/archive.sh` script to move the current implementation plan and specs into `archive/0006-*/`.

```bash
cd /home/ryaneggz/sandbox/2026/feb/deep-factor-agent/.ralph && bash archive.sh --yes
```

This will:
- Move `IMPLEMENTATION_PLAN.md` → `archive/0006-<name>/IMPLEMENTATION_PLAN.md`
- Move `specs/*.md` (8 files) → `archive/0006-<name>/specs/`
- Clear `logs/` (keep `.gitkeep`)
- Write a fresh blank `IMPLEMENTATION_PLAN.md` template

---

## Step 2: Create 6 test spec files in `.ralph/specs/`

### SPEC-01: `test-01-coverage-infra.md` — Coverage Infrastructure

**Goal:** Add `@vitest/coverage-v8` to both packages so `vitest run --coverage` works.

**Files to modify:**
- `packages/deep-factor-agent/package.json` — add `@vitest/coverage-v8` devDep + `"coverage"` script
- `packages/deep-factor-cli/package.json` — same
- `packages/deep-factor-agent/vitest.config.ts` — add `coverage` block (`provider: "v8"`, `include: ["src/**/*.ts"]`, `reporter: ["text", "lcov"]`)
- `packages/deep-factor-cli/vitest.config.ts` — same pattern for `*.{ts,tsx}`
- `.gitignore` — ensure `coverage/` is ignored

**Acceptance:** `pnpm -C packages/deep-factor-agent coverage` and `pnpm -C packages/deep-factor-cli coverage` both print text tables. No existing tests break.

---

### SPEC-02: `test-02-use-agent-hook.md` — useAgent Hook Tests (Highest Priority)

**Goal:** Full unit test coverage for `packages/deep-factor-cli/src/hooks/useAgent.ts` — the state machine bridging agent library to React UI.

**File to create:** `packages/deep-factor-cli/__tests__/hooks/useAgent.test.ts`

**Prerequisite change:** Export `eventsToChatMessages` from `useAgent.ts` for direct unit testing.

**Mock strategy:** `vi.mock("deep-factor-agent", ...)` with controllable `createDeepFactorAgent`, `isPendingResult`, `maxIterations`, `requestHumanInput`. Test hook via thin Ink wrapper component + `ink-testing-library`.

**Test cases (~25):**
- `eventsToChatMessages`: converts user/assistant/tool_call/tool_result events, skips system/error/summary events, preserves order, empty array
- Initial state: status=idle, empty messages, zero usage, null error/humanInputRequest
- `sendPrompt()`: sets running, calls createDeepFactorAgent with correct params, includes requestHumanInput in tools, handles AgentResult→done, PendingResult→pending_input, Error→error, non-Error→wrapped Error
- `submitHumanInput()`: no-op without pending, sets running, calls resume, handles result/error

---

### SPEC-03: `test-03-component-tests.md` — Component Tests

**Goal:** Unit test 4 untested components + extend Chat tests.

**Files to create:**
- `__tests__/components/ToolCall.test.tsx` — 9 tests: renders name/args, truncates strings >120 chars, preserves short values, handles empty/multi-key args
- `__tests__/components/Spinner.test.tsx` — 7 tests: "Thinking" text, dot cycling (1→2→3→1) via `vi.useFakeTimers()`, cleanup on unmount
- `__tests__/components/HumanInput.test.tsx` — 16 tests: renders question/choices, appends chars, backspace/delete, ignores ctrl/meta, submits non-empty on Enter, clears after submit
- `__tests__/components/PromptInput.test.tsx` — 10 tests: renders "> " prefix, same keyboard logic as HumanInput

**File to modify:** `__tests__/components/Chat.test.tsx` — add 3 tests: tool_result with verbose=true, truncation at 200 chars

**Key notes:** Use `stdin.write("\r")` for Enter key. Fake timers for Spinner. No mocks needed — pure prop-driven components.

---

### SPEC-04: `test-04-bash-tool.md` — Bash Tool Tests

**Goal:** Test `packages/deep-factor-cli/src/tools/bash.ts` with mocked `child_process`.

**File to create:** `packages/deep-factor-cli/__tests__/tools/bash.test.ts`

**Mock strategy:** `vi.mock("child_process", () => ({ execSync: vi.fn() }))` before imports.

**Test cases (14):**
- Metadata: name="bash", description, schema has "command" field
- Success: calls execSync with command, passes `encoding: "utf8"`, `timeout: 30_000`, `maxBuffer: 1048576`, returns stdout
- Errors: throws on non-zero exit, propagates error message, timeout error, maxBuffer error

---

### SPEC-05: `test-05-app-integration.md` — Extended App Integration Tests

**Goal:** Expand `app.test.tsx` from 2 to ~18 tests covering all UI states.

**File to modify:** `packages/deep-factor-cli/__tests__/app.test.tsx`

**New test groups:**
- Interactive mode: PromptInput visible at idle, re-appears after completion, no auto-exit
- Pending input: HumanInput rendered with question text when status=pending_input
- Error state: red error message, exits in single-prompt mode
- enableBash flag: bashTool included/excluded in tools
- Spinner: visible during running, hidden at idle/done

**Depends on:** Understanding from SPEC-02 to write correct mocks.

---

### SPEC-06: `test-06-agent-fixes.md` — Agent Package Minor Fixes

**Goal:** Address 4 known issues in `packages/deep-factor-agent`.

**Changes:**

| Fix | File | Action |
|-----|------|--------|
| Remove dead `isPendingHumanInput()` | `src/agent.ts` (lines 237-245) | Delete method |
| Add Claude 4.6 pricing | `src/stop-conditions.ts` | Add `claude-sonnet-4-6` + `claude-opus-4-6` entries |
| Document `interruptOn` edge case | `__tests__/agent.test.ts` | Add 2 tests: mixed tool responses with interrupt |
| Fix conditional assertion | `__tests__/agent.test.ts` | Replace `if (systemMessages.length > 0)` with `expect(...).toBeGreaterThan(0)` |

**New tests:** 4 pricing tests in `stop-conditions.test.ts`, 2 interruptOn tests in `agent.test.ts`, 1 assertion fix.

---

## Step 3: Write initial `IMPLEMENTATION_PLAN.md`

After creating specs, populate the fresh `IMPLEMENTATION_PLAN.md` with the testing phase summary, listing all 6 specs as pending work items.

---

## Execution Order

1. **SPEC-01** (coverage infra) — enables measurement
2. **SPEC-06** (agent fixes) — clean foundation first
3. **SPEC-02** (useAgent hook) — highest value gap
4. **SPEC-03** (components) — parallelizable with SPEC-02
5. **SPEC-04** (bash tool) — isolated, mechanical
6. **SPEC-05** (app integration) — depends on SPEC-02 patterns

## Verification

After all specs are implemented:
- `OPENAI_API_KEY` is available via `.env` symlink from `~/.env/deep-factor-agent/.env`
- `pnpm -r test` — all tests pass (unit tests use mocks, no API calls)
- `pnpm -r type-check` — no type errors
- `pnpm -C packages/deep-factor-cli coverage` — coverage report shows improvement
- `pnpm -C packages/deep-factor-agent coverage` — coverage report baseline
- End-to-end validation: `node packages/deep-factor-cli/dist/cli.js "say hello"` completes with `OPENAI_API_KEY` loaded
