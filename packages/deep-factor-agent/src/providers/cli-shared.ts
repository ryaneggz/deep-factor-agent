/**
 * Shared utility functions for CLI-based model providers (claude-cli, codex-cli).
 * Extracted to eliminate duplication between provider implementations.
 */
import { AIMessage } from "@langchain/core/messages";
import type { TokenUsage } from "../types.js";
import { parseToolCalls } from "./messages-to-xml.js";

/** Prompt-engineered instruction telling the CLI model how to format tool calls. */
export const TOOL_CALL_FORMAT = `When you need to call a tool, respond with ONLY a JSON block in this exact format:

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

export function createZeroUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

/**
 * Parse a raw usage object from a CLI provider response into a TokenUsage.
 * Handles field name variants across providers:
 * - input_tokens, output_tokens, total_tokens (standard)
 * - cache_read_input_tokens (Claude)
 * - cached_input_tokens (Codex)
 * - cache_creation_input_tokens (Claude)
 */
export function normalizeUsage(value: unknown): TokenUsage | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const inputTokens = typeof record.input_tokens === "number" ? record.input_tokens : undefined;
  const outputTokens = typeof record.output_tokens === "number" ? record.output_tokens : undefined;
  const totalTokens =
    typeof record.total_tokens === "number"
      ? record.total_tokens
      : inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined;
  const cacheReadTokens =
    typeof record.cache_read_input_tokens === "number"
      ? record.cache_read_input_tokens
      : typeof record.cached_input_tokens === "number"
        ? record.cached_input_tokens
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

export function toUsageMetadata(usage: TokenUsage): {
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

export function extractTextFromUnknown(value: unknown): string {
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

export function stripToolCallJsonBlock(text: string): string {
  return text.replace(/```json\s*\n?[\s\S]*?\n?\s*```/, "").trim();
}

export function responseTextToAiMessage(text: string, usage?: TokenUsage): AIMessage {
  const toolCalls = parseToolCalls(text);
  const content = toolCalls.length > 0 ? stripToolCallJsonBlock(text) : text.trim();

  return new AIMessage({
    content,
    tool_calls: toolCalls,
    ...(usage ? { usage_metadata: toUsageMetadata(usage) } : {}),
  });
}
