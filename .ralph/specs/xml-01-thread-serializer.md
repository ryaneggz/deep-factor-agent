# SPEC-01: XML Thread Serializer Module

## CONTEXT

The agent currently loses tool interaction history between outer-loop iterations because `buildMessages()` (agent.ts:193) skips `tool_call`, `tool_result`, `error`, `completion`, and `human_input_requested` events when reconstructing messages. The [Orchestra XML agent](https://github.com/ruska-ai/orchestra/blob/0.0.2-rc70/backend/src/flows/xml_agent.py) solves this by serializing the entire thread into a `<thread>` XML document sent as a single `HumanMessage`. This spec defines the serializer module that converts `AgentEvent[]` into that XML representation.

### DEPENDENCIES
- None (standalone module consuming existing types from `types.ts`)

---

## API

### `serializeThreadToXml(events, options?): string`

Converts an array of `AgentEvent` objects into a `<thread>` XML string.

```ts
interface XmlSerializerOptions {
  /** Optional text appended after the closing </thread> tag, used as a response prefix / nudge. */
  responsePrefix?: string;
}

function serializeThreadToXml(
  events: AgentEvent[],
  options?: XmlSerializerOptions,
): string;
```

### `escapeXml(text: string): string`

Escapes XML special characters (`&`, `<`, `>`, `"`, `'`) in text content and attribute values. This is a named export for reuse and testability.

```ts
function escapeXml(text: string): string;
```

---

## XML FORMAT

The output is a well-formed XML document (no XML declaration, no namespace). Each `AgentEvent` maps to an `<event>` element:

```xml
<thread>
  <event type="human" id="0" iteration="0">What is 2+2?</event>
  <event type="tool_input" id="1" name="calculator" iteration="1">{"expression":"2+2"}</event>
  <event type="tool_output" id="2" name="calculator" status="success" iteration="1">4</event>
  <event type="ai" id="3" iteration="1">The answer is 4.</event>
  <event type="completion" id="4" iteration="1">The answer is 4.</event>
</thread>
```

### Event Type Mapping

| `AgentEvent.type`        | XML `type` attr          | Extra XML attributes                    | Content body                                        |
| ------------------------ | ------------------------ | --------------------------------------- | --------------------------------------------------- |
| `message` (role=user)    | `human`                  | `id`, `iteration`                       | `event.content`                                     |
| `message` (role=assistant)| `ai`                    | `id`, `iteration`                       | `event.content`                                     |
| `message` (role=system)  | `system`                 | `id`, `iteration`                       | `event.content`                                     |
| `tool_call`              | `tool_input`             | `id`, `name`, `iteration`               | `JSON.stringify(event.args)`                         |
| `tool_result`            | `tool_output`            | `id`, `name`, `status`, `iteration`     | `String(event.result)`                               |
| `error`                  | `error`                  | `id`, `iteration`, `recoverable`        | `event.error`                                        |
| `human_input_requested`  | `human_input_requested`  | `id`, `iteration`                       | `event.question`                                     |
| `human_input_received`   | `human_input_received`   | `id`, `iteration`                       | `event.response`                                     |
| `completion`             | `completion`             | `id`, `iteration`                       | `event.result`                                       |
| `summary`                | `summary`                | `id`, `iteration`, `summarizedIterations` | `event.summary`                                    |

### Attribute Details

- **`id`**: Sequential index (0-based) of the event within the serialized array. This is a positional counter, not derived from any event field.
- **`iteration`**: `event.iteration` (number).
- **`name`**: For `tool_call`, this is `event.toolName`. For `tool_result`, the serializer must look back through preceding events to find the matching `tool_call` (by `toolCallId`) and use its `toolName`. If no match is found, use `"unknown"`.
- **`status`**: For `tool_result`, always `"success"`. Error tool results are separate `error` events.
- **`recoverable`**: For `error`, `String(event.recoverable)` (`"true"` or `"false"`).
- **`summarizedIterations`**: For `summary`, `event.summarizedIterations.join(",")`.

### Content Escaping

All text content inside `<event>` tags is XML-escaped via `escapeXml()`. Attribute values are also escaped.

### Response Prefix

When `options.responsePrefix` is provided, it is appended after the closing `</thread>` tag, separated by a newline:

```
<thread>
  ...
</thread>
Based on the above thread, I will now
```

This allows callers to prime the model's response.

---

## FILE STRUCTURE

- `src/xml-serializer.ts` -- `serializeThreadToXml`, `escapeXml`, `XmlSerializerOptions`
- `__tests__/xml-serializer.test.ts` -- unit tests

---

## IMPLEMENTATION NOTES

1. Use plain string concatenation (template literals). No XML library dependency needed.
2. The `tool_result` → `name` lookup requires scanning backward through the events array for a `tool_call` event with a matching `toolCallId`. Build a `Map<string, string>` (toolCallId → toolName) in a single pass before serialization to avoid O(n^2).
3. The `id` attribute is not stored on the event — it is the positional index during serialization.
4. Empty events array produces `<thread>\n</thread>`.

---

## ACCEPTANCE CRITERIA

- [ ] `escapeXml` handles `&`, `<`, `>`, `"`, `'` correctly
- [ ] `serializeThreadToXml([])` returns `<thread>\n</thread>`
- [ ] Each `AgentEvent` type maps to the correct XML `type` attribute per the table above
- [ ] `message` events dispatch on `event.role` to `human`, `ai`, or `system`
- [ ] `tool_call` events serialize `event.args` as JSON in the body
- [ ] `tool_result` events resolve `name` from the matching `tool_call` by `toolCallId`
- [ ] `tool_result` events fall back to `name="unknown"` when no matching `tool_call` exists
- [ ] `error` events include `recoverable` attribute
- [ ] `summary` events include `summarizedIterations` attribute as comma-separated list
- [ ] `responsePrefix` is appended after `</thread>` when provided
- [ ] All attribute values and text content are XML-escaped
- [ ] Output is valid XML (parseable by a standard XML parser)
- [ ] Tests cover all event types, escaping edge cases, missing tool_call lookup, responsePrefix, empty events
- [ ] All tests pass (`pnpm -C packages/deep-factor-agent test`)
