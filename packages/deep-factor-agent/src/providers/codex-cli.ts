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

export interface CodexCliProviderOptions {
  /** Codex model to use (e.g. "gpt-5.4"). Passed as `--model <model>`. */
  model?: string;
  /** Path to the codex CLI binary. Default: "codex" */
  cliPath?: string;
  /** Timeout in milliseconds for the CLI process. Default: 120000 (2 min) */
  timeout?: number;
  /** Max stdout/stderr buffer in bytes. Default: 10 MB */
  maxBuffer?: number;
  /** Input encoding for messages. Default: "xml". Use "text" for plain-text labels. */
  inputEncoding?: "xml" | "text";
  /** Codex CLI output mode. Default: "text". */
  outputFormat?: "text" | "jsonl";
  /** Codex sandbox mode. Default: "read-only". */
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  /** Skip the Codex Git repo check. Default: true. */
  skipGitRepoCheck?: boolean;
}

interface CodexJsonlEvent {
  type?: unknown;
  item?: Record<string, unknown>;
  usage?: unknown;
  error?: unknown;
  message?: unknown;
}

interface CodexStreamState {
  lastAgentMessageText: string;
  usage: TokenUsage;
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
  const outputTokens = typeof record.output_tokens === "number" ? record.output_tokens : undefined;
  const cacheReadTokens =
    typeof record.cached_input_tokens === "number" ? record.cached_input_tokens : undefined;

  if (inputTokens === undefined && outputTokens === undefined && cacheReadTokens === undefined) {
    return undefined;
  }

  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0),
    cacheReadTokens,
  };
}

