# SPEC-02: Codex CLI Provider

## CONTEXT

### Problem Statement

With the `ModelAdapter` interface established in SPEC-01, we need a second concrete adapter for **OpenAI Codex CLI** (`codex exec`). Like the Claude CLI provider, this is a pure input/output adapter — prompt goes in, response comes out. No interactivity from the CLI itself; all tool calling is handled by our agent loop via prompt-engineered JSON output.

### Derives From

| Source | What it provides |
|--------|-----------------|
| Plan: `abundant-snacking-sprout.md` | Codex CLI invocation pattern: `codex exec "prompt" --full-auto --sandbox read-only` |
| SPEC-01 | `ModelAdapter` interface, `isModelAdapter()` type guard, prompt engineering pattern for tool calls |
| `src/providers/claude-cli.ts` | Reference implementation — same structure adapted for Codex CLI |

### Relevant Files

| File | Purpose |
|------|---------|
| `packages/deep-factor-agent/src/providers/types.ts` | `ModelAdapter` interface (from SPEC-01) |
| `packages/deep-factor-agent/src/providers/claude-cli.ts` | Reference — parallel structure |
| `packages/deep-factor-agent/src/index.ts` | Needs export of `createCodexCliProvider` |

---

## OVERVIEW

1. **Create `src/providers/codex-cli.ts`** — Factory function `createCodexCliProvider()` that shells out to `codex exec`
2. **Create `__tests__/providers/codex-cli.test.ts`** — Unit tests with mocked `child_process`
3. **Modify `src/index.ts`** — Export new provider

---

## IMPLEMENTATION

### `src/providers/codex-cli.ts` — Codex CLI Provider

```ts
import { execFile } from "node:child_process";
import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ModelAdapter } from "./types.js";

export interface CodexCliProviderOptions {
  /** OpenAI model to use (e.g. "o4-mini", "gpt-4.1"). Passed as --model flag. */
  model?: string;
  /** Path to codex binary. Default: "codex" (resolved via PATH). */
  cliPath?: string;
  /** Timeout in ms. Default: 120_000 (2 minutes). */
  timeout?: number;
  /** Max output buffer in bytes. Default: 10MB. */
  maxBuffer?: number;
}

/**
 * Tool-call JSON format embedded in the system prompt when bindTools is called.
 * Same format as Claude CLI provider for consistency.
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
 * Same format as Claude CLI provider.
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

export function createCodexCliProvider(
  opts?: CodexCliProviderOptions,
): ModelAdapter {
  const cliPath = opts?.cliPath ?? "codex";
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

        // codex exec "<prompt>" --full-auto --sandbox read-only
        const args = ["exec", prompt, "--full-auto", "--sandbox", "read-only"];
        if (modelFlag) args.push("--model", modelFlag);

        const stdout = await execFileAsync(cliPath, args, {
          timeout,
          maxBuffer,
        });

        const trimmed = stdout.trim();
        const toolCalls = boundToolDefs ? parseToolCalls(trimmed) : null;

        if (toolCalls && toolCalls.length > 0) {
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

### `src/index.ts` — New Exports

Add after the Claude CLI provider exports:

```ts
// Providers (continued)
export { createCodexCliProvider } from "./providers/codex-cli.js";
export type { CodexCliProviderOptions } from "./providers/codex-cli.js";
```

### `__tests__/providers/codex-cli.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { createCodexCliProvider } from "../../src/providers/codex-cli.js";
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

