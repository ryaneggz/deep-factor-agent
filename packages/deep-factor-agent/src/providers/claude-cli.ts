import { spawn } from "node:child_process";
import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { toJSONSchema } from "zod";
import type { TokenUsage } from "../types.js";
import type { ModelAdapter, ModelInvocationUpdate } from "./types.js";
import {
  execFileAsync,
  messagesToXml,
  messagesToPrompt,
  parseToolCalls,
} from "./messages-to-xml.js";

export interface ClaudeCliProviderOptions {
  /** Claude model to use (e.g. "sonnet", "opus"). Passed as `--model <model>`. */
  model?: string;
  /** Claude CLI permission mode. Default: "bypassPermissions". */
  permissionMode?: "acceptEdits" | "bypassPermissions" | "default" | "dontAsk" | "plan" | "auto";
  /** Path to the claude CLI binary. Default: "claude" */
  cliPath?: string;
  /** Timeout in milliseconds for the CLI process. Default: 120000 (2 min) */
  timeout?: number;
  /** Max stdout buffer in bytes. Default: 10 MB */
  maxBuffer?: number;
  /** Input encoding for messages. Default: "xml". Use "text" for plain-text labels. */
  inputEncoding?: "xml" | "text";
  /** Disable Claude CLI built-in tools so tool use goes through the outer agent loop. Default: true. */
  disableBuiltInTools?: boolean;
  /** Claude CLI output format. Default: "json". */
  outputFormat?: "json" | "stream-json";
  /** Enables Claude CLI verbose stream events when using `stream-json`. Default: false. */
  verbose?: boolean;
  /** Includes partial assistant-message deltas when using `stream-json`. Default: false. */
  includePartialMessages?: boolean;
}

