# Plan: Complexity Reduction Iteration

## Context

The prior complexity audit (2026-03-14) ranked 56 files and recommended 5 refactoring patterns. Two have already been applied (Pattern 2: `buildOutcome`/`emitToolResult` in agent.ts, Pattern 4 partial: `eventsToChatMessages` extracted to `events-to-messages.ts`). Three patterns remain. This iteration applies them — one atomic commit per pattern, validated after each.

**Baseline:** 440 tests (351 agent + 89 TUI), all passing. Build and type-check green.

---

## Commit 1: Extract `executeToolSteps()` and `evaluateIterationResult()` from `runLoop()`

**File:** `packages/deep-factor-agent/src/agent.ts` (1632 lines, composite 86.6 — #1 hotspot)

**Problem:** `runLoop()` is 616 lines (lines 984–1599) handling 7+ concerns inline with 8-level nesting.

**Changes:**

1. **Add interfaces** near existing internal types (around line 155):
   - `ToolStepParams` — inputs for the tool-calling loop (modelWithTools, messages, toolMap, thread, iteration, consecutiveErrors, dedup Sets)
   - `ToolStepResult` — outputs (pendingRequest, lastAIResponse, stepCount, iterationUsage, liveErrorMessage)
   - `IterationEvalParams` — inputs for post-iteration eval (thread, totalUsage, iteration, lastResponse, parsedPlan, pendingRequest, prompt, emittedPlanContents)

2. **Extract `private async executeToolSteps(params: ToolStepParams): Promise<ToolStepResult>`**
   - Cuts lines ~1042–1334 (inner tool-calling while-loop) into a new private method
   - Reconstructs the helper closures (`appendToolCallIfNew`, `appendAssistantOrPlanEvent`, `currentUsageSnapshot`) internally using `this` + passed params
   - Returns structured result instead of mutating outer-scope locals

3. **Extract `private async evaluateIterationResult(params: IterationEvalParams): Promise<AgentResult | PendingResult | PlanResult | null>`**
   - Cuts lines ~1378–1543 (stop conditions, pending requests, verification, plan mode, normal completion)
   - Returns result or `null` (meaning "continue the outer loop")
   - When verification fails: injects feedback message, returns `null`
   - When plan mode needs retry: returns `null`

4. **Rewrite `runLoop()` as ~80-line orchestrator:**
   - Init (model, usage, iteration, tools)
   - While-loop: middleware hooks → context management → build messages → `executeToolSteps()` → extract response text → parse plan → accumulate usage → middleware afterIteration → `evaluateIterationResult()` → return or continue
   - Error recovery try-catch stays inline in runLoop

**Expected impact:** runLoop: 616 → ~80 lines. CC ~-40%, cognitive ~-55%.

**Validate:**
```bash
pnpm -C packages/deep-factor-agent build && pnpm -C packages/deep-factor-agent type-check && pnpm -C packages/deep-factor-agent test
```

---

## Commit 2: Extract handler map from `processStreamLine` in claude-cli.ts

**File:** `packages/deep-factor-agent/src/providers/claude-cli.ts` (802 lines, composite 47.2 — #2 hotspot)

**Problem:** `processStreamLine` uses sequential if-statements to dispatch 5 event types. No handler map.

**Changes:**

1. **Define handler type and 4 named handler functions** inside the `createClaudeCliProvider` closure:
   - `handleAssistantEvent` — processes content blocks, delegates to existing `addAssistantText`/`addToolCallFromBlock`
   - `handleStreamEvent` — captures partial text
   - `handleResultEvent` — final result with error checking
   - `handleErrorEvent` — stream-level errors
   - `const streamHandlers: Record<string, StreamLineHandler>` — dispatch map

2. **Rewrite `processStreamLine`:**
   - JSON parsing stays at top (unchanged)
   - Common metadata extraction stays at top (session_id, model, stop_reason, permission_denials)
   - Usage normalization + `emitUsage` closure stays at top
   - Replace sequential if-blocks with: `if (type && streamHandlers[type]) { streamHandlers[type](event, state, onUpdate, emitUsage, rawStopReason); return; }`
   - Default fallthrough: `emitUsage()` (unchanged behavior)

**Expected impact:** CC ~-35%, cognitive ~-40%. Each handler is independently testable.

**Validate:**
```bash
pnpm -C packages/deep-factor-agent build && pnpm -C packages/deep-factor-agent type-check && pnpm -C packages/deep-factor-agent test
```

---

## Commit 3: Extract `writeStatusEntry` and `persistMessageLog` from `handleResult` in useAgent.ts

**File:** `packages/deep-factor-tui/src/hooks/useAgent.ts` (515 lines, composite 43.7 — #3 hotspot)

**Problem:** `handleResult()` is 165 lines with 4 nearly-identical `appendUnifiedSession({ type: "status" })` blocks and duplicated message logging.

**Changes:**

1. **Extract `writeStatusEntry(ctx, status, usage, iterations)`** — module-level pure function replacing the 4 duplicated status blocks

2. **Extract `persistMessageLog(newMessages, alreadyLogged, ctx, options)`** — module-level function encapsulating the message logging loop (lines ~137–184). Returns new logged count.

3. **Extract `writeResultEntry(result, ctx, usageBase, sessionStart)`** — module-level function encapsulating result entry logic (lines ~186–219)

4. **Rewrite `handleResult`** using the three helpers: ~165 → ~70 lines

**Expected impact:** CC ~-20%, cognitive ~-25%. Eliminates the only code duplication in the codebase.

**Validate:**
```bash
pnpm -C packages/deep-factor-tui build && pnpm -C packages/deep-factor-tui type-check && pnpm -C packages/deep-factor-tui test
```

---

## Execution Order

1. Commit 1 (agent.ts — highest impact)
2. Commit 2 (claude-cli.ts — second-highest)
3. Commit 3 (useAgent.ts — deduplication)

All three touch different files in different packages — no interaction risk.

## Final Validation

After all 3 commits:
```bash
pnpm -r build && pnpm -r type-check && pnpm -r test
```
- Test count >= 440
- Pass rate = 100%
- Build and type-check green

## Critical Files

| File | Action | Commit |
|------|--------|--------|
| `packages/deep-factor-agent/src/agent.ts` | Extract 2 methods from runLoop | 1 |
| `packages/deep-factor-agent/src/providers/claude-cli.ts` | Handler map for processStreamLine | 2 |
| `packages/deep-factor-tui/src/hooks/useAgent.ts` | Extract 3 helpers from handleResult | 3 |
| `packages/deep-factor-agent/src/types.ts` | Reference only (no changes) | — |

## Risk

All LOW. Private/internal method extractions only. No public API changes. 440 tests covering all affected code paths.
