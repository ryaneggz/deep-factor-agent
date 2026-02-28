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
| `packages/deep-factor-agent/src/xml-serializer.ts` | `escapeXml()` — reused by `messagesToXml()` (not duplicated) |
| `packages/deep-factor-cli/src/tools/bash.ts` | Reference for `child_process` async pattern |
| `packages/deep-factor-agent/__tests__/agent.test.ts` | Test patterns — `makeMockModel()`, `makeAIMessage()` |

---

## OVERVIEW

1. **Create `src/providers/types.ts`** — Define `ModelAdapter` interface with `invoke()` and optional `bindTools()`
2. **Create `src/providers/messages-to-xml.ts`** — Shared utility: `messagesToXml()`, `messagesToPrompt()`, `parseToolCalls()`, `execFileAsync()`
3. **Create `src/providers/claude-cli.ts`** — Factory function `createClaudeCliProvider()` that shells out to `claude -p`, defaults to XML input encoding
4. **Create `__tests__/providers/claude-cli.test.ts`** — Unit tests with mocked `child_process`
5. **Create `__tests__/providers/messages-to-xml.test.ts`** — Unit tests for shared XML serialization utility
6. **Modify `src/types.ts`** — Extend `DeepFactorAgentSettings.model` to accept `ModelAdapter`
7. **Modify `src/agent.ts`** — Add `ModelAdapter` branch to `ensureModel()`, update stored model type
8. **Modify `src/index.ts`** — Export new provider types and factory

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

### `src/providers/messages-to-xml.ts` — Shared Utility (NEW)

Extracts duplicated functions from both CLI providers into a single shared module. Adds `messagesToXml()` for XML input encoding.

