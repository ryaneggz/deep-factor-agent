# IMPLEMENTATION PLAN -- deep-factor-agent

> A TypeScript library implementing a loop-based AI agent with middleware, verification, stop conditions, and 12-factor compliance.
>
> **Stack**: TypeScript 5.x, Vercel AI SDK v6+, Zod v4+ (peer dep), Vitest, pnpm, ESM only
>
> **Status Legend**: All items are marked with their current status.

---

## PRIORITY TIER 1 -- Project Initialization (SPEC-01: US-01)

_No dependencies. Must be completed first before any code can be written._

- [x] **1.1** Create `package.json` via `pnpm init`
  - **Spec**: SPEC-01 (US-01)
  - **File**: `package.json`
  - **Details**:
    - Set `name` to `deep-factor-agent`
    - Set `type` to `module` (ESM only)
    - Configure `exports` map: `{ ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } }`
    - Set `main` to `./dist/index.js` and `types` to `./dist/index.d.ts`
  - **Status**: DONE

- [x] **1.2** Install production dependencies
  - **Spec**: SPEC-01 (US-01)
  - **File**: `package.json`
  - **Details**:
    - `pnpm add ai @ai-sdk/provider-utils`
    - `ai` must be v6+ (Vercel AI SDK)
  - **Status**: DONE

- [x] **1.3** Install dev dependencies
  - **Spec**: SPEC-01 (US-01)
  - **File**: `package.json`
  - **Details**:
    - `pnpm add -D typescript vitest @types/node`
  - **Status**: DONE

- [x] **1.4** Add `zod` v4+ as a peer dependency
  - **Spec**: SPEC-01 (US-01)
  - **File**: `package.json`
  - **Details**:
    - Add `"zod": ">=4.0.0"` to `peerDependencies`
    - Also install as dev dependency for local testing: `pnpm add -D zod@4`
  - **Status**: DONE

- [x] **1.5** Create `tsconfig.json`
  - **Spec**: SPEC-01 (US-01)
  - **File**: `tsconfig.json`
  - **Details**:
    - `target`: `ES2022`
    - `module`: `ESNext`
    - `moduleResolution`: `bundler` or `nodenext`
    - `strict`: `true`
    - `declaration`: `true`
    - `declarationMap`: `true`
    - `outDir`: `./dist`
    - `rootDir`: `./src`
    - `include`: `["src"]`
    - `exclude`: `["node_modules", "dist", "**/*.test.ts"]`
  - **Status**: DONE

- [x] **1.6** Define npm scripts in `package.json`
  - **Spec**: SPEC-01 (US-01)
  - **File**: `package.json`
  - **Details**:
    - `build`: `tsc`
    - `dev`: `tsc --watch`
    - `test`: `vitest run`
    - `test:watch`: `vitest`
    - `type-check`: `tsc --noEmit`
  - **Status**: DONE

- [x] **1.7** Create `src/` directory and `src/index.ts` barrel export
  - **Spec**: SPEC-01 (US-01)
  - **File**: `src/index.ts`
  - **Details**:
    - Initial placeholder: `export {};` (or a comment indicating barrel exports will be added)
    - Will be updated as each module is implemented
  - **Status**: DONE

- [x] **1.8** Create `.gitignore`
  - **Spec**: SPEC-01 (US-01)
  - **File**: `.gitignore`
  - **Details**:
    - Must include: `node_modules/`, `dist/`, `.env`, `*.tsbuildinfo`
  - **Status**: DONE

- [x] **1.9** Create `vitest.config.ts`
  - **Spec**: SPEC-01 (US-01)
  - **File**: `vitest.config.ts`
  - **Details**:
    - Configure for ESM + TypeScript
    - Set `test.include` to `["src/**/*.test.ts"]`
  - **Status**: DONE

- [x] **1.10** Verify project builds and type-checks
  - **Spec**: SPEC-01 (US-01)
  - **Files**: N/A (validation step)
  - **Details**:
    - Run `pnpm build` -- must succeed with zero errors
    - Run `pnpm type-check` -- must succeed with zero errors
    - Run `pnpm test` -- must succeed (no tests yet, but should not error)
  - **Status**: DONE

---

## PRIORITY TIER 2 -- Core Types & Interfaces (SPEC-02: US-02)

_Depends on: Tier 1 (project initialized, dependencies installed). All subsequent tiers depend on these types._

- [x] **2.1** Define `AgentEvent` discriminated union and all event subtypes
  - **Spec**: SPEC-02 (US-02)
  - **File**: `src/types.ts`
  - **Details**:
    - Define `AgentEventType` string literal union: `"tool_call" | "tool_result" | "error" | "human_input_requested" | "human_input_received" | "message" | "completion" | "summary"`
    - Define `BaseEvent` interface with `type: AgentEventType`, `timestamp: number`, `iteration: number`
    - Define `ToolCallEvent extends BaseEvent` with `type: "tool_call"`, `toolName: string`, `toolCallId: string`, `args: Record<string, unknown>`
    - Define `ToolResultEvent extends BaseEvent` with `type: "tool_result"`, `toolCallId: string`, `result: unknown`
    - Define `ErrorEvent extends BaseEvent` with `type: "error"`, `error: string`, `toolCallId?: string`, `recoverable: boolean`
    - Define `HumanInputRequestedEvent extends BaseEvent` with `type: "human_input_requested"`, `question: string`, `context?: string`, `urgency?: "low" | "medium" | "high"`, `format?: "free_text" | "yes_no" | "multiple_choice"`, `choices?: string[]`
    - Define `HumanInputReceivedEvent extends BaseEvent` with `type: "human_input_received"`, `response: string`
    - Define `MessageEvent extends BaseEvent` with `type: "message"`, `role: "user" | "assistant" | "system"`, `content: string`
    - Define `CompletionEvent extends BaseEvent` with `type: "completion"`, `result: string`, `verified: boolean`
    - Define `SummaryEvent extends BaseEvent` with `type: "summary"`, `summarizedIterations: number[]`, `summary: string`
    - Define `AgentEvent` as union of all event types
  - **Status**: DONE

