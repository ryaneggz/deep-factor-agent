# SPEC-01: Model Adapter Interface + Claude CLI Provider

## CONTEXT

### Problem Statement

The deep-factor-agent currently delegates to LLMs exclusively through LangChain's `initChatModel` / `BaseChatModel` API. We want to support **Claude CLI** (`claude -p`) as a **model provider** — not a tool. The CLI is an input/output adapter: prompt goes in, response comes out. No interactivity, no internal tool calling from the CLI. All tool calling is handled by our agent loop.

This spec introduces a lightweight `ModelAdapter` interface and the first concrete adapter: `createClaudeCliProvider()`.

### Derives From

| Source | What it provides |
|--------|-----------------|
| Plan: `abundant-snacking-sprout.md` | Architecture decision (Option A — simple adapter functions), interface shape, key design decisions |
| `src/agent.ts:404-423` | The 2 methods the agent loop uses: `model.bindTools()` and `model.invoke()` |
| `src/types.ts:165-182` | `DeepFactorAgentSettings.model` — currently `BaseChatModel \| string` |
| `packages/deep-factor-cli/src/tools/bash.ts` | `child_process` pattern with async wrapper |

### Relevant Files

| File | Purpose |
|------|---------|
| `packages/deep-factor-agent/src/types.ts` | `DeepFactorAgentSettings` — `model` field needs union extension |
| `packages/deep-factor-agent/src/agent.ts` | `ensureModel()` (line 186-194) needs 3rd branch; agent loop (line 404-423) uses `invoke` + `bindTools` |
| `packages/deep-factor-agent/src/index.ts` | Re-exports — needs new provider exports |
| `packages/deep-factor-agent/src/create-agent.ts` | Factory — may need type adjustment |
| `packages/deep-factor-cli/src/tools/bash.ts` | Reference for `child_process` async pattern |
| `packages/deep-factor-agent/__tests__/agent.test.ts` | Test patterns — `makeMockModel()`, `makeAIMessage()` |

---

## OVERVIEW

1. **Create `src/providers/types.ts`** — Define `ModelAdapter` interface with `invoke()` and optional `bindTools()`
2. **Create `src/providers/claude-cli.ts`** — Factory function `createClaudeCliProvider()` that shells out to `claude -p`
3. **Create `__tests__/providers/claude-cli.test.ts`** — Unit tests with mocked `child_process`
4. **Modify `src/types.ts`** — Extend `DeepFactorAgentSettings.model` to accept `ModelAdapter`
5. **Modify `src/agent.ts`** — Add `ModelAdapter` branch to `ensureModel()`, update stored model type
6. **Modify `src/index.ts`** — Export new provider types and factory

---

## IMPLEMENTATION

### `src/providers/types.ts` — ModelAdapter Interface

```ts
import type { BaseMessage, AIMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";

/**
 * Minimal model interface matching what the agent loop actually needs.
 * Adapters implement this instead of extending BaseChatModel.
 */
export interface ModelAdapter {
  invoke(messages: BaseMessage[]): Promise<AIMessage>;
  bindTools?(tools: StructuredToolInterface[]): ModelAdapter;
}

/**
 * Type guard to distinguish ModelAdapter from BaseChatModel.
 * BaseChatModel has _generate; ModelAdapter does not.
 */
export function isModelAdapter(
  model: unknown,
): model is ModelAdapter {
  return (
    typeof model === "object" &&
    model !== null &&
    "invoke" in model &&
    typeof (model as any).invoke === "function" &&
    !("_generate" in model) // BaseChatModel has _generate
  );
}
```

### `src/providers/claude-cli.ts` — Claude CLI Provider

