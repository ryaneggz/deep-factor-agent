/**
 * OpenAI SDK provider — native Chat Completions API integration.
 *
 * Uses the `openai` SDK for native function calling, streaming,
 * structured output, and full usage metadata.
 *
 * The SDK is an optional peer dependency loaded dynamically at runtime.
 */

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { TokenUsage } from "../types.js";
import type { ModelAdapter, ModelInvocationUpdate } from "./types.js";
import type { ProviderResponse, ContentBlock } from "./provider-response.js";
import { toAIMessage, createZeroUsage } from "./provider-response.js";
import { toolsToOpenAIFormat } from "./tool-schema.js";
import type { OpenAIChatCompletionTool } from "./tool-schema.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface OpenAIProviderOptions {
  /** Model ID (e.g. "gpt-5.4", "o3-mini"). */
  model?: string;
  /** API key. Falls back to OPENAI_API_KEY env var. */
  apiKey?: string;
  /** Base URL. Falls back to OPENAI_BASE_URL env var. */
  baseURL?: string;
  /** Max completion tokens. Default: 16384. */
  maxCompletionTokens?: number;
  /** Temperature. Default: undefined (use model default). */
  temperature?: number;
  /** Reasoning effort for thinking models (e.g. "low", "medium", "high"). */
  reasoningEffort?: "low" | "medium" | "high";
  /** System prompt prepended before converted messages. */
  systemPrompt?: string;
  /** Timeout in milliseconds. Default: 120000. */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// OpenAI SDK types (minimal subset to avoid hard dependency)
// ---------------------------------------------------------------------------

interface OpenAIChatCompletionMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
}

interface OpenAIChatCompletionChoice {
  index: number;
  message: OpenAIChatCompletionMessage;
  finish_reason: string | null;
}

interface OpenAIChatCompletionResponse {
  id: string;
  choices: OpenAIChatCompletionChoice[];
  usage?: OpenAIUsage;
  model: string;
}

/** OpenAI message param shapes for the request. */
type OpenAIMessageParam =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

/**
 * Convert LangChain BaseMessage[] to OpenAI Chat Completions message format.
 *
 * - SystemMessage -> { role: "system", content }
 * - HumanMessage -> { role: "user", content }
 * - AIMessage -> { role: "assistant", content, tool_calls? }
 * - ToolMessage -> { role: "tool", tool_call_id, content }
 */
export function convertToOpenAIMessages(messages: BaseMessage[]): OpenAIMessageParam[] {
  const converted: OpenAIMessageParam[] = [];

  for (const msg of messages) {
    if (msg instanceof SystemMessage) {
      converted.push({
        role: "system",
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      });
      continue;
    }

    if (msg instanceof HumanMessage) {
      converted.push({
        role: "user",
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      });
      continue;
    }

    if (msg instanceof AIMessage) {
      const text = typeof msg.content === "string" ? msg.content : "";
      const toolCalls =
        msg.tool_calls && msg.tool_calls.length > 0
          ? msg.tool_calls.map((tc) => ({
              id: tc.id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.args ?? {}),
              },
            }))
          : undefined;

      converted.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    if (msg instanceof ToolMessage) {
      const toolCallId =
        msg.tool_call_id ??
        (msg.additional_kwargs?.tool_call_id as string | undefined) ??
        "unknown";
      converted.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      });
      continue;
    }
  }

  return converted;
}

// ---------------------------------------------------------------------------
// Response mapping
// ---------------------------------------------------------------------------

/** Safely parse JSON, returning empty object on failure. */
function safeParseJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Map OpenAI usage to our TokenUsage. */
function mapOpenAIUsage(usage: OpenAIUsage): TokenUsage {
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    cacheReadTokens: usage.prompt_tokens_details?.cached_tokens,
  };
}