- [x] **2.2** Define `AgentThread` type
  - **Spec**: SPEC-02 (US-02)
  - **File**: `src/types.ts`
  - **Details**:
    - `id: string`
    - `events: AgentEvent[]`
    - `metadata: Record<string, unknown>`
    - `createdAt: number`
    - `updatedAt: number`
  - **Status**: DONE

- [x] **2.3** Define `TokenUsage` type
  - **Spec**: SPEC-02 (US-02)
  - **File**: `src/types.ts`
  - **Details**:
    - `inputTokens: number`
    - `outputTokens: number`
    - `totalTokens: number`
    - `cacheReadTokens?: number`
    - `cacheWriteTokens?: number`
  - **Status**: DONE

- [x] **2.4** Define `StopCondition`, `StopConditionContext`, and `StopConditionResult` types
  - **Spec**: SPEC-02 (US-02)
  - **File**: `src/types.ts`
  - **Details**:
    - `StopConditionContext`: `{ iteration: number; usage: TokenUsage; model: string; thread: AgentThread }`
    - `StopConditionResult`: `{ stop: boolean; reason?: string }`
    - `StopCondition`: `(ctx: StopConditionContext) => StopConditionResult`
  - **Status**: DONE

- [x] **2.5** Define `VerifyCompletion`, `VerifyContext`, and `VerifyResult` types
  - **Spec**: SPEC-02 (US-02)
  - **File**: `src/types.ts`
  - **Details**:
    - `VerifyContext`: `{ result: unknown; iteration: number; thread: AgentThread; originalPrompt: string }`
    - `VerifyResult`: `{ complete: boolean; reason?: string }`
    - `VerifyCompletion`: `(ctx: VerifyContext) => Promise<VerifyResult>`
  - **Status**: DONE

- [x] **2.6** Define `AgentMiddleware` and `MiddlewareContext` types
  - **Spec**: SPEC-02 (US-02)
  - **File**: `src/types.ts`
  - **Details**:
    - `MiddlewareContext`: `{ thread: AgentThread; iteration: number; settings: DeepFactorAgentSettings }`
    - `AgentMiddleware`: `{ name: string; tools?: ToolSet; beforeIteration?: (ctx: MiddlewareContext) => Promise<void>; afterIteration?: (ctx: MiddlewareContext, result: unknown) => Promise<void> }`
    - Import `ToolSet` from Vercel AI SDK
  - **Status**: DONE

- [x] **2.7** Define `DeepFactorAgentSettings` type
  - **Spec**: SPEC-02 (US-02)
  - **File**: `src/types.ts`
  - **Details**:
    - Generic: `<TTools extends ToolSet = ToolSet>`
    - `model: LanguageModel | string`
    - `tools?: TTools`
    - `instructions?: string`
    - `stopWhen?: StopCondition | StopCondition[]`
    - `verifyCompletion?: VerifyCompletion`
    - `middleware?: AgentMiddleware[]`
    - `interruptOn?: string[]`
    - `contextManagement?: ContextManagementConfig`
    - `onIterationStart?: (iteration: number) => void`
    - `onIterationEnd?: (iteration: number, result: unknown) => void`
    - Import `LanguageModel` from Vercel AI SDK
  - **Status**: DONE

- [x] **2.8** Define `AgentResult` and `PendingResult` types
  - **Spec**: SPEC-02 (US-02)
  - **File**: `src/types.ts`
  - **Details**:
    - `AgentResult`: `{ response: string; thread: AgentThread; usage: TokenUsage; iterations: number; stopReason: "completed" | "stop_condition" | "max_errors" | "human_input_needed"; stopDetail?: string }`
    - `PendingResult extends AgentResult`: `{ stopReason: "human_input_needed"; resume: (humanResponse: string) => Promise<AgentResult> }`
  - **Status**: DONE

- [x] **2.9** Define `ContextManagementConfig` type
  - **Spec**: SPEC-02 (US-02)
  - **File**: `src/types.ts`
  - **Details**:
    - `maxContextTokens?: number` (default 150000)
    - `keepRecentIterations?: number` (default 3)
  - **Status**: DONE

- [x] **2.10** Export all types from `src/index.ts`
  - **Spec**: SPEC-02 (US-02)
  - **File**: `src/index.ts`
  - **Details**:
    - Re-export all types using `export type { ... } from "./types.js"`
    - Types must use Vercel AI SDK's `LanguageModel` and `ToolSet` types where applicable
  - **Status**: DONE

- [x] **2.11** Verify types compile without errors
  - **Spec**: SPEC-02 (US-02)
  - **Files**: N/A (validation step)
  - **Details**:
    - Run `pnpm type-check` -- must pass with zero errors
    - No runtime dependencies added (types only in this tier)
  - **Status**: DONE

---

## PRIORITY TIER 3 -- Stop Conditions (SPEC-03: US-03)

_Depends on: Tier 2 (StopCondition, StopConditionContext, TokenUsage types)._

