# SPEC-04: Example 14 — Claude/Codex CLI Delegation Demo

## CONTEXT

### Problem Statement

The examples suite demonstrates various agent features but none show how to use the new CLI-based model providers from SPEC-01 and SPEC-02. Example 14 demonstrates the **delegation pattern** — using `createClaudeCliProvider()` or `createCodexCliProvider()` as the agent's model backend, with tool calling handled by the agent loop via prompt-engineered JSON output.

This is the integration test that proves the `ModelAdapter` flow works end-to-end: provider → `bindTools` → prompt injection → CLI invocation → response parsing → tool execution → result feedback.

### Derives From

| Source | What it provides |
|--------|-----------------|
| Plan: `abundant-snacking-sprout.md` | Example 14 description, smoke test steps 5-7 |
| SPEC-01 | `createClaudeCliProvider()`, `ModelAdapter` interface |
| SPEC-02 | `createCodexCliProvider()` |
| `examples/13-parallel-tool-calls.ts` | Nearest example — interactive loop with tools, streaming, HITL |

### Relevant Files

| File | Purpose |
|------|---------|
| `packages/deep-factor-agent/src/providers/claude-cli.ts` | Claude CLI provider (SPEC-01) |
| `packages/deep-factor-agent/src/providers/codex-cli.ts` | Codex CLI provider (SPEC-02) |
| `packages/deep-factor-agent/src/create-agent.ts` | `createDeepFactorAgent()` factory |
| `packages/deep-factor-agent/src/index.ts` | Package exports |
| `packages/deep-factor-agent/examples/env.ts` | `MODEL_ID` and API key validation |
| `packages/deep-factor-agent/examples/README.md` | Examples table — needs new row |

---

## OVERVIEW

Create `packages/deep-factor-agent/examples/14-claude-codex-delegation.ts` that:

1. **Accepts a CLI flag** to select the provider: `--provider claude` (default) or `--provider codex`
2. **Creates a CLI model provider** using `createClaudeCliProvider()` or `createCodexCliProvider()`
3. **Creates an agent** with `createDeepFactorAgent()`, passing the provider as the `model`
4. **Defines a simple tool** (e.g. `calculator`) to demonstrate tool calling through the CLI provider
5. **Runs the agent loop** with a prompt that triggers tool use
6. **Prints the result** including response, iterations, stop reason, and tool call events from the thread

---

## IMPLEMENTATION

### `examples/14-claude-codex-delegation.ts`

```ts
/**
 * Example 14: Claude/Codex CLI Delegation
 *
 * Demonstrates using CLI-based model providers (Claude CLI, Codex CLI) as the
 * agent's model backend. Tool calling is handled via prompt engineering — the
 * provider injects tool definitions into the prompt and parses tool calls from
 * the CLI's response.
 *
 * Usage:
 *   npx tsx examples/14-claude-codex-delegation.ts                  # Claude CLI (default)
 *   npx tsx examples/14-claude-codex-delegation.ts --provider codex # Codex CLI
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  createDeepFactorAgent,
  createClaudeCliProvider,
  createCodexCliProvider,
  maxIterations,
} from "../dist/index.js";
import type { ModelAdapter, AgentEvent } from "../dist/index.js";

// --- Parse CLI args ---

const providerArg = process.argv.includes("--provider")
  ? process.argv[process.argv.indexOf("--provider") + 1]
  : "claude";

if (providerArg !== "claude" && providerArg !== "codex") {
  console.error(`Unknown provider: ${providerArg}. Use "claude" or "codex".`);
  process.exit(1);
}

// --- Create provider ---

let provider: ModelAdapter;
if (providerArg === "claude") {
  provider = createClaudeCliProvider({ model: "sonnet" });
  console.log("Using Claude CLI provider (model: sonnet)");
} else {
  provider = createCodexCliProvider({ model: "o4-mini" });
  console.log("Using Codex CLI provider (model: o4-mini)");
}

// --- Define tools ---

const calculatorTool = tool(
  async ({ expression }: { expression: string }) => {
    // Simple math evaluator (safe for demo purposes)
    try {
      const result = new Function(`return (${expression})`)();
      return String(result);
    } catch (e) {
      return `Error evaluating "${expression}": ${(e as Error).message}`;
    }
  },
  {
    name: "calculator",
    description:
      "Evaluate a mathematical expression. Supports +, -, *, /, **, Math functions.",
    schema: z.object({
      expression: z
        .string()
        .describe("The math expression to evaluate, e.g. '2 + 2' or 'Math.sqrt(16)'"),
    }),
  },
);

const getCurrentTimeTool = tool(
  async () => {
    return new Date().toISOString();
  },
  {
    name: "get_current_time",
    description: "Get the current date and time in ISO format.",
    schema: z.object({}),
  },
);

// --- Create agent ---

const agent = createDeepFactorAgent({
  model: provider,
  tools: [calculatorTool, getCurrentTimeTool],
  instructions: [
    "You are a helpful assistant with access to a calculator and a clock.",
    "Use the calculator tool for any math questions.",
    "Use the get_current_time tool when asked about the current time.",
    "Be concise in your responses.",
  ].join(" "),
  stopWhen: [maxIterations(3)],
  middleware: [],
});

// --- Run the agent ---

const prompt =
  "What is 42 * 17? Also, what time is it right now? Give me both answers.";

console.log(`\nPrompt: ${prompt}\n`);
console.log("--- Running agent loop ---\n");

const result = await agent.loop(prompt);

// --- Display results ---

console.log("\n--- Results ---\n");
console.log(`Response: ${result.response}`);
console.log(`Iterations: ${result.iterations}`);
console.log(`Stop reason: ${result.stopReason}`);

// Show tool call events
const toolCallEvents = result.thread.events.filter(
  (e: AgentEvent) => e.type === "tool_call",
);
const toolResultEvents = result.thread.events.filter(
  (e: AgentEvent) => e.type === "tool_result",
);

console.log(`\nTool calls: ${toolCallEvents.length}`);
for (const tc of toolCallEvents) {
  if (tc.type === "tool_call") {
    console.log(`  - ${tc.toolName}(${JSON.stringify(tc.args)})`);
  }
}

console.log(`Tool results: ${toolResultEvents.length}`);
for (const tr of toolResultEvents) {
  if (tr.type === "tool_result") {
    const preview =
      tr.result.length > 100
        ? tr.result.substring(0, 100) + "..."
        : tr.result;
    console.log(`  - ${preview}`);
  }
}

// Usage summary
console.log(`\nToken usage:`);
console.log(`  Input:  ${result.usage.inputTokens}`);
console.log(`  Output: ${result.usage.outputTokens}`);
console.log(`  Total:  ${result.usage.totalTokens}`);
```

