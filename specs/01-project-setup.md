# SPEC-01: Project Setup & Package Scaffolding

## CONTEXT

### RELEVANT SOURCES
- [Langchain DeepAgents - Typescript](https://reference.langchain.com/javascript/deepagents)
- [12 Factor Agents Github](https://github.com/humanlayer/12-factor-agents/tree/main/content)
- [Vercel Labs - RalphLoopAgent](https://github.com/vercel-labs/ralph-loop-agent/tree/main/packages/ralph-loop-agent)

### SUGGESTED TOOLS & SKILLS TO USE
- **agent-browser**: validate frontend changes
- **curl**: validate api changes

---

## OVERVIEW

Create **deep-factor-agent** -- a TypeScript package that synthesizes the best patterns from three sources:

1. **LangChain DeepAgents** (`createDeepAgent`): Middleware stack, sub-agent delegation, planning tools, filesystem access, context summarization, and backend abstraction.
2. **12 Factor Agents** (HumanLayer): Stateless reducer pattern, owning prompts/context/control-flow, unified event state, compact error handling, human-in-the-loop via tool calls, small focused agents.
3. **Vercel Ralph Loop Agent**: Dual-loop architecture (outer verify loop + inner tool loop), composable stop conditions, cost tracking, context management with auto-summarization.

The package exposes a single factory function `createDeepFactorAgent()` that returns a loop-based agent with middleware, verification, stop conditions, and 12-factor compliance.

---

## USER STORIES

### US-01: Project Initialization
**As a** developer
**I want to** initialize a TypeScript package with proper tooling
**So that** I have a solid foundation to build, test, and publish the agent package

#### Acceptance Criteria
- [ ] `package.json` exists with name `deep-factor-agent`, type `module`, ESM exports map
- [ ] `tsconfig.json` configured for ES2022 target, ESNext module, strict mode, declaration files
- [ ] Dev dependencies installed: `typescript`, `vitest`, `@types/node`
- [ ] Production dependencies installed: `ai` (Vercel AI SDK v6+), `zod` (v4+ as peer dep)
- [ ] Scripts defined: `build` (tsc), `dev` (tsc --watch), `test` (vitest run), `test:watch` (vitest), `type-check` (tsc --noEmit)
- [ ] `src/` directory created with `index.ts` barrel export
- [ ] `dist/` is in `.gitignore`
- [ ] Project builds without errors (`pnpm build`)
- [ ] Project type-checks without errors (`pnpm type-check`)

#### Implementation Steps
1. Run `pnpm init` to create `package.json`
2. Install dependencies: `pnpm add ai @ai-sdk/provider-utils` and `pnpm add -D typescript vitest @types/node`
3. Add `zod` as a peer dependency
4. Create `tsconfig.json` with strict settings, ES2022, declaration output
5. Create `src/index.ts` with placeholder export
6. Create `.gitignore` with `node_modules/`, `dist/`
7. Verify `pnpm build` and `pnpm type-check` pass

---

### US-02: Core Types & Interfaces
**As a** developer
**I want to** define the core type system for the agent
**So that** all components share a consistent, type-safe contract

#### Acceptance Criteria
- [ ] `AgentEvent` type defined with discriminated union: `tool_call`, `tool_result`, `error`, `human_input_requested`, `human_input_received`, `completion`, `summary`
- [ ] `AgentThread` type defined as an ordered list of `AgentEvent` entries (the unified state per Factor 5)
- [ ] `AgentContext` type wraps the thread plus metadata (iteration count, model info, usage stats)
- [ ] `StopCondition` function type: `(ctx: StopConditionContext) => { stop: boolean; reason?: string }`
- [ ] `VerifyCompletion` function type: `(ctx: VerifyContext) => Promise<{ complete: boolean; reason?: string }>`
- [ ] `AgentMiddleware` interface with optional `tools`, `beforeIteration`, `afterIteration` hooks
- [ ] `DeepFactorAgentSettings` type for the factory function config
- [ ] All types exported from `src/types.ts` and re-exported from `src/index.ts`
- [ ] Types compile without errors

#### Implementation Steps
1. Create `src/types.ts`
2. Define `AgentEvent` as a discriminated union on `type` field
3. Define `AgentThread` as `{ events: AgentEvent[]; metadata: Record<string, unknown> }`
4. Define `StopCondition`, `VerifyCompletion`, `AgentMiddleware` function/interface types
5. Define `DeepFactorAgentSettings` with model, tools, instructions, stopWhen, verifyCompletion, middleware
6. Export all from `src/index.ts`
7. Run `pnpm type-check`

---

### US-03: Stop Conditions
**As a** developer
**I want to** composable stop conditions that halt the agent loop
**So that** I can control cost, iteration count, and token usage

#### Acceptance Criteria
- [ ] `maxIterations(n)` factory -- stops after N outer loop iterations
- [ ] `maxTokens(n)` factory -- stops when total token usage exceeds threshold
- [ ] `maxCost(dollars, model?)` factory -- stops when estimated cost exceeds budget
- [ ] Stop conditions are composable: array of conditions evaluated with OR semantics
- [ ] `MODEL_PRICING` map with per-token costs for common models (Claude, GPT-4o, Gemini)
- [ ] `calculateCost(usage, model)` utility function
- [ ] Unit tests for each stop condition
- [ ] All tests pass (`pnpm test`)

#### Implementation Steps
1. Create `src/stop-conditions.ts`
2. Implement `StopConditionContext` with iteration, usage, model fields
3. Implement `maxIterations`, `maxTokens`, `maxCost` factory functions
4. Add `MODEL_PRICING` lookup table
5. Implement `calculateCost` helper
6. Create `src/stop-conditions.test.ts` with tests for each factory
7. Run `pnpm test`

---

### US-04: Agent Loop (Core Engine)
**As a** developer
**I want to** implement the dual-loop agent engine
**So that** agents iterate with tool calling, verification, and self-correction

#### Acceptance Criteria
- [ ] Outer loop runs iterations until `verifyCompletion` returns `{ complete: true }` or a stop condition triggers
- [ ] Inner loop delegates to Vercel AI SDK `generateText()` with tools for tool-calling steps
- [ ] Verification feedback (when `complete: false` with `reason`) is injected as context for next iteration
- [ ] Errors are caught and appended to context (Factor 9: compact errors) with consecutive error counter (max 3)
- [ ] Each iteration appends events to the `AgentThread` (Factor 5: unified state)
- [ ] The agent is a stateless reducer (Factor 12): given the same thread, produces the same next action
- [ ] Result includes final response, full thread, total usage, iteration count, and stop reason
- [ ] `loop()` method for blocking execution
- [ ] `stream()` method for streaming the final iteration
- [ ] Unit tests with mocked LLM responses covering: single iteration success, multi-iteration with feedback, error recovery, stop condition triggered

#### Implementation Steps
1. Create `src/agent.ts` with `DeepFactorAgent` class
2. Implement constructor accepting `DeepFactorAgentSettings`
3. Implement `loop()` method with outer verify loop + inner `generateText()` call
4. Implement `stream()` method using `streamText()` on final iteration
5. Implement error handling with consecutive error counter
6. Implement stop condition evaluation between iterations
7. Implement verification feedback injection
8. Create `src/agent.test.ts` with comprehensive tests
9. Run `pnpm test`

---

### US-05: Middleware System
**As a** developer
**I want to** a middleware pipeline that extends agent capabilities
**So that** I can add planning, filesystem, summarization, and custom tools modularly

#### Acceptance Criteria
- [ ] `AgentMiddleware` interface supports: `tools` (additional tools), `beforeIteration(ctx)`, `afterIteration(ctx, result)`
- [ ] Middleware is composed in order: built-in middleware first, then user-provided middleware
- [ ] Built-in `todoMiddleware` provides `write_todos` / `read_todos` tools for task planning
- [ ] Built-in `errorMiddleware` catches tool errors and appends compact error events (Factor 9)
- [ ] Middleware tools are merged with user tools and passed to `generateText()`
- [ ] Middleware hooks can modify context before/after each iteration
- [ ] Unit tests for middleware composition and each built-in middleware

#### Implementation Steps
1. Create `src/middleware.ts`
2. Implement `composeMiddleware(middlewares)` to merge tools and chain hooks
3. Implement `todoMiddleware` with in-memory todo list and tool definitions
4. Implement `errorMiddleware` with compact error formatting
5. Integrate middleware pipeline into `DeepFactorAgent.loop()`
6. Create `src/middleware.test.ts`
7. Run `pnpm test`

---

### US-06: Factory Function (`createDeepFactorAgent`)
**As a** developer
**I want to** a single factory function as the public API
**So that** creating an agent is simple and discoverable

#### Acceptance Criteria
- [ ] `createDeepFactorAgent(settings)` returns a `DeepFactorAgent` instance
- [ ] Settings include: `model`, `tools`, `instructions`, `stopWhen`, `verifyCompletion`, `middleware`
- [ ] Sensible defaults: `stopWhen: [maxIterations(10)]`, no verification (single iteration), empty middleware
- [ ] Returned agent has `.loop(prompt)` and `.stream(prompt)` methods
- [ ] Minimal example works:
  ```ts
  const agent = createDeepFactorAgent({ model: "anthropic:claude-sonnet-4-5" });
  const result = await agent.loop("What is 2+2?");
  ```
- [ ] Re-exported from `src/index.ts` as the primary export
- [ ] Integration test with mocked model

#### Implementation Steps
1. Create `src/create-agent.ts` with `createDeepFactorAgent()` function
2. Apply defaults for missing settings
3. Instantiate and return `DeepFactorAgent`
4. Update `src/index.ts` exports
5. Create `src/create-agent.test.ts` with integration test
6. Run `pnpm test`

---

### US-07: Human-in-the-Loop via Tool Calls
**As a** developer
**I want to** agents to request human input through structured tool calls
**So that** humans can be contacted as part of the agent workflow (Factor 7)

#### Acceptance Criteria
- [ ] `requestHumanInput` tool definition with fields: `question`, `context`, `urgency`, `format`
- [ ] When agent calls `requestHumanInput`, the loop pauses and returns a pending result
- [ ] Result includes a `resume(humanResponse)` function to continue execution
- [ ] Human response is appended as a `human_input_received` event and the loop continues
- [ ] Configurable via `interruptOn` in settings to specify which tools require approval
- [ ] Unit tests for pause/resume flow

#### Implementation Steps
1. Create `src/human-in-the-loop.ts`
2. Define `requestHumanInput` tool with zod schema
3. Implement pause mechanism that returns a `PendingResult` with `resume()` callback
4. Implement resume logic that appends human response and re-enters loop
5. Add `interruptOn` config to `DeepFactorAgentSettings`
6. Create `src/human-in-the-loop.test.ts`
7. Run `pnpm test`

---

### US-08: Context Management & Summarization
**As a** developer
**I want to** automatic context compression for long-running agents
**So that** agents don't exceed token limits on multi-step tasks

#### Acceptance Criteria
- [ ] `ContextManager` class tracks token usage estimates across iterations
- [ ] When token budget is exceeded, older iterations are summarized into compact summaries
- [ ] Most recent N iterations are preserved in full detail
- [ ] Summaries are injected into the system prompt for subsequent iterations
- [ ] Configurable: `maxContextTokens` (default 150K), `summarizeAfter` (iterations to keep in full)
- [ ] Token estimation utility: `estimateTokens(text)` at ~3.5 chars per token
- [ ] Unit tests for summarization triggering and context injection

#### Implementation Steps
1. Create `src/context-manager.ts`
2. Implement `ContextManager` with token budgeting
3. Implement `estimateTokens()` utility
4. Implement `summarize()` method that compresses old iterations
5. Integrate with `DeepFactorAgent` loop to check budget between iterations
6. Create `src/context-manager.test.ts`
7. Run `pnpm test`

---

## DEPENDENCY ORDER

```
US-01 (Project Init)
  |
  v
US-02 (Core Types)
  |
  v
US-03 (Stop Conditions)
  |
  +-------+-------+
  v       v       v
US-04   US-05   US-08
(Loop)  (MW)    (Context)
  |       |       |
  +---+---+---+---+
      v
    US-06 (Factory)
      |
      v
    US-07 (HITL)
```

## 12-FACTOR ALIGNMENT

| Factor | Where Addressed |
|--------|----------------|
| 1. Natural Language to Tool Calls | US-04: inner loop with `generateText()` + tools |
| 2. Own Your Prompts | US-06: `instructions` field, no hidden prompts |
| 3. Own Your Context Window | US-08: `ContextManager`, US-02: `AgentThread` |
| 4. Tools Are Just Structured Outputs | US-02: `AgentEvent` types, US-04: tool result handling |
| 5. Unify Execution & Business State | US-02: `AgentThread` as single event log |
| 6. Launch, Pause, Resume | US-07: pause/resume with `PendingResult` |
| 7. Contact Humans with Tool Calls | US-07: `requestHumanInput` tool |
| 8. Own Your Control Flow | US-04: explicit loop, no framework routing |
| 9. Compact Errors into Context | US-04/US-05: error middleware, consecutive error counter |
| 10. Small, Focused Agents | Architecture: single-purpose agents, composable |
| 11. Trigger from Anywhere | US-06: `agent.loop(prompt)` -- plain function, any trigger |
| 12. Stateless Reducer | US-04: `(thread + event) => new_thread` |
| 13. Pre-Fetch Context | US-08: context injection before iterations |

## TECHNOLOGY STACK

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js 20+ | LTS, ESM support |
| Language | TypeScript 5.x | Type safety, declaration files |
| AI SDK | Vercel AI SDK (`ai` v6+) | `generateText`/`streamText`, tool support, model agnostic |
| Schema | Zod v4+ (peer dep) | Tool parameter validation |
| Test | Vitest | Fast, ESM native, TypeScript native |
| Build | tsc | Simple, no bundler needed for library |
| Package Manager | pnpm | Fast, disk efficient |
| Module | ESM only | Modern standard |