- [x] **3.1** Implement `MODEL_PRICING` map
  - **Spec**: SPEC-03 (US-03)
  - **File**: `src/stop-conditions.ts`
  - **Details**:
    - Type: `Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }>`
    - Must include pricing for at minimum:
      - `claude-sonnet-4-5`, `claude-opus-4-5`, `claude-haiku-4-5`
      - `gpt-4o`, `gpt-4o-mini`
      - `gemini-2.5-pro`, `gemini-2.5-flash`
    - Prices in cost-per-token (e.g., input $3.00/1M tokens = 0.000003 per token)
  - **Status**: DONE

- [x] **3.2** Implement `calculateCost(usage, model)` utility
  - **Spec**: SPEC-03 (US-03)
  - **File**: `src/stop-conditions.ts`
  - **Details**:
    - Accepts `TokenUsage` and model string
    - Looks up model in `MODEL_PRICING`
    - Calculates: `(inputTokens * input_price) + (outputTokens * output_price)`
    - Must handle cache tokens when present (cacheReadTokens, cacheWriteTokens)
    - Returns 0 if model not found in pricing map (graceful fallback)
  - **Status**: DONE

- [x] **3.3** Implement `maxIterations(n)` factory function
  - **Spec**: SPEC-03 (US-03)
  - **File**: `src/stop-conditions.ts`
  - **Details**:
    - Returns a `StopCondition` function
    - Stops when `ctx.iteration >= n`
    - Returns `{ stop: true, reason: "Max iterations (N) reached" }` when triggered
    - Returns `{ stop: false }` otherwise
  - **Status**: DONE

- [x] **3.4** Implement `maxTokens(n)` factory function
  - **Spec**: SPEC-03 (US-03)
  - **File**: `src/stop-conditions.ts`
  - **Details**:
    - Stops when `ctx.usage.totalTokens >= n`
    - Returns descriptive reason in the result
  - **Status**: DONE

- [x] **3.5** Implement `maxInputTokens(n)` factory function
  - **Spec**: SPEC-03 (US-03)
  - **File**: `src/stop-conditions.ts`
  - **Details**:
    - Stops when `ctx.usage.inputTokens >= n`
  - **Status**: DONE

- [x] **3.6** Implement `maxOutputTokens(n)` factory function
  - **Spec**: SPEC-03 (US-03)
  - **File**: `src/stop-conditions.ts`
  - **Details**:
    - Stops when `ctx.usage.outputTokens >= n`
  - **Status**: DONE

- [x] **3.7** Implement `maxCost(dollars, model?)` factory function
  - **Spec**: SPEC-03 (US-03)
  - **File**: `src/stop-conditions.ts`
  - **Details**:
    - Uses `calculateCost()` to determine current cost
    - If `model` is passed to factory, uses that; otherwise uses `ctx.model` from the context
    - Stops when calculated cost >= `dollars`
  - **Status**: DONE

- [x] **3.8** Implement `evaluateStopConditions(conditions, ctx)` utility
  - **Spec**: SPEC-03 (US-03)
  - **File**: `src/stop-conditions.ts`
  - **Details**:
    - Accepts array of `StopCondition` functions and a `StopConditionContext`
    - Evaluates each condition in order
    - Returns the first `StopConditionResult` where `stop: true` (OR semantics)
    - Returns `null` when no condition triggers
  - **Status**: DONE

- [x] **3.9** Export stop conditions from `src/index.ts`
  - **Spec**: SPEC-03 (US-03)
  - **File**: `src/index.ts`
  - **Details**:
    - Export: `maxIterations`, `maxTokens`, `maxInputTokens`, `maxOutputTokens`, `maxCost`, `calculateCost`, `MODEL_PRICING`, `evaluateStopConditions`
  - **Status**: DONE

- [x] **3.10** Write unit tests for stop conditions
  - **Spec**: SPEC-03 (US-03)
  - **File**: `src/stop-conditions.test.ts`
  - **Details**:
    - Test `maxIterations(3)` stops on iteration 3, does not stop on iterations 1-2
    - Test `maxTokens(1000)` stops when `usage.totalTokens >= 1000`
    - Test `maxInputTokens(n)` and `maxOutputTokens(n)` individually
    - Test `maxCost(0.50)` stops when calculated cost >= $0.50
    - Test `calculateCost` correctly computes with and without cache tokens
    - Test `calculateCost` returns 0 for unknown models
    - Test `evaluateStopConditions` returns `null` when no condition triggers
    - Test `evaluateStopConditions` returns the first triggered result (OR semantics)
    - Test composability: array of conditions with OR semantics
    - All tests must pass: `pnpm test`
  - **Status**: DONE

---

## PRIORITY TIER 4A -- Agent Loop / Core Engine (SPEC-04: US-04)

_Depends on: Tier 2 (types), Tier 3 (stop conditions). Can be built in parallel with Tiers 4B and 4C._

- [x] **4A.1** Create `DeepFactorAgent` class with constructor
  - **Spec**: SPEC-04 (US-04)
  - **File**: `src/agent.ts`
  - **Details**:
    - Constructor accepts `DeepFactorAgentSettings`
    - Stores resolved model, tools, instructions, stop conditions, middleware, verification function
    - Normalizes `stopWhen` from single condition or array into array
    - Creates internal helper to create fresh `AgentThread` with unique `id`, empty events, timestamps
  - **Status**: DONE

- [x] **4A.2** Implement `buildMessages(thread)` helper
  - **Spec**: SPEC-04 (US-04)
  - **File**: `src/agent.ts`
  - **Details**:
    - Converts the `AgentThread` events into Vercel AI SDK message format
    - System instructions injected as system message
    - Maps `MessageEvent`, `ToolCallEvent`, `ToolResultEvent` to SDK message types
    - Context summaries injected from context manager
    - Stateless reducer: reads full thread to determine next action (Factor 12)
  - **Status**: DONE

