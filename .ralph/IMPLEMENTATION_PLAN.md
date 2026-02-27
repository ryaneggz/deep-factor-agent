# Implementation Plan — Phase 0009

**Generated:** 2026-02-27
**Baseline:** 283 tests passing (173 agent, 110 CLI), type-check clean, 0 TODOs/FIXMEs in source

---

## Priority 1 — Active Spec (Unimplemented)

### P1.1 — SPEC-01: Example 12 — Interactive HITL with Multiple Choice
- **Spec:** `.ralph/specs/SPEC-01-hitl-multiple-choice-example.md`
- **Status:** COMPLETE
- **Implemented:**
  - [x] Created `packages/deep-factor-agent/examples/12-hitl-multiple-choice.ts` (forked from Example 11)
  - [x] Added `requestHumanInput` to tools array alongside `bashTool`
  - [x] Added `collectHumanInput()` helper — parses tool result JSON, displays numbered choices, collects via `rl.question()`, resolves selection or free-text fallback
  - [x] Modified `runToolLoop()` with HITL branch — detects `TOOL_NAME_REQUEST_HUMAN_INPUT`, invokes tool, records `human_input_requested`/`human_input_received` events, pushes `ToolMessage`, continues
  - [x] Updated system prompt to instruct model about `multiple_choice` vs `free_text` usage
  - [x] Passed `readline` interface to `runToolLoop()`
  - [x] Updated `packages/deep-factor-agent/examples/README.md` — added Example 12 in running commands and overview table
  - [x] Build passes, 283 tests pass (173 agent, 110 CLI), type-check clean

---

## Priority 2 — Correctness Bugs

### P2.1 — `interruptOn` leaves dangling unmatched `tool_call` event
- **File:** `packages/deep-factor-agent/src/agent.ts` (~line 421-454)
- **Problem:** When a tool is in `interruptOn`, the agent records a `ToolCallEvent` but then hits `continue` — skipping tool execution and skipping `ToolResultEvent`. On resume, `buildMessages()` reconstructs an `AIMessage` with `tool_calls` but no corresponding `ToolMessage`, which many LLM APIs reject.
- **Fix:** Either (a) defer recording the `ToolCallEvent` until after the interrupt check, or (b) on resume, inject a synthetic `ToolMessage` with the human's response keyed to the interrupted tool's `toolCallId`
- **Impact:** Affects `interruptOn` feature for standard context mode; XML mode may be more tolerant
- **Tests:** Add test that verifies `buildMessages()` produces valid message sequence after interrupt+resume

### P2.2 — Summarization token usage invisible to stop conditions
- **File:** `packages/deep-factor-agent/src/context-manager.ts` (~summarize method) + `agent.ts` (~line 371)
- **Problem:** `ContextManager.summarize()` calls `model.invoke()` internally but the token usage is never added to `totalUsage` in `runLoop`. Summarization API calls are invisible to `maxTokens`/`maxCost` stop conditions.
- **Fix:** Have `summarize()` return the usage metadata from the summarization call, and add it to `totalUsage` in `agent.ts`
- **Impact:** Cost tracking accuracy for long-running agents with context summarization

### P2.3 — `stream()` is an incomplete thin wrapper
- **File:** `packages/deep-factor-agent/src/agent.ts` (~stream method)
- **Problem:** `stream()` builds messages and calls `modelWithTools.stream()` but does NOT run the tool-calling loop, record events, support stop conditions, HITL, or verification. It's essentially a single-shot completion stream. Example 03 uses it but only for tool-less single-turn prompts.
- **Fix:** Either (a) document the limitation clearly in JSDoc + README, or (b) implement a full streaming agent loop (significant effort)
- **Recommendation:** Document the limitation (P2 priority); full streaming loop is P4 effort
- **Tests:** Add test asserting stream() behavior matches documentation (or add JSDoc warning)

---

## Priority 3 — Design / Quality Issues

### P3.1 — `XmlSerializerOptions.responsePrefix` naming is misleading
- **File:** `packages/deep-factor-agent/src/xml-serializer.ts`
- **Problem:** `responsePrefix` is appended AFTER `</thread>` — it's a suffix, not a prefix. The name implies it prepends, but it appends.
- **Fix:** Rename to `responseSuffix` (breaking change) or add JSDoc clarifying behavior
- **Recommendation:** Add JSDoc clarification (non-breaking)

### P3.2 — `calculateCost` silently returns 0 for unknown models
- **File:** `packages/deep-factor-agent/src/stop-conditions.ts`
- **Problem:** When a model ID is not in `MODEL_PRICING`, `calculateCost` returns `0` with no warning. `maxCost` stop condition will never trigger for unknown models.
- **Fix:** Add `console.warn` on first unknown model lookup, or return `NaN`
- **Recommendation:** `console.warn` once per unknown model (memoize to avoid spam)

