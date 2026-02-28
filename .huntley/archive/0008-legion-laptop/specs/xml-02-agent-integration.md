# SPEC-02: XML Context Mode Integration

## CONTEXT

SPEC-01 provides the `serializeThreadToXml` function. This spec integrates it into the agent so callers can opt in to XML-based context window construction via a `contextMode` setting. In XML mode, all prior-iteration history is serialized into a single `<thread>` XML document and sent as one `HumanMessage` alongside the `SystemMessage`, ensuring the model sees the full thread including tool interactions.

### DEPENDENCIES
- SPEC-01 (xml-serializer module)

---

## API CHANGES

### `types.ts` — Add `contextMode` to Settings

```ts
export interface DeepFactorAgentSettings<
  TTools extends StructuredToolInterface[] = StructuredToolInterface[],
> {
  // ... existing fields ...

  /**
   * How prior-iteration history is presented to the model.
   * - `"standard"` (default): converts events to individual LangChain message objects
   * - `"xml"`: serializes the full thread into a `<thread>` XML document sent as a single HumanMessage
   */
  contextMode?: "standard" | "xml";
}
```

### `agent.ts` — Add `buildXmlMessages()` Method

New private method on `DeepFactorAgent`:

```ts
private buildXmlMessages(thread: AgentThread): BaseMessage[] {
  const messages: BaseMessage[] = [];

  // System prompt (same as standard mode — context injection + instructions)
  const contextInjection = this.contextManager.buildContextInjection(thread);
  if (this.instructions || contextInjection) {
    const system = [contextInjection, this.instructions]
      .filter(Boolean)
      .join("\n\n");
    messages.push(new SystemMessage(system));
  }

  // Serialize entire thread as XML
  const xml = serializeThreadToXml(thread.events);
  messages.push(new HumanMessage(xml));

  return messages;
}
```

### `agent.ts` — Dispatch in `runLoop()` and `stream()`

Replace the direct `this.buildMessages(thread)` calls with a dispatch:

```ts
// In runLoop() and stream():
const messages = this.contextMode === "xml"
  ? this.buildXmlMessages(thread)
  : this.buildMessages(thread);
```

The inner tool-calling loop is **unchanged** — it still appends `AIMessage`, `ToolMessage` etc. to the local `messages` array within a single iteration. XML serialization only affects how prior-iteration history is presented at the start of each outer iteration.

### `create-agent.ts` — Pass Through `contextMode`

The factory function passes `contextMode` from settings to the agent constructor. Default is `"standard"` (no behavior change for existing users):

```ts
const resolvedSettings: DeepFactorAgentSettings<TTools> = {
  ...settings,
  // ... existing defaults ...
  contextMode: settings.contextMode ?? "standard",
};
```

### `index.ts` — Export Serializer Symbols

Add exports for the new module:

```ts
// XML serializer
export { serializeThreadToXml, escapeXml } from "./xml-serializer.js";
export type { XmlSerializerOptions } from "./xml-serializer.js";
```

---

## BEHAVIOR

### Standard Mode (default)

No change from current behavior. `buildMessages()` is called as before.

### XML Mode

1. `buildXmlMessages()` is called at the start of each outer iteration.
2. The `SystemMessage` is constructed identically to standard mode (context injection + instructions).
3. A single `HumanMessage` containing the XML-serialized thread is appended.
4. The model receives: `[SystemMessage, HumanMessage(xml)]`.
5. The inner tool-calling loop proceeds normally, appending `AIMessage` / `ToolMessage` to the local `messages` array.
6. At the end of the iteration, events are appended to the thread as usual.
7. On the next outer iteration, the thread is re-serialized from scratch, capturing all events including tool calls, tool results, errors, etc.

### Message Flow Diagram

```
Outer Iteration N (XML mode):
  1. buildXmlMessages(thread)
     -> [SystemMessage(instructions), HumanMessage(<thread>...all events...</thread>)]
  2. Inner tool loop (same as standard mode):
     -> model.invoke(messages) -> AIMessage(tool_calls)
     -> execute tools -> ToolMessage(result)
     -> model.invoke(messages) -> AIMessage(text)
  3. Append events to thread (tool_call, tool_result, message)
  4. Check stop conditions / verify completion

Outer Iteration N+1 (XML mode):
  1. buildXmlMessages(thread)  <-- now includes iteration N's tool events
     -> [SystemMessage(instructions), HumanMessage(<thread>...all events including N...</thread>)]
  ...
```

---

## FILE STRUCTURE

- `src/types.ts` -- add `contextMode` field to `DeepFactorAgentSettings`
- `src/agent.ts` -- add `buildXmlMessages()`, dispatch in `runLoop()` and `stream()`, store `contextMode` field
- `src/create-agent.ts` -- pass through `contextMode` with `"standard"` default
- `src/index.ts` -- export serializer symbols
- `__tests__/xml-context.test.ts` -- unit tests for XML mode integration

---

## IMPLEMENTATION NOTES

1. **Constructor**: Add `private contextMode: "standard" | "xml"` field to `DeepFactorAgent`, initialized from `settings.contextMode ?? "standard"`.
2. **Import**: Add `import { serializeThreadToXml } from "./xml-serializer.js"` to `agent.ts`.
3. **Minimal diff**: The only changes to `runLoop()` and `stream()` are swapping `this.buildMessages(thread)` for a ternary dispatch. No other logic changes.
4. **Context management**: In XML mode, `buildContextInjection()` still runs and is injected into the `SystemMessage`. Summaries are included in the system prompt as before — they are **not** duplicated in the XML thread (summary events already appear in the thread).

---

## ACCEPTANCE CRITERIA

- [ ] `contextMode` is an optional field on `DeepFactorAgentSettings` with type `"standard" | "xml"`
- [ ] Default `contextMode` is `"standard"` (existing behavior unchanged)
- [ ] `DeepFactorAgent` stores `contextMode` and dispatches to `buildXmlMessages()` when `"xml"`
- [ ] `buildXmlMessages()` produces `[SystemMessage, HumanMessage(xml)]`
- [ ] The XML `HumanMessage` contains all thread events serialized via `serializeThreadToXml`
- [ ] `create-agent.ts` passes through `contextMode` with `"standard"` default
- [ ] `index.ts` exports `serializeThreadToXml`, `escapeXml`, and `XmlSerializerOptions`
- [ ] Inner tool-calling loop behavior is identical in both modes
- [ ] Tests verify XML mode produces correct message structure
- [ ] Tests verify standard mode is unchanged
- [ ] Tests verify `contextMode` defaults to `"standard"` in factory
- [ ] `pnpm -C packages/deep-factor-agent type-check` passes
- [ ] `pnpm -C packages/deep-factor-agent test` passes (existing + new)