- [x] **4A.3** Implement `loop(prompt)` method -- outer verification loop
  - **Spec**: SPEC-04 (US-04)
  - **File**: `src/agent.ts`
  - **Details**:
    - Creates new `AgentThread`, pushes initial user `MessageEvent`
    - Enters `while (true)` loop, incrementing `iteration` counter
    - Calls `onIterationStart` callback if provided
    - Runs `beforeIteration` hooks from composed middleware
    - Calls `generateText()` from Vercel AI SDK with `{ model, tools: allTools, messages, maxSteps: 20 }`
    - Appends tool call events, tool result events, and assistant message events to thread
    - Aggregates `TokenUsage` across iterations using `addUsage()` helper
    - Resets `consecutiveErrors` to 0 on success
    - On error: increments `consecutiveErrors`, appends `ErrorEvent`, continues (retry)
    - If `consecutiveErrors >= 3`: returns `AgentResult` with `stopReason: "max_errors"`
    - Runs `afterIteration` hooks from composed middleware
    - Calls `onIterationEnd` callback if provided
    - Evaluates stop conditions via `evaluateStopConditions()`; if triggered, returns with `stopReason: "stop_condition"`
    - Checks for pending human input; if found, returns `PendingResult` with `resume()` function
    - Calls `verifyCompletion()` if provided; on `{ complete: true }`, returns with `stopReason: "completed"`
    - On verification failure with reason, injects feedback message into thread for next iteration
    - Without `verifyCompletion`, returns after single iteration with `stopReason: "completed"`
    - Result includes: `response`, `thread`, `usage`, `iterations`, `stopReason`, `stopDetail`
  - **Status**: DONE

- [x] **4A.4** Implement `stream(prompt)` method
  - **Spec**: SPEC-04 (US-04)
  - **File**: `src/agent.ts`
  - **Details**:
    - Uses `streamText()` from Vercel AI SDK on the final iteration
    - For non-final iterations, uses `generateText()` as in `loop()`
    - Returns a streaming result object
  - **Status**: DONE

- [x] **4A.5** Implement `appendResultEvents(thread, result, iteration)` helper
  - **Spec**: SPEC-04 (US-04)
  - **File**: `src/agent.ts`
  - **Details**:
    - Extracts tool calls from `generateText` result and creates `ToolCallEvent` for each
    - Extracts tool results and creates `ToolResultEvent` for each
    - Creates `MessageEvent` for assistant text response
    - Creates `CompletionEvent` when iteration completes
    - All events include `timestamp` and `iteration` number
    - Updates `thread.updatedAt`
  - **Status**: DONE

- [x] **4A.6** Implement `addUsage()` token aggregation helper
  - **Spec**: SPEC-04 (US-04)
  - **File**: `src/agent.ts`
  - **Details**:
    - Merges two `TokenUsage` objects by summing all fields
    - Handles optional cache token fields
  - **Status**: DONE

- [x] **4A.7** Implement error handling with consecutive error counter
  - **Spec**: SPEC-04 (US-04)
  - **File**: `src/agent.ts`
  - **Details**:
    - `try/catch` around `generateText()` call
    - On error: create `ErrorEvent` with compact error message (max 500 chars), `recoverable: true` initially
    - Increment `consecutiveErrors`; if >= 3, set `recoverable: false` on last error and exit loop
    - Compact error formatting per Factor 9
  - **Status**: DONE

- [x] **4A.8** Export `DeepFactorAgent` from `src/index.ts`
  - **Spec**: SPEC-04 (US-04)
  - **File**: `src/index.ts`
  - **Details**:
    - `export { DeepFactorAgent } from "./agent.js"`
  - **Status**: DONE

- [x] **4A.9** Write unit tests for agent loop
  - **Spec**: SPEC-04 (US-04)
  - **File**: `src/agent.test.ts`
  - **Details**:
    - Mock Vercel AI SDK `generateText` and `streamText`
    - Test: single iteration success -- returns `AgentResult` with `stopReason: "completed"`
    - Test: multi-iteration with verification feedback -- verifier rejects first, accepts second
    - Test: error recovery -- one error, then success on retry, `consecutiveErrors` resets
    - Test: max consecutive errors (3) -- exits with `stopReason: "max_errors"`
    - Test: stop condition triggered -- `maxIterations` causes early exit
    - Test: no verifyCompletion -- single iteration mode
    - Test: tool calls and results are recorded as events in thread
    - Test: token usage is aggregated across iterations
    - Test: thread is included in result
    - Test: `onIterationStart` and `onIterationEnd` callbacks are invoked
    - All tests must pass: `pnpm test`
  - **Status**: DONE

---

## PRIORITY TIER 4B -- Middleware System (SPEC-05: US-05)

_Depends on: Tier 2 (AgentMiddleware, MiddlewareContext types). Can be built in parallel with Tiers 4A and 4C._

- [x] **4B.1** Implement `composeMiddleware(middlewares)` function
  - **Spec**: SPEC-05 (US-05)
  - **File**: `src/middleware.ts`
  - **Details**:
    - Accepts array of `AgentMiddleware`
    - Merges `tools` from all middleware: later middleware wins on name conflicts (log a `console.warn` on conflict)
    - Chains `beforeIteration` hooks: execute in array order
    - Chains `afterIteration` hooks: execute in array order
    - Returns `{ tools: ToolSet; beforeIteration: (ctx) => Promise<void>; afterIteration: (ctx, result) => Promise<void> }`
  - **Status**: DONE

