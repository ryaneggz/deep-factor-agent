# SPEC-01: Example 12 — Interactive HITL with Multiple Choice

## CONTEXT

### Problem Statement

The examples suite demonstrates individual agent features in isolation: Example 06 shows human-in-the-loop via the high-level `createDeepFactorAgent` API (simulated, non-interactive), and Example 11 shows interactive multi-turn streaming with a bash tool using the manual XML thread loop. There is no example combining **interactive HITL** (specifically multiple-choice prompting) with the **manual streaming tool loop**. This spec creates Example 12 to fill that gap.

Ref: [GitHub Issue #2](https://github.com/ryaneggz/deep-factor-agent/issues/2)

### Derives From

| Source | What it provides |
|--------|-----------------|
| `examples/11-xml-tools-stream.ts` | Interactive readline loop, streaming token output, bash tool, XML thread serialization |
| `examples/06-human-in-the-loop.ts` | `requestHumanInput` tool usage with `isPendingResult` / `result.resume()` |
| `src/human-in-the-loop.ts` | Tool schema — already supports `format: "multiple_choice"` + `choices: string[]` |

### Relevant Files

| File | Purpose |
|------|---------|
| `packages/deep-factor-agent/examples/11-xml-tools-stream.ts` | Base example to fork — `bashTool`, `createThread()`, `pushEvent()`, `extractText()`, `runToolLoop()`, `main()`, `printSummary()` |
| `packages/deep-factor-agent/src/human-in-the-loop.ts` | `requestHumanInput` tool, `TOOL_NAME_REQUEST_HUMAN_INPUT`, `requestHumanInputSchema` |
| `packages/deep-factor-agent/src/types.ts` | `HumanInputRequestedEvent` (format, choices fields), `HumanInputReceivedEvent` |
| `packages/deep-factor-agent/src/xml-serializer.ts` | `serializeThreadToXml()` — already handles `human_input_requested` and `human_input_received` events |
| `packages/deep-factor-agent/src/index.ts` | Exports `requestHumanInput`, `TOOL_NAME_REQUEST_HUMAN_INPUT` |
| `packages/deep-factor-agent/examples/env.ts` | Shared `MODEL_ID` and API key validation |
| `packages/deep-factor-agent/examples/README.md` | Examples table — needs new row |

---

## OVERVIEW

Create `packages/deep-factor-agent/examples/12-hitl-multiple-choice.ts` by forking Example 11 with these changes:

1. **Add `requestHumanInput` to the tools array** alongside `bashTool`
2. **Add `collectHumanInput()` helper** — parses tool result JSON, displays numbered choices, collects input via `rl.question()`, resolves selection or falls back to free-text
3. **Modify `runToolLoop()` with HITL branch** — detects `requestHumanInput` tool calls, invokes `collectHumanInput`, records `human_input_requested`/`human_input_received` events, pushes `ToolMessage`, continues loop
4. **Update system prompt** — instruct model to use `multiple_choice` for preference questions, `free_text` for open-ended
5. **Pass readline interface to `runToolLoop()`** — enables mid-turn user prompting
6. **Update `examples/README.md`** with Example 12 entry

---

## IMPLEMENTATION

### Imports

Everything from Example 11, plus HITL exports:

```ts
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

```ts
const tools = [bashTool, requestHumanInput];
```

The `bashTool` definition is identical to Example 11.

### `collectHumanInput()` Helper

Core new function. Parses the JSON returned by `requestHumanInput.invoke()`, displays the question and numbered choices (if multiple-choice), prompts the user, and resolves:

```ts
interface HitlResult {
  requested: boolean;
  question: string;
  context?: string;
  urgency?: string;
  format?: string;
  choices?: string[];
}

async function collectHumanInput(
  toolResultJson: string,
  rl: ReadlineInterface,
): Promise<string> {
  const parsed: HitlResult = JSON.parse(toolResultJson);

  // Display question
  console.log(`\n  [HITL] ${parsed.question}`);
  if (parsed.context) {
    console.log(`         Context: ${parsed.context}`);
  }

  // Display numbered choices if multiple_choice
  if (parsed.format === "multiple_choice" && parsed.choices?.length) {
    console.log();
    for (let i = 0; i < parsed.choices.length; i++) {
      console.log(`    ${i + 1}. ${parsed.choices[i]}`);
    }
    console.log();
  }

  // Prompt
  const prompt =
    parsed.format === "multiple_choice" && parsed.choices?.length
      ? "  Enter number or type your answer: "
      : "  Your answer: ";

  const answer = await rl.question(prompt);

  // Resolve numbered choice
  if (parsed.format === "multiple_choice" && parsed.choices?.length) {
    const num = parseInt(answer.trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= parsed.choices.length) {
      const chosen = parsed.choices[num - 1];
      console.log(`  [Selected: "${chosen}"]`);
      return chosen;
    }
  }

  // Free-text fallback
  return answer.trim();
}
```

### Modified `runToolLoop()`

Fork of Example 11's `runToolLoop` with two changes:

1. **Signature**: Add `rl: ReadlineInterface` parameter
2. **HITL branch**: When `tc.name === TOOL_NAME_REQUEST_HUMAN_INPUT`:
   - Execute the tool to get structured JSON (tool has no side effects)
   - Record `human_input_requested` event with `question`, `context`, `urgency`, `format`, `choices`
   - Call `collectHumanInput()` to display choices and collect answer
   - Record `human_input_received` event with `response`
   - Push `ToolMessage` with `"Human responded: <answer>"` content
   - `continue` to next tool call in batch (then loop for model response)

The bash tool branch remains identical to Example 11.

Key code for the HITL branch inside the tool execution loop:

```ts
if (tc.name === TOOL_NAME_REQUEST_HUMAN_INPUT) {
  const toolResult = await requestHumanInput.invoke(tc.args);
  const resultStr = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
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
  continue;
}
```

### System Prompt

```ts
const instructions = [
  "You are a helpful assistant with access to a bash tool and a requestHumanInput tool.",
  "Use the bash tool to answer questions about the system, files, etc.",
  "When you need to ask the user a preference question or get a decision,",
  "use the requestHumanInput tool with format: 'multiple_choice' and provide",
  "a choices array with 2-5 options. For open-ended questions, use format: 'free_text'.",
  "Examples of when to use multiple_choice: choosing a programming language,",
  "selecting a file format, picking a color scheme, deciding between approaches.",
  "Keep your answers concise. Show relevant output from commands.",
].join(" ");
```

### Main Loop

Nearly identical to Example 11 with two changes:
- Pass `rl` to `runToolLoop(model, messages, thread, turn, rl)`
- Updated banner text mentioning HITL capability

### `printSummary`

Identical to Example 11 — already counts all event types dynamically.

### README.md Update

Add to the "Running Examples" section:
```
# Interactive HITL with multiple choice (interactive)
npx tsx examples/12-hitl-multiple-choice.ts
```

Add to the "Example Overview" table:
```
| 12 | `12-hitl-multiple-choice.ts` | Interactive HITL with multiple-choice prompts, bash tool, streaming |
```

---

## FILE STRUCTURE

### New
- `packages/deep-factor-agent/examples/12-hitl-multiple-choice.ts`

### Modified
- `packages/deep-factor-agent/examples/README.md` — add Example 12 entry

---

## DESIGN DECISIONS

1. **Execute tool vs. intercept before execution**: The `requestHumanInput` tool is executed (it simply returns a JSON string with no side effects) rather than intercepted pre-execution. This gives us the structured `{ question, format, choices }` payload without duplicating schema parsing.

2. **`ToolMessage` content prefix**: Uses `"Human responded: <answer>"` to make it clear to the model that this is the human's answer. This matches how the high-level agent feeds human input back.

3. **Free-text fallback for invalid numbers**: If the user types something other than a valid choice number during multiple-choice, it's treated as free-text. This is more user-friendly than re-prompting.

4. **No new dependencies**: Uses only existing imports from `../dist/index.js` and `node:readline/promises`.

---

## ACCEPTANCE CRITERIA

- [ ] `npx tsx examples/12-hitl-multiple-choice.ts` starts an interactive session
- [ ] The agent presents at least one multiple-choice question during a typical conversation
- [ ] Selecting a choice by number resumes the agent with the chosen text
- [ ] Typing free text instead of a number also resumes the agent
- [ ] Streaming output works for text responses
- [ ] Bash tool calls work inline (same as Example 11)
- [ ] XML thread state is printed after each turn and includes HITL events (`human_input_requested`, `human_input_received`)
- [ ] Graceful exit on `quit` or Ctrl+C
- [ ] `human_input_requested` events include `question`, `format`, `choices` fields
- [ ] `human_input_received` events include the resolved `response` string
- [ ] README.md updated with Example 12 in both the running commands and overview table
- [ ] Example builds and runs without errors: `pnpm -C packages/deep-factor-agent build && npx tsx examples/12-hitl-multiple-choice.ts`
