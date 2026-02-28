# Plan: XML Context Window Specs

## Context

The agent's `buildMessages()` method (agent.ts:193) skips `tool_call`, `tool_result`, `error`, `completion`, and `human_input_requested` events when reconstructing messages for the next outer iteration. This means the model loses all tool interaction history between iterations (commit edc4279: "Does not retain full threads").

The [Orchestra XML agent](https://github.com/ruska-ai/orchestra/blob/0.0.2-rc70/backend/src/flows/xml_agent.py) solves this by serializing the entire thread into a `<thread><event ...>...</event></thread>` XML document, sent as a single `HumanMessage` alongside the `SystemMessage`. This ensures ALL event types are represented in the context window.

**Goal**: Generate 3 spec files in `.huntley/specs/` that define how to add XML-based context window construction to the deep-factor-agent package.

---

## Deliverables

### SPEC-01: `xml-01-thread-serializer.md` — XML Thread Serializer Module

New file: `packages/deep-factor-agent/src/xml-serializer.ts`

Converts `AgentEvent[]` → `<thread>` XML string. Maps each event type:

| AgentEvent type | XML `type` attr | Key XML attributes | Content |
|---|---|---|---|
| `message` (user) | `human` | `id`, `iteration` | `event.content` |
| `message` (assistant) | `ai` | `id`, `iteration` | `event.content` |
| `message` (system) | `system` | `id`, `iteration` | `event.content` |
| `tool_call` | `tool_input` | `id`, `name`, `iteration` | `JSON.stringify(args)` |
| `tool_result` | `tool_output` | `id`, `name`, `status`, `iteration` | `event.result` |
| `error` | `error` | `id`, `iteration`, `recoverable` | `event.error` |
| `human_input_requested` | `human_input_requested` | `id`, `iteration` | `event.question` |
| `human_input_received` | `human_input_received` | `id`, `iteration` | `event.response` |
| `completion` | `completion` | `id`, `iteration` | `event.result` |
| `summary` | `summary` | `id`, `iteration`, `summarizedIterations` | `event.summary` |

Includes: `escapeXml()`, optional `responsePrefix`, unit tests.

### SPEC-02: `xml-02-agent-integration.md` — XML Context Mode Integration

Modifications to existing files:
- `types.ts`: Add `contextMode?: "standard" | "xml"` to `DeepFactorAgentSettings`
- `agent.ts`: Add `buildXmlMessages()` method, dispatch in `runLoop()` and `stream()`
- `create-agent.ts`: Pass through `contextMode`
- `index.ts`: Export new serializer symbols

In XML mode: `[SystemMessage(instructions), HumanMessage(xmlThread)]`. The inner tool-calling loop is unchanged (it appends to a local `messages` array within an iteration). XML serialization only affects how prior-iteration history is presented.

### SPEC-03: `xml-03-thread-retention.md` — Standard Mode Fix + Integration Tests

Fix `buildMessages()` to also handle `tool_call` → `AIMessage` with `tool_calls`, `tool_result` → `ToolMessage`, and `error` → `HumanMessage`. This fixes the thread retention gap for both modes.

Integration tests verifying multi-iteration thread retention in both standard and XML modes.

---

## Critical Files

| File | Action |
|---|---|
| `packages/deep-factor-agent/src/types.ts` | Modify (add `contextMode`) |
| `packages/deep-factor-agent/src/agent.ts` | Modify (add `buildXmlMessages()`, fix `buildMessages()`) |
| `packages/deep-factor-agent/src/xml-serializer.ts` | **Create** |
| `packages/deep-factor-agent/src/create-agent.ts` | Modify (pass through `contextMode`) |
| `packages/deep-factor-agent/src/index.ts` | Modify (export serializer) |
| `packages/deep-factor-agent/__tests__/xml-serializer.test.ts` | **Create** |
| `packages/deep-factor-agent/__tests__/xml-context.test.ts` | **Create** |
| `packages/deep-factor-agent/__tests__/thread-retention.test.ts` | **Create** |

---

## Spec Dependency Order

```
SPEC-01 (serializer) → SPEC-02 (agent integration) → SPEC-03 (standard fix + tests)
```

---

## Verification

After implementation:
1. `pnpm -C packages/deep-factor-agent type-check` — no type errors
2. `pnpm -C packages/deep-factor-agent test` — all tests pass (existing + new)
3. `pnpm -C packages/deep-factor-agent build` — builds cleanly