- [x] **4B.2** Implement `todoMiddleware()` factory
  - **Spec**: SPEC-05 (US-05)
  - **File**: `src/middleware.ts`
  - **Details**:
    - Returns an `AgentMiddleware` with `name: "todo"`
    - Provides two tools:
      - `write_todos`: accepts `{ todos: Array<{ id: string; text: string; status: "pending" | "in_progress" | "done" }> }`, stores in `thread.metadata.todos`
      - `read_todos`: accepts `{}`, returns current `thread.metadata.todos` array
    - Tools defined using Vercel AI SDK `tool()` with Zod schemas
    - Todos persisted in thread metadata for stateless access
  - **Status**: DONE

- [x] **4B.3** Implement `errorRecoveryMiddleware()` factory
  - **Spec**: SPEC-05 (US-05)
  - **File**: `src/middleware.ts`
  - **Details**:
    - Returns an `AgentMiddleware` with `name: "errorRecovery"`
    - `afterIteration` hook: checks if the last event in the thread is an `ErrorEvent`
    - If so, formats the error compactly (truncate stack traces to max 500 chars)
    - Appends a hint message: `"Consider an alternative approach if the same error occurs again."`
  - **Status**: DONE

- [x] **4B.4** Export middleware functions from `src/index.ts`
  - **Spec**: SPEC-05 (US-05)
  - **File**: `src/index.ts`
  - **Details**:
    - Export: `composeMiddleware`, `todoMiddleware`, `errorRecoveryMiddleware`
  - **Status**: DONE

- [x] **4B.5** Write unit tests for middleware system
  - **Spec**: SPEC-05 (US-05)
  - **File**: `src/middleware.test.ts`
  - **Details**:
    - Test `composeMiddleware` merges tools from multiple middleware
    - Test tool name conflicts: later middleware wins, warning is logged
    - Test `beforeIteration` hooks execute in order
    - Test `afterIteration` hooks execute in order
    - Test `todoMiddleware`: `write_todos` stores todos in `thread.metadata.todos`
    - Test `todoMiddleware`: `read_todos` returns the current todos from metadata
    - Test `errorRecoveryMiddleware`: formats errors compactly (truncation at 500 chars)
    - Test `errorRecoveryMiddleware`: appends recovery hint
    - Test custom middleware is appended after built-in middleware
    - All tests must pass: `pnpm test`
  - **Status**: DONE

---

## PRIORITY TIER 4C -- Context Management & Summarization (SPEC-08: US-08)

_Depends on: Tier 2 (ContextManagementConfig, SummaryEvent, AgentThread types). Can be built in parallel with Tiers 4A and 4B._

- [x] **4C.1** Implement `estimateTokens(text)` utility function
  - **Spec**: SPEC-08 (US-08)
  - **File**: `src/context-manager.ts`
  - **Details**:
    - Formula: `Math.ceil(text.length / 3.5)`
    - Exported for external use
  - **Status**: DONE

- [x] **4C.2** Implement `ContextManager` class constructor
  - **Spec**: SPEC-08 (US-08)
  - **File**: `src/context-manager.ts`
  - **Details**:
    - Accepts `ContextManagementConfig`
    - Applies defaults: `maxContextTokens = 150000`, `keepRecentIterations = 3`
  - **Status**: DONE

- [x] **4C.3** Implement `estimateThreadTokens(thread)` method
  - **Spec**: SPEC-08 (US-08)
  - **File**: `src/context-manager.ts`
  - **Details**:
    - Iterates all events in the thread
    - Serializes each event to string and runs `estimateTokens()` on it
    - Sums all token estimates and returns the total
  - **Status**: DONE

- [x] **4C.4** Implement `needsSummarization(thread)` method
  - **Spec**: SPEC-08 (US-08)
  - **File**: `src/context-manager.ts`
  - **Details**:
    - Returns `true` when `estimateThreadTokens(thread) > maxContextTokens`
    - Returns `false` otherwise
  - **Status**: DONE

- [x] **4C.5** Implement `summarize(thread, model)` method
  - **Spec**: SPEC-08 (US-08)
  - **File**: `src/context-manager.ts`
  - **Details**:
    - Groups events by their `iteration` field
    - Identifies old iterations (those beyond `keepRecentIterations` from the current max iteration)
    - For each old iteration, compresses its events into a 2-3 sentence `SummaryEvent`
    - Uses the provided `LanguageModel` to generate summaries via `generateText()`
    - Removes original events for summarized iterations from the thread
    - Inserts `SummaryEvent` entries with `summarizedIterations` array and `summary` text
    - Returns the modified thread
  - **Status**: DONE

- [x] **4C.6** Implement `buildContextInjection(thread)` method
  - **Spec**: SPEC-08 (US-08)
  - **File**: `src/context-manager.ts`
  - **Details**:
    - Finds all `SummaryEvent` entries in the thread
    - Produces a formatted string for system prompt injection
    - Format: header + each summary with its iteration range
    - Returns empty string if no summaries exist
  - **Status**: DONE

- [x] **4C.7** Export context management from `src/index.ts`
  - **Spec**: SPEC-08 (US-08)
  - **File**: `src/index.ts`
  - **Details**:
    - Export: `ContextManager`, `estimateTokens`
  - **Status**: DONE

