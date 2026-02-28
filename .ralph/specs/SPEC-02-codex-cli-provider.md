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
| `packages/deep-factor-agent/src/providers/messages-to-xml.ts` | Shared utility (from SPEC-01): `messagesToXml()`, `messagesToPrompt()`, `parseToolCalls()`, `execFileAsync()` |
| `packages/deep-factor-agent/src/providers/claude-cli.ts` | Reference — parallel structure |
| `packages/deep-factor-agent/src/xml-serializer.ts` | `escapeXml()` — used by shared utility |
| `packages/deep-factor-agent/src/index.ts` | Needs export of `createCodexCliProvider` |

---

## OVERVIEW

1. **Create `src/providers/codex-cli.ts`** — Factory function `createCodexCliProvider()` that shells out to `codex exec`, defaults to XML input encoding, imports shared utilities from `messages-to-xml.ts`
2. **Create `__tests__/providers/codex-cli.test.ts`** — Unit tests with mocked `child_process`
3. **Modify `src/index.ts`** — Export new provider

---

## IMPLEMENTATION

### `src/providers/codex-cli.ts` — Codex CLI Provider

```ts
import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ModelAdapter } from "./types.js";
import {
  execFileAsync,
  messagesToXml,
  messagesToPrompt,
  parseToolCalls,
} from "./messages-to-xml.js";

export interface CodexCliProviderOptions {
  /** Codex model to use (e.g. "o4-mini"). Passed as `--model <model>`. */
  model?: string;
  /** Path to the codex CLI binary. Default: "codex" */
  cliPath?: string;
  /** Timeout in milliseconds for the CLI process. Default: 120000 (2 min) */
  timeout?: number;
  /** Max stdout buffer in bytes. Default: 10 MB */
  maxBuffer?: number;
  /** Input encoding for messages. Default: "xml". Use "text" for plain-text labels. */
  inputEncoding?: "xml" | "text";
}

/** Prompt-engineered instruction telling the CLI model how to format tool calls. */
const TOOL_CALL_FORMAT = `When you need to call a tool, respond with ONLY a JSON block in this exact format:

\`\`\`json
{
  "tool_calls": [
    {
      "name": "tool_name",
      "args": { "param": "value" },
      "id": "call_1"
    }
  ]
}
\`\`\`

If you do not need to call any tools, respond with plain text (no JSON block).`;

/**
 * Create a Codex CLI model adapter.
 *
 * Shells out to `codex exec <prompt> --full-auto --sandbox read-only` for each
 * invocation. Tool calling is handled via prompt engineering: tool definitions
 * are injected into the prompt when `bindTools()` is called, and tool calls are
 * parsed from JSON code blocks in the response.
 *
 * By default, messages are serialized as `<thread>` XML (matching the agent's
 * `contextMode: "xml"` pattern). Set `inputEncoding: "text"` for plain-text labels.
 */
