# Unified Log Format

All providers emit events in a common JSONL format. Each line is a self-contained JSON object representing one log entry.

## Common Fields

Every log entry contains:

```typescript
interface UnifiedLogBase {
  type: string; // event type (see below)
  sessionId: string; // unique session identifier
  timestamp: number; // Unix epoch ms
  sequence: number; // monotonically increasing counter
  providerMeta?: any; // optional provider-specific data
}
```

## Event Types

### `init`

Session initialization. Always the first entry.

| Field      | Type    | Description                              |
| ---------- | ------- | ---------------------------------------- |
| `provider` | string  | Provider name (langchain, claude, codex) |
| `model`    | string? | Model identifier                         |
| `mode`     | string? | Execution mode (plan, approve, yolo)     |

### `message`

User, assistant, or system message.

| Field     | Type   | Description                       |
| --------- | ------ | --------------------------------- |
| `role`    | string | "user" \| "assistant" \| "system" |
| `content` | string | Message text                      |

### `thinking`

Extended reasoning / thinking blocks (Claude extended thinking).

| Field     | Type   | Description   |
| --------- | ------ | ------------- |
| `content` | string | Thinking text |

### `tool_call`

Tool invocation.

| Field           | Type    | Description                          |
| --------------- | ------- | ------------------------------------ |
| `toolName`      | string  | Tool name                            |
| `toolCallId`    | string  | Unique call identifier               |
| `args`          | object  | Tool arguments                       |
| `display`       | object? | Display metadata (kind, label, path) |
| `parallelGroup` | string? | Group ID for parallel calls          |

### `tool_result`

Tool execution result.

| Field           | Type     | Description                   |
| --------------- | -------- | ----------------------------- |
| `toolCallId`    | string   | Matching call identifier      |
| `toolName`      | string   | Tool name                     |
| `result`        | string   | Result content                |
| `isError`       | boolean? | Whether the tool errored      |
| `durationMs`    | number?  | Execution time                |
| `display`       | object?  | Display metadata              |
| `parallelGroup` | string?  | Group ID for parallel results |

### `file_change`

File modification detected.

| Field        | Type    | Description                        |
| ------------ | ------- | ---------------------------------- |
| `changeType` | string  | "created" \| "edited" \| "deleted" |
| `filePath`   | string  | File path                          |
| `additions`  | number? | Lines added                        |
| `deletions`  | number? | Lines removed                      |

### `error`

Error during execution.

| Field         | Type     | Description               |
| ------------- | -------- | ------------------------- |
| `message`     | string   | Error message             |
| `recoverable` | boolean? | Whether agent can recover |

### `approval`

Approval decision for gated tool execution.

| Field      | Type    | Description                     |
| ---------- | ------- | ------------------------------- |
| `decision` | string  | "approve" \| "reject" \| "edit" |
| `toolName` | string? | Tool being approved             |
| `response` | string? | Edit feedback                   |

### `human_input_requested`

Agent is requesting human input.

| Field      | Type      | Description                                  |
| ---------- | --------- | -------------------------------------------- |
| `question` | string    | What the agent is asking                     |
| `urgency`  | string?   | "low" \| "medium" \| "high"                  |
| `format`   | string?   | "free_text" \| "yes_no" \| "multiple_choice" |
| `choices`  | string[]? | Available choices                            |

### `human_input_received`

Human response to input request.

| Field      | Type   | Description    |
| ---------- | ------ | -------------- |
| `response` | string | Human's answer |

### `plan`

Plan output in plan mode.

| Field     | Type   | Description |
| --------- | ------ | ----------- |
| `content` | string | Plan text   |

### `summary`

Context summarization output.

| Field               | Type    | Description                         |
| ------------------- | ------- | ----------------------------------- |
| `content`           | string  | Summary text                        |
| `iterationsCovered` | number? | How many iterations were summarized |

### `status`

Periodic status update.

| Field        | Type    | Description             |
| ------------ | ------- | ----------------------- |
| `status`     | string  | Current status          |
| `iterations` | number? | Current iteration count |
| `usage`      | object? | Token usage snapshot    |

### `rate_limit`

Rate limit hit.

| Field          | Type    | Description           |
| -------------- | ------- | --------------------- |
| `retryAfterMs` | number? | Suggested retry delay |

### `completion`

Iteration completion marker.

| Field        | Type    | Description          |
| ------------ | ------- | -------------------- |
| `stopReason` | string? | Why the loop stopped |
| `iterations` | number? | Total iterations     |
| `usage`      | object? | Final token usage    |

### `result`

Final result. Always the last entry.

| Field        | Type    | Description         |
| ------------ | ------- | ------------------- |
| `content`    | string  | Final response text |
| `stopReason` | string? | Why execution ended |
| `iterations` | number? | Total iterations    |
| `usage`      | object? | Final token usage   |

## Example JSONL

```jsonl
{"type":"init","sessionId":"abc123","timestamp":1710000000000,"sequence":1,"provider":"langchain","model":"gpt-4.1-mini"}
{"type":"message","sessionId":"abc123","timestamp":1710000000100,"sequence":2,"role":"user","content":"What is 2+2?"}
{"type":"message","sessionId":"abc123","timestamp":1710000001200,"sequence":3,"role":"assistant","content":"2 + 2 = 4."}
{"type":"status","sessionId":"abc123","timestamp":1710000001300,"sequence":4,"status":"completed","iterations":1}
{"type":"completion","sessionId":"abc123","timestamp":1710000001400,"sequence":5,"stopReason":"done","iterations":1}
{"type":"status","sessionId":"abc123","timestamp":1710000001500,"sequence":6,"status":"done"}
{"type":"result","sessionId":"abc123","timestamp":1710000001600,"sequence":7,"content":"2 + 2 = 4."}
```

## Validation

Use the smoke test validator to check log files:

```bash
node docs/smoke-tests/validate-smoke-logs.mjs <file.jsonl> [...]
```

Validation checks:

- Required base fields on every entry
- Monotonically increasing sequence numbers
- `init` as first entry, `result` as last
- Consistent session ID
- No raw tool JSON leaked in assistant messages
- No consecutive identical status entries
- Matching `tool_call`/`tool_result` pairs by `toolCallId`

See [smoke-tests/SMOKE_TEST_PLAN.md](./smoke-tests/SMOKE_TEST_PLAN.md) for the full test matrix.