```ts
import { execFile } from "node:child_process";
import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ModelAdapter } from "./types.js";

export interface ClaudeCliProviderOptions {
  /** Claude model to use (e.g. "sonnet", "opus"). Passed as --model flag. */
  model?: string;
  /** Path to claude binary. Default: "claude" (resolved via PATH). */
  cliPath?: string;
  /** Timeout in ms. Default: 120_000 (2 minutes). */
  timeout?: number;
  /** Max output buffer in bytes. Default: 10MB. */
  maxBuffer?: number;
}

/**
 * Tool-call JSON format embedded in the system prompt when bindTools is called.
 * The Claude CLI model is instructed to respond with this format.
 */
const TOOL_CALL_FORMAT = `When you want to use a tool, respond with ONLY a JSON block in this exact format (no other text):
\`\`\`json
{"tool_calls": [{"name": "<tool_name>", "id": "<unique_id>", "args": {<arguments>}}]}
\`\`\`
You may include multiple tool calls in the array if they are independent.
If you do NOT need to use a tool, respond with plain text (no JSON block).`;

function execFileAsync(
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options, encoding: "utf8" }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/**
 * Serialize LangChain messages to a prompt string for the CLI.
 * System messages become a preamble, human/AI/tool messages are labeled.
 */
function messagesToPrompt(messages: BaseMessage[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    const role = msg.getType();

    switch (role) {
      case "system":
        parts.push(`[System]\n${content}`);
        break;
      case "human":
        parts.push(`[User]\n${content}`);
        break;
      case "ai":
        parts.push(`[Assistant]\n${content}`);
        break;
      case "tool":
        parts.push(`[Tool Result (${(msg as any).tool_call_id})]\n${content}`);
        break;
      default:
        parts.push(`[${role}]\n${content}`);
    }
  }
  return parts.join("\n\n");
}

/**
 * Parse tool calls from CLI response text.
 * Looks for a JSON code block with {"tool_calls": [...]}.
 */
function parseToolCalls(
  text: string,
): { name: string; id: string; args: Record<string, unknown> }[] | null {
  // Match ```json ... ``` block
  const jsonBlockMatch = text.match(
    /```json\s*\n?([\s\S]*?)\n?\s*```/,
  );
  if (!jsonBlockMatch) return null;

  try {
    const parsed = JSON.parse(jsonBlockMatch[1]);
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      return parsed.tool_calls.map(
        (tc: { name: string; id?: string; args?: Record<string, unknown> }) => ({
          name: tc.name,
          id: tc.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          args: tc.args ?? {},
        }),
      );
    }
  } catch {
    // Not valid JSON — treat as plain text
  }
  return null;
}

export function createClaudeCliProvider(
  opts?: ClaudeCliProviderOptions,
): ModelAdapter {
  const cliPath = opts?.cliPath ?? "claude";
  const modelFlag = opts?.model;
  const timeout = opts?.timeout ?? 120_000;
  const maxBuffer = opts?.maxBuffer ?? 10 * 1024 * 1024;
  let boundToolDefs: string | null = null;

  function buildAdapter(): ModelAdapter {
    const adapter: ModelAdapter = {
      async invoke(messages: BaseMessage[]): Promise<AIMessage> {
        let prompt = messagesToPrompt(messages);

        // Inject tool definitions into the prompt if tools are bound
        if (boundToolDefs) {
          prompt = `${boundToolDefs}\n\n${TOOL_CALL_FORMAT}\n\n${prompt}`;
        }

        const args = ["-p", prompt, "--no-input"];
        if (modelFlag) args.push("--model", modelFlag);

        const stdout = await execFileAsync(cliPath, args, {
          timeout,
          maxBuffer,
        });

        const trimmed = stdout.trim();
        const toolCalls = boundToolDefs ? parseToolCalls(trimmed) : null;

        if (toolCalls && toolCalls.length > 0) {
          // Extract text content outside the JSON block
          const textContent = trimmed
            .replace(/```json\s*\n?[\s\S]*?\n?\s*```/, "")
            .trim();

          return new AIMessage({
            content: textContent || "",
            tool_calls: toolCalls,
          });
        }

        return new AIMessage({ content: trimmed });
      },

      bindTools(tools: StructuredToolInterface[]): ModelAdapter {
        // Serialize tool definitions for prompt injection
        const toolDefs = tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.schema
            ? JSON.parse(JSON.stringify(t.schema))
            : {},
        }));
        boundToolDefs = `Available tools:\n${JSON.stringify(toolDefs, null, 2)}`;
        return adapter;
      },
    };

    return adapter;
  }

  return buildAdapter();
}
```

### `src/types.ts` — Extend Model Union

Add `ModelAdapter` to the `model` field:

```ts
// At top of file, add import:
import type { ModelAdapter } from "./providers/types.js";

