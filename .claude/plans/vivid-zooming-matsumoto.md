# Manual Testing Queries for IMPLEMENTATION_PLAN.md

**Context:** This document enumerates the exact commands, scripts, and interactive prompts needed to manually verify every item in `.ralph/IMPLEMENTATION_PLAN.md` — both completed (P1) and outstanding (P2–P4).

---

## P1.1 — SPEC-01: Example 12 — Interactive HITL with Multiple Choice (COMPLETE)

### Test 1a: Basic HITL multiple-choice flow

```bash
cd packages/deep-factor-agent
npx tsx examples/12-hitl-multiple-choice.ts
```

**Interactive prompts to send:**
1. `Help me choose a programming language for a CLI tool`
2. Wait for the model to invoke `requestHumanInput` with numbered choices
3. Type a number (e.g. `2`) to select a choice
4. Observe the model continues with the selection
5. Type `quit` to exit

**Verify:**
- Numbered choices render in the terminal
- Selecting by number resolves correctly
- XML thread printed at end of turn contains `<event type="human_input_requested" ...>` and `<event type="human_input_received" ...>`
- Thread event count increments correctly

### Test 1b: Free-text fallback

```bash
npx tsx examples/12-hitl-multiple-choice.ts
```

1. `What color should I paint my room?`
2. When choices appear, type a custom answer instead of a number (e.g. `teal`)
3. Confirm the model incorporates the free-text response

### Test 1c: Multi-turn with bash + HITL

```bash
npx tsx examples/12-hitl-multiple-choice.ts
```

1. `List the files in the current directory and then ask me which one to read`
2. Observe bash tool call for `ls`, then HITL prompt with file choices
3. Select a file
4. Observe bash tool call for `cat <file>` and final summary
5. Confirm XML thread shows interleaved `tool_input`, `tool_output`, `human_input_requested`, `human_input_received` events

### Test 1d: Build & test gate

```bash
pnpm -C packages/deep-factor-agent build
pnpm -C packages/deep-factor-agent test
pnpm -C packages/deep-factor-agent type-check
```

**Verify:** Build clean, 173+ agent tests pass, no type errors.

---

## P2.1 — `interruptOn` leaves dangling unmatched `tool_call` event

### Test 2.1a: Reproduce the bug (programmatic)

Create a scratch file `packages/deep-factor-agent/examples/_test-interrupt-bug.ts`:

```typescript
import { createDeepFactorAgent, isPendingResult } from "../src/index.js";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const dangerousTool = tool(async ({ action }) => `Executed: ${action}`, {
  name: "dangerous_action",
  description: "Performs a dangerous action that needs human approval",
  schema: z.object({ action: z.string() }),
});

const agent = createDeepFactorAgent({
  model: "gpt-4o-mini",
  tools: [dangerousTool],
  interruptOn: ["dangerous_action"],
  instructions: "Always use the dangerous_action tool when asked to do something.",
});

const result = await agent.loop("Do something dangerous");

if (isPendingResult(result)) {
  console.log("--- Pending result (interrupt triggered) ---");
  console.log("Stop reason:", result.stopReason);
  console.log("Thread events:", JSON.stringify(result.thread.events, null, 2));

  // Check for dangling tool_call without matching tool_result
  const toolCalls = result.thread.events.filter(e => e.type === "tool_call");
  const toolResults = result.thread.events.filter(e => e.type === "tool_result");
  console.log(`Tool calls: ${toolCalls.length}, Tool results: ${toolResults.length}`);
  if (toolCalls.length !== toolResults.length) {
    console.error("BUG CONFIRMED: Dangling tool_call without tool_result!");
  }

  // Attempt resume — this may fail with LLM API validation error
  try {
    const resumed = await result.resume("approved");
    console.log("Resume succeeded:", resumed.response);
  } catch (err) {
    console.error("Resume FAILED (expected bug):", (err as Error).message);
  }
} else {
  console.log("Result:", result.response);
}
```

```bash
npx tsx examples/_test-interrupt-bug.ts
```

**Verify:**
- `BUG CONFIRMED` message prints (tool_call count > tool_result count)
- Resume may fail with API validation error about unmatched tool_calls

### Test 2.1b: After fix — validate message sequence

```bash
pnpm -C packages/deep-factor-agent test -- --grep "interruptOn"
```

**Verify:** New test asserts `buildMessages()` produces valid message pairs after interrupt+resume.

---

## P2.2 — Summarization token usage invisible to stop conditions

