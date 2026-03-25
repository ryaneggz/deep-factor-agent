/**
 * Anthropic SDK provider — native Messages API integration.
 *
 * Uses `@anthropic-ai/sdk` for native tool_use blocks, streaming,
 * extended thinking, cache control, and full usage metadata.
 *
 * The SDK is an optional peer dependency loaded dynamically at runtime.
 */

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { TokenUsage } from "../types.js";
import type { ModelAdapter, ModelInvocationUpdate } from "./types.js";
import type {
  ProviderResponse,
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
} from "./provider-response.js";
import { toAIMessage, extractText, createZeroUsage } from "./provider-response.js";
import { toolsToAnthropicFormat } from "./tool-schema.js";
import type { AnthropicToolParam } from "./tool-schema.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface AnthropicProviderOptions {
  /** Model ID (e.g. "claude-sonnet-4-20250514", "claude-opus-4-6"). */
  model?: string;
  /** API key (X-Api-Key header). Falls back to ANTHROPIC_API_KEY env var. */
  apiKey?: string;
  /**
   * OAuth/bearer token (Authorization header). Falls back to
   * ANTHROPIC_AUTH_TOKEN or CLAUDE_CODE_OAUTH_TOKEN env vars.
   * Use this to authenticate with a Claude subscription instead of an API key.
   */
  authToken?: string;
  /** Base URL for the API. Falls back to ANTHROPIC_BASE_URL env var. */
  baseURL?: string;
  /** Max tokens for the response. Default: 16384. */
  maxTokens?: number;
  /** Temperature. Default: undefined (use model default). */
  temperature?: number;
  /** Extended thinking configuration. */
  thinking?: { type: "enabled"; budget_tokens: number };
  /** System prompt prepended before converted messages. */
  systemPrompt?: string;
  /** Timeout in milliseconds. Default: 120000. */
  timeout?: number;
  /** Enable prompt caching via cache_control markers. Default: false. */
  enableCaching?: boolean;
}

// ---------------------------------------------------------------------------
// Anthropic SDK types (minimal subset to avoid hard dependency)
// ---------------------------------------------------------------------------

/** Minimal Anthropic Message response shape. */
interface AnthropicMessage {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

/** Minimal Anthropic message param shapes. */
type AnthropicMessageParam =
  | { role: "user"; content: string | AnthropicUserContent[] }
  | { role: "assistant"; content: string | AnthropicContentBlock[] };

type AnthropicUserContent =
  | { type: "text"; text: string }
  | { type: "tool_result"; tool_use_id: string; content: string };

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

interface ConvertedAnthropicMessages {
  system: string | undefined;
  messages: AnthropicMessageParam[];
}

/**
 * Convert LangChain BaseMessage[] to Anthropic Messages API format.
 *
 * - SystemMessage -> extracted to top-level `system` parameter
 * - HumanMessage -> { role: "user", content }
 * - AIMessage -> { role: "assistant", content: ContentBlock[] }
 * - ToolMessage -> { role: "user", content: [{ type: "tool_result", ... }] }
 */
export function convertToAnthropicMessages(messages: BaseMessage[]): ConvertedAnthropicMessages {
  const systemParts: string[] = [];
  const converted: AnthropicMessageParam[] = [];

  for (const msg of messages) {
    if (msg instanceof SystemMessage) {
      systemParts.push(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
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
      const blocks: AnthropicContentBlock[] = [];
      const text = typeof msg.content === "string" ? msg.content : "";
      if (text) {
        blocks.push({ type: "text", text });
      }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          blocks.push({
            type: "tool_use",
            id: tc.id ?? `call_${blocks.length}`,
            name: tc.name,
            input: (tc.args ?? {}) as Record<string, unknown>,
          });
        }
      }
      converted.push({
        role: "assistant",
        content: blocks.length > 0 ? blocks : text,
      });
      continue;
    }

    if (msg instanceof ToolMessage) {
      const toolCallId =
        msg.tool_call_id ??
        (msg.additional_kwargs?.tool_call_id as string | undefined) ??
        "unknown";
      converted.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolCallId,
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
          },
        ],
      });
      continue;
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: converted,
  };
}

// ---------------------------------------------------------------------------
// Response mapping
// ---------------------------------------------------------------------------

/** Map Anthropic usage to our TokenUsage. */
function mapAnthropicUsage(usage: AnthropicMessage["usage"]): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.input_tokens + usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens,
  };
}

