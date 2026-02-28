# Spec: MockApp — Test Wrapper Component

## File

`packages/deep-factor-cli/src/testing/MockApp.tsx` (new file)

## Purpose

A thin wrapper that renders `<App>` inside an `<AgentProvider>` powered by `useMockAgent`. Provides a one-line way to render the entire app with mock data in tests and dev scripts.

---

## Props Interface

```typescript
import type { MockAgentConfig } from "./mock-agent.js";

interface MockAppProps {
  /** Pre-built mock config, OR use `scenario` shorthand */
  config?: MockAgentConfig;

  /** Shorthand: scenario name to use a preset factory */
  scenario?: "slow" | "burst" | "mixed" | "long" | "error" | "human" | "large";

  /** App props that still matter for rendering */
  verbose?: boolean; // default: true
  interactive?: boolean; // default: true
}
```

## Behavior

1. Resolve config:
   - If `config` is provided, use it directly
   - If `scenario` is provided, call the matching preset factory
   - If neither, default to `mixedPressure()`

2. Call `useMockAgent(resolvedConfig)` to get mock `UseAgentReturn`

3. Render:

```tsx
<AgentProvider value={mockAgent}>
  <App
    model="mock-model"
    maxIter={99}
    verbose={verbose ?? true}
    enableBash={false}
    interactive={interactive ?? true}
  />
</AgentProvider>
```

## Scenario Name Mapping

```typescript
import {
  slowConversation,
  rapidBurst,
  mixedPressure,
  longRunning,
  errorRecovery,
  humanInputFlow,
  largePayload,
} from "./mock-agent.js";

const presets: Record<string, () => MockAgentConfig> = {
  slow: slowConversation,
  burst: rapidBurst,
  mixed: mixedPressure,
  long: longRunning,
  error: errorRecovery,
  human: humanInputFlow,
  large: largePayload,
};

function resolveConfig(props: MockAppProps): MockAgentConfig {
  if (props.config) return props.config;
  const factory = presets[props.scenario ?? "mixed"];
  return factory();
}
```

## Imports

```typescript
import React from "react";
import { App } from "../app.js";
import { AgentProvider } from "./agent-context.js";
import { useMockAgent } from "./mock-agent.js";
import type { MockAgentConfig } from "./mock-agent.js";
```

## Usage Examples

```tsx
// In tests:
import { render } from "ink-testing-library";
import { MockApp } from "../src/testing/MockApp.js";

const { lastFrame } = render(<MockApp scenario="burst" />);

// In dev script:
import { render } from "ink";
import { MockApp } from "../src/testing/MockApp.js";

render(<MockApp scenario="slow" />);

// With custom config:
render(
  <MockApp
    config={{
      scenario: customSteps,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    }}
  />,
);
```

---

## Acceptance Criteria

- [ ] `MockApp` renders `App` wrapped in `AgentProvider`
- [ ] Passing `scenario="burst"` uses `rapidBurst()` preset
- [ ] Passing `config={...}` uses custom config directly
- [ ] Default scenario is `mixedPressure()` when neither prop is given
- [ ] `verbose` defaults to `true`, `interactive` defaults to `true`
- [ ] `enableBash` is always `false` (mock doesn't execute real tools)
- [ ] Component can be rendered with `ink-testing-library`'s `render()`
- [ ] TypeScript compiles without errors