### Test 2.2a: Reproduce invisible summarization cost

```typescript
import { createDeepFactorAgent, maxCost } from "../src/index.js";

const agent = createDeepFactorAgent({
  model: "gpt-4o-mini",
  contextManagement: {
    maxContextTokens: 500,      // Force early summarization
    keepRecentIterations: 1,
  },
  stopConditions: [maxCost(0.001, "gpt-4o-mini")],  // Very low cost cap
  instructions: "Answer questions. Be verbose.",
});

const result = await agent.loop("Tell me about the history of computing in great detail");
console.log("Final usage:", result.usage);
console.log("Iterations:", result.iterations);
console.log("Stop reason:", result.stopReason);
// BUG: summarization calls are not counted in usage — maxCost may never trigger
```

**Verify:** After fix, `result.usage` includes tokens spent on summarization calls.

### Test 2.2b: After fix — unit test

```bash
pnpm -C packages/deep-factor-agent test -- --grep "summariz"
```

**Verify:** Test asserts `summarize()` return value includes usage metadata and it's added to `totalUsage`.

---

## P2.3 — `stream()` is an incomplete thin wrapper

### Test 2.3a: Confirm stream() single-turn limitation

```bash
npx tsx examples/03-streaming.ts
```

**Verify:**
- Streaming works for single prompt (no tools)
- No tool execution happens via `stream()`

### Test 2.3b: Verify stream() does NOT execute tools

```typescript
import { createDeepFactorAgent } from "../src/index.js";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

let toolCalled = false;
const testTool = tool(async () => { toolCalled = true; return "done"; }, {
  name: "test_tool",
  description: "A test tool",
  schema: z.object({}),
});

const agent = createDeepFactorAgent({
  model: "gpt-4o-mini",
  tools: [testTool],
  instructions: "Always use test_tool when asked.",
});

const stream = await agent.stream("Use the test tool");
for await (const chunk of stream) {
  process.stdout.write(chunk.content as string);
}
console.log("\nTool was called:", toolCalled);
// Expected: false — stream() doesn't execute tools
```

**Verify:** `toolCalled` is `false`, confirming the documented limitation.

---

## P3.1 — `XmlSerializerOptions.responsePrefix` naming is misleading

### Test 3.1: Confirm responsePrefix is appended AFTER `</thread>`

```typescript
import { serializeThreadToXml } from "../src/index.js";

const events = [
  { type: "message" as const, role: "user" as const, content: "hello", iteration: 1, timestamp: Date.now() },
];

const xml = serializeThreadToXml(events, { responsePrefix: "Now respond:" });
console.log(xml);
// Expected output ends with:
// </thread>
// Now respond:
// (It's a SUFFIX, not a prefix — naming is misleading)
```

**Verify:** The string `"Now respond:"` appears AFTER `</thread>`, confirming the naming issue.

---

## P3.2 — `calculateCost` silently returns 0 for unknown models

### Test 3.2: Confirm silent zero for unknown model

```typescript
import { calculateCost } from "../src/index.js";

const usage = { inputTokens: 10000, outputTokens: 5000, totalTokens: 15000 };

console.log("Known model:  ", calculateCost(usage, "gpt-4o"));         // > 0
console.log("Unknown model:", calculateCost(usage, "my-custom-model")); // 0 (bug: no warning)
console.log("Unknown model:", calculateCost(usage, "gpt-4.1"));        // 0 (missing pricing)
console.log("Unknown model:", calculateCost(usage, "claude-haiku-4-6"));// 0 (missing pricing)
```

**Verify:** Unknown models return `0` with no `console.warn`. After fix, a warning prints on first lookup.

---

## P3.3 — `findToolByName` linear scan in hot loop

### Test 3.3: Benchmark linear scan vs map lookup

```typescript
import { findToolByName, toolArrayToMap } from "../src/index.js";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Create 100 tools
const tools = Array.from({ length: 100 }, (_, i) =>
  tool(async () => `result_${i}`, {
    name: `tool_${i}`,
    description: `Tool number ${i}`,
    schema: z.object({}),
  })
);

const iterations = 100_000;

// Linear scan
console.time("findToolByName (linear)");
for (let i = 0; i < iterations; i++) {
  findToolByName(tools, `tool_${i % 100}`);
}
console.timeEnd("findToolByName (linear)");

// Map lookup
const toolMap = toolArrayToMap(tools);
console.time("toolMap[name] (O(1))");
for (let i = 0; i < iterations; i++) {
  toolMap[`tool_${i % 100}`];
}
console.timeEnd("toolMap[name] (O(1))");
```