interface ClaudeCliJsonResponse {
  result: string;
  stop_reason?: string | null;
  session_id?: string | null;
  model?: string | null;
  permission_denials?: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface ClaudeCliMessageMetadata extends Record<string, unknown> {
  session_id?: string;
  stop_reason?: string;
  permission_mode: NonNullable<ClaudeCliProviderOptions["permissionMode"]>;
  model?: string;
  permission_denials?: unknown;
}

interface ClaudeCliStreamState {
  textBlocks: string[];
  partialText: string[];
  toolCalls: Array<{ name: string; args: Record<string, unknown>; id: string }>;
  usage: TokenUsage;
  responseMetadata: ClaudeCliMessageMetadata;
  finalContent?: string;
  sawAssistantBlock: boolean;
  sawFinalEvent: boolean;
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
 * Shells out to `claude --print --output-format json <prompt>` for each invocation.
 * Tool calling is handled via prompt engineering: tool definitions are injected
 * into the prompt when `bindTools()` is called, and tool calls are parsed from
 * JSON code blocks in the response.
 *
 * By default, messages are serialized as `<thread>` XML (matching the agent's
 * `contextMode: "xml"` pattern). Set `inputEncoding: "text"` for plain-text labels.
 */
export function createClaudeCliProvider(opts?: ClaudeCliProviderOptions): ModelAdapter {
  const cliPath = opts?.cliPath ?? "claude";
  const model = opts?.model;
  const permissionMode = opts?.permissionMode ?? "bypassPermissions";
  const timeout = opts?.timeout ?? 120_000;
  const maxBuffer = opts?.maxBuffer ?? 10 * 1024 * 1024;
  const inputEncoding = opts?.inputEncoding ?? "xml";
  const disableBuiltInTools = opts?.disableBuiltInTools ?? true;
  const outputFormat = opts?.outputFormat ?? "json";
  const verbose = opts?.verbose ?? false;
  const includePartialMessages = opts?.includePartialMessages ?? false;

  let boundToolDefs: StructuredToolInterface[] = [];

  function createZeroUsage(): TokenUsage {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
  }

  function normalizeUsage(value: unknown): TokenUsage | undefined {
    if (typeof value !== "object" || value === null) {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const inputTokens = typeof record.input_tokens === "number" ? record.input_tokens : undefined;
    const outputTokens =
      typeof record.output_tokens === "number" ? record.output_tokens : undefined;
    const totalTokens =
      typeof record.total_tokens === "number"
        ? record.total_tokens
        : inputTokens !== undefined || outputTokens !== undefined
          ? (inputTokens ?? 0) + (outputTokens ?? 0)
          : undefined;
    const cacheReadTokens =
      typeof record.cache_read_input_tokens === "number"
        ? record.cache_read_input_tokens
        : undefined;
    const cacheWriteTokens =
      typeof record.cache_creation_input_tokens === "number"
        ? record.cache_creation_input_tokens
        : undefined;

    if (
      inputTokens === undefined &&
      outputTokens === undefined &&
      totalTokens === undefined &&
      cacheReadTokens === undefined &&
      cacheWriteTokens === undefined
    ) {
      return undefined;
    }

    return {
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
      totalTokens: totalTokens ?? 0,
      cacheReadTokens,
      cacheWriteTokens,
    };
  }

  function maxUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
    return {
      inputTokens: Math.max(a.inputTokens, b.inputTokens),
      outputTokens: Math.max(a.outputTokens, b.outputTokens),
      totalTokens: Math.max(a.totalTokens, b.totalTokens),
      cacheReadTokens:
        a.cacheReadTokens !== undefined || b.cacheReadTokens !== undefined
          ? Math.max(a.cacheReadTokens ?? 0, b.cacheReadTokens ?? 0)
          : undefined,
      cacheWriteTokens:
        a.cacheWriteTokens !== undefined || b.cacheWriteTokens !== undefined
          ? Math.max(a.cacheWriteTokens ?? 0, b.cacheWriteTokens ?? 0)
          : undefined,
    };
  }

  function toClaudeUsageMetadata(usage: TokenUsage): {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  } {
    return {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.totalTokens,
      ...(usage.cacheReadTokens !== undefined
        ? { cache_read_input_tokens: usage.cacheReadTokens }
        : {}),
      ...(usage.cacheWriteTokens !== undefined
        ? { cache_creation_input_tokens: usage.cacheWriteTokens }
        : {}),
    };
  }

  function extractTextFromUnknown(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          if (
            typeof item === "object" &&
            item !== null &&
            "type" in item &&
            (item as { type?: unknown }).type === "text" &&
            "text" in item &&
            typeof (item as { text?: unknown }).text === "string"
          ) {
            return (item as { text: string }).text;
          }
          return "";
        })
        .join("");
    }

    if (
      typeof value === "object" &&
      value !== null &&
      "text" in value &&
      typeof (value as { text?: unknown }).text === "string"
    ) {
      return (value as { text: string }).text;
    }