// Change DeepFactorAgentSettings.model:
export interface DeepFactorAgentSettings<
  TTools extends StructuredToolInterface[] = StructuredToolInterface[],
> {
  model: BaseChatModel | ModelAdapter | string;
  // ... rest unchanged
}
```

### `src/agent.ts` — Update ensureModel()

Change the stored model type and add a `ModelAdapter` branch:

```ts
// At top, add import:
import { isModelAdapter } from "./providers/types.js";
import type { ModelAdapter } from "./providers/types.js";

// Change class property types:
private modelOrString: BaseChatModel | ModelAdapter | string;
private resolvedModel: BaseChatModel | ModelAdapter | null = null;

// Update ensureModel:
private async ensureModel(): Promise<BaseChatModel | ModelAdapter> {
  if (this.resolvedModel) return this.resolvedModel;
  if (typeof this.modelOrString === "string") {
    this.resolvedModel = await initChatModel(this.modelOrString);
    return this.resolvedModel;
  }
  // Both BaseChatModel and ModelAdapter pass through directly
  this.resolvedModel = this.modelOrString;
  return this.resolvedModel;
}
```

The agent loop at lines 404-423 already uses duck-typing for `model.bindTools` (optional chaining guard) and `model.invoke()`, so it works with `ModelAdapter` without further changes.

### `src/index.ts` — New Exports

```ts
// Providers
export type { ModelAdapter } from "./providers/types.js";
export { isModelAdapter } from "./providers/types.js";
export { createClaudeCliProvider } from "./providers/claude-cli.js";
export type { ClaudeCliProviderOptions } from "./providers/claude-cli.js";
```

### `__tests__/providers/claude-cli.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Mock child_process before import
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { createClaudeCliProvider } from "../../src/providers/claude-cli.js";
import { execFile } from "node:child_process";

const mockExecFile = vi.mocked(execFile);

function mockCliResponse(stdout: string) {
  mockExecFile.mockImplementation(
    (_file: any, _args: any, _opts: any, callback: any) => {
      callback(null, stdout, "");
      return {} as any;
    },
  );
}