```ts
import { execFile } from "node:child_process";
import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessage as AIMessageType } from "@langchain/core/messages";
import { escapeXml } from "../xml-serializer.js";

/**
 * Promisified `execFile` wrapper — avoids shell injection by passing args as
 * an array rather than interpolating into a command string.
 */
export function execFileAsync(
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options, encoding: "utf8" }, (error, stdout) => {
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Serialize LangChain `BaseMessage[]` to a plain-text labeled prompt.
 * Used as the `"text"` fallback when `inputEncoding` is not `"xml"`.
 */
export function messagesToPrompt(messages: BaseMessage[]): string {
  return messages
    .map((msg) => {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      const type = msg._getType();
      switch (type) {
        case "system":
          return `[System]\n${content}`;
        case "human":
          return `[User]\n${content}`;
        case "ai":
          return `[Assistant]\n${content}`;
        case "tool":
          return `[Tool Result]\n${content}`;
        default:
          return `[${type}]\n${content}`;
      }
    })
    .join("\n\n");
}

/**
 * Serialize LangChain `BaseMessage[]` to `<thread>` XML format.
 *
 * - `SystemMessage`  → `<event type="system">`
 * - `HumanMessage`   → `<event type="human">`
 * - `AIMessage`      → `<event type="ai">` + `<event type="tool_input">` per tool call
 * - `ToolMessage`    → `<event type="tool_output">`
 *
 * Reuses `escapeXml` from `src/xml-serializer.ts` (not duplicated).
 * Detects pre-serialized XML (content starting with `<thread>`) and passes through.
 *
 * `iteration="0"` for all events — `BaseMessage[]` doesn't carry iteration metadata.
 * `call_id` attribute links `tool_input`/`tool_output` pairs.
 */
export function messagesToXml(messages: BaseMessage[]): string {
  // Detect pre-serialized XML from buildXmlMessages() — pass through
  if (
    messages.length === 1 &&
    typeof messages[0].content === "string" &&
    messages[0].content.trimStart().startsWith("<thread>")
  ) {
    return messages[0].content;
  }

  // Build toolCallId → toolName map from AIMessage.tool_calls arrays
  const toolNameMap = new Map<string, string>();
  for (const msg of messages) {
    if (msg._getType() === "ai") {
      const aiMsg = msg as AIMessageType;
      if (aiMsg.tool_calls) {
        for (const tc of aiMsg.tool_calls) {
          if (tc.id) {
            toolNameMap.set(tc.id, tc.name);
          }
        }
      }
    }
  }

  const lines: string[] = ["<thread>"];
  let id = 0;

  for (const msg of messages) {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    const type = msg._getType();

    switch (type) {
      case "system":
        lines.push(
          `  <event type="system" id="${id}" iteration="0">${escapeXml(content)}</event>`,
        );
        id++;
        break;

      case "human":
        lines.push(
          `  <event type="human" id="${id}" iteration="0">${escapeXml(content)}</event>`,
        );
        id++;
        break;

      case "ai": {
        // Emit AI text content (may be empty when only tool calls)
        if (content) {
          lines.push(
            `  <event type="ai" id="${id}" iteration="0">${escapeXml(content)}</event>`,
          );
          id++;
        }
        // Emit tool_input events for each tool call
        const aiMsg = msg as AIMessageType;
        if (aiMsg.tool_calls) {
          for (const tc of aiMsg.tool_calls) {
            lines.push(
              `  <event type="tool_input" id="${id}" name="${escapeXml(tc.name)}" call_id="${escapeXml(tc.id ?? "")}" iteration="0">${escapeXml(JSON.stringify(tc.args))}</event>`,
            );
            id++;
          }
        }
        break;
      }

      case "tool": {
        const toolCallId = (msg as any).tool_call_id ?? "";
        const toolName = toolNameMap.get(toolCallId) ?? "unknown";
        lines.push(
          `  <event type="tool_output" id="${id}" name="${escapeXml(toolName)}" call_id="${escapeXml(toolCallId)}" status="success" iteration="0">${escapeXml(content)}</event>`,
        );
        id++;
        break;
      }

      default:
        lines.push(
          `  <event type="${escapeXml(type)}" id="${id}" iteration="0">${escapeXml(content)}</event>`,
        );
        id++;
    }
  }

  lines.push("</thread>");
  return lines.join("\n");
}

/**
 * Parse tool calls from a ```json``` code block in CLI response text.
 * Returns the parsed tool_calls array, or an empty array if no block found.
 */
export function parseToolCalls(
  text: string,
): Array<{ name: string; args: Record<string, unknown>; id: string }> {
  const match = text.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      return parsed.tool_calls.map(
        (tc: { name: string; args?: Record<string, unknown>; id?: string }, i: number) => ({
          name: tc.name,
          args: tc.args ?? {},
          id: tc.id ?? `call_${i}`,
        }),
      );
    }
  } catch {
    // JSON parse failed — treat as plain text response
  }

  return [];
}
```

### `src/providers/claude-cli.ts` — Claude CLI Provider

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

