# SPEC-02: Example 13 — Parallel Tool Calling

## CONTEXT

### Problem Statement

All tool execution in the codebase is strictly sequential — the agent core (`agent.ts` lines 411–496), Example 11, and Example 12 all use a `for...of` loop with `await` per tool call. When the model returns multiple `tool_calls` in a single response, each waits for the previous to finish. This wastes wall-clock time when tool calls are independent (e.g., two bash commands that don't depend on each other).

Example 13 demonstrates **parallel tool execution** — running independent tool calls concurrently with `Promise.all` for better wall-clock performance, while keeping HITL calls sequential since they require interactive user input.

Ref: [GitHub Issue #4](https://github.com/ryaneggz/deep-factor-agent/issues/4)

### Derives From

| Source | What it provides |
|--------|-----------------|
| `examples/12-hitl-multiple-choice.ts` | Interactive readline loop, streaming token output, bash tool, HITL with multiple choice, XML thread serialization |
| `src/agent.ts` (lines 411–496) | Sequential `for...of await` tool loop — the pattern to replace |

### Relevant Files

| File | Purpose |
|------|---------|
| `packages/deep-factor-agent/examples/12-hitl-multiple-choice.ts` | Base example to fork — `bashTool`, `createThread()`, `pushEvent()`, `extractText()`, `collectHumanInput()`, `runToolLoop()`, `main()`, `printSummary()` |
| `packages/deep-factor-agent/src/human-in-the-loop.ts` | `requestHumanInput` tool, `TOOL_NAME_REQUEST_HUMAN_INPUT`, `requestHumanInputSchema` |
| `packages/deep-factor-agent/src/types.ts` | `HumanInputRequestedEvent` (format, choices fields), `HumanInputReceivedEvent`, `ToolCallEvent`, `ToolResultEvent` |
| `packages/deep-factor-agent/src/xml-serializer.ts` | `serializeThreadToXml()` — handles all event types including `human_input_requested` and `human_input_received` |
| `packages/deep-factor-agent/src/index.ts` | Exports `requestHumanInput`, `TOOL_NAME_REQUEST_HUMAN_INPUT`, `serializeThreadToXml` |
| `packages/deep-factor-agent/examples/env.ts` | Shared `MODEL_ID` and API key validation |
| `packages/deep-factor-agent/examples/README.md` | Examples table — needs new row for Example 13 |

---

## OVERVIEW

Create `packages/deep-factor-agent/examples/13-parallel-tool-calls.ts` by forking Example 12 with these changes:

1. **Add `performance` import** from `node:perf_hooks` for timing measurements
2. **Add `executeToolsParallel()` helper** — partitions tool calls into HITL (sequential) vs parallelizable, runs `Promise.all` on parallel batch, returns results with per-tool timing
3. **Modify `runToolLoop()` to use parallel execution** — replaces sequential `for...of await` with call to `executeToolsParallel()`, handles HITL calls sequentially before/after parallel batch, displays timing output showing wall-clock vs estimated sequential time
4. **Update system prompt** — encourage the model to make multiple tool calls in a single response when tasks are independent
5. **Update `examples/README.md`** with Example 13 entry

Everything else is identical to Example 12: `bashTool`, `createThread()`, `pushEvent()`, `extractText()`, `collectHumanInput()`, main loop, `printSummary()`.

---

## IMPLEMENTATION

### Imports

Everything from Example 12, plus `performance` from `node:perf_hooks`:

```ts
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline/promises";
import type { Interface as ReadlineInterface } from "node:readline/promises";
import { execSync } from "node:child_process";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { initChatModel } from "langchain/chat_models/universal";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentEvent, AgentThread } from "../dist/index.js";
import {
  serializeThreadToXml,
  requestHumanInput,
  TOOL_NAME_REQUEST_HUMAN_INPUT,
} from "../dist/index.js";
import { MODEL_ID } from "./env.js";
```

### Tools Array

Unchanged from Example 12:

```ts
const tools = [bashTool, requestHumanInput];
```

The `bashTool` definition is identical to Example 12.

### Thread Helpers

Unchanged from Example 12: `createThread()`, `pushEvent()`, `extractText()`.

### `collectHumanInput()` Helper

Identical to Example 12.

### New `executeToolsParallel()` Helper

Core new function. Partitions tool calls into HITL vs parallelizable, runs parallel batch with `Promise.all`, returns structured results with per-tool timing:

```ts
interface ParallelResult {
  tc: { id: string; name: string; args: Record<string, unknown> };
  result: string;
  duration: number;
}

async function executeToolsParallel(
  parsedToolCalls: { id: string; name: string; args: Record<string, unknown> }[],
  thread: AgentThread,
  turn: number,
  rl: ReadlineInterface,
  messages: BaseMessage[],
): Promise<void> {
  // Partition tool calls
  const hitlCalls = parsedToolCalls.filter(
    (tc) => tc.name === TOOL_NAME_REQUEST_HUMAN_INPUT,
  );
  const parallelCalls = parsedToolCalls.filter(
    (tc) => tc.name !== TOOL_NAME_REQUEST_HUMAN_INPUT,
  );

  // Execute parallelizable tools concurrently with timing
  if (parallelCalls.length > 0) {
    console.log(
      `\n  [parallel] Executing ${parallelCalls.length} tool call(s) concurrently...`,
    );

    const startTime = performance.now();
    const results: ParallelResult[] = await Promise.all(
      parallelCalls.map(async (tc) => {
        const t0 = performance.now();
        const now = Date.now();

        // Record tool_call event
        pushEvent(thread, {
          type: "tool_call",
          toolName: tc.name,
          toolCallId: tc.id,
          args: tc.args,
          timestamp: now,
          iteration: turn,
        });

        // Execute tool
        const foundTool = tools.find((t) => t.name === tc.name);
        let resultStr: string;
        if (foundTool) {
          const result = await foundTool.invoke(tc.args);
          resultStr = typeof result === "string" ? result : JSON.stringify(result);
        } else {
          resultStr = `Unknown tool: ${tc.name}`;
        }

        return { tc, result: resultStr, duration: performance.now() - t0 };
      }),
    );
    const parallelTime = performance.now() - startTime;
    const sequentialTime = results.reduce((sum, r) => sum + r.duration, 0);

    // Display timing
    console.log(
      `  [timing] Parallel: ${parallelTime.toFixed(0)}ms | Sequential would be: ${sequentialTime.toFixed(0)}ms`,
    );

    // Record events and push ToolMessages in order
    for (const { tc, result: resultStr } of results) {
      const preview =
        resultStr.length > 200
          ? resultStr.substring(0, 200) + "..."
          : resultStr;
      console.log(
        `  [result] ${tc.name}: ${preview.replace(/\n/g, "\n           ")}`,
      );

      // Record tool_result event
      pushEvent(thread, {
        type: "tool_result",
        toolCallId: tc.id,
        result: resultStr,
        timestamp: Date.now(),
        iteration: turn,
      });

      // Add to LangChain messages
      messages.push(
        new ToolMessage({ tool_call_id: tc.id, content: resultStr }),
      );
    }
  }

  // Handle HITL calls sequentially (they require interactive user input)
  for (const tc of hitlCalls) {
    const now = Date.now();

    // Record tool_call event
    pushEvent(thread, {
      type: "tool_call",
      toolName: tc.name,
      toolCallId: tc.id,
      args: tc.args,
      timestamp: now,
      iteration: turn,
    });

    const toolResult = await requestHumanInput.invoke(tc.args);
    const resultStr =
      typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
    const hitlData = JSON.parse(resultStr);

    // Record human_input_requested
    pushEvent(thread, {
      type: "human_input_requested",
      question: hitlData.question ?? "",
      context: hitlData.context,
      urgency: hitlData.urgency,
      format: hitlData.format,
      choices: hitlData.choices,
      timestamp: now,
      iteration: turn,
    });

    // Collect input interactively
    const humanResponse = await collectHumanInput(resultStr, rl);

    // Record human_input_received
    pushEvent(thread, {
      type: "human_input_received",
      response: humanResponse,
      timestamp: Date.now(),
      iteration: turn,
    });

    // Feed response back to model
    messages.push(
      new ToolMessage({
        tool_call_id: tc.id,
        content: `Human responded: ${humanResponse}`,
      }),
    );
  }
}
```

### Modified `runToolLoop()`

Fork of Example 12's `runToolLoop` with the sequential `for...of await` replaced by a single call to `executeToolsParallel()`. Streaming and tool-call chunk accumulation remain identical:

```ts
async function runToolLoop(
  model: any,
  messages: BaseMessage[],
  thread: AgentThread,
  turn: number,
  rl: ReadlineInterface,
): Promise<string> {
  const modelWithTools = model.bindTools(tools);

  while (true) {
    // Stream the model response (identical to Example 12)
    const stream = await modelWithTools.stream(messages);
    let fullContent = "";
    let firstText = true;
    const toolCalls: any[] = [];

    for await (const chunk of stream) {
      const text = extractText(chunk.content);
      if (text) {
        if (firstText) {
          process.stdout.write("\nAssistant: ");
          firstText = false;
        }
        process.stdout.write(text);
        fullContent += text;
      }
      if (chunk.tool_call_chunks?.length) {
        for (const tc of chunk.tool_call_chunks) {
          if (tc.index !== undefined) {
            while (toolCalls.length <= tc.index) {
              toolCalls.push({ id: "", name: "", args: "" });
            }
            const entry = toolCalls[tc.index];
            if (tc.id) entry.id = tc.id;
            if (tc.name) entry.name = tc.name;
            if (tc.args) entry.args += tc.args;
          }
        }
      }
    }

    // No tool calls — text reply
    if (toolCalls.length === 0) {
      if (fullContent) console.log();
      return fullContent;
    }

    // Build AIMessage (identical to Example 12)
    const parsedToolCalls = toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: tc.args ? JSON.parse(tc.args) : {},
    }));
    const aiMsg = new AIMessage({
      content: fullContent,
      tool_calls: parsedToolCalls,
    });
    messages.push(aiMsg);

    // --- CHANGED: parallel execution instead of sequential for...of ---
    await executeToolsParallel(parsedToolCalls, thread, turn, rl, messages);

    // Loop back so the model can respond to the tool results
  }
}
```

### System Prompt

Updated to encourage the model to make multiple tool calls when tasks are independent:

```ts
const instructions = [
  "You are a helpful assistant with access to a bash tool and a requestHumanInput tool.",
  "Use the bash tool to answer questions about the system, files, etc.",
  "IMPORTANT: When you need to run multiple independent commands, call them ALL",
  "in a single response rather than one at a time. For example, if you need to",
  "check disk space AND list files, make both tool calls at once.",
  "When you need to ask the user a preference question or get a decision,",
  "use the requestHumanInput tool with format: 'multiple_choice' and provide",
  "a choices array with 2-5 options. For open-ended questions, use format: 'free_text'.",
  "Keep your answers concise. Show relevant output from commands.",
].join(" ");
```

### Main Loop

Nearly identical to Example 12 with updated banner text:

```ts
console.log("--- Parallel Tool Calling with HITL (XML context) ---");
console.log('Type a message and press Enter. Type "quit" to exit.');
console.log("Independent tool calls execute in parallel for better performance.\n");
```

### `printSummary()`

Identical to Example 12 — already counts all event types dynamically.

### README.md Update

Add to the "Running Examples" section:
```
# Parallel tool calling with HITL (interactive)
npx tsx examples/13-parallel-tool-calls.ts
```

Add to the "Example Overview" table:
```
| 13 | `13-parallel-tool-calls.ts` | Parallel tool execution with `Promise.all`, timing display, HITL sequential |
```

---

## FILE STRUCTURE

### New
- `packages/deep-factor-agent/examples/13-parallel-tool-calls.ts`

### Modified
- `packages/deep-factor-agent/examples/README.md` — add Example 13 entry

---

## DESIGN DECISIONS

1. **`Promise.all` over `Promise.allSettled`**: We use `Promise.all` because a tool failure should be a hard error — the model needs all results to continue reasoning. `Promise.allSettled` would require additional logic to surface partial failures, and the model cannot meaningfully continue if a tool call fails. This matches the existing error handling pattern where tool errors propagate up.

2. **HITL stays sequential**: `requestHumanInput` calls require interactive user input via `rl.question()`. Running multiple HITL prompts in parallel would interleave their output and make the terminal unusable. HITL calls are partitioned out and handled sequentially after the parallel batch completes.

3. **Timing display uses `performance.now()`**: `Date.now()` has millisecond resolution at best and can be affected by system clock adjustments. `performance.now()` from `node:perf_hooks` provides monotonic, sub-millisecond precision — ideal for measuring wall-clock durations of tool execution. The display shows both parallel wall-clock time and the sum of individual durations (what sequential execution would have cost).

4. **Tool-call events recorded inside `Promise.all` map**: Each parallel branch records its own `tool_call` event before executing the tool. This means `tool_call` timestamps may be nearly identical (which is correct — they did start concurrently). `tool_result` events are recorded after the parallel batch completes, preserving a clear before/after ordering in the thread.

5. **No changes to agent core**: This is an example-level change only. The parallel pattern is demonstrated in the example file, not in `agent.ts`. A future enhancement could add a `parallelToolExecution` option to `DeepFactorAgentSettings`, but that's out of scope for this spec.

---

## ACCEPTANCE CRITERIA

Mapped from [GitHub Issue #4](https://github.com/ryaneggz/deep-factor-agent/issues/4):

- [ ] `npx tsx examples/13-parallel-tool-calls.ts` runs end-to-end
- [ ] When the model returns N independent tool calls, all N execute concurrently (verified by wall-clock time being ~ max(individual) rather than sum(individual))
- [ ] `requestHumanInput` calls are detected and handled sequentially before or after the parallel batch
- [ ] Interrupted tools (`interruptOn`) are still skipped correctly (N/A at example level — `interruptOn` is an agent-core concept not used in the manual examples, same as Example 12; included here for completeness per the issue)
- [ ] XML thread contains all `tool_call` and `tool_result` events in correct order
- [ ] Streaming works for text responses
- [ ] Timing output shows parallel wall-clock time and estimated sequential time
- [ ] README.md updated with Example 13 in both the running commands and overview table
