/**
 * Shared ProviderResponse normalization layer.
 *
 * Both SDK providers (Anthropic, OpenAI) produce a `ProviderResponse` before
 * converting to LangChain's `AIMessage`. This eliminates duplication in
 * content-block parsing, usage normalization, and tool-call extraction.
 */

import { AIMessage } from "@langchain/core/messages";
import type { TokenUsage } from "../types.js";

// ---------------------------------------------------------------------------
// Content blocks (mirrors Anthropic API shape — canonical representation)
// ---------------------------------------------------------------------------

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock;

// ---------------------------------------------------------------------------
// ProviderResponse — the unified shape every SDK provider normalizes into
// ---------------------------------------------------------------------------

export interface ProviderResponse {
  /** Ordered content blocks from the model response. */
  content: ContentBlock[];
  /** Token usage for this response. */
  usage: TokenUsage;
  /** Why the model stopped (e.g. "end_turn", "tool_use", "max_tokens"). */
  stopReason: string | undefined;
  /** Model identifier that produced this response. */
  model?: string;
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

/** Concatenate all text blocks into a single string. */
export function extractText(response: ProviderResponse): string {
  return response.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Extract tool calls in the format the agent loop expects. */
export function extractToolCalls(response: ProviderResponse): Array<{
  name: string;
  id: string;
  args: Record<string, unknown>;
  type: "tool_call";
}> {
  return response.content
    .filter((b): b is ToolUseBlock => b.type === "tool_use")
    .map((b) => ({
      name: b.name,
      id: b.id,
      args: b.input,
      type: "tool_call" as const,
    }));
}

/** Extract concatenated thinking content, if any. */
export function extractThinking(response: ProviderResponse): string | undefined {
  const parts = response.content
    .filter((b): b is ThinkingBlock => b.type === "thinking")
    .map((b) => b.thinking);
  return parts.length > 0 ? parts.join("") : undefined;
}

// ---------------------------------------------------------------------------
// Conversion to LangChain AIMessage
// ---------------------------------------------------------------------------

/**
 * Convert TokenUsage to the `usage_metadata` shape the agent loop reads via
 * `response.usage_metadata.input_tokens` etc.
 */
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

/**
 * Convert a ProviderResponse into a LangChain AIMessage with `tool_calls`
 * and `usage_metadata` attached — the exact shape the agent loop consumes.
 */
export function toAIMessage(response: ProviderResponse): AIMessage {
  const text = extractText(response);
  const toolCalls = extractToolCalls(response);

  const message = new AIMessage({
    content: text,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  });

  // Attach usage_metadata as a dynamic property (same pattern as CLI providers)
  (message as AIMessage & { usage_metadata?: unknown }).usage_metadata = toUsageMetadata(
    response.usage,
  );

  // Attach response_metadata for debugging
  (message as AIMessage & { response_metadata?: unknown }).response_metadata = {
    stop_reason: response.stopReason,
    model: response.model,
  };

  return message;
}

// ---------------------------------------------------------------------------
// Zero-value factory
// ---------------------------------------------------------------------------

export function createZeroUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}