export function createCodexCliProvider(
  opts?: CodexCliProviderOptions,
): ModelAdapter {
  const cliPath = opts?.cliPath ?? "codex";
  const model = opts?.model;
  const timeout = opts?.timeout ?? 120_000;
  const maxBuffer = opts?.maxBuffer ?? 10 * 1024 * 1024;
  const inputEncoding = opts?.inputEncoding ?? "xml";

  let boundToolDefs: StructuredToolInterface[] = [];

  function buildAdapter(): ModelAdapter {
    return {
      async invoke(messages: BaseMessage[]): Promise<AIMessage> {
        let prompt = "";

        // Inject tool definitions if tools are bound
        if (boundToolDefs.length > 0) {
          const toolDefs = boundToolDefs.map((t) => ({
            name: t.name,
            description: t.description,
            parameters:
              "schema" in t && t.schema
                ? JSON.parse(JSON.stringify(t.schema))
                : {},
          }));
          prompt += `[Available Tools]\n${JSON.stringify(toolDefs, null, 2)}\n\n${TOOL_CALL_FORMAT}\n\n`;
        }

        // Serialize messages using the configured encoding
        prompt +=
          inputEncoding === "xml"
            ? messagesToXml(messages)
            : messagesToPrompt(messages);

        const args = ["exec", prompt, "--full-auto", "--sandbox", "read-only"];
        if (model) {
          args.push("--model", model);
        }

        const stdout = await execFileAsync(cliPath, args, {
          timeout,
          maxBuffer,
        });

        const text = stdout.trim();
        const toolCalls = parseToolCalls(text);

        if (toolCalls.length > 0) {
          // Extract any text outside the JSON block as content
          const contentOutsideJson = text
            .replace(/```json\s*\n?[\s\S]*?\n?\s*```/, "")
            .trim();
          return new AIMessage({
            content: contentOutsideJson || "",
            tool_calls: toolCalls,
          });
        }

        return new AIMessage({ content: text, tool_calls: [] });
      },

      bindTools(tools: StructuredToolInterface[]): ModelAdapter {
        boundToolDefs = tools;
        return this;
      },
    };
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
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";

// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { createCodexCliProvider } from "../../src/providers/codex-cli.js";
import { isModelAdapter } from "../../src/providers/types.js";

const mockExecFile = vi.mocked(execFile);

function simulateExecFile(stdout: string) {
  mockExecFile.mockImplementation(
    (_file: any, _args: any, _opts: any, cb: any) => {
      cb(null, stdout, "");
      return {} as any;
    },
  );
}

function simulateExecFileError(message: string) {
  mockExecFile.mockImplementation(
    (_file: any, _args: any, _opts: any, cb: any) => {
      cb(new Error(message), "", "");
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
    expect(provider).toBeDefined();
    expect(typeof provider.invoke).toBe("function");
    expect(typeof provider.bindTools).toBe("function");
    expect(isModelAdapter(provider)).toBe(true);
  });

  it("calls codex exec <prompt> --full-auto --sandbox read-only via execFile", async () => {
    simulateExecFile("Hello from Codex CLI");
    const provider = createCodexCliProvider();

    const result = await provider.invoke([new HumanMessage("Hi")]);

    expect(mockExecFile).toHaveBeenCalledOnce();
    const [file, args] = mockExecFile.mock.calls[0] as any[];
    expect(file).toBe("codex");
    expect(args[0]).toBe("exec");
    expect(args).toContain("--full-auto");
    expect(args).toContain("--sandbox");
    expect(args).toContain("read-only");

    expect(result).toBeInstanceOf(AIMessage);
    expect(result.content).toBe("Hello from Codex CLI");
    expect(result.tool_calls).toEqual([]);
  });

  it("uses XML encoding by default (prompt contains <thread>)", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider();

    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    const prompt = args[1]; // exec <prompt>
    expect(prompt).toContain("<thread>");
    expect(prompt).toContain('<event type="human"');
    expect(prompt).not.toContain("[User]");
  });

  it("uses text encoding when inputEncoding: 'text'", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider({ inputEncoding: "text" });

    await provider.invoke([
      new SystemMessage("Be concise."),
      new HumanMessage("What is 2+2?"),
    ]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    const prompt = args[1];
    expect(prompt).toContain("[System]");
    expect(prompt).toContain("[User]");
    expect(prompt).not.toContain("<thread>");
  });

  it("passes --model flag when model option is set", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider({ model: "o4-mini" });

    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    expect(args).toContain("--model");
    expect(args).toContain("o4-mini");
  });

  it("uses custom cliPath", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider({
      cliPath: "/usr/local/bin/codex-dev",
    });

    await provider.invoke([new HumanMessage("Hi")]);

    const file = (mockExecFile.mock.calls[0] as any[])[0];
    expect(file).toBe("/usr/local/bin/codex-dev");
  });

  it("throws on CLI error", async () => {
    simulateExecFileError("CLI process exited with code 1");
    const provider = createCodexCliProvider();

    await expect(
      provider.invoke([new HumanMessage("Hi")]),
    ).rejects.toThrow("CLI process exited with code 1");
  });

  it("parses tool calls from JSON code block", async () => {
    const cliOutput = `I need to calculate something.

\`\`\`json
{
  "tool_calls": [
    {
      "name": "calculator",
      "args": { "expression": "2 + 2" },
      "id": "call_1"
    }
  ]
}
\`\`\``;
    simulateExecFile(cliOutput);
    const provider = createCodexCliProvider();

    const result = await provider.invoke([new HumanMessage("What is 2+2?")]);

    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0]).toEqual({
      name: "calculator",
      args: { expression: "2 + 2" },
      id: "call_1",
    });
  });

  it("returns plain text with empty tool_calls when no JSON block", async () => {
    simulateExecFile("The answer is 42.");
    const provider = createCodexCliProvider();

    const result = await provider.invoke([new HumanMessage("What is the meaning of life?")]);

    expect(result.content).toBe("The answer is 42.");
    expect(result.tool_calls).toEqual([]);
  });

  it("handles multiple tool calls in one response", async () => {
    const cliOutput = `\`\`\`json
{
  "tool_calls": [
    { "name": "calculator", "args": { "expression": "2 + 2" }, "id": "call_1" },
    { "name": "get_time", "args": {}, "id": "call_2" }
  ]
}
\`\`\``;
    simulateExecFile(cliOutput);
    const provider = createCodexCliProvider();

    const result = await provider.invoke([new HumanMessage("Calculate and get time")]);

    expect(result.tool_calls).toHaveLength(2);
    expect(result.tool_calls![0].name).toBe("calculator");
    expect(result.tool_calls![1].name).toBe("get_time");
  });

  it("injects tool definitions into prompt when tools bound", async () => {
    simulateExecFile("Plain response");
    const provider = createCodexCliProvider();

    const mockTool = {
      name: "calculator",
      description: "Evaluate math",
      schema: { type: "object", properties: { expr: { type: "string" } } },
      invoke: vi.fn(),
      lc_namespace: ["test"],
    } as any;

    provider.bindTools!([mockTool]);
    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    // args[0] = "exec", args[1] = prompt
    const prompt = args[1];
    expect(prompt).toContain("[Available Tools]");
    expect(prompt).toContain("calculator");
    expect(prompt).toContain("tool_calls");
  });

  it("passes timeout and maxBuffer options", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider({
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    await provider.invoke([new HumanMessage("Hi")]);

    const opts = (mockExecFile.mock.calls[0] as any[])[2];
    expect(opts.timeout).toBe(60_000);
    expect(opts.maxBuffer).toBe(5 * 1024 * 1024);
  });

  it("uses correct CLI argument structure (exec, prompt, flags)", async () => {
    simulateExecFile("Response");
    const provider = createCodexCliProvider({ model: "o4-mini" });

    await provider.invoke([new HumanMessage("Test prompt")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    // Expected: ["exec", <prompt>, "--full-auto", "--sandbox", "read-only", "--model", "o4-mini"]
    expect(args[0]).toBe("exec");
    expect(args[2]).toBe("--full-auto");
    expect(args[3]).toBe("--sandbox");
    expect(args[4]).toBe("read-only");
    expect(args[5]).toBe("--model");
    expect(args[6]).toBe("o4-mini");
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