### `examples/README.md` — Update

Add to the "Running Examples" section:

```bash
# Claude/Codex CLI delegation (non-interactive)
npx tsx examples/14-claude-codex-delegation.ts
npx tsx examples/14-claude-codex-delegation.ts --provider codex
```

Add to the "Example Overview" table:

```
| 14 | `14-claude-codex-delegation.ts` | CLI model providers (Claude CLI, Codex CLI) as agent model backend with tool calling |
```

---

## FILE STRUCTURE

### New
- `packages/deep-factor-agent/examples/14-claude-codex-delegation.ts`

### Modified
- `packages/deep-factor-agent/examples/README.md` — Add Example 14 entry

---

## DESIGN DECISIONS

1. **Non-interactive, single-shot**: Unlike Examples 10-13 which are interactive multi-turn loops, Example 14 is a single-shot run. This keeps the demo focused on the provider integration without readline complexity. The `maxIterations(3)` stop condition allows up to 3 agent iterations for tool calling.

2. **Two tools to demonstrate multi-tool calling**: The `calculator` and `get_current_time` tools are simple and independent. The prompt is designed to trigger both tools, which tests the provider's ability to return multiple tool calls in one response (parsed from the JSON block).

3. **`--provider` CLI flag**: Allows testing both providers from the same example file. Default is `claude` since it's more commonly available. This matches the smoke test steps 5-7 in the plan.

4. **`new Function()` for calculator**: Used instead of `eval()` for slightly better scoping. This is acceptable in a demo context. Production code should use a proper math parser.

5. **Token usage may be zeros**: CLI providers don't return `usage_metadata` on their `AIMessage` responses (the CLI doesn't expose token counts). The usage display will show zeros. This is expected and documented by the output.

6. **No streaming**: CLI providers are batch-mode only (prompt in → full response out). The `agent.loop()` call is synchronous per iteration. `agent.stream()` would require chunked CLI output, which is out of scope for this spec.

---

## ACCEPTANCE CRITERIA

- [ ] `npx tsx examples/14-claude-codex-delegation.ts` runs end-to-end with Claude CLI
- [ ] `npx tsx examples/14-claude-codex-delegation.ts --provider codex` runs end-to-end with Codex CLI
- [ ] Agent makes tool calls (calculator, get_current_time) through the CLI provider
- [ ] Tool results are fed back to the agent and incorporated into the final response
- [ ] Output shows: response, iterations, stop reason, tool call events, tool result events, token usage
- [ ] Invalid `--provider` value prints an error and exits
- [ ] README.md updated with Example 14 in both the running commands and overview table
- [ ] Example builds and runs without errors: `pnpm -C packages/deep-factor-agent build && npx tsx examples/14-claude-codex-delegation.ts`
