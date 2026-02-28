# Spec: Dev Script for Manual UX Testing

## File

`packages/deep-factor-cli/scripts/tui-dev.tsx` (new file)

## Purpose

A standalone script that renders the app with a mock agent scenario for manual UX testing. Selectable scenarios via CLI argument. Run directly with `tsx` (no build step needed).

---

## Usage

```bash
pnpm -C packages/deep-factor-cli tui:dev                     # default: mixedPressure
pnpm -C packages/deep-factor-cli tui:dev --scenario slow      # slow conversation
pnpm -C packages/deep-factor-cli tui:dev --scenario burst     # rapid burst (50 events)
pnpm -C packages/deep-factor-cli tui:dev --scenario mixed     # mixed pressure (default)
pnpm -C packages/deep-factor-cli tui:dev --scenario long      # long running (20 iterations)
pnpm -C packages/deep-factor-cli tui:dev --scenario error     # error recovery flow
pnpm -C packages/deep-factor-cli tui:dev --scenario human     # human input flow
pnpm -C packages/deep-factor-cli tui:dev --scenario large     # large payload
```

## Implementation

```tsx
#!/usr/bin/env tsx
import React from "react";
import { render } from "ink";
import { MockApp } from "../src/testing/MockApp.js";

// Parse --scenario arg from process.argv
const scenarioArg = process.argv.find((_, i, arr) => arr[i - 1] === "--scenario");
const scenario = (scenarioArg ?? "mixed") as
  | "slow"
  | "burst"
  | "mixed"
  | "long"
  | "error"
  | "human"
  | "large";

const validScenarios = ["slow", "burst", "mixed", "long", "error", "human", "large"];
if (!validScenarios.includes(scenario)) {
  console.error(`Unknown scenario: ${scenario}`);
  console.error(`Valid scenarios: ${validScenarios.join(", ")}`);
  process.exit(1);
}

console.log(`Starting TUI dev mode with scenario: ${scenario}`);
console.log("Type a prompt and press Enter to trigger the mock agent.\n");

render(<MockApp scenario={scenario} />);
```

## Arg Parsing Approach

Use simple `process.argv` parsing rather than importing `meow` — this is a dev script, not a user-facing CLI. Keep it minimal.

## What the Developer Sees

1. Script starts, prints which scenario is active
2. App renders inline (not fullscreen — fullscreen TUI isn't built yet)
3. Interactive mode: prompt input (`>`) is shown
4. Developer types a prompt, presses Enter
5. Mock agent replays the scenario's steps with configured delays
6. Developer observes rendering behavior: spinner, messages, tool calls, status bar
7. For `human` scenario: HumanInput component appears, developer types response
8. Ctrl+C to exit

## Notes

- The script runs the source `.tsx` directly via `tsx` — no build step needed
- This is a dev-only tool; it's not shipped in the package
- The script imports from `../src/testing/MockApp.js` (relative to `scripts/`)
- `tsx` resolves `.js` extensions to `.ts`/`.tsx` source files automatically

---

## Acceptance Criteria

- [ ] `pnpm -C packages/deep-factor-cli tui:dev` runs without error
- [ ] Default scenario is `mixed` when no `--scenario` arg
- [ ] Each valid scenario name renders the corresponding mock
- [ ] Invalid scenario name prints error and exits with code 1
- [ ] App renders interactively with prompt input
- [ ] Mock agent events fire with correct delays
- [ ] Ctrl+C cleanly exits
- [ ] No build step required (runs via `tsx`)
