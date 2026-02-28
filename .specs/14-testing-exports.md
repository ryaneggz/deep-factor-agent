# Spec: Testing Module Barrel Export

## File

`packages/deep-factor-cli/src/testing/index.ts` (new file)

## Purpose

Barrel export for the testing module so consumers (tests, dev scripts) can import from a single path.

---

## Contents

```typescript
// Mock agent hook + scenario types + preset factories
export {
  useMockAgent,
  slowConversation,
  rapidBurst,
  mixedPressure,
  longRunning,
  errorRecovery,
  humanInputFlow,
  largePayload,
} from "./mock-agent.js";
export type { MockScenarioStep, MockAgentConfig } from "./mock-agent.js";

// Context injection
export { AgentProvider, useAgentContext } from "./agent-context.js";

// Test wrapper component
export { MockApp } from "./MockApp.js";
```

## Import Pattern

Consumers import from the barrel:

```typescript
// In tests:
import { MockApp, rapidBurst } from "../src/testing/index.js";

// In dev script:
import { MockApp } from "../src/testing/index.js";
```

## Notes

- This file is NOT added to the main `src/index.ts` exports. The testing module is internal-only — it is not part of the public package API.
- If it were needed externally in the future, a separate `"./testing"` export path could be added to `package.json` exports map.

---

## Acceptance Criteria

- [ ] All mock-agent exports are re-exported
- [ ] AgentProvider and useAgentContext are re-exported
- [ ] MockApp is re-exported
- [ ] Types (MockScenarioStep, MockAgentConfig) are re-exported
- [ ] Not added to the main `src/index.ts`
- [ ] TypeScript compiles without errors
