# Spec: ChatPane — Chat Content Pane

## File

`packages/deep-factor-cli/src/tui/ChatPane.tsx` (new file)

## Purpose

Chat content pane that reuses the existing `useAgent` hook and display components. Provides the same interactive chat experience as the current `App` component but adapted for the fullscreen TUI layout.

## Props Interface

```typescript
interface ChatPaneProps {
  model: string; // Model identifier
  maxIter: number; // Maximum agent iterations
  enableBash: boolean; // Whether to include the bash tool
}
```

## Internal State & Hooks

### `useAgent` Hook

```typescript
const tools: AgentTools = enableBash ? [bashTool] : [];
const {
  messages,
  status,
  usage,
  iterations,
  error,
  sendPrompt,
  submitHumanInput,
  humanInputRequest,
} = useAgent({ model, maxIter, tools });
```

### Behavior Differences from `App`

| Aspect       | App (inline)                    | ChatPane (TUI)                  |
| ------------ | ------------------------------- | ------------------------------- |
| `verbose`    | Controlled by `--verbose` flag  | Always `true` (show tool calls) |
| Mode         | Single-prompt or interactive    | Always interactive              |
| Exit on done | Yes (single-prompt)             | No (always stays open)          |
| Prompt input | Only in interactive + idle/done | Always shown when idle or done  |

## Layout

Vertical flex container filling the parent's height:

```
┌──────────────────────────────────────────┐
│  [Chat history - scrollable via Static]  │
│  > User message                          │
│  Assistant response...                   │
│  🔧 tool_name(args)                      │
│  ← tool result                           │
│                                          │
│  Thinking...                             │  ← Spinner (when running)
│  ? Human input question                  │  ← HumanInput (when pending)
│  ⚠ Error message                         │  ← Error (when error)
│  ─────────────────────────────────────── │
│  Tokens: 1,234 | Iter: 2 | Status: idle │  ← StatusBar
│  > _                                     │  ← PromptInput
└──────────────────────────────────────────┘
```

### Ink Box Structure

```tsx
<Box flexDirection="column" flexGrow={1}>
  {/* Chat history */}
  <Chat messages={messages} verbose={true} />

  {/* Spinner when running */}
  {status === "running" && <Spinner />}

  {/* Human input when pending */}
  {status === "pending_input" && humanInputRequest && (
    <HumanInput request={humanInputRequest} onSubmit={submitHumanInput} />
  )}

  {/* Error display */}
  {error && (
    <Box>
      <Text color="red">Error: {error.message}</Text>
    </Box>
  )}

  {/* Status bar */}
  <StatusBar usage={usage} iterations={iterations} status={status} />

  {/* Prompt input - always available when idle or done */}
  {(status === "idle" || status === "done") && <PromptInput onSubmit={sendPrompt} />}
</Box>
```

## Component Reuse

All display components are imported from existing sources:

```typescript
import { useAgent } from "../hooks/useAgent.js";
import { Chat } from "../components/Chat.js";
import { Spinner } from "../components/Spinner.js";
import { StatusBar } from "../components/StatusBar.js";
import { HumanInput } from "../components/HumanInput.js";
import { PromptInput } from "../components/PromptInput.js";
import { bashTool } from "../tools/bash.js";
import type { AgentTools } from "../types.js";
```

## Agent Lifecycle

1. **Initial state**: `status === "idle"`, prompt input shown
2. **User sends prompt**: `sendPrompt(text)` called → `status === "running"`
3. **Agent processing**: Spinner shown, messages stream in via `useAgent`
4. **Human input needed**: `status === "pending_input"`, HumanInput component shown
5. **Human responds**: `submitHumanInput(response)` → `status === "running"` again
6. **Agent done**: `status === "done"`, prompt input re-shown for next turn
7. **Error**: Error message shown, prompt input re-shown for retry

## Edge Cases

- If `enableBash` changes (via SettingsPane), the tools array updates on next render. The `useAgent` hook will use updated tools on the next `sendPrompt` call. In-flight requests are unaffected.
- If `model` changes, same behavior — takes effect on next prompt.
- The `Chat` component uses `<Static>` from Ink for efficient rendering of growing message history.

## Acceptance Criteria

- [ ] Renders chat history using existing `Chat` component with `verbose={true}`
- [ ] Shows `Spinner` when agent is running
- [ ] Shows `HumanInput` when agent requests human input
- [ ] Shows error message in red when error occurs
- [ ] Shows `StatusBar` with token/iteration/status info
- [ ] Shows `PromptInput` when idle or done
- [ ] Sending a prompt invokes the agent and displays responses
- [ ] Multi-turn conversation works (maintains thread via `useAgent`)
- [ ] Bash tool included when `enableBash` is true
- [ ] TypeScript compiles without errors