describe("createCodexCliProvider", () => {
  it("returns a ModelAdapter with invoke and bindTools", () => {
    const provider = createCodexCliProvider();
    expect(provider.invoke).toBeInstanceOf(Function);
    expect(provider.bindTools).toBeInstanceOf(Function);
  });

  describe("invoke", () => {
    it("calls codex exec with --full-auto --sandbox read-only", async () => {
      mockCliResponse("4");

      const provider = createCodexCliProvider();
      const result = await provider.invoke([
        new HumanMessage("What is 2+2?"),
      ]);

      expect(result.content).toBe("4");
      expect(mockExecFile).toHaveBeenCalledOnce();

      const [file, args] = mockExecFile.mock.calls[0] as any[];
      expect(file).toBe("codex");
      expect(args[0]).toBe("exec");
      expect(args).toContain("--full-auto");
      expect(args).toContain("--sandbox");
      expect(args).toContain("read-only");
    });

    it("passes --model flag when model option is set", async () => {
      mockCliResponse("Response");

      const provider = createCodexCliProvider({ model: "o4-mini" });
      await provider.invoke([new HumanMessage("test")]);

      const [, args] = mockExecFile.mock.calls[0] as any[];
      expect(args).toContain("--model");
      expect(args).toContain("o4-mini");
    });

    it("uses custom cliPath", async () => {
      mockCliResponse("Response");

      const provider = createCodexCliProvider({ cliPath: "/usr/local/bin/codex" });
      await provider.invoke([new HumanMessage("test")]);

      const [file] = mockExecFile.mock.calls[0] as any[];
      expect(file).toBe("/usr/local/bin/codex");
    });

    it("throws on CLI error", async () => {
      mockCliError("Command not found: codex");

      const provider = createCodexCliProvider();
      await expect(
        provider.invoke([new HumanMessage("test")]),
      ).rejects.toThrow("Command not found: codex");
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
        "```json",
        '{"tool_calls": [{"name": "calculator", "id": "call_1", "args": {"expression": "2+2"}}]}',
        "```",
      ].join("\n");

      mockCliResponse(toolCallResponse);

      const provider = createCodexCliProvider();
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

      const provider = createCodexCliProvider();
      const bound = provider.bindTools!([calculatorTool]);
      const result = await bound.invoke([new HumanMessage("What is 2+2?")]);

      expect(result.content).toBe("The answer is 4.");
      expect(result.tool_calls).toEqual([]);
    });

    it("injects tool definitions into prompt when tools are bound", async () => {
      mockCliResponse("The answer is 4.");

      const provider = createCodexCliProvider();
      provider.bindTools!([calculatorTool]);
      await provider.invoke([new HumanMessage("test")]);

      const [, args] = mockExecFile.mock.calls[0] as any[];
      const prompt = args[1]; // exec <prompt>
      expect(prompt).toContain("Available tools:");
      expect(prompt).toContain("calculator");
    });
  });
});
```

---

## FILE STRUCTURE

### New
- `packages/deep-factor-agent/src/providers/codex-cli.ts`
- `packages/deep-factor-agent/__tests__/providers/codex-cli.test.ts`

### Modified
- `packages/deep-factor-agent/src/index.ts` — Export `createCodexCliProvider`, `CodexCliProviderOptions`

---

## DESIGN DECISIONS

1. **Same tool-call JSON format as Claude CLI**: Both providers use the same `{"tool_calls": [...]}` JSON block format for tool call output. This keeps the parsing logic consistent and makes it easy for humans to reason about. A future refactor could extract `parseToolCalls` and `messagesToPrompt` into a shared utility.

2. **`codex exec` with `--full-auto --sandbox read-only`**: `exec` is the non-interactive mode for Codex CLI. `--full-auto` skips confirmation prompts. `--sandbox read-only` prevents the CLI from making filesystem changes — our agent loop handles all tool execution.

3. **Parallel structure to Claude CLI provider**: The Codex provider mirrors `claude-cli.ts` almost exactly. The only differences are the CLI binary name, the command structure (`exec <prompt>` vs `-p <prompt>`), and the flags. This consistency makes both providers easy to maintain.

4. **No shared base class**: Despite the near-identical structure, we don't extract a shared base. Two small files with some duplication is clearer than an abstraction hierarchy. If a third CLI provider is added, extraction makes sense then (Rule of Three).

---

## ACCEPTANCE CRITERIA

- [ ] `createCodexCliProvider()` returns a `ModelAdapter`
- [ ] Provider calls `codex exec <prompt> --full-auto --sandbox read-only` via `execFile`
- [ ] `--model` flag is passed when `model` option is set
- [ ] Custom `cliPath` option overrides the binary path
- [ ] `bindTools()` injects tool definitions into the prompt
- [ ] Tool calls are parsed from `\`\`\`json {"tool_calls": [...]} \`\`\`` blocks in the response
- [ ] Plain text responses return `AIMessage` with empty `tool_calls`
- [ ] CLI errors propagate as rejected promises
- [ ] `createCodexCliProvider` is exported from `src/index.ts`
- [ ] All unit tests pass: `pnpm -C packages/deep-factor-agent test`
- [ ] Build succeeds: `pnpm -C packages/deep-factor-agent build`
- [ ] Type-check passes: `pnpm -C packages/deep-factor-agent type-check`