### P3.3 — `findToolByName` linear scan in hot loop
- **File:** `packages/deep-factor-agent/src/agent.ts` inner tool loop
- **Problem:** `findToolByName()` does `O(n)` linear scan per tool call. In `agent.ts` it's called inside the inner tool execution loop for every tool call.
- **Fix:** Build `toolArrayToMap()` once at loop start, look up by name
- **Impact:** Minor performance concern for large tool sets

### P3.4 — CLI `useAgent` creates new agent per prompt (no multi-turn memory)
- **File:** `packages/deep-factor-cli/src/hooks/useAgent.ts`
- **Problem:** In interactive mode, each `sendPrompt` call creates a fresh `DeepFactorAgent` instance with no thread history. The model has no memory of previous turns.
- **Fix:** Carry the `AgentThread` forward across turns, or use XML context mode to serialize prior turns
- **Impact:** UX limitation for interactive CLI usage; users expect multi-turn chat

### P3.5 — CLI `HumanInput` and `PromptInput` duplicate `useInput` logic
- **File:** `packages/deep-factor-cli/src/components/HumanInput.tsx`, `PromptInput.tsx`
- **Problem:** Near-identical keystroke handling code in both components
- **Fix:** Extract shared `useTextInput()` custom hook or shared base component

### P3.6 — CLI `eventsToChatMessages` not exported from `index.ts`
- **File:** `packages/deep-factor-cli/src/index.ts`
- **Problem:** `eventsToChatMessages` utility from `useAgent.ts` is not publicly exported, limiting reuse
- **Fix:** Add to `index.ts` exports

### P3.7 — Barrel export test incomplete
- **File:** `packages/deep-factor-agent/__tests__/create-agent.test.ts` (barrel test section)
- **Problem:** Barrel test does not verify: `TOOL_NAME_WRITE_TODOS`, `TOOL_NAME_REQUEST_HUMAN_INPUT`, `requestHumanInputSchema`, `escapeXml`, `serializeThreadToXml`, type exports
- **Fix:** Add missing exports to barrel test assertions

---

## Priority 4 — Deferred / Low Priority

### P4.1 — Full streaming agent loop
- Implement `stream()` as a full agentic streaming loop (tool calls, events, stop conditions, HITL)
- Significant effort; currently only Example 10/11 demonstrate manual streaming

### P4.2 — `bash` tool uses synchronous `execSync`
- **File:** `packages/deep-factor-cli/src/tools/bash.ts`
- **Problem:** `execSync` blocks the Node.js event loop for up to 30 seconds
- **Fix:** Replace with `child_process.exec` wrapped in a Promise

### P4.3 — `zod` is peer-only but required at runtime
- **File:** `packages/deep-factor-agent/package.json`
- **Problem:** `zod` is listed as `peerDependencies` only but is directly imported in `middleware.ts`, `human-in-the-loop.ts`, `tool-adapter.ts`
- **Fix:** Either move to `dependencies` or enforce in README/docs

### P4.4 — `@langchain/openai` is unconditional runtime dependency
- **File:** `packages/deep-factor-agent/package.json`
- **Problem:** `@langchain/openai` is required even for consumers using only Anthropic
- **Fix:** Move to optional/peer dependency or document as required

### P4.5 — Model pricing table may be stale
- **File:** `packages/deep-factor-agent/src/stop-conditions.ts`
- **Problem:** Missing `claude-haiku-4-6`, `gpt-4.1`, `gpt-4.1-nano`, `gemini-2.0-flash`, etc.
- **Fix:** Add new model entries as they become available

### P4.6 — No CI coverage integration or thresholds
- Deferred from Phase 0007
- **Fix:** Add coverage thresholds to vitest config, integrate with CI

### P4.7 — StatusBar separator not terminal-width-aware
- **File:** `packages/deep-factor-cli/src/components/StatusBar.tsx`
- Hardcoded `"─".repeat(50)` — minor UX issue

### P4.8 — CLI `HumanInput` has no Ctrl+C/escape cancel
- **File:** `packages/deep-factor-cli/src/components/HumanInput.tsx`
- User must type something and press Enter; cannot abort HITL prompt

---

## Completed (Previous Phases)

- [x] Phase 0001: Project setup, core types, agent loop, stop conditions, middleware, factory, context management, HITL
- [x] Phase 0002: README and documentation
- [x] Phase 0003: Replace AI SDK with LangChain
- [x] Phase 0004: OpenAI default model, examples 01-09
- [x] Phase 0005: Loop/log readability improvements
- [x] Phase 0006: CLI package scaffold (pnpm workspace, Ink components, bash tool, tests)
- [x] Phase 0007: Testing & coverage (139 → 245 tests, component tests, hook tests)
- [x] Phase 0008: XML thread serialization, buildMessages() retention fix, examples 10-11 (245 → 283 tests)