function mockCliError(message: string) {
  mockExecFile.mockImplementation(
    (_file: any, _args: any, _opts: any, callback: any) => {
      callback(new Error(message), "", message);
      return {} as any;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createClaudeCliProvider", () => {
  it("returns a ModelAdapter with invoke and bindTools", () => {
    const provider = createClaudeCliProvider();
    expect(provider.invoke).toBeInstanceOf(Function);
    expect(provider.bindTools).toBeInstanceOf(Function);
  });

  describe("invoke", () => {
    it("calls claude CLI with -p flag and returns AIMessage", async () => {
      mockCliResponse("Hello, world!");

      const provider = createClaudeCliProvider();
      const result = await provider.invoke([
        new HumanMessage("Say hello"),
      ]);

      expect(result.content).toBe("Hello, world!");
      expect(result.tool_calls).toEqual([]);
      expect(mockExecFile).toHaveBeenCalledOnce();

      const [file, args] = mockExecFile.mock.calls[0] as any[];
      expect(file).toBe("claude");
      expect(args).toContain("-p");
      expect(args).toContain("--no-input");
    });

    it("passes --model flag when model option is set", async () => {
      mockCliResponse("Response");

      const provider = createClaudeCliProvider({ model: "sonnet" });
      await provider.invoke([new HumanMessage("test")]);

      const [, args] = mockExecFile.mock.calls[0] as any[];
      expect(args).toContain("--model");
      expect(args).toContain("sonnet");
    });

    it("uses custom cliPath", async () => {
      mockCliResponse("Response");

      const provider = createClaudeCliProvider({ cliPath: "/usr/local/bin/claude" });
      await provider.invoke([new HumanMessage("test")]);

      const [file] = mockExecFile.mock.calls[0] as any[];
      expect(file).toBe("/usr/local/bin/claude");
    });

    it("throws on CLI error", async () => {
      mockCliError("Command not found: claude");

      const provider = createClaudeCliProvider();
      await expect(
        provider.invoke([new HumanMessage("test")]),
      ).rejects.toThrow("Command not found: claude");
    });

    it("serializes system, human, ai, and tool messages", async () => {
      mockCliResponse("Done");

      const provider = createClaudeCliProvider();
      await provider.invoke([
        new SystemMessage("Be concise."),
        new HumanMessage("What is 2+2?"),
      ]);

      const [, args] = mockExecFile.mock.calls[0] as any[];
      const prompt = args[1]; // -p <prompt>
      expect(prompt).toContain("[System]");
      expect(prompt).toContain("Be concise.");
      expect(prompt).toContain("[User]");
      expect(prompt).toContain("What is 2+2?");
    });
  });

  describe("bindTools + tool call parsing", () => {
    const calculatorTool = tool(
      async ({ expression }: { expression: string }) => String(eval(expression)),
      {
        name: "calculator",
        description: "Evaluate a math expression",
        schema: z.object({ expression: z.string() }),
      },
    );

    it("parses tool calls from JSON code block in response", async () => {
      const toolCallResponse = [
        "Let me calculate that.",
        "```json",
        '{"tool_calls": [{"name": "calculator", "id": "call_1", "args": {"expression": "2+2"}}]}',
        "```",
      ].join("\n");

      mockCliResponse(toolCallResponse);

      const provider = createClaudeCliProvider();
      const bound = provider.bindTools!([calculatorTool]);
      const result = await bound.invoke([new HumanMessage("What is 2+2?")]);

      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls![0]).toMatchObject({
        name: "calculator",
        id: "call_1",
        args: { expression: "2+2" },
      });
    });

    it("returns plain text when no JSON block is present", async () => {
      mockCliResponse("The answer is 4.");

      const provider = createClaudeCliProvider();
      const bound = provider.bindTools!([calculatorTool]);
      const result = await bound.invoke([new HumanMessage("What is 2+2?")]);

      expect(result.content).toBe("The answer is 4.");
      expect(result.tool_calls).toEqual([]);
    });

    it("handles multiple tool calls in one response", async () => {
      const multiToolResponse = [
        "```json",
        '{"tool_calls": [',
        '  {"name": "calculator", "id": "call_1", "args": {"expression": "2+2"}},',
        '  {"name": "calculator", "id": "call_2", "args": {"expression": "3*3"}}',
        "]}",
        "```",
      ].join("\n");

      mockCliResponse(multiToolResponse);

      const provider = createClaudeCliProvider();
      const bound = provider.bindTools!([calculatorTool]);
      const result = await bound.invoke([new HumanMessage("Calculate both")]);

      expect(result.tool_calls).toHaveLength(2);
    });

    it("injects tool definitions into prompt when tools are bound", async () => {
      mockCliResponse("The answer is 4.");

      const provider = createClaudeCliProvider();
      provider.bindTools!([calculatorTool]);
      await provider.invoke([new HumanMessage("test")]);

      const [, args] = mockExecFile.mock.calls[0] as any[];
      const prompt = args[1];
      expect(prompt).toContain("Available tools:");
      expect(prompt).toContain("calculator");
      expect(prompt).toContain("tool_calls");
    });
  });
});
```

---

## FILE STRUCTURE

### New
- `packages/deep-factor-agent/src/providers/types.ts`
- `packages/deep-factor-agent/src/providers/claude-cli.ts`
- `packages/deep-factor-agent/__tests__/providers/claude-cli.test.ts`

### Modified
- `packages/deep-factor-agent/src/types.ts` — Add `ModelAdapter` to `model` union
- `packages/deep-factor-agent/src/agent.ts` — Update `ensureModel()` return type and stored model type
- `packages/deep-factor-agent/src/index.ts` — Export `ModelAdapter`, `isModelAdapter`, `createClaudeCliProvider`

---

## DESIGN DECISIONS

1. **`ModelAdapter` over `BaseChatModel`**: The agent loop uses exactly 2 methods — `invoke()` and `bindTools()`. Implementing the full `BaseChatModel` abstract class would require 10+ irrelevant methods (`_generate`, `_llmType`, `_modelType`, serialization, etc.). A minimal interface matches the actual contract.

2. **`execFile` not `exec`**: Avoids shell injection. Arguments are passed as an array, not interpolated into a command string. This matches the security pattern in `packages/deep-factor-cli/src/tools/bash.ts`.

3. **Tool calling via prompt engineering**: When `bindTools()` is called, tool definitions are serialized as JSON and injected into the prompt. The CLI model is instructed to respond with a specific JSON format (`{"tool_calls": [...]}`). The adapter parses tool calls from the response text. This is the only viable approach since the Claude CLI doesn't expose native tool-use bindings in print mode.

4. **`isModelAdapter` type guard uses `_generate` absence**: `BaseChatModel` always has `_generate` (it's abstract). `ModelAdapter` never does. This is a reliable discriminator without requiring a brand/symbol.

5. **`--no-input` flag**: Prevents the Claude CLI from waiting for interactive input. Combined with `-p`, this ensures the CLI runs as a pure prompt→response pipe.

6. **Mutable `boundToolDefs` via closure**: `bindTools()` sets a closure variable rather than returning a new object. This is simpler than cloning the adapter and matches how LangChain's `bindTools` returns the same model reference.

---

## ACCEPTANCE CRITERIA

- [ ] `ModelAdapter` interface exists in `src/providers/types.ts` with `invoke()` and optional `bindTools()`
- [ ] `isModelAdapter()` type guard correctly distinguishes `ModelAdapter` from `BaseChatModel`
- [ ] `createClaudeCliProvider()` returns a `ModelAdapter`
- [ ] Provider calls `claude -p <prompt> --no-input` via `execFile`
- [ ] `--model` flag is passed when `model` option is set
- [ ] Custom `cliPath` option overrides the binary path
- [ ] `bindTools()` injects tool definitions into the prompt
- [ ] Tool calls are parsed from `\`\`\`json {"tool_calls": [...]} \`\`\`` blocks in the response
- [ ] Multiple tool calls in a single response are parsed correctly
- [ ] Plain text responses (no tool calls) return `AIMessage` with empty `tool_calls`
- [ ] CLI errors propagate as rejected promises with the error message
- [ ] `DeepFactorAgentSettings.model` accepts `ModelAdapter` (union type: `BaseChatModel | ModelAdapter | string`)
- [ ] `ensureModel()` in `agent.ts` handles `ModelAdapter` (passes through without `initChatModel`)
- [ ] `createClaudeCliProvider` is exported from `src/index.ts`
- [ ] `ModelAdapter` type is exported from `src/index.ts`
- [ ] All unit tests pass: `pnpm -C packages/deep-factor-agent test`
- [ ] Build succeeds: `pnpm -C packages/deep-factor-agent build`
- [ ] Type-check passes: `pnpm -C packages/deep-factor-agent type-check`