- [x] **4C.8** Write unit tests for context management
  - **Spec**: SPEC-08 (US-08)
  - **File**: `src/context-manager.test.ts`
  - **Details**:
    - Test `estimateTokens("hello")` returns `Math.ceil(5 / 3.5)` = 2
    - Test `estimateTokens` with empty string returns 0
    - Test `estimateTokens` with long text returns reasonable estimate
    - Test `estimateThreadTokens` sums token estimates across all events in a thread
    - Test `needsSummarization` returns `true` when estimated tokens exceed `maxContextTokens`
    - Test `needsSummarization` returns `false` when below threshold
    - Test `summarize` replaces old iteration events with `SummaryEvent` entries (mock the model)
    - Test `summarize` preserves recent iterations unchanged (per `keepRecentIterations`)
    - Test `buildContextInjection` produces formatted string of iteration summaries
    - Test `buildContextInjection` returns empty string when no summaries exist
    - All tests must pass: `pnpm test`
  - **Status**: DONE

---

## PRIORITY TIER 5 -- Factory Function & Barrel Exports (SPEC-06: US-06)

_Depends on: Tier 4A (DeepFactorAgent), Tier 4B (middleware), Tier 4C (ContextManager), Tier 3 (stop conditions)._

- [x] **5.1** Implement `createDeepFactorAgent(settings)` factory function
  - **Spec**: SPEC-06 (US-06)
  - **File**: `src/create-agent.ts`
  - **Details**:
    - Accepts `DeepFactorAgentSettings<TTools>`
    - Applies defaults for all optional settings:
      - `tools`: `{}` (empty object)
      - `instructions`: `""` (empty string)
      - `stopWhen`: `[maxIterations(10)]`
      - `verifyCompletion`: `undefined` (single iteration mode)
      - `middleware`: `[todoMiddleware(), errorRecoveryMiddleware()]`
      - `interruptOn`: `[]`
      - `contextManagement`: `{ maxContextTokens: 150000, keepRecentIterations: 3 }`
    - Instantiates and returns `DeepFactorAgent` with resolved settings
    - Generic type parameter preserves tool type safety
  - **Status**: DONE

- [x] **5.2** Finalize `src/index.ts` barrel exports
  - **Spec**: SPEC-06 (US-06)
  - **File**: `src/index.ts`
  - **Details**:
    - Primary export: `createDeepFactorAgent` from `./create-agent.js`
    - Types: `AgentEvent`, `AgentThread`, `AgentResult`, `PendingResult`, `TokenUsage`, `StopCondition`, `VerifyCompletion`, `AgentMiddleware`, `DeepFactorAgentSettings`, `ContextManagementConfig` (and all event subtypes) from `./types.js`
    - Stop conditions: `maxIterations`, `maxTokens`, `maxInputTokens`, `maxOutputTokens`, `maxCost`, `calculateCost`, `MODEL_PRICING`, `evaluateStopConditions` from `./stop-conditions.js`
    - Middleware: `composeMiddleware`, `todoMiddleware`, `errorRecoveryMiddleware` from `./middleware.js`
    - Agent class: `DeepFactorAgent` from `./agent.js`
    - Context management: `ContextManager`, `estimateTokens` from `./context-manager.js`
    - Human-in-the-loop (added in Tier 6): `requestHumanInput` from `./human-in-the-loop.js`
  - **Status**: DONE

- [x] **5.3** Verify `pnpm build` produces `dist/` with `.js` and `.d.ts` files
  - **Spec**: SPEC-06 (US-06)
  - **Files**: N/A (validation step)
  - **Details**:
    - Run `pnpm build`
    - Confirm `dist/index.js` and `dist/index.d.ts` exist
    - Confirm all module files have corresponding `.js` and `.d.ts` in `dist/`
  - **Status**: DONE

- [x] **5.4** Write integration tests for factory function
  - **Spec**: SPEC-06 (US-06)
  - **File**: `src/create-agent.test.ts`
  - **Details**:
    - Test `createDeepFactorAgent({ model: "..." })` returns a `DeepFactorAgent` instance
    - Test defaults are applied: stopWhen has maxIterations(10), middleware includes todoMiddleware and errorRecoveryMiddleware
    - Test returned agent has `.loop()` and `.stream()` methods
    - Test `.loop(prompt)` returns `AgentResult` with response, thread, usage, iterations (with mocked model)
    - Test `.stream(prompt)` returns a streaming result (with mocked model)
    - Test custom settings override defaults
    - Test all public types and functions are importable from barrel export
    - All tests must pass: `pnpm test`
  - **Status**: DONE

---

## PRIORITY TIER 6 -- Human-in-the-Loop (SPEC-07: US-07)

_Depends on: Tier 5 (factory function), Tier 4A (agent loop with pause/resume mechanism)._

- [x] **6.1** Define `requestHumanInput` tool
  - **Spec**: SPEC-07 (US-07)
  - **File**: `src/human-in-the-loop.ts`
  - **Details**:
    - Use Vercel AI SDK `tool()` with Zod schema
    - Parameters:
      - `question: z.string()` -- the question to ask the human
      - `context: z.string().optional()` -- background context
      - `urgency: z.enum(["low", "medium", "high"]).optional().default("medium")`
      - `format: z.enum(["free_text", "yes_no", "multiple_choice"]).optional().default("free_text")`
      - `choices: z.array(z.string()).optional()` -- options for multiple_choice format
    - Description: "Request input or approval from a human. Use when you need clarification, confirmation, or a decision."
  - **Status**: DONE

- [x] **6.2** Implement pause mechanism returning `PendingResult`
  - **Spec**: SPEC-07 (US-07)
  - **File**: `src/human-in-the-loop.ts`
  - **Details**:
    - When agent calls `requestHumanInput`, the tool call event is appended to the thread
    - A `HumanInputRequestedEvent` is appended with `question`, `context`, `urgency`, `format`, `choices`
    - The loop pauses and returns a `PendingResult` with `stopReason: "human_input_needed"`
    - The `PendingResult` includes partial results: response so far, thread, usage, iterations
  - **Status**: DONE

