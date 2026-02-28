# Spec: `useMockAgent` — Configurable Mock Agent Hook

## File

`packages/deep-factor-cli/src/testing/mock-agent.ts` (new file)

## Purpose

A drop-in replacement for the `useAgent` hook that replays a configurable sequence of scenario steps on a timer. No LLM calls. Returns the same `UseAgentReturn` interface so all existing components (Chat, Spinner, StatusBar, HumanInput, PromptInput) work unchanged.

---

## Types

```typescript
import type { ChatMessage, AgentStatus, UseAgentReturn } from "../types.js";
import type { TokenUsage, HumanInputRequestedEvent } from "deep-factor-agent";

/**
 * A single step in a mock scenario.
 * Each step fires after its `delay` and mutates the hook state accordingly.
 */
interface MockScenarioStep {
  type: "message" | "tool_call" | "tool_result" | "human_input" | "error" | "done";
  delay: number; // ms before this step fires (relative to previous step)
  data:
    | ChatMessage // for message, tool_call, tool_result
    | { question: string; choices?: string[] } // for human_input
    | { message: string } // for error
    | Record<string, never>; // for done (empty object)
}

interface MockAgentConfig {
  scenario: MockScenarioStep[]; // sequence of events to replay
  usage?: Partial<TokenUsage>; // final token counts reported at done
}
```

## Hook Signature

```typescript
function useMockAgent(config: MockAgentConfig): UseAgentReturn;
```

## State Management

The hook maintains the same state shape as `useAgent`:

| State               | Type                               | Initial                                               |
| ------------------- | ---------------------------------- | ----------------------------------------------------- |
| `messages`          | `ChatMessage[]`                    | `[]`                                                  |
| `status`            | `AgentStatus`                      | `"idle"`                                              |
| `usage`             | `TokenUsage`                       | `{ inputTokens: 0, outputTokens: 0, totalTokens: 0 }` |
| `iterations`        | `number`                           | `0`                                                   |
| `error`             | `Error \| null`                    | `null`                                                |
| `humanInputRequest` | `HumanInputRequestedEvent \| null` | `null`                                                |
| `stepIndex`         | `number`                           | `0` (internal, tracks position in scenario)           |
| `paused`            | `boolean`                          | `false` (internal, true when waiting for human input) |

## `sendPrompt(prompt: string)` Behavior

1. Append `{ role: "user", content: prompt }` to messages
2. Set `status` to `"running"`, clear `error`, clear `humanInputRequest`
3. Reset `stepIndex` to `0`
4. Begin walking through `config.scenario` steps using `setTimeout` chains:
   - For each step at index `i`, schedule it after the cumulative delay from step `i`
   - Each step fires `processStep(step)` (see below)

## `submitHumanInput(response: string)` Behavior

1. If not paused, no-op
2. Set `paused` to `false`
3. Set `status` to `"running"`, clear `humanInputRequest`
4. Append `{ role: "user", content: response }` to messages
5. Resume walking from `stepIndex + 1`

## Step Processing (`processStep`)

| Step Type       | State Mutations                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"message"`     | Append `data` (a `ChatMessage`) to `messages`. If role is `"assistant"`, increment `iterations`.                                                                                                                                      |
| `"tool_call"`   | Append `{ role: "tool_call", content: data.toolName, toolName: data.toolName, toolArgs: data.toolArgs }` to `messages`.                                                                                                               |
| `"tool_result"` | Append `{ role: "tool_result", content: data.content }` to `messages`.                                                                                                                                                                |
| `"human_input"` | Set `status` to `"pending_input"`. Set `humanInputRequest` to `{ type: "human_input_requested", question: data.question, choices: data.choices, timestamp: Date.now(), iteration: iterations }`. Set `paused = true`. Stop advancing. |
| `"error"`       | Set `status` to `"error"`. Set `error` to `new Error(data.message)`. Stop advancing.                                                                                                                                                  |
| `"done"`        | Set `status` to `"done"`. Apply `config.usage` if provided. Increment `iterations`.                                                                                                                                                   |

## Cleanup

Use a `useEffect` cleanup function to clear any pending `setTimeout` handles when the component unmounts, preventing state updates after unmount.

```typescript
const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