/** Map an OpenAI chat completion choice + usage to our ProviderResponse. */
function mapOpenAIResponse(
  choice: OpenAIChatCompletionChoice,
  usage: OpenAIUsage | undefined,
  model: string,
): ProviderResponse {
  const content: ContentBlock[] = [];

  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: safeParseJSON(tc.function.arguments),
      });
    }
  }

  return {
    content,
    usage: usage ? mapOpenAIUsage(usage) : createZeroUsage(),
    stopReason: choice.finish_reason ?? undefined,
    model,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ModelAdapter backed by the OpenAI Chat Completions API.
 *
 * The `openai` package is loaded dynamically — it must be installed as a
 * peer dependency.
 */
export function createOpenAIProvider(opts?: OpenAIProviderOptions): ModelAdapter {
  const options = { ...opts };

  // Lazily resolved SDK client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any = null;
  let boundTools: OpenAIChatCompletionTool[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function ensureClient(): Promise<any> {
    if (client) return client;

    const sdkModuleId = "openai";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mod: any;
    try {
      mod = await import(/* webpackIgnore: true */ sdkModuleId);
    } catch {
      throw new Error(`openai SDK is not installed. Install it with: pnpm add openai`);
    }
    const OpenAI = mod.default ?? mod.OpenAI;
    // Only pass fields with actual values — passing undefined explicitly
    // prevents the SDK from reading its own env var fallbacks.
    client = new OpenAI({
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      timeout: options.timeout ?? 120_000,
    });
    return client;
  }

  // -------------------------------------------------------------------------
  // invoke()
  // -------------------------------------------------------------------------

  async function invoke(messages: BaseMessage[]): Promise<AIMessage> {
    const openai = await ensureClient();
    const openaiMessages = convertToOpenAIMessages(messages);

    // Prepend system prompt if configured
    if (options.systemPrompt) {
      openaiMessages.unshift({ role: "system", content: options.systemPrompt });
    }

    const requestParams: Record<string, unknown> = {
      model: options.model ?? "gpt-5.4",
      messages: openaiMessages,
      max_completion_tokens: options.maxCompletionTokens ?? 16384,
      ...(boundTools.length > 0 ? { tools: boundTools } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    };

    const response: OpenAIChatCompletionResponse =
      await openai.chat.completions.create(requestParams);

    const choice = response.choices[0];
    if (!choice) {
      throw new Error("OpenAI returned no choices");
    }

    const providerResponse = mapOpenAIResponse(choice, response.usage, response.model);
    return toAIMessage(providerResponse);
  }

  // -------------------------------------------------------------------------
  // invokeWithUpdates() — streaming
  // -------------------------------------------------------------------------

  async function invokeWithUpdates(
    messages: BaseMessage[],
    onUpdate: (update: ModelInvocationUpdate) => void,
  ): Promise<AIMessage> {
    const openai = await ensureClient();
    const openaiMessages = convertToOpenAIMessages(messages);

    if (options.systemPrompt) {
      openaiMessages.unshift({ role: "system", content: options.systemPrompt });
    }

    const requestParams: Record<string, unknown> = {
      model: options.model ?? "gpt-5.4",
      messages: openaiMessages,
      max_completion_tokens: options.maxCompletionTokens ?? 16384,
      ...(boundTools.length > 0 ? { tools: boundTools } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
      stream: true,
      stream_options: { include_usage: true },
    };

    const stream = await openai.chat.completions.create(requestParams);

    let textContent = "";
    const toolCallAccumulators: Map<number, { id: string; name: string; args: string }> = new Map();
    let usage: TokenUsage = createZeroUsage();
    let stopReason: string | undefined;

    for await (const chunk of stream as AsyncIterable<{
      choices?: Array<{
        delta?: {
          content?: string;
          tool_calls?: Array<{
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: string | null;
      }>;
      usage?: OpenAIUsage;
    }>) {
      const choice = chunk.choices?.[0];

      if (choice?.delta?.content) {
        textContent += choice.delta.content;
        onUpdate({ type: "assistant_message", content: choice.delta.content });
      }

      if (choice?.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const existing = toolCallAccumulators.get(tc.index);
          if (!existing) {
            toolCallAccumulators.set(tc.index, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              args: tc.function?.arguments ?? "",
            });
          } else {
            // Later chunks may carry id/name that weren't in the first delta
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) {
              existing.args += tc.function.arguments;
            }
          }
        }
      }

      if (choice?.finish_reason) {
        stopReason = choice.finish_reason;
      }

      if (chunk.usage) {
        usage = mapOpenAIUsage(chunk.usage);
        onUpdate({ type: "usage", usage, rawStopReason: stopReason });
      }
    }

    // Emit completed tool calls
    for (const [, tc] of toolCallAccumulators) {
      const args = safeParseJSON(tc.args);
      onUpdate({
        type: "tool_call",
        toolCall: { name: tc.name, id: tc.id, args },
      });
    }

    // Build final ProviderResponse
    const contentBlocks: ContentBlock[] = [];
    if (textContent) {
      contentBlocks.push({ type: "text", text: textContent });
    }
    for (const [, tc] of toolCallAccumulators) {
      contentBlocks.push({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: safeParseJSON(tc.args),
      });
    }

    const providerResponse: ProviderResponse = {
      content: contentBlocks,
      usage,
      stopReason,
      model: options.model,
    };

    onUpdate({
      type: "final",
      content: textContent,
      usage,
      rawStopReason: stopReason,
    });

    return toAIMessage(providerResponse);
  }

  // -------------------------------------------------------------------------
  // ModelAdapter
  // -------------------------------------------------------------------------

  const adapter: ModelAdapter = {
    invoke,
    invokeWithUpdates,
    bindTools(tools: StructuredToolInterface[]): ModelAdapter {
      boundTools = toolsToOpenAIFormat(tools);
      return adapter;
    },
  };

  return adapter;
}
