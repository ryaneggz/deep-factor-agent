# Plan: Create GitHub Issue for Example 13 — Parallel Tool Calling

## Context

All tool execution in the codebase is strictly sequential — the agent core (`agent.ts` line ~406), Example 11, and Example 12 all use a `for...of` loop with `await` per tool. When the model returns multiple `tool_calls` in a single response, each waits for the previous to finish. There is no `Promise.all` or concurrency anywhere in the package.

A new Example 13 (`13-parallel-tool-calls.ts`) should derive from the latest example (Example 12) and demonstrate **parallel tool execution** — running independent tool calls concurrently with `Promise.all` for better performance.

## Action

Run `gh issue create` with a structured issue covering:
- Purpose: demonstrate parallel tool calling (the key difference from all prior examples)
- Derives from: Example 12 (`12-hitl-multiple-choice.ts`) — keeps streaming, XML thread, bash tool, HITL
- Core change: replace the sequential `for...of await` tool execution with `Promise.all` for independent tools
- Requirements, acceptance criteria, and implementation notes
- References to existing code

## Issue Content Outline

**Title:** `Add Example 13: Parallel Tool Calling`

**Body:**
- Summary — new example showing concurrent tool execution via `Promise.all`
- Derives-from table (Example 12, agent.ts sequential loop)
- Requirements:
  1. Parallel execution — when model returns multiple tool_calls, execute them concurrently with `Promise.all`
  2. HITL exception — `requestHumanInput` calls must still be handled sequentially (needs user interaction)
  3. Streaming output — text responses stream token-by-token
  4. XML thread serialization — all events recorded including parallel results
  5. Bash tool + HITL tool included
  6. Timing display — show wall-clock time for parallel vs what sequential would have taken
- Acceptance criteria checklist
- Implementation notes referencing the exact code pattern to change
- Key files list

## Key files referenced
- `packages/deep-factor-agent/examples/12-hitl-multiple-choice.ts` — base example to derive from
- `packages/deep-factor-agent/src/agent.ts` (lines ~406–496) — sequential tool loop in the core agent
- `packages/deep-factor-agent/src/human-in-the-loop.ts` — HITL tool (must remain sequential)
- `packages/deep-factor-agent/src/types.ts` — event types for thread recording

## Verification
- Confirm the issue is created on GitHub and return the URL