/** Map an Anthropic Message response to our ProviderResponse. */
function mapAnthropicResponse(response: AnthropicMessage): ProviderResponse {
  const content: ContentBlock[] = response.content.map((block) => {
    switch (block.type) {
      case "text":
        return { type: "text", text: block.text } satisfies TextBlock;
      case "thinking":
        return { type: "thinking", thinking: block.thinking } satisfies ThinkingBlock;
      case "tool_use":
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input,
        } satisfies ToolUseBlock;
    }
  });

  return {
    content,
    usage: mapAnthropicUsage(response.usage),
    stopReason: response.stop_reason ?? undefined,
    model: response.model,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ModelAdapter backed by the Anthropic Messages API.
 *
 * The `@anthropic-ai/sdk` package is loaded dynamically — it must be
 * installed as a peer dependency.
 */
export function createAnthropicProvider(opts?: AnthropicProviderOptions): ModelAdapter {
  const options = { ...opts };

  // Lazily resolved SDK client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any = null;
  let boundTools: AnthropicToolParam[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function ensureClient(): Promise<any> {
    if (client) return client;

    const sdkModuleId = "@anthropic-ai/sdk";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mod: any;
    try {
      mod = await import(/* webpackIgnore: true */ sdkModuleId);
    } catch {
      throw new Error(
        `@anthropic-ai/sdk is not installed. Install it with: pnpm add @anthropic-ai/sdk`,
      );
    }
    const Anthropic = mod.default ?? mod.Anthropic;

    // Resolve auth: explicit options > ANTHROPIC_* env > CLAUDE_CODE_OAUTH_TOKEN env
    const authToken =
      options.authToken ??
      process.env.ANTHROPIC_AUTH_TOKEN ??
      process.env.CLAUDE_CODE_OAUTH_TOKEN ??
      undefined;

    client = new Anthropic({
      apiKey: options.apiKey ?? (authToken ? null : undefined),
      authToken: authToken ?? undefined,
      baseURL: options.baseURL,
      timeout: options.timeout ?? 120_000,
    });
    return client;
  }

  // -------------------------------------------------------------------------
  // invoke()
  // -------------------------------------------------------------------------

  async function invoke(messages: BaseMessage[]): Promise<AIMessage> {
    const anthropic = await ensureClient();
    const { system, messages: anthropicMessages } = convertToAnthropicMessages(messages);

    const requestParams: Record<string, unknown> = {
      model: options.model ?? "claude-opus-4-6",
      max_tokens: options.maxTokens ?? 16384,
      messages: anthropicMessages,
      ...(system ? { system } : {}),
      ...(boundTools.length > 0 ? { tools: boundTools } : {}),
      ...(options.thinking ? { thinking: options.thinking } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    };

    const response: AnthropicMessage = await anthropic.messages.create(requestParams);
    const providerResponse = mapAnthropicResponse(response);
    return toAIMessage(providerResponse);
  }

  // -------------------------------------------------------------------------
  // invokeWithUpdates() — streaming
  // -------------------------------------------------------------------------

  async function invokeWithUpdates(
    messages: BaseMessage[],
    onUpdate: (update: ModelInvocationUpdate) => void,
  ): Promise<AIMessage> {
    const anthropic = await ensureClient();
    const { system, messages: anthropicMessages } = convertToAnthropicMessages(messages);

    const requestParams: Record<string, unknown> = {
      model: options.model ?? "claude-opus-4-6",
      max_tokens: options.maxTokens ?? 16384,
      messages: anthropicMessages,
      ...(system ? { system } : {}),
      ...(boundTools.length > 0 ? { tools: boundTools } : {}),
      ...(options.thinking ? { thinking: options.thinking } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    };

    const stream = anthropic.messages.stream(requestParams);

    // Track content blocks as they arrive
    const blockAccumulators: Map<
      number,
      { type: string; text: string; id?: string; name?: string; inputJson: string }
    > = new Map();

    let usage: TokenUsage = createZeroUsage();
    let stopReason: string | undefined;

    stream.on("message_start", (event: { message: AnthropicMessage }) => {
      if (event.message.usage) {
        usage = mapAnthropicUsage(event.message.usage);
      }
    });

    stream.on(
      "content_block_start",
      (event: { index: number; content_block: AnthropicContentBlock }) => {
        const block = event.content_block;
        blockAccumulators.set(event.index, {
          type: block.type,
          text: "",
          id: block.type === "tool_use" ? block.id : undefined,
          name: block.type === "tool_use" ? block.name : undefined,
          inputJson: "",
        });
      },
    );

    stream.on("content_block_delta", (event: { index: number; delta: Record<string, unknown> }) => {
      const acc = blockAccumulators.get(event.index);
      if (!acc) return;

      const delta = event.delta;
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        acc.text += delta.text;
        onUpdate({ type: "assistant_message", content: delta.text });
      } else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
        acc.text += delta.thinking;
        onUpdate({ type: "thinking", content: delta.thinking });
      } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
        acc.inputJson += delta.partial_json;
      }
    });

    stream.on("content_block_stop", (event: { index: number }) => {
      const acc = blockAccumulators.get(event.index);
      if (!acc) return;

      // Emit completed tool calls
      if (acc.type === "tool_use") {
        if (!acc.id || !acc.name) {
          onUpdate({
            type: "error",
            error: `Tool call block missing id or name (index ${event.index})`,
          });
          return;
        }
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(acc.inputJson || "{}");
        } catch {
          // Malformed tool input — use empty args
        }
        onUpdate({
          type: "tool_call",
          toolCall: { name: acc.name, id: acc.id, args },
        });
      }
    });

    stream.on(
      "message_delta",
      (event: { delta: { stop_reason?: string }; usage?: { output_tokens: number } }) => {
        stopReason = event.delta.stop_reason ?? undefined;
        if (event.usage) {
          usage = {
            ...usage,
            outputTokens: event.usage.output_tokens,
            totalTokens: usage.inputTokens + event.usage.output_tokens,
          };
          onUpdate({ type: "usage", usage, rawStopReason: stopReason });
        }
      },
    );

    // Wait for stream to complete
    const finalMessage: AnthropicMessage = await stream.finalMessage();
    const providerResponse = mapAnthropicResponse(finalMessage);

    onUpdate({
      type: "final",
      content: extractText(providerResponse),
      usage: providerResponse.usage,
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
      boundTools = toolsToAnthropicFormat(tools);
      return adapter;
    },
  };

  return adapter;
}