    return "";
  }

  function buildPrompt(messages: BaseMessage[]): string {
    let prompt = "";

    if (boundToolDefs.length > 0) {
      const toolDefs = boundToolDefs.map((t) => ({
        name: t.name,
        description: t.description,
        parameters:
          "schema" in t && t.schema
            ? "_zod" in (t.schema as object)
              ? toJSONSchema(t.schema as import("zod").ZodType)
              : t.schema
            : {},
      }));
      prompt += `[Available Tools]\n${JSON.stringify(toolDefs, null, 2)}\n\n${TOOL_CALL_FORMAT}\n\n`;
    }

    return (
      prompt + (inputEncoding === "xml" ? messagesToXml(messages) : messagesToPrompt(messages))
    );
  }

  function buildArgs(prompt: string, format: "json" | "stream-json"): string[] {
    const args = ["--print", "--output-format", format];
    if (disableBuiltInTools) {
      args.push("--tools", "");
    }
    if (format === "stream-json" && verbose) {
      args.push("--verbose");
    }
    if (format === "stream-json" && includePartialMessages) {
      args.push("--include-partial-messages");
    }
    args.push("--permission-mode", permissionMode);
    if (model) {
      args.push("--model", model);
    }
    args.push(prompt);
    return args;
  }

  function buildCommandPreview(args: string[]): string {
    return [cliPath, ...args.slice(0, -1)].join(" ");
  }

  function parseJsonOutput(stdout: string): ClaudeCliJsonResponse {
    let parsed: unknown;

    try {
      parsed = JSON.parse(stdout);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Claude CLI returned invalid JSON output: ${detail}`);
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("result" in parsed) ||
      typeof parsed.result !== "string"
    ) {
      throw new Error("Claude CLI JSON output did not include a string result field");
    }

    return parsed as ClaudeCliJsonResponse;
  }

  function createStreamState(): ClaudeCliStreamState {
    return {
      textBlocks: [],
      partialText: [],
      toolCalls: [],
      usage: createZeroUsage(),
      responseMetadata: {
        permission_mode: permissionMode,
      },
      sawAssistantBlock: false,
      sawFinalEvent: false,
    };
  }

  function addToolCallFromBlock(
    block: Record<string, unknown>,
    state: ClaudeCliStreamState,
    onUpdate?: (update: ModelInvocationUpdate) => void,
  ): void {
    const name = typeof block.name === "string" ? block.name : undefined;
    if (!name) {
      return;
    }

    const id = typeof block.id === "string" ? block.id : `call_${state.toolCalls.length}`;
    const args =
      typeof block.input === "object" && block.input !== null
        ? (block.input as Record<string, unknown>)
        : typeof block.args === "object" && block.args !== null
          ? (block.args as Record<string, unknown>)
          : {};

    state.toolCalls.push({ name, id, args });
    onUpdate?.({
      type: "tool_call",
      toolCall: { name, id, args },
    });
  }

  function addAssistantText(
    text: string,
    state: ClaudeCliStreamState,
    onUpdate?: (update: ModelInvocationUpdate) => void,
  ): void {
    const normalized = text.trim();
    if (!normalized) {
      return;
    }

    state.sawAssistantBlock = true;
    state.textBlocks.push(normalized);
    onUpdate?.({
      type: "assistant_message",
      content: normalized,
    });
  }

  function readNestedProperty(record: Record<string, unknown>, path: string[]): unknown {
    let current: unknown = record;
    for (const part of path) {
      if (typeof current !== "object" || current === null || !(part in current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  function parsePartialTextEvent(event: Record<string, unknown>): string {
    return (
      extractTextFromUnknown(readNestedProperty(event, ["delta"])) ||
      extractTextFromUnknown(readNestedProperty(event, ["partial_message"])) ||
      extractTextFromUnknown(readNestedProperty(event, ["message", "delta"])) ||
      extractTextFromUnknown(readNestedProperty(event, ["event", "delta"])) ||
      ""
    );
  }

  function processStreamLine(
    line: string,
    state: ClaudeCliStreamState,
    onUpdate?: (update: ModelInvocationUpdate) => void,
  ): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const preview = line.length > 200 ? `${line.slice(0, 200)}...` : line;
      const message = `Claude CLI stream-json produced malformed JSON: ${detail}. Line: ${preview}`;
      onUpdate?.({ type: "error", error: message });
      throw new Error(message);
    }

    if (typeof parsed !== "object" || parsed === null) {
      return;
    }

    const event = parsed as Record<string, unknown>;
    const type = typeof event.type === "string" ? event.type : undefined;
    const rawStopReason =
      typeof event.stop_reason === "string"
        ? event.stop_reason
        : typeof readNestedProperty(event, ["message", "stop_reason"]) === "string"
          ? (readNestedProperty(event, ["message", "stop_reason"]) as string)
          : undefined;

    if (typeof event.session_id === "string") {
      state.responseMetadata.session_id = event.session_id;
    }
    if (typeof event.model === "string") {
      state.responseMetadata.model = event.model;
    }
    if (rawStopReason) {
      state.responseMetadata.stop_reason = rawStopReason;
    }
    if ("permission_denials" in event) {
      state.responseMetadata.permission_denials = event.permission_denials;
    }

    const usage = normalizeUsage(event.usage ?? readNestedProperty(event, ["message", "usage"]));
    const emitUsage = (): void => {
      if (!usage) {
        return;
      }

      state.usage = maxUsage(state.usage, usage);
      onUpdate?.({
        type: "usage",
        usage: state.usage,
        rawStopReason,
      });
    };

    if (type === "assistant") {
      const message =
        typeof event.message === "object" && event.message !== null
          ? (event.message as Record<string, unknown>)
          : event;
      const content = Array.isArray(message.content) ? message.content : [];

      for (const block of content) {
        if (typeof block !== "object" || block === null) {
          continue;
        }

        const contentBlock = block as Record<string, unknown>;
        if (contentBlock.type === "text") {
          addAssistantText(
            typeof contentBlock.text === "string" ? contentBlock.text : "",
            state,
            onUpdate,
          );
          continue;
        }

        if (contentBlock.type === "tool_use") {
          addToolCallFromBlock(contentBlock, state, onUpdate);
        }
      }
      emitUsage();
      return;
    }

    if (type === "stream_event") {
      const partialText = parsePartialTextEvent(event);
      if (partialText.trim()) {
        state.partialText.push(partialText);
      }
      return;
    }

    if (type === "result") {
      state.sawFinalEvent = true;

      if (event.subtype === "error" || event.is_error === true || typeof event.error === "string") {
        const message =
          typeof event.error === "string"
            ? event.error
            : typeof event.result === "string"
              ? event.result
              : "Claude CLI reported an error result.";
        onUpdate?.({
          type: "error",
          error: message,
          rawStopReason,
        });
        throw new Error(message);
      }

      if (typeof event.result === "string" && event.result.trim()) {
        state.finalContent = event.result.trim();
      }

      emitUsage();
      onUpdate?.({
        type: "final",
        content: state.finalContent,
        usage: state.usage,
        rawStopReason,
      });
      return;
    }

    if (type === "error") {
      const message =
        typeof event.error === "string"
          ? event.error
          : typeof event.message === "string"
            ? event.message
            : "Claude CLI reported a stream error.";
      onUpdate?.({
        type: "error",
        error: message,
        rawStopReason,
      });
      throw new Error(message);
    }

    emitUsage();
  }

  function buildStreamMessage(state: ClaudeCliStreamState): AIMessage {
    const fallbackText = state.textBlocks.join("\n\n").trim();
    const partialText = state.partialText.join("").trim();
    const text = (state.finalContent ?? (fallbackText || partialText)).trim();
    const toolCalls = state.toolCalls.length > 0 ? state.toolCalls : parseToolCalls(text);

    if (state.toolCalls.length === 0 && toolCalls.length > 0) {
      state.toolCalls = toolCalls;
    }

    const content =
      toolCalls.length > 0 ? text.replace(/```json\s*\n?[\s\S]*?\n?\s*```/, "").trim() : text;

    return attachClaudeMetadata(
      new AIMessage({
        content,
        tool_calls: state.toolCalls,
      }),
      toClaudeUsageMetadata(state.usage),
      state.responseMetadata,
    );
  }

  function attachClaudeMetadata(
    message: AIMessage,
    usageMetadata: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    },
    responseMetadata: ClaudeCliMessageMetadata,
  ): AIMessage {
    (message as AIMessage & { usage_metadata?: unknown }).usage_metadata = usageMetadata;
    (message as AIMessage & { response_metadata?: unknown }).response_metadata = responseMetadata;
    return message;
  }

  async function invokeJson(messages: BaseMessage[]): Promise<AIMessage> {
    const prompt = buildPrompt(messages);
    const args = buildArgs(prompt, "json");
    const commandPreview = buildCommandPreview(args);
    let stdout: string;

    try {
      stdout = await execFileAsync(cliPath, args, {
        timeout,
        maxBuffer,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Claude CLI invocation failed (${commandPreview}): ${detail}`);
    }

    const response = parseJsonOutput(stdout.trim());
    const text = response.result.trim();
    const toolCalls = parseToolCalls(text);
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const usageMetadata = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    };
    const responseMetadata: ClaudeCliMessageMetadata = {
      permission_mode: permissionMode,
    };

    if (response.session_id) {
      responseMetadata.session_id = response.session_id;
    }
    if (response.stop_reason) {
      responseMetadata.stop_reason = response.stop_reason;
    }
    const resolvedModel = response.model ?? model;
    if (resolvedModel) {
      responseMetadata.model = resolvedModel;
    }
    if (response.permission_denials !== undefined) {
      responseMetadata.permission_denials = response.permission_denials;
    }

    if (toolCalls.length > 0) {
      const contentOutsideJson = text.replace(/```json\s*\n?[\s\S]*?\n?\s*```/, "").trim();
      return attachClaudeMetadata(
        new AIMessage({
          content: contentOutsideJson || "",
          tool_calls: toolCalls,
        }),
        usageMetadata,
        responseMetadata,
      );
    }

    return attachClaudeMetadata(
      new AIMessage({ content: text, tool_calls: [] }),
      usageMetadata,
      responseMetadata,
    );
  }

  async function invokeStream(
    messages: BaseMessage[],
    onUpdate?: (update: ModelInvocationUpdate) => void,
  ): Promise<AIMessage> {
    const prompt = buildPrompt(messages);
    const args = buildArgs(prompt, "stream-json");
    const commandPreview = buildCommandPreview(args);
    const state = createStreamState();

    return new Promise<AIMessage>((resolve, reject) => {
      const child = spawn(cliPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdoutBuffer = "";
      let stderrBuffer = "";
      let bufferedBytes = 0;
      let settled = false;
      let timeoutId: NodeJS.Timeout | null = null;

      const fail = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        child.kill();
        reject(new Error(`Claude CLI invocation failed (${commandPreview}): ${error.message}`));
      };

      const succeed = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(buildStreamMessage(state));
      };

      const trackBuffer = (chunk: string): void => {
        bufferedBytes += Buffer.byteLength(chunk, "utf8");
        if (bufferedBytes > maxBuffer) {
          fail(new Error(`Claude CLI stream exceeded maxBuffer (${maxBuffer} bytes)`));
        }
      };

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          fail(new Error(`Timed out after ${timeout}ms`));
        }, timeout);
      }

      child.on("error", (error) => {
        fail(error instanceof Error ? error : new Error(String(error)));
      });

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        trackBuffer(chunk);
        if (settled) {
          return;
        }

        stdoutBuffer += chunk;

        let newlineIndex = stdoutBuffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = stdoutBuffer.slice(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

          if (line) {
            try {
              processStreamLine(line, state, onUpdate);
            } catch (error) {
              fail(error instanceof Error ? error : new Error(String(error)));
              return;
            }
          }

          newlineIndex = stdoutBuffer.indexOf("\n");
        }
      });

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        trackBuffer(chunk);
        stderrBuffer += chunk;
      });

      child.on("close", (code) => {
        if (settled) {
          return;
        }

        const trailing = stdoutBuffer.trim();
        if (trailing) {
          try {
            processStreamLine(trailing, state, onUpdate);
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
            return;
          }
        }

        if (code !== 0) {
          const detail = stderrBuffer.trim() || `Process exited with code ${code}`;
          fail(new Error(detail));
          return;
        }

        if (!state.sawFinalEvent && !state.sawAssistantBlock && !state.partialText.length) {
          fail(
            new Error(
              "Claude CLI stream-json ended without a result event or assistant content. Ensure this Claude CLI version supports --output-format stream-json.",
            ),
          );
          return;
        }

        succeed();
      });
    });
  }

  function buildAdapter(): ModelAdapter {
    return {
      async invoke(messages: BaseMessage[]): Promise<AIMessage> {
        return outputFormat === "stream-json" ? invokeStream(messages) : invokeJson(messages);
      },

      async invokeWithUpdates(
        messages: BaseMessage[],
        onUpdate: (update: ModelInvocationUpdate) => void,
      ): Promise<AIMessage> {
        return invokeStream(messages, onUpdate);
      },

      bindTools(tools: StructuredToolInterface[]): ModelAdapter {
        boundToolDefs = tools;
        return this;
      },
    };
  }

  return buildAdapter();
}