// In sendPrompt: push each setTimeout handle to timeoutsRef
// In useEffect cleanup: clear all pending timeouts
useEffect(() => {
  return () => {
    timeoutsRef.current.forEach(clearTimeout);
  };
}, []);
```

---

## Preset Scenario Factories

All factories return `MockAgentConfig`. Exported as named functions.

### `slowConversation(delayMs = 1500): MockAgentConfig`

Simulates a normal conversation with noticeable pauses:

```
Step 0: message (user echo)      delay: 0
Step 1: tool_call (search)       delay: delayMs
Step 2: tool_result              delay: delayMs
Step 3: message (assistant)      delay: delayMs
Step 4: done                     delay: 100
```

### `rapidBurst(count = 50, delayMs = 10): MockAgentConfig`

Floods tool_call + tool_result pairs to stress rendering:

```
Step 0..2n-1: alternating tool_call/tool_result    delay: delayMs each
Step 2n:      message (assistant summary)          delay: delayMs
Step 2n+1:    done                                 delay: 0
```

Total: `count` pairs → `2 * count + 2` steps.

### `mixedPressure(): MockAgentConfig`

Alternates between slow (2000ms) and fast (10ms) phases:

```
Phase 1 (slow):  3 steps at 2000ms each (tool_call, tool_result, assistant message)
Phase 2 (fast):  10 steps at 10ms each (tool_call/tool_result pairs)
Phase 3 (slow):  2 steps at 2000ms each (assistant message, done)
```

### `longRunning(iterations = 20, delayMs = 500): MockAgentConfig`

Many iteration cycles to test scroll/memory:

```
For each iteration i (0..iterations-1):
  Step: tool_call   delay: delayMs
  Step: tool_result  delay: delayMs
  Step: message (assistant "Iteration {i+1} complete")  delay: delayMs
Final: done  delay: 0
```

Total: `3 * iterations + 1` steps.

### `errorRecovery(): MockAgentConfig`

Normal flow → error → recovery → done:

```
Step 0: tool_call              delay: 500
Step 1: tool_result            delay: 500
Step 2: error ("API timeout")  delay: 1000
```

Note: After the error step, the scenario stops. To test recovery, the dev script can call `sendPrompt` again with a new scenario that succeeds. This matches how the real agent works — errors terminate the run and the user retries.

### `humanInputFlow(): MockAgentConfig`

Reaches pending_input state, waits for submitHumanInput, then continues:

```
Step 0: tool_call                    delay: 500
Step 1: tool_result                  delay: 500
Step 2: human_input ("Pick one", choices: ["Option A", "Option B"])  delay: 500
--- pauses here until submitHumanInput() ---
Step 3: message (assistant "You chose: ...")  delay: 500
Step 4: done                                  delay: 100
```

### `largePayload(charCount = 5000): MockAgentConfig`

Single assistant message with very long content:

```
Step 0: message (assistant, "A".repeat(charCount))  delay: 100
Step 1: done  delay: 0
```

Usage: `{ inputTokens: 50, outputTokens: Math.ceil(charCount / 4), totalTokens: 50 + Math.ceil(charCount / 4) }`

---

## Acceptance Criteria

- [ ] `useMockAgent` returns the exact same `UseAgentReturn` shape as `useAgent`
- [ ] `sendPrompt()` transitions status: idle → running → (varies by scenario) → done
- [ ] `submitHumanInput()` resumes from paused human_input step
- [ ] Timeouts are cleaned up on unmount (no "state update after unmount" warnings)
- [ ] All 7 preset factories return valid `MockAgentConfig` objects
- [ ] Each preset produces the documented step sequence
- [ ] TypeScript compiles without errors
- [ ] No imports from `deep-factor-agent` runtime code (only type imports)
