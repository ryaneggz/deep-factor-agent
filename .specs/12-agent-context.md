# Spec: AgentContext — React Context for Hook Injection

## Files

- `packages/deep-factor-cli/src/testing/agent-context.tsx` (new file)
- `packages/deep-factor-cli/src/app.tsx` (modify — 1-line change)

## Purpose

A React context that allows injecting a `UseAgentReturn` value into the component tree, enabling `App` to use either the real `useAgent` hook (production) or a mock (testing) without changing its props interface. This is a minimal, non-breaking change.

---

## New File: `agent-context.tsx`

```typescript
import { createContext, useContext } from "react";
import type { UseAgentReturn } from "../types.js";

const AgentContext = createContext<UseAgentReturn | null>(null);

/** Provider to inject a UseAgentReturn value (real or mock) */
export const AgentProvider = AgentContext.Provider;

/**
 * Consume the injected agent state.
 * Returns null when no provider is present (production default).
 */
export function useAgentContext(): UseAgentReturn | null {
  return useContext(AgentContext);
}
```

### API Surface

| Export            | Type                                     | Description                                 |
| ----------------- | ---------------------------------------- | ------------------------------------------- |
| `AgentProvider`   | `React.Provider<UseAgentReturn \| null>` | Wraps components to inject agent state      |
| `useAgentContext` | `() => UseAgentReturn \| null`           | Reads injected state; `null` if no provider |

---

## Modified File: `app.tsx`

### Current Code (line 19-28)

```typescript
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

### Required Change

Add import and use context-first pattern:

```typescript
import { useAgentContext } from "./testing/agent-context.js";
```

Replace the `useAgent` call:

```typescript
const agentFromContext = useAgentContext();

const {
  messages,
  status,
  usage,
  iterations,
  error,
  sendPrompt,
  submitHumanInput,
  humanInputRequest,
} = agentFromContext ?? useAgent({ model, maxIter, tools });
```

### Behavior

| Scenario                 | `useAgentContext()` returns | `App` uses                     |
| ------------------------ | --------------------------- | ------------------------------ |
| Production (no provider) | `null`                      | `useAgent(options)` — real LLM |
| Testing (MockApp wraps)  | `UseAgentReturn` from mock  | Injected mock — no LLM         |

### Important: React Rules of Hooks

The `useAgent` hook is still called unconditionally at the top level — it is never behind a conditional. The `agentFromContext ?? useAgent(...)` pattern is valid because both hooks always execute. The nullish coalescing only determines which _result_ is destructured.

**Wait — this violates the intent.** If `agentFromContext` is non-null, we still call `useAgent` (which creates a real agent on `sendPrompt`). This is wasteful but not broken because `sendPrompt` is never called (MockApp doesn't wire it). However, we should avoid creating the real agent.

**Revised approach:** Since `useAgent` only creates an agent when `sendPrompt` is called (it's lazy), calling it when unused is harmless — it just initializes empty React state. The real agent is never instantiated. This is acceptable.

**Alternative (cleaner but more invasive):** Make `useAgent` accept an `enabled` option. But this adds complexity for a testing concern. The plan's approach (context fallback) is simpler and sufficient.

---

## Acceptance Criteria

- [ ] `AgentProvider` and `useAgentContext` are exported from `agent-context.tsx`
- [ ] `App` imports `useAgentContext` from `./testing/agent-context.js`
- [ ] When no `AgentProvider` wraps `App`, behavior is 100% unchanged (context returns `null`, falls back to `useAgent`)
- [ ] When `AgentProvider` wraps `App` with a mock value, `App` uses the mock value
- [ ] All existing tests pass without modification (they mock `useAgent` at the module level, which still works)
- [ ] TypeScript compiles without errors
- [ ] No conditional hook calls introduced