**Verify:** Map lookup is significantly faster. After fix, `agent.ts` inner loop uses `toolArrayToMap()`.

---

## P3.4 — CLI `useAgent` creates new agent per prompt (no multi-turn memory)

### Test 3.4: Confirm no multi-turn memory in CLI

```bash
node packages/deep-factor-cli/dist/cli.js --interactive
```

1. Type: `My name is Alice`
2. Wait for response
3. Type: `What is my name?`
4. Observe model does NOT remember "Alice"

**Verify:** Model cannot recall prior turns — each prompt creates a fresh agent with no thread carry-over.

---

## P3.5 — CLI `HumanInput` and `PromptInput` duplicate `useInput` logic

### Test 3.5: Visual code comparison (read-only)

```bash
diff <(sed -n '20,50p' packages/deep-factor-cli/src/components/HumanInput.tsx) \
     <(sed -n '15,37p' packages/deep-factor-cli/src/components/PromptInput.tsx)
```

**Verify:** Near-identical keystroke handling (backspace, Enter, character append) in both files.

---

## P3.6 — CLI `eventsToChatMessages` not exported from `index.ts`

### Test 3.6: Confirm missing export

```typescript
import * as cli from "deep-factor-cli";
console.log("eventsToChatMessages" in cli); // Expected: false
```

Or check directly:

```bash
grep -n "eventsToChatMessages" packages/deep-factor-cli/src/index.ts
# Expected: no matches (not exported)
```

**Verify:** Function exists in `useAgent.ts` but is not re-exported from `index.ts`.

---

## P3.7 — Barrel export test incomplete

### Test 3.7: Run existing barrel test & check coverage

```bash
pnpm -C packages/deep-factor-agent test -- --grep "barrel"
```

Then manually verify these are NOT asserted in the test:

```bash
grep -c "TOOL_NAME_WRITE_TODOS" packages/deep-factor-agent/__tests__/create-agent.test.ts
grep -c "TOOL_NAME_REQUEST_HUMAN_INPUT" packages/deep-factor-agent/__tests__/create-agent.test.ts
grep -c "requestHumanInputSchema" packages/deep-factor-agent/__tests__/create-agent.test.ts
grep -c "escapeXml" packages/deep-factor-agent/__tests__/create-agent.test.ts
grep -c "serializeThreadToXml" packages/deep-factor-agent/__tests__/create-agent.test.ts
grep -c "XmlSerializerOptions" packages/deep-factor-agent/__tests__/create-agent.test.ts
```

**Verify:** Counts are 0 for some/all — confirming missing assertions.

---

## P4 — Deferred Items (Smoke Tests Only)

### P4.1 — Full streaming agent loop

No test needed (deferred). Current `stream()` behavior covered by Test 2.3a/b.

### P4.2 — `bash` tool uses synchronous `execSync`

```bash
# Confirm execSync usage:
grep -n "execSync" packages/deep-factor-cli/src/tools/bash.ts
```

**Verify:** `execSync` is used (blocks event loop). No fix needed yet.

### P4.3 — `zod` is peer-only but required at runtime

```bash
grep '"zod"' packages/deep-factor-agent/package.json
# Check if it's in peerDependencies only
```

**Verify:** `zod` in `peerDependencies` but directly imported in source files.

### P4.4 — `@langchain/openai` is unconditional dependency

```bash
grep "@langchain/openai" packages/deep-factor-agent/package.json
```

**Verify:** Listed in `dependencies` (not `peerDependencies` or `optionalDependencies`).

### P4.5 — Model pricing table may be stale

```typescript
import { MODEL_PRICING } from "../src/index.js";
const missing = ["claude-haiku-4-6", "gpt-4.1", "gpt-4.1-nano", "gemini-2.0-flash"];
for (const m of missing) {
  console.log(`${m}: ${m in MODEL_PRICING ? "PRESENT" : "MISSING"}`);
}
```

**Verify:** All listed models print `MISSING`.

### P4.6–P4.8 — CI coverage, StatusBar width, HumanInput cancel

These are minor UX/infra items. No manual test required until addressed.

---

## Full Regression Gate

Run after ANY change to confirm baseline:

```bash
pnpm -r build && pnpm -r test && pnpm -r type-check
```

**Expected:** Build clean, 283+ tests pass (173 agent + 110 CLI), no type errors.
