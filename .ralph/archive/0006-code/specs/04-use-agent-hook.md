# SPEC-04: useAgent Hook — Agent Integration

## CONTEXT

### Problem Statement

React Ink components need a hook that wraps `createDeepFactorAgent()` into React state, managing the agent lifecycle (create, run, collect events, handle human-in-the-loop, track usage).

### RELEVANT FILES
- `packages/deep-factor-agent/src/create-agent.ts` — `createDeepFactorAgent(settings)`
- `packages/deep-factor-agent/src/types.ts` — `AgentResult`, `PendingResult`, `isPendingResult`, `AgentEvent`, `TokenUsage`
- `packages/deep-factor-agent/src/agent.ts` — `DeepFactorAgent.loop(prompt)`, `AgentThread.events`
- `packages/deep-factor-agent/src/human-in-the-loop.ts` — `requestHumanInput` tool
- `packages/deep-factor-agent/src/stop-conditions.ts` — `maxIterations(n)`

---

## OVERVIEW

Implement `src/hooks/useAgent.ts` — the core React hook that bridges `deep-factor-agent` into ink component state.

---

## USER STORIES

### US-01: Agent Lifecycle Hook

**As a** component author
**I want** a `useAgent()` hook that manages agent state
**So that** components can reactively render messages, status, and usage

#### Hook Signature

```ts
interface UseAgentOptions {
  model: string;
  maxIter: number;
  tools?: StructuredToolInterface[];
  verbose?: boolean;
}

type AgentStatus = "idle" | "running" | "done" | "error" | "pending_input";

interface ChatMessage {
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}

interface UseAgentReturn {
  messages: ChatMessage[];
  status: AgentStatus;
  usage: TokenUsage;
  iterations: number;
  error: Error | null;
  sendPrompt: (prompt: string) => void;
  submitHumanInput: (response: string) => void;
  humanInputRequest: HumanInputRequestedEvent | null;
}

function useAgent(options: UseAgentOptions): UseAgentReturn;
```

#### State Management

1. **`sendPrompt(prompt)`** — creates agent via `createDeepFactorAgent()`, runs `agent.loop(prompt)`
2. **Running state** — sets status to `"running"`, accumulates messages from `AgentThread.events`
3. **Completion** — `AgentResult` received, status → `"done"`, extract final usage/iterations
4. **Human-in-the-loop** — `isPendingResult(result)` returns true, status → `"pending_input"`, store `PendingResult.resume`
5. **`submitHumanInput(response)`** — calls `pendingResult.resume(response)`, status → `"running"` again
6. **Error** — catch errors, status → `"error"`, store error object

#### Event → Message Mapping

Extract `ChatMessage` entries from `AgentThread.events`:

| AgentEvent type | ChatMessage role | content |
|-----------------|-----------------|---------|
| `"message"` (role=user) | `"user"` | `event.content` |
| `"message"` (role=assistant) | `"assistant"` | `event.content` |
| `"tool_call"` | `"tool_call"` | `event.toolName` + `event.args` |
| `"tool_result"` | `"tool_result"` | `event.result` |

#### Acceptance Criteria

- [ ] Creates agent with `createDeepFactorAgent({ model, tools, stopWhen: [maxIterations(maxIter)] })`
- [ ] Includes `requestHumanInput` in tools when no custom interruptOn provided
- [ ] `sendPrompt()` runs `agent.loop()` in useEffect, updates state reactively
- [ ] Messages extracted from `AgentThread.events` after each iteration
- [ ] `isPendingResult()` check triggers `pending_input` status
- [ ] `submitHumanInput()` calls `result.resume()` and continues the loop
- [ ] Usage accumulated from `AgentResult.usage`
- [ ] Errors caught and exposed via `error` + status `"error"`
- [ ] Hook is re-entrant: `sendPrompt()` can be called multiple times in interactive mode

---

## DEPENDENCY ORDER

```
SPEC-02 (scaffold) → SPEC-04 (useAgent)
                          |
            +-------------+-------------+
            v                           v
      SPEC-03 (app.tsx)          SPEC-05 (components)
```