export interface ClaudeCliProviderOptions {
  /** Claude model to use (e.g. "sonnet", "opus"). Passed as `--model <model>`. */
  model?: string;
  /** Path to the claude CLI binary. Default: "claude" */
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
 * Create a Claude CLI model adapter.
 *
 * Shells out to `claude -p <prompt> --no-input` for each invocation.
 * Tool calling is handled via prompt engineering: tool definitions are injected
 * into the prompt when `bindTools()` is called, and tool calls are parsed from
 * JSON code blocks in the response.
 *
 * By default, messages are serialized as `<thread>` XML (matching the agent's
 * `contextMode: "xml"` pattern). Set `inputEncoding: "text"` for plain-text labels.
 */
export function createClaudeCliProvider(
  opts?: ClaudeCliProviderOptions,
): ModelAdapter {
  const cliPath = opts?.cliPath ?? "claude";
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

        const args = ["-p", prompt, "--no-input"];
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

### `__tests__/providers/messages-to-xml.test.ts` (NEW)

```ts
import { describe, it, expect } from "vitest";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { messagesToXml, messagesToPrompt, parseToolCalls } from "../../src/providers/messages-to-xml.js";

describe("messagesToXml", () => {
  it("serializes system/human/ai/tool messages to XML", () => {
    const messages = [
      new SystemMessage("You are helpful"),
      new HumanMessage("Hello"),
      new AIMessage({
        content: "I'll help",
        tool_calls: [{ name: "calc", id: "tc_1", args: { x: 1 } }],
      }),
      new ToolMessage({ tool_call_id: "tc_1", content: "42" }),
    ];

    const xml = messagesToXml(messages);

    expect(xml).toMatch(/^<thread>/);
    expect(xml).toMatch(/<\/thread>$/);
    expect(xml).toContain('<event type="system"');
    expect(xml).toContain('<event type="human"');
    expect(xml).toContain('<event type="ai"');
    expect(xml).toContain('<event type="tool_input"');
    expect(xml).toContain('name="calc"');
    expect(xml).toContain('call_id="tc_1"');
    expect(xml).toContain('<event type="tool_output"');
    expect(xml).toContain('name="calc"');
  });

  it("resolves tool names from AIMessage.tool_calls map", () => {
    const messages = [
      new AIMessage({
        content: "",
        tool_calls: [{ name: "search", id: "tc_2", args: { q: "test" } }],
      }),
      new ToolMessage({ tool_call_id: "tc_2", content: "results" }),
    ];

    const xml = messagesToXml(messages);
    // tool_output should resolve name="search" via the map
    expect(xml).toContain('<event type="tool_output"');
    expect(xml).toContain('name="search"');
    expect(xml).toContain('call_id="tc_2"');
  });

  it("falls back to 'unknown' for unresolvable tool names", () => {
    const messages = [
      new ToolMessage({ tool_call_id: "orphan_id", content: "result" }),
    ];

    const xml = messagesToXml(messages);
    expect(xml).toContain('name="unknown"');
  });

  it("escapes XML special characters", () => {
    const messages = [
      new HumanMessage('What is <b>"1 & 2"</b>?'),
    ];

    const xml = messagesToXml(messages);
    expect(xml).toContain("&lt;b&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;");
  });

  it("passes through pre-serialized XML (content starts with <thread>)", () => {
    const preSerialized = "<thread>\n  <event type=\"human\" id=\"0\" iteration=\"1\">Hello</event>\n</thread>";
    const messages = [new HumanMessage(preSerialized)];

    const xml = messagesToXml(messages);
    expect(xml).toBe(preSerialized);
  });

  it("sets iteration='0' for all events", () => {
    const messages = [
      new SystemMessage("sys"),
      new HumanMessage("hi"),
    ];

    const xml = messagesToXml(messages);
    const iterationMatches = xml.match(/iteration="0"/g);
    expect(iterationMatches).toHaveLength(2);
  });
});

describe("messagesToPrompt", () => {
  it("serializes system/human/ai/tool messages to labeled text", () => {
    const messages = [
      new SystemMessage("You are helpful"),
      new HumanMessage("Hello"),
      new AIMessage("Hi there"),
      new ToolMessage({ tool_call_id: "call_1", content: "result" }),
    ];

    const prompt = messagesToPrompt(messages);
    expect(prompt).toContain("[System]\nYou are helpful");
    expect(prompt).toContain("[User]\nHello");
    expect(prompt).toContain("[Assistant]\nHi there");
    expect(prompt).toContain("[Tool Result]\nresult");
  });

  it("separates messages with double newlines", () => {
    const messages = [new HumanMessage("First"), new HumanMessage("Second")];
    const prompt = messagesToPrompt(messages);
    expect(prompt).toBe("[User]\nFirst\n\n[User]\nSecond");
  });
});

describe("parseToolCalls", () => {
  it("extracts tool calls from a JSON code block", () => {
    const text = 'Some text\n\n```json\n{"tool_calls": [{"name": "calc", "args": {"x": 1}, "id": "c1"}]}\n```\n\nMore text';
    const result = parseToolCalls(text);
    expect(result).toEqual([{ name: "calc", args: { x: 1 }, id: "c1" }]);
  });

  it("returns empty array when no JSON block present", () => {
    expect(parseToolCalls("Just plain text")).toEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseToolCalls("```json\n{ invalid json }\n```")).toEqual([]);
  });

  it("assigns default ids when missing", () => {
    const text = '```json\n{"tool_calls": [{"name": "t", "args": {}}]}\n```';
    const result = parseToolCalls(text);
    expect(result[0].id).toBe("call_0");
  });

  it("handles multiple tool calls", () => {
    const text = '```json\n{"tool_calls": [{"name": "a", "args": {}, "id": "1"}, {"name": "b", "args": {"k": "v"}, "id": "2"}]}\n```';
    const result = parseToolCalls(text);
    expect(result).toHaveLength(2);
  });
});
```

### `__tests__/providers/claude-cli.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";

// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { createClaudeCliProvider } from "../../src/providers/claude-cli.js";
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

describe("createClaudeCliProvider", () => {
  it("returns a ModelAdapter with invoke and bindTools", () => {
    const provider = createClaudeCliProvider();
    expect(provider).toBeDefined();
    expect(typeof provider.invoke).toBe("function");
    expect(typeof provider.bindTools).toBe("function");
    expect(isModelAdapter(provider)).toBe(true);
  });

  it("calls claude -p <prompt> --no-input via execFile", async () => {
    simulateExecFile("Hello from Claude CLI");
    const provider = createClaudeCliProvider();

    const result = await provider.invoke([new HumanMessage("Hi")]);

    expect(mockExecFile).toHaveBeenCalledOnce();
    const [file, args] = mockExecFile.mock.calls[0] as any[];
    expect(file).toBe("claude");
    expect(args).toContain("-p");
    expect(args).toContain("--no-input");

    expect(result).toBeInstanceOf(AIMessage);
    expect(result.content).toBe("Hello from Claude CLI");
    expect(result.tool_calls).toEqual([]);
  });

  it("uses XML encoding by default (prompt contains <thread>)", async () => {
    simulateExecFile("Response");
    const provider = createClaudeCliProvider();

    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    const prompt = args[1]; // -p <prompt>
    expect(prompt).toContain("<thread>");
    expect(prompt).toContain('<event type="human"');
    expect(prompt).not.toContain("[User]");
  });

  it("uses text encoding when inputEncoding: 'text'", async () => {
    simulateExecFile("Response");
    const provider = createClaudeCliProvider({ inputEncoding: "text" });

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
    const provider = createClaudeCliProvider({ model: "sonnet" });

    await provider.invoke([new HumanMessage("Hi")]);

    const args = (mockExecFile.mock.calls[0] as any[])[1] as string[];
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
  });

  it("uses custom cliPath", async () => {
    simulateExecFile("Response");
    const provider = createClaudeCliProvider({
      cliPath: "/usr/local/bin/claude-dev",
    });

    await provider.invoke([new HumanMessage("Hi")]);

    const file = (mockExecFile.mock.calls[0] as any[])[0];
    expect(file).toBe("/usr/local/bin/claude-dev");
  });

  it("throws on CLI error", async () => {
    simulateExecFileError("CLI process exited with code 1");
    const provider = createClaudeCliProvider();

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
    const provider = createClaudeCliProvider();

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
    const provider = createClaudeCliProvider();

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
    const provider = createClaudeCliProvider();

    const result = await provider.invoke([new HumanMessage("Calculate and get time")]);

    expect(result.tool_calls).toHaveLength(2);
    expect(result.tool_calls![0].name).toBe("calculator");
    expect(result.tool_calls![1].name).toBe("get_time");
  });

  it("injects tool definitions into prompt when tools bound", async () => {
    simulateExecFile("Plain response");
    const provider = createClaudeCliProvider();

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
    const prompt = args[1]; // -p <prompt>
    expect(prompt).toContain("[Available Tools]");
    expect(prompt).toContain("calculator");
    expect(prompt).toContain("tool_calls");
  });

  it("passes timeout and maxBuffer options", async () => {
    simulateExecFile("Response");
    const provider = createClaudeCliProvider({
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    await provider.invoke([new HumanMessage("Hi")]);

    const opts = (mockExecFile.mock.calls[0] as any[])[2];
    expect(opts.timeout).toBe(60_000);
    expect(opts.maxBuffer).toBe(5 * 1024 * 1024);
  });
});

describe("isModelAdapter", () => {
  it("returns true for a ModelAdapter", () => {
    const adapter = createClaudeCliProvider();
    expect(isModelAdapter(adapter)).toBe(true);
  });

  it("returns false for a BaseChatModel-like object with _generate", () => {
    const baseChatModel = {
      invoke: vi.fn(),
      bindTools: vi.fn(),
      _generate: vi.fn(),
    };
    expect(isModelAdapter(baseChatModel)).toBe(false);
  });

  it("returns false for null/undefined/primitives", () => {
    expect(isModelAdapter(null)).toBe(false);
    expect(isModelAdapter(undefined)).toBe(false);
    expect(isModelAdapter("string")).toBe(false);
    expect(isModelAdapter(42)).toBe(false);
  });
});
```

---

## FILE STRUCTURE

### New
- `packages/deep-factor-agent/src/providers/types.ts`
- `packages/deep-factor-agent/src/providers/messages-to-xml.ts` — Shared utility: `messagesToXml()`, `messagesToPrompt()`, `parseToolCalls()`, `execFileAsync()`
- `packages/deep-factor-agent/src/providers/claude-cli.ts`
- `packages/deep-factor-agent/__tests__/providers/claude-cli.test.ts`
- `packages/deep-factor-agent/__tests__/providers/messages-to-xml.test.ts`

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

7. **XML by default** — `inputEncoding` defaults to `"xml"`, matching the codebase's `contextMode: "xml"` pattern. XML provides richer structure (iteration tracking, tool name resolution, structured events) than plain-text labels. The `"text"` fallback is retained for compatibility.

8. **Shared utility extraction** — `messagesToXml()`, `messagesToPrompt()`, `parseToolCalls()`, and `execFileAsync()` are extracted into `src/providers/messages-to-xml.ts`, eliminating ~150 lines of duplication between the Claude and Codex CLI providers.

9. **`escapeXml` reuse** — Imports from existing `src/xml-serializer.ts`, not duplicated.

10. **Pre-serialized pass-through** — When the agent uses `contextMode: "xml"`, the `HumanMessage` already contains `<thread>...</thread>`. `messagesToXml()` detects this and passes it through instead of double-wrapping.

11. **`iteration="0"` for all events** — `BaseMessage[]` doesn't carry iteration metadata; acceptable since iteration tracking is an agent-loop concept, not a message concept.

12. **`call_id` attribute** — Added to `tool_input`/`tool_output` events to link tool call/result pairs (the BaseMessage path needs this; the AgentEvent path uses ordering).

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
- [ ] **Shared utility `src/providers/messages-to-xml.ts` exists** with `messagesToXml()`, `messagesToPrompt()`, `parseToolCalls()`, `execFileAsync()`
- [ ] **`messagesToXml()` produces valid `<thread>` XML** with `<event type="system|human|ai|tool_input|tool_output">` elements
- [ ] **`messagesToXml()` resolves tool names** from `AIMessage.tool_calls` via `toolCallId → toolName` map
- [ ] **`messagesToXml()` escapes XML special characters** via `escapeXml` from `src/xml-serializer.ts`
- [ ] **`messagesToXml()` passes through pre-serialized XML** when content starts with `<thread>`
- [ ] **`inputEncoding` option** defaults to `"xml"`; `"text"` falls back to `messagesToPrompt()`
- [ ] **Default prompt contains `<thread>` XML**, not `[User]` labels
- [ ] All unit tests pass: `pnpm -C packages/deep-factor-agent test`
- [ ] Build succeeds: `pnpm -C packages/deep-factor-agent build`
- [ ] Type-check passes: `pnpm -C packages/deep-factor-agent type-check`
