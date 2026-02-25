# SPEC-05: Ink Components

## CONTEXT

### Problem Statement

The CLI needs a set of React Ink components to render agent output: message history, tool calls, spinner, status bar, human-in-the-loop input, and REPL prompt input.

### RELEVANT SOURCES
- [ink Box/Text](https://github.com/vadimdemedes/ink#components) — layout primitives
- [ink useInput](https://github.com/vadimdemedes/ink#useinput) — keyboard input handling
- [ink Static](https://github.com/vadimdemedes/ink#static) — render items above dynamic area

### RELEVANT FILES
- `packages/deep-factor-cli/src/types.ts` — `ChatMessage`, `AgentStatus`
- `packages/deep-factor-agent/src/types.ts` — `TokenUsage`, `HumanInputRequestedEvent`

---

## OVERVIEW

Implement six presentational components: Chat, ToolCall, Spinner, StatusBar, HumanInput, and PromptInput.

---

## USER STORIES

### US-01: Chat Component (`src/components/Chat.tsx`)

**As a** user
**I want** to see the conversation history color-coded by role
**So that** I can distinguish user, assistant, and tool messages

#### Props
```ts
interface ChatProps {
  messages: ChatMessage[];
  verbose: boolean;
}
```

#### Rendering Rules
- **user** messages: `<Text color="blue">` with `> ` prefix
- **assistant** messages: `<Text color="green">` as plain text
- **tool_call** messages: render `<ToolCall>` component (only when `verbose=true`)
- **tool_result** messages: `<Text color="cyan">` with truncated content (only when `verbose=true`)
- Use `<Static>` for message history to prevent re-rendering of past messages

#### Acceptance Criteria
- [ ] Renders all message types with correct colors
- [ ] Tool messages hidden when `verbose=false`
- [ ] Uses `<Static>` for efficient rendering of message list
- [ ] Empty messages array renders nothing

---

### US-02: ToolCall Component (`src/components/ToolCall.tsx`)

**As a** user
**I want** to see formatted tool call details
**So that** I can understand what tools the agent is invoking

#### Props
```ts
interface ToolCallProps {
  toolName: string;
  args: Record<string, unknown>;
}
```

#### Rendering
```
  Tool: toolName
  Args: { key: "value", ... }
```

- Tool name in `<Text bold>`
- Args JSON-stringified with 2-space indent, dimmed color
- Truncate arg values longer than 120 chars

#### Acceptance Criteria
- [ ] Shows tool name in bold
- [ ] Shows args as formatted JSON
- [ ] Long arg values truncated with `...`

---

### US-03: Spinner Component (`src/components/Spinner.tsx`)

**As a** user
**I want** a visual indicator when the agent is thinking
**So that** I know the CLI is actively working

#### Rendering
- Animated dots: `.` → `..` → `...` → `.` (cycle every 300ms)
- Display: `<Text color="yellow">Thinking{dots}</Text>`
- Use `useState` + `useEffect` with `setInterval`

#### Acceptance Criteria
- [ ] Animates dots while rendered
- [ ] Cleans up interval on unmount
- [ ] Yellow color for visibility

---

### US-04: StatusBar Component (`src/components/StatusBar.tsx`)

**As a** user
**I want** to see token usage and iteration count
**So that** I can monitor agent resource consumption

#### Props
```ts
interface StatusBarProps {
  usage: TokenUsage;
  iterations: number;
  status: AgentStatus;
}
```

#### Rendering
```
─────────────────────────────────
Tokens: 1,234 in / 567 out (1,801 total) | Iterations: 3 | Status: done
```

- Horizontal rule separator
- Numbers formatted with commas
- Status color: green=done, yellow=running, red=error, cyan=pending_input

#### Acceptance Criteria
- [ ] Shows input/output/total tokens
- [ ] Shows iteration count
- [ ] Status indicator with color coding
- [ ] Renders after agent completes (or on each update in verbose mode)

---

### US-05: HumanInput Component (`src/components/HumanInput.tsx`)

**As a** user
**I want** to provide text input when the agent requests it
**So that** I can participate in the human-in-the-loop flow

#### Props
```ts
interface HumanInputProps {
  request: HumanInputRequestedEvent;
  onSubmit: (response: string) => void;
}
```

#### Rendering
- Display question from `request.question`
- If `request.choices`, render numbered list
- Text input field using ink's `useInput` hook
- Submit on Enter key

#### Acceptance Criteria
- [ ] Displays question text
- [ ] Renders choices as numbered list when present
- [ ] Captures text input character by character
- [ ] Submits on Enter, clears input
- [ ] Handles backspace for editing

---

### US-06: PromptInput Component (`src/components/PromptInput.tsx`)

**As a** user in interactive mode
**I want** a prompt input to submit new messages
**So that** I can have a multi-turn conversation

#### Props
```ts
interface PromptInputProps {
  onSubmit: (prompt: string) => void;
}
```

#### Rendering
```
> type your prompt here_
```

- `>` prefix in blue
- Text input with cursor
- Submit on Enter, clear input
- Ctrl+C to exit (handled by ink)

#### Acceptance Criteria
- [ ] Shows `>` prompt prefix
- [ ] Captures text input
- [ ] Submits non-empty text on Enter
- [ ] Clears input after submit
- [ ] Does not submit empty strings

---

## DEPENDENCY ORDER

```
US-01 (Chat) depends on US-02 (ToolCall)
US-03 (Spinner), US-04 (StatusBar), US-05 (HumanInput), US-06 (PromptInput) are independent
```
