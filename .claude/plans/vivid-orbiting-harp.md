# Plan: Backpressure Testing Scaffold for TUI UX

## Context

Before implementing the fullscreen TUI (`--ui` flag, inspired by [ruska-cli](https://github.com/ruska-ai/ruska-cli)), we need a testing environment that can exercise the TUI under various load conditions. The current `useAgent` hook calls a real LLM, making UX testing slow, expensive, and non-deterministic. A mock agent with configurable timing (slow streaming, rapid bursts) will let QA validate rendering, state transitions, and backpressure handling both manually and in CI.

---

## Step 1: Create `MockAgentProvider` — configurable mock useAgent hook

**New file:** `packages/deep-factor-cli/src/testing/mock-agent.ts`

A drop-in replacement for `useAgent` that drives the same `UseAgentReturn` interface through a configurable scenario script. No real LLM calls.

```ts
interface MockScenarioStep {
  type: "message" | "tool_call" | "tool_result" | "human_input" | "error" | "done";
  delay: number;           // ms before this step fires
  data: Partial<ChatMessage> | { question: string; choices?: string[] } | { message: string };
}

interface MockAgentConfig {
  scenario: MockScenarioStep[];  // sequence of events to replay
  usage?: Partial<TokenUsage>;   // final token counts
}
```

**Preset scenarios** (exported factory functions):
- `slowConversation(delayMs = 1500)` — user msg → 1.5s pause → tool call → 1.5s pause → tool result → 1.5s pause → assistant response → done
- `rapidBurst(count = 50, delayMs = 10)` — floods `count` tool_call + tool_result pairs with `delayMs` between each, then final assistant response
- `mixedPressure()` — alternates between slow (2s) and fast (10ms) phases to simulate real-world LLM behavior
- `longRunning(iterations = 20, delayMs = 500)` — many iteration cycles with moderate delay (tests memory/scroll)
- `errorRecovery()` — normal flow → error → recovery → done
- `humanInputFlow()` — reaches pending_input state, waits for input, then continues
- `largePayload(charCount = 5000)` — single assistant message with very long content (tests wrapping/truncation)

**Implementation:** A `useMockAgent` hook that:
1. Accepts `MockAgentConfig`
2. Maintains the same state shape as `useAgent` (`messages`, `status`, `usage`, `iterations`, `error`, `humanInputRequest`)
3. When `sendPrompt()` is called, walks through `scenario` steps using `setTimeout` chains
4. When `submitHumanInput()` is called, resumes from the paused step
5. Exposes the same `UseAgentReturn` interface

## Step 2: Create `MockApp` wrapper component

**New file:** `packages/deep-factor-cli/src/testing/MockApp.tsx`

A thin wrapper that renders the existing `App` component (or future TUI) but injects `useMockAgent` instead of the real `useAgent`. Uses React context to swap the hook.

Approach: Create an `AgentContext` that the `App` component reads from:

```tsx
// src/testing/agent-context.tsx
const AgentContext = createContext<UseAgentReturn | null>(null);
export const AgentProvider = AgentContext.Provider;
export function useAgentContext() { return useContext(AgentContext); }
```

Then refactor `App` to check for context first: `const agent = useAgentContext() ?? useAgent(options);`

This is a minimal, non-breaking change — when no context is provided (production), it falls back to the real hook.

## Step 3: Create dev script for manual UX testing

**New file:** `packages/deep-factor-cli/scripts/tui-dev.tsx`

A standalone script that renders the app with a mock agent scenario, selectable via CLI arg:

```bash
pnpm tui:dev                    # default: mixedPressure scenario
pnpm tui:dev --scenario slow    # slow conversation
pnpm tui:dev --scenario burst   # rapid burst (50 events)
pnpm tui:dev --scenario long    # long running (20 iterations)
pnpm tui:dev --scenario error   # error recovery flow
pnpm tui:dev --scenario human   # human input flow
pnpm tui:dev --scenario large   # large payload
```

Add script to `package.json`:
```json
"tui:dev": "tsx scripts/tui-dev.tsx"
```

This requires adding `tsx` as a devDependency (for running .tsx directly without build).

## Step 4: Create automated ink-testing-library tests

**New file:** `packages/deep-factor-cli/__tests__/tui/backpressure.test.tsx`

Tests using ink-testing-library + vitest that exercise the app under each scenario:

### Test cases:

**Slow scenario:**
- Status transitions: idle → running → done (with correct intermediate states)
- Messages appear in correct order after delays
- Spinner visible during running state, hidden after

**Rapid burst scenario:**
- All messages eventually render (none dropped)
- No crash or unhandled exception under rapid state changes
- Status bar token counts update correctly
- Final frame contains assistant response

**Mixed pressure scenario:**
- Transitions between slow and fast phases are smooth
- Tool calls/results appear correctly in verbose mode

**Long running scenario:**
- High iteration count renders without performance degradation
- `Static` component prevents re-rendering of old messages (check frame stability)
- StatusBar iteration count matches expected

**Error recovery scenario:**
- Error message appears, then clears when recovery succeeds
- Status goes: running → error → running → done

**Human input scenario:**
- HumanInput component appears when pending_input
- Simulating stdin input calls submitHumanInput
- Resumes correctly after input

**Large payload scenario:**
- Long content renders without crash
- Content is visible (not swallowed)

### Implementation pattern:
```tsx
// Each test creates a MockAgentConfig, renders App with AgentProvider,
// advances time with vi.advanceTimersByTime(), and asserts on lastFrame()
vi.useFakeTimers();

test("rapid burst renders all messages", async () => {
  const config = rapidBurst(50, 10);
  const mock = useMockAgent(config); // or render via MockApp
  const { lastFrame } = render(<MockApp scenario="burst" />);

  // Advance through all 50 events
  for (let i = 0; i < 50; i++) {
    await vi.advanceTimersByTimeAsync(10);
  }

  expect(lastFrame()).toContain("assistant response");
  // Verify message count
});
```

## Step 5: Add npm script entries

**File:** `packages/deep-factor-cli/package.json`

```json
"scripts": {
  ...existing,
  "tui:dev": "tsx scripts/tui-dev.tsx",
  "test:backpressure": "vitest run --testPathPattern=tui/backpressure"
}
```

**New devDependency:** `tsx` (for running TypeScript scripts directly)

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/deep-factor-cli/src/testing/mock-agent.ts` | **New** — mock useAgent hook + preset scenarios |
| `packages/deep-factor-cli/src/testing/agent-context.tsx` | **New** — React context for hook injection |
| `packages/deep-factor-cli/src/testing/MockApp.tsx` | **New** — wrapper that injects mock agent |
| `packages/deep-factor-cli/src/testing/index.ts` | **New** — barrel export |
| `packages/deep-factor-cli/src/app.tsx` | **Modify** — add `useAgentContext()` fallback (1 line change) |
| `packages/deep-factor-cli/scripts/tui-dev.tsx` | **New** — manual testing dev script |
| `packages/deep-factor-cli/__tests__/tui/backpressure.test.tsx` | **New** — automated backpressure tests |
| `packages/deep-factor-cli/package.json` | **Modify** — add scripts + tsx devDependency |

## Existing Code Reused

- `UseAgentReturn` interface — `src/types.ts:25-34`
- `ChatMessage` type — `src/types.ts:12-17`
- `AgentStatus` type — `src/types.ts:10`
- `TokenUsage` type — from `deep-factor-agent` (`packages/deep-factor-agent/src/types.ts:97-103`)
- `HumanInputRequestedEvent` type — from `deep-factor-agent` (`packages/deep-factor-agent/src/types.ts:43-50`)
- `App` component — `src/app.tsx` (rendered in MockApp and tests)
- All existing components (Chat, StatusBar, Spinner, etc.) — tested implicitly through App
- Existing test patterns (vi.hoisted mocks, ink-testing-library render) — `__tests__/app.test.tsx`

## Verification

1. **Build:** `pnpm -C packages/deep-factor-cli build`
2. **Type check:** `pnpm -C packages/deep-factor-cli type-check`
3. **Existing tests pass:** `pnpm -C packages/deep-factor-cli test`
4. **Backpressure tests pass:** `pnpm -C packages/deep-factor-cli test:backpressure`
5. **Manual dev script works:**
   - `pnpm -C packages/deep-factor-cli tui:dev` — shows interactive app with mock agent
   - `pnpm -C packages/deep-factor-cli tui:dev --scenario burst` — rapid events render correctly
   - `pnpm -C packages/deep-factor-cli tui:dev --scenario slow` — delays are visible
6. **Normal CLI still works:** `node packages/deep-factor-cli/dist/cli.js --interactive` — unchanged behavior
