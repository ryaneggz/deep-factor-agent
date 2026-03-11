# Architecture Overview

deep-factor-agent is a monorepo with two packages that together provide a programmable AI agent framework and an interactive terminal interface.

```
┌─────────────────────────────────────────────────────────┐
│                    deep-factor-tui                       │
│  CLI entry point · Ink/React TUI · Session persistence  │
│  Default tools (bash, read, write, edit)                │
│  Print mode · Unified log streaming                     │
├─────────────────────────────────────────────────────────┤
│                   deep-factor-agent                      │
│  Agent loop · Middleware · Stop conditions               │
│  Context management · Human-in-the-loop                 │
│  Providers · Unified log format · Tool display          │
└─────────────────────────────────────────────────────────┘
```

## Package Relationships

**deep-factor-agent** is the core library. It has no dependency on the TUI and can be used standalone in any TypeScript project.

**deep-factor-tui** depends on deep-factor-agent. It provides the `deepfactor` CLI binary, the interactive terminal UI, default file/bash tools, session persistence, and print-mode output.

## Core Concepts

### Agent Loop

The `DeepFactorAgent` class runs an iterative loop:

```
User prompt → Build messages → Invoke model → Check tool calls
     ↑                                              │
     │         ┌────────────────────────────────────┘
     │         ▼
     │    Execute tools → Record events → Evaluate stop conditions
     │         │
     └─────────┘ (continue if not stopped)
```

Each iteration produces events (`message`, `tool_call`, `tool_result`, etc.) appended to an `AgentThread`. The loop continues until the model returns no tool calls, a stop condition triggers, or human input is needed.

### Event-Driven Architecture

All state changes are recorded as typed events on the thread:

```typescript
type AgentEventType =
  | "message"
  | "tool_call"
  | "tool_result"
  | "approval"
  | "human_input_requested"
  | "human_input_received"
  | "error"
  | "completion"
  | "plan"
  | "summary";
```

This makes the agent fully observable: middleware hooks into iteration boundaries, the TUI streams events for real-time display, and the unified log format serializes events to JSONL for replay.

### Execution Modes

| Mode      | Behavior                                                |
| --------- | ------------------------------------------------------- |
| `plan`    | Denies mutating tools. Returns a plan for human review. |
| `approve` | Gates mutating tools on explicit user approval.         |
| `yolo`    | Executes all tools without restriction.                 |

Modes are enforced at tool execution time. Tools declare `mutatesState` in their metadata; the agent checks this against the current mode before executing.

### Message Building

Two context modes control how the conversation is sent to the model:

- **`standard`** (default): Individual LangChain messages (`HumanMessage`, `AIMessage`, `ToolMessage`)
- **`xml`**: The full thread is serialized into a `<thread>` XML document, useful for long-context coherence with some models

### Provider Abstraction

The agent accepts either:

- A **string model ID** (e.g., `"openai:gpt-4.1-mini"`) resolved via LangChain's `initChatModel`
- A **`BaseChatModel`** instance from LangChain
- A **`ModelAdapter`** for non-LangChain backends (Claude CLI, Codex CLI, Claude Agent SDK)

See [providers.md](./providers.md) for details.

### Middleware Pipeline

Middleware runs before and after each iteration:

```
beforeIteration(context) → Agent iteration → afterIteration(context)
```

Middleware can inject tools, modify thread state, and provide system feedback. Built-in middleware includes `todoMiddleware` (task tracking) and `errorRecoveryMiddleware` (error nudging).

### Context Management

When thread token count exceeds `maxContextTokens` (default: 150,000), the `ContextManager` summarizes older iterations while preserving the most recent `keepRecentIterations` (default: 3). Summaries are injected into the system prompt.

### Unified Log Format

All providers emit events in a common JSONL format with 16 event types. This enables cross-provider replay, validation, and tooling. See [unified-log.md](./unified-log.md) for the full specification.