function toUsageMetadata(usage: TokenUsage): {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read_input_tokens?: number;
} {
  return {
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    total_tokens: usage.totalTokens,
    ...(usage.cacheReadTokens !== undefined
      ? { cache_read_input_tokens: usage.cacheReadTokens }
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
        if (typeof item === "string") return item;
        if (
          typeof item === "object" &&
          item !== null &&
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

function stripToolCallJsonBlock(text: string): string {
  return text.replace(/```json\s*\n?[\s\S]*?\n?\s*```/, "").trim();
}

function responseTextToAiMessage(text: string, usage?: TokenUsage): AIMessage {
  const toolCalls = parseToolCalls(text);
  const content = toolCalls.length > 0 ? stripToolCallJsonBlock(text) : text.trim();

  return new AIMessage({
    content,
    tool_calls: toolCalls,
    ...(usage ? { usage_metadata: toUsageMetadata(usage) } : {}),
  });
}

/**
 * Create a Codex CLI model adapter.
 *
 * Tool calling is handled via prompt engineering: tool definitions are injected
 * into the prompt when `bindTools()` is called, and tool calls are parsed from
 * JSON code blocks in the response. The outer Deep Factor loop remains
 * authoritative for tool execution and HITL semantics.
 */
export function createCodexCliProvider(opts?: CodexCliProviderOptions): ModelAdapter {
  const cliPath = opts?.cliPath ?? "codex";
  const model = opts?.model;
  const timeout = opts?.timeout ?? 120_000;
  const maxBuffer = opts?.maxBuffer ?? 10 * 1024 * 1024;
  const inputEncoding = opts?.inputEncoding ?? "xml";
  const outputFormat = opts?.outputFormat ?? "text";
  const sandbox = opts?.sandbox ?? "read-only";
  const skipGitRepoCheck = opts?.skipGitRepoCheck ?? true;

  let boundToolDefs: StructuredToolInterface[] = [];

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

  function buildArgs(prompt: string, format: "text" | "jsonl"): string[] {
    const args = ["exec"];

    if (format === "jsonl") {
      args.push("--json");
    }
    args.push("--sandbox", sandbox);

    if (skipGitRepoCheck) {
      args.push("--skip-git-repo-check");
    }

    if (model) {
      args.push("--model", model);
    }

    args.push(prompt);

    return args;
  }

  async function invokeText(messages: BaseMessage[]): Promise<AIMessage> {
    const prompt = buildPrompt(messages);
    const args = buildArgs(prompt, "text");

    const stdout = await execFileAsync(cliPath, args, {
      timeout,
      maxBuffer,
    });

    return responseTextToAiMessage(stdout.trim());
  }

  async function invokeJsonl(
    messages: BaseMessage[],
    onUpdate?: (update: ModelInvocationUpdate) => void,
  ): Promise<AIMessage> {
    const prompt = buildPrompt(messages);
    const args = buildArgs(prompt, "jsonl");
    const child = spawn(cliPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const state: CodexStreamState = {
      lastAgentMessageText: "",
      usage: createZeroUsage(),
    };

    let stdoutBuffer = "";
    let stderrBuffer = "";
    let observedBytes = 0;
    let settled = false;
    let sawTurnCompleted = false;
    let timeoutId: NodeJS.Timeout | undefined;

    const finalize = (
      resolve: (value: AIMessage) => void,
      reject: (reason?: unknown) => void,
      error?: Error,
    ): void => {
      if (settled) return;
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(
        responseTextToAiMessage(
          state.lastAgentMessageText,
          state.usage.totalTokens > 0 || state.usage.cacheReadTokens !== undefined
            ? state.usage
            : undefined,
        ),
      );
    };

    const fail = (
      message: string,
      resolve: (value: AIMessage) => void,
      reject: (reason?: unknown) => void,
      rawStopReason?: string,
    ): void => {
      if (!settled) {
        onUpdate?.({ type: "error", error: message, rawStopReason });
      }
      child.kill();
      finalize(resolve, reject, new Error(message));
    };

    const assertBufferLimit = (
      chunk: string,
      resolve: (value: AIMessage) => void,
      reject: (reason?: unknown) => void,
    ): boolean => {
      observedBytes += Buffer.byteLength(chunk);
      if (observedBytes <= maxBuffer) {
        return true;
      }

      fail(
        `Codex CLI JSONL stream exceeded maxBuffer (${maxBuffer} bytes).`,
        resolve,
        reject,
        "max_buffer_exceeded",
      );
      return false;
    };

    const handleEvent = (
      parsed: CodexJsonlEvent,
      resolve: (value: AIMessage) => void,
      reject: (reason?: unknown) => void,
    ): void => {
      const eventType = typeof parsed.type === "string" ? parsed.type : undefined;
      const item = parsed.item;
      const itemType = typeof item?.type === "string" ? item.type : undefined;

      if (
        (eventType === "item.started" || eventType === "item.completed") &&
        itemType === "command_execution"
      ) {
        fail(
          "Codex CLI attempted native command execution, which violates the Deep Factor provider contract. Codex must return prompt-engineered tool calls instead of `command_execution` items.",
          resolve,
          reject,
          "contract_violation",
        );
        return;
      }

      if (eventType === "thread.started" || eventType === "turn.started") {
        return;
      }

      if (eventType === "item.completed" && itemType === "reasoning") {
        return;
      }

      if (eventType === "item.completed" && itemType === "agent_message") {
        const text = extractTextFromUnknown(item?.text ?? item?.content ?? item?.message);
        state.lastAgentMessageText = text;

        const toolCalls = parseToolCalls(text);
        for (const toolCall of toolCalls) {
          onUpdate?.({ type: "tool_call", toolCall });
        }

        const content = toolCalls.length > 0 ? stripToolCallJsonBlock(text) : text.trim();
        if (content) {
          onUpdate?.({ type: "assistant_message", content });
        }
        return;
      }

      if (eventType === "turn.completed") {
        sawTurnCompleted = true;
        const usage = normalizeUsage(parsed.usage);
        if (usage) {
          state.usage = usage;
          onUpdate?.({ type: "usage", usage });
        }
        onUpdate?.({
          type: "final",
          content: stripToolCallJsonBlock(state.lastAgentMessageText) || undefined,
          ...(usage ? { usage } : {}),
        });
        return;
      }

      const errorText =
        (typeof parsed.error === "string" && parsed.error) ||
        (typeof parsed.message === "string" && parsed.message);
      if (errorText) {
        fail(`Codex CLI stream error: ${errorText}`, resolve, reject, "provider_error");
      }
    };

    return await new Promise<AIMessage>((resolve, reject) => {
      timeoutId = setTimeout(() => {
        fail(`Codex CLI invocation timed out after ${timeout}ms.`, resolve, reject, "timeout");
      }, timeout);

      child.on("error", (error) => {
        fail(`Codex CLI invocation failed: ${error.message}`, resolve, reject, "spawn_error");
      });

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        if (settled || !assertBufferLimit(chunk, resolve, reject)) {
          return;
        }

        stdoutBuffer += chunk;
        let newlineIndex = stdoutBuffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const rawLine = stdoutBuffer.slice(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

          if (rawLine.length > 0) {
            try {
              handleEvent(JSON.parse(rawLine) as CodexJsonlEvent, resolve, reject);
            } catch (error) {
              fail(
                `Codex CLI emitted malformed JSONL: ${error instanceof Error ? error.message : String(error)}`,
                resolve,
                reject,
                "malformed_jsonl",
              );
              return;
            }
          }

          newlineIndex = stdoutBuffer.indexOf("\n");
        }
      });

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        if (settled || !assertBufferLimit(chunk, resolve, reject)) {
          return;
        }
        stderrBuffer += chunk;
      });

      child.on("close", (code) => {
        if (settled) {
          return;
        }

        const trailing = stdoutBuffer.trim();
        if (trailing.length > 0) {
          try {
            handleEvent(JSON.parse(trailing) as CodexJsonlEvent, resolve, reject);
          } catch (error) {
            fail(
              `Codex CLI emitted malformed JSONL: ${error instanceof Error ? error.message : String(error)}`,
              resolve,
              reject,
              "malformed_jsonl",
            );
            return;
          }
        }

        if (code !== 0) {
          const detail = stderrBuffer.trim();
          fail(
            `Codex CLI invocation failed${detail ? `: ${detail}` : ` with exit code ${code}`}`,
            resolve,
            reject,
            "non_zero_exit",
          );
          return;
        }

        if (!sawTurnCompleted) {
          fail(
            "Codex CLI JSONL stream ended before emitting turn.completed.",
            resolve,
            reject,
            "incomplete_stream",
          );
          return;
        }

        finalize(resolve, reject);
      });
    });
  }

  return {
    async invoke(messages: BaseMessage[]): Promise<AIMessage> {
      if (outputFormat === "jsonl") {
        return invokeJsonl(messages);
      }
      return invokeText(messages);
    },

    async invokeWithUpdates(
      messages: BaseMessage[],
      onUpdate: (update: ModelInvocationUpdate) => void,
    ): Promise<AIMessage> {
      return invokeJsonl(messages, onUpdate);
    },

    bindTools(tools: StructuredToolInterface[]): ModelAdapter {
      boundToolDefs = tools;
      return this;
    },
  };
}