- [x] **6.3** Implement `resume(humanResponse)` function on `PendingResult`
  - **Spec**: SPEC-07 (US-07)
  - **File**: `src/human-in-the-loop.ts`
  - **Details**:
    - Appends `HumanInputReceivedEvent` with the human's response to the thread
    - Re-enters the agent loop from where it left off (same thread, same iteration state)
    - Returns a full `AgentResult` (or another `PendingResult` if another pause is needed)
    - Must support multiple pause/resume cycles within a single agent run
  - **Status**: DONE

- [x] **6.4** Implement `interruptOn` configuration
  - **Spec**: SPEC-07 (US-07)
  - **Files**: `src/human-in-the-loop.ts`, `src/agent.ts`
  - **Details**:
    - When a tool listed in `interruptOn` is called by the agent:
      1. The tool call event is appended to the thread
      2. The loop pauses before executing the tool
      3. Returns a `PendingResult` with the tool call details
    - On `resume("approved")`: tool is executed and loop continues
    - On `resume("denied: reason")`: denial is appended as context and loop continues without executing the tool
    - Integrates with agent loop's tool execution flow
  - **Status**: DONE

- [x] **6.5** Export human-in-the-loop from `src/index.ts`
  - **Spec**: SPEC-07 (US-07)
  - **File**: `src/index.ts`
  - **Details**:
    - Export: `requestHumanInput` tool definition
  - **Status**: DONE

- [x] **6.6** Write unit tests for human-in-the-loop
  - **Spec**: SPEC-07 (US-07)
  - **File**: `src/human-in-the-loop.test.ts`
  - **Details**:
    - Test: agent calls `requestHumanInput` -- loop pauses and returns `PendingResult`
    - Test: `PendingResult.resume(response)` continues the loop with the human's response
    - Test: `HumanInputRequestedEvent` is appended to thread on pause
    - Test: `HumanInputReceivedEvent` is appended to thread on resume
    - Test: `interruptOn` triggers pause before executing a listed tool
    - Test: resume with "approved" executes the tool
    - Test: resume with "denied: reason" skips tool execution
    - Test: multiple pause/resume cycles work within a single agent run
    - Test: after resume, the loop continues from where it left off
    - All tests must pass: `pnpm test`
  - **Status**: DONE

---

## PRIORITY TIER 7 -- Integration with Agent Loop (Cross-cutting)

_Depends on: All Tier 4 modules and Tier 5. These items integrate the independently-built modules into the agent loop._

- [x] **7.1** Integrate middleware pipeline into `DeepFactorAgent.loop()`
  - **Spec**: SPEC-04 + SPEC-05
  - **File**: `src/agent.ts`
  - **Details**:
    - Use `composeMiddleware()` to merge built-in + user middleware at construction time
    - Merge middleware tools with user tools; pass combined `allTools` to `generateText()`
    - Call composed `beforeIteration` before each iteration
    - Call composed `afterIteration` after each iteration
  - **Status**: DONE

- [x] **7.2** Integrate context management into `DeepFactorAgent.loop()`
  - **Spec**: SPEC-04 + SPEC-08
  - **File**: `src/agent.ts`
  - **Details**:
    - Instantiate `ContextManager` from `contextManagement` config
    - After each iteration, call `needsSummarization(thread)`
    - If needed, call `summarize(thread, model)` to compress old iterations
    - In `buildMessages()`, call `buildContextInjection(thread)` and inject summary context into system prompt
  - **Status**: DONE

- [x] **7.3** Integrate human-in-the-loop into `DeepFactorAgent.loop()`
  - **Spec**: SPEC-04 + SPEC-07
  - **File**: `src/agent.ts`
  - **Details**:
    - Add `requestHumanInput` tool to the agent's tool set when HITL is enabled
    - After `generateText()`, check if `requestHumanInput` was called
    - If so, pause the loop and return `PendingResult`
    - Check `interruptOn` list against tool calls; pause before executing listed tools
    - Implement `isPendingHumanInput(thread)` helper
  - **Status**: DONE

- [x] **7.4** Write end-to-end integration tests
  - **Spec**: All specs
  - **File**: `src/integration.test.ts`
  - **Details**:
    - Test full workflow: createDeepFactorAgent -> loop() with tools, middleware, stop conditions
    - Test verification loop: multi-iteration with verification feedback
    - Test context management: long-running agent triggers summarization
    - Test human-in-the-loop: pause, resume, continue
    - Test middleware hooks fire in correct order
    - Test token usage aggregation across iterations
    - All tests with mocked LLM
    - All tests must pass: `pnpm test`
  - **Status**: DONE

---

## PRIORITY TIER 8 -- Final Validation & Polish

_Depends on: All previous tiers complete._

- [x] **8.1** Run full test suite and fix any failures
  - **Spec**: All specs
  - **Files**: All test files
  - **Details**:
    - `pnpm test` -- all tests pass
    - `pnpm type-check` -- zero type errors
    - `pnpm build` -- clean build, `dist/` populated
  - **Status**: DONE

- [x] **8.2** Verify all public API exports
  - **Spec**: SPEC-06
  - **File**: `src/index.ts`
  - **Details**:
    - Verify every public function, class, type, and constant is exported from the barrel
    - Verify imports work: `import { createDeepFactorAgent, maxIterations, todoMiddleware } from "deep-factor-agent"`
    - Verify `.d.ts` files in `dist/` provide proper type definitions
  - **Status**: DONE

- [x] **8.3** Verify 12-factor alignment
  - **Spec**: SPEC-01 (12-factor table)
  - **Files**: N/A (review step)
  - **Details**:
    - Factor 1 (NL to Tool Calls): `generateText()` + tools in agent loop
    - Factor 2 (Own Prompts): `instructions` field, no hidden prompts
    - Factor 3 (Own Context Window): `ContextManager` with summarization
    - Factor 4 (Tools as Structured Output): `AgentEvent` types, tool result handling
    - Factor 5 (Unified State): `AgentThread` as single event log
    - Factor 6 (Launch/Pause/Resume): `PendingResult` with `resume()`
    - Factor 7 (Contact Humans via Tools): `requestHumanInput` tool
    - Factor 8 (Own Control Flow): Explicit loop code
    - Factor 9 (Compact Errors): Error middleware, consecutive error counter
    - Factor 10 (Small Focused Agents): Architecture supports composition
    - Factor 11 (Trigger from Anywhere): `agent.loop(prompt)` is a plain function
    - Factor 12 (Stateless Reducer): Thread + event -> new thread
    - Factor 13 (Pre-fetch Context): Context injection before iterations
  - **Status**: DONE

---

## FILE MANIFEST

All files that will be created during implementation:

| File | Tier | Spec | Purpose |
|------|------|------|---------|
| `package.json` | 1 | SPEC-01 | Package configuration, dependencies, scripts |
| `tsconfig.json` | 1 | SPEC-01 | TypeScript compiler configuration |
| `.gitignore` | 1 | SPEC-01 | Git ignore rules |
| `vitest.config.ts` | 1 | SPEC-01 | Vitest test runner configuration |
| `src/index.ts` | 1-5 | SPEC-01/06 | Barrel export (updated incrementally) |
| `src/types.ts` | 2 | SPEC-02 | All type definitions and interfaces |
| `src/stop-conditions.ts` | 3 | SPEC-03 | Stop condition factories, pricing, utilities |
| `src/stop-conditions.test.ts` | 3 | SPEC-03 | Stop condition unit tests |
| `src/agent.ts` | 4A | SPEC-04 | DeepFactorAgent class with loop() and stream() |
| `src/agent.test.ts` | 4A | SPEC-04 | Agent loop unit tests |
| `src/middleware.ts` | 4B | SPEC-05 | Middleware composition, todoMiddleware, errorRecoveryMiddleware |
| `src/middleware.test.ts` | 4B | SPEC-05 | Middleware unit tests |
| `src/context-manager.ts` | 4C | SPEC-08 | ContextManager class, estimateTokens utility |
| `src/context-manager.test.ts` | 4C | SPEC-08 | Context management unit tests |
| `src/create-agent.ts` | 5 | SPEC-06 | createDeepFactorAgent factory function |
| `src/create-agent.test.ts` | 5 | SPEC-06 | Factory function integration tests |
| `src/human-in-the-loop.ts` | 6 | SPEC-07 | requestHumanInput tool, interrupt logic |
| `src/human-in-the-loop.test.ts` | 6 | SPEC-07 | Human-in-the-loop unit tests |
| `src/integration.test.ts` | 7 | All | End-to-end integration tests |

---

## DEPENDENCY GRAPH

```
TIER 1: Project Init (SPEC-01)
  |
  v
TIER 2: Core Types (SPEC-02)
  |
  v
TIER 3: Stop Conditions (SPEC-03)
  |
  +-------------------+-------------------+
  v                   v                   v
TIER 4A: Agent Loop   TIER 4B: Middleware  TIER 4C: Context Mgmt
(SPEC-04)             (SPEC-05)           (SPEC-08)
  |                   |                   |
  +-------------------+-------------------+
  v
TIER 5: Factory Function & Barrel Exports (SPEC-06)
  |
  v
TIER 6: Human-in-the-Loop (SPEC-07)
  |
  v
TIER 7: Cross-cutting Integration
  |
  v
TIER 8: Final Validation & Polish
```

---

## SUMMARY

| Tier | Items | Spec(s) | Description |
|------|-------|---------|-------------|
| 1 | 10 | SPEC-01 | Project scaffolding, deps, config |
| 2 | 11 | SPEC-02 | All types and interfaces |
| 3 | 10 | SPEC-03 | Stop condition factories and tests |
| 4A | 9 | SPEC-04 | Agent loop core engine and tests |
| 4B | 5 | SPEC-05 | Middleware system and tests |
| 4C | 8 | SPEC-08 | Context management and tests |
| 5 | 4 | SPEC-06 | Factory function, barrel exports |
| 6 | 6 | SPEC-07 | Human-in-the-loop and tests |
| 7 | 4 | All | Cross-cutting integration |
| 8 | 3 | All | Final validation |
| **Total** | **70** | | |

---

## KEY IMPLEMENTATION LEARNINGS

- Vercel AI SDK v6 uses `stopWhen` with `stepCountIs(n)` instead of the old `maxSteps` parameter
- `LanguageModel` type is a union that includes string types - need to check `typeof model === "object"` before accessing `.modelId`
- The `stream()` method return type needs explicit annotation to avoid TS4053 error with `Output` type
- `LanguageModelUsage` fields can be `undefined` - extractUsage helper normalizes them to 0
- Zod v4 was automatically installed as a dependency alongside `ai` v6
- pnpm needed to be installed globally via npm first
- vitest needs `passWithNoTests: true` to not error on empty test suites
- All 93 tests pass across 7 test files (stop-conditions: 23, middleware: 15, agent: 16, create-agent: 9, human-in-the-loop: 12, context-manager: 12, integration: 6)
