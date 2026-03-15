import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ModelAdapter, ModelInvocationUpdate } from "./types.js";
import { formatToolDefinitions } from "./claude-agent-sdk.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RuskaApiProviderOptions {
  /** Base URL of the Ruska API (e.g. "http://localhost:8000"). */
  baseUrl: string;
  /** API key sent as `x-api-key` header. */
  apiKey?: string;
  /** Bearer token sent as `Authorization` header. */
  bearerToken?: string;
  /** Model identifier (e.g. "openai:gpt-4.1-nano"). */
  model: string;
  /** LangGraph graph ID. Default: "react". */
  graphId?: "react" | "deepagent";
  /** Resume an existing thread. */
  threadId?: string;
  /** Load a pre-configured assistant. */
  assistantId?: string;
  /** Request timeout in ms. Default: 120 000. */
  timeout?: number;
  /** System prompt prepended to messages. */
  systemPrompt?: string;
  /** Inject tool JSON schemas into system prompt. Default: true. */
  injectToolSchemas?: boolean;
}

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

interface RuskaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    name: string;
    args: Record<string, unknown>;
    id: string;
    type: "tool_call";
  }>;
  tool_call_id?: string;
}

function extractContent(content: string | unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block: unknown) => {
        if (typeof block === "string") return block;
        if (
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          (block as { type: string }).type === "text" &&
          "text" in block
        ) {
          return (block as { text: string }).text;
        }
        return JSON.stringify(block);
      })
      .join("");
  }
  return JSON.stringify(content);
}

export function convertToRuskaMessages(messages: BaseMessage[]): {
  systemPrompt: string | undefined;
  messages: RuskaMessage[];
} {
  const systemParts: string[] = [];
  const ruskaMessages: RuskaMessage[] = [];

  for (const msg of messages) {
    const type = msg._getType();

    switch (type) {
      case "system":
        systemParts.push(extractContent(msg.content));
        break;

      case "human":
        ruskaMessages.push({ role: "user", content: extractContent(msg.content) });
        break;

      case "ai": {
        const aiMsg = msg as AIMessage;
        const text = extractContent(aiMsg.content);
        const toolCalls = aiMsg.tool_calls ?? [];
        const ruskaMsg: RuskaMessage = { role: "assistant", content: text };
        if (toolCalls.length > 0) {
          ruskaMsg.tool_calls = toolCalls.map((tc) => ({
            name: tc.name,
            args: tc.args as Record<string, unknown>,
            id: tc.id ?? "",
            type: "tool_call" as const,
          }));
        }
        ruskaMessages.push(ruskaMsg);
        break;
      }

      case "tool": {
        const toolCallId = (msg as unknown as { tool_call_id?: string }).tool_call_id ?? "unknown";
        ruskaMessages.push({
          role: "tool",
          content: extractContent(msg.content),
          tool_call_id: toolCallId,
        });
        break;
      }

      default:
        ruskaMessages.push({ role: "user", content: extractContent(msg.content) });
        break;
    }
  }

  return {
    systemPrompt: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: ruskaMessages,
  };
}

// ---------------------------------------------------------------------------
// SSE stream parser
// ---------------------------------------------------------------------------

export async function* parseSSEStream(response: Response): AsyncGenerator<[string, unknown]> {
  const body = response.body;
  if (!body) throw new Error("Ruska API: SSE response has no body");

  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("id:")) continue;

        if (trimmed.startsWith("data:")) {
          const dataStr = trimmed.slice(5).trim();
          if (!dataStr) continue;

          // Handle [DONE] sentinel
          if (dataStr === "[DONE]") {
            yield ["DONE", null];
            continue;
          }

          try {
            const parsed = JSON.parse(dataStr) as unknown;
            if (Array.isArray(parsed) && parsed.length >= 1) {
              const eventType = parsed[0] as string;
              const payload = parsed.length > 1 ? parsed[1] : null;
              yield [eventType, payload];
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data:")) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") {
          yield ["DONE", null];
        } else if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr) as unknown;
            if (Array.isArray(parsed) && parsed.length >= 1) {
              yield [parsed[0] as string, parsed.length > 1 ? parsed[1] : null];
            }
          } catch {
            // Skip malformed
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Final message extraction
// ---------------------------------------------------------------------------

interface RuskaValuesPayload {
  messages?: Array<{
    type?: string;
    content?: string;
    tool_calls?: Array<{
      name: string;
      args: Record<string, unknown>;
      id: string;
      type: string;
    }>;
    usage_metadata?: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      input_token_details?: Record<string, number>;
      output_token_details?: Record<string, number>;
    };
    response_metadata?: {
      finish_reason?: string;
      model_name?: string;
      model_provider?: string;
    };
  }>;
  todos?: unknown[];
  files?: Record<string, unknown>;
}

export function extractFinalAIMessage(valuesPayload: RuskaValuesPayload): AIMessage | undefined {
  const messages = valuesPayload.messages;
  if (!messages || messages.length === 0) return undefined;

  // Find the last AI message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === "ai" || msg.type === "AIMessageChunk") {
      const aiMessage = new AIMessage({
        content: msg.content ?? "",
        tool_calls: (msg.tool_calls ?? []).map((tc) => ({
          name: tc.name,
          args: tc.args,
          id: tc.id,
          type: "tool_call" as const,
        })),
      });

      if (msg.usage_metadata) {
        (aiMessage as AIMessage & { usage_metadata?: unknown }).usage_metadata = {
          input_tokens: msg.usage_metadata.input_tokens,
          output_tokens: msg.usage_metadata.output_tokens,
          total_tokens: msg.usage_metadata.total_tokens,
        };
      }

      return aiMessage;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function createRuskaApiProvider(opts: RuskaApiProviderOptions): ModelAdapter {
  const options = { ...opts };
  const graphId = options.graphId ?? "react";
  const timeout = options.timeout ?? 120_000;
  const injectToolSchemas = options.injectToolSchemas ?? true;

  // Mutable thread state persisted across calls
  let currentThreadId = options.threadId;

  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (options.bearerToken) {
      headers["Authorization"] = `Bearer ${options.bearerToken}`;
    }
    if (options.apiKey) {
      headers["x-api-key"] = options.apiKey;
    }
    return headers;
  }

  function buildAdapter(boundTools: StructuredToolInterface[] = []): ModelAdapter {
    return {
      async invoke(messages: BaseMessage[]): Promise<AIMessage> {
        return this.invokeWithUpdates!(messages, () => {});
      },

      async invokeWithUpdates(
        messages: BaseMessage[],
        onUpdate: (update: ModelInvocationUpdate) => void,
      ): Promise<AIMessage> {
        const converted = convertToRuskaMessages(messages);

        // Build system prompt
        const systemParts: string[] = [];
        if (options.systemPrompt) systemParts.push(options.systemPrompt);
        if (converted.systemPrompt) systemParts.push(converted.systemPrompt);
        if (injectToolSchemas && boundTools.length > 0) {
          systemParts.push(formatToolDefinitions(boundTools));
        }

        // Build request body
        const requestMessages = converted.messages;
        if (systemParts.length > 0) {
          requestMessages.unshift({ role: "system", content: systemParts.join("\n\n") });
        }

        const body: Record<string, unknown> = {
          model: options.model,
          input: { messages: requestMessages },
          metadata: { graph_id: graphId },
          stream_mode: ["values", "updates"],
        };

        if (boundTools.length > 0) {
          body.tools = boundTools.map((t) => t.name);
        }
        if (currentThreadId) {
          body.thread_id = currentThreadId;
        }
        if (options.assistantId) {
          body.assistant_id = options.assistantId;
        }

        const headers = buildHeaders();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        if (typeof timer === "object" && "unref" in timer) (timer as NodeJS.Timeout).unref();

        try {
          // Phase 1: POST /api/llm/stream → get thread_id + run_id
          const postResponse = await fetch(`${options.baseUrl}/api/llm/stream`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          if (!postResponse.ok) {
            const errorBody = await postResponse.text().catch(() => "");
            throw new Error(
              `Ruska API POST /api/llm/stream failed (${postResponse.status}): ${errorBody}`,
            );
          }

          const postData = (await postResponse.json()) as {
            thread_id: string;
            run_id: string;
            distributed?: boolean;
          };

          const threadId = postData.thread_id;
          const runId = postData.run_id;
          currentThreadId = threadId;

          // Phase 2: GET /api/threads/{thread_id}/stream?run_id={run_id} → SSE
          // When distributed=true, the stream may not be ready immediately.
          const maxRetries = 8;
          const baseDelayMs = 2000;
          const maxDelayMs = 10_000;
          let sseResponse: Response | undefined;

          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0 && postData.distributed) {
              const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
              await new Promise((r) => setTimeout(r, delay));
            }

            sseResponse = await fetch(
              `${options.baseUrl}/api/threads/${threadId}/stream?run_id=${runId}`,
              {
                method: "GET",
                headers: { ...headers, Accept: "text/event-stream" },
                signal: controller.signal,
              },
            );

            if (sseResponse.ok || !postData.distributed || sseResponse.status !== 404) {
              break;
            }
          }

          if (!sseResponse!.ok) {
            const errorBody = await sseResponse!.text().catch(() => "");
            throw new Error(
              `Ruska API GET /api/threads/${threadId}/stream failed (${sseResponse!.status}): ${errorBody}`,
            );
          }

          // Parse SSE stream
          let lastValuesPayload: RuskaValuesPayload | undefined;
          let accumulatedContent = "";

          for await (const [eventType, payload] of parseSSEStream(sseResponse!)) {
            switch (eventType) {
              case "initializing":
                // Store run_id if needed (already have it from POST)
                break;

              case "metadata": {
                const meta = payload as { thread_id?: string; assistant_id?: string } | null;
                if (meta?.thread_id) currentThreadId = meta.thread_id;
                break;
              }

              case "values":
                lastValuesPayload = payload as RuskaValuesPayload;
                break;

              case "messages": {
                // payload is [AIMessageChunk, langgraph_metadata]
                if (!Array.isArray(payload)) break;
                const chunk = payload[0] as
                  | {
                      content?: string;
                      tool_calls?: Array<{
                        name: string;
                        args: Record<string, unknown>;
                        id: string;
                      }>;
                    }
                  | undefined;

                if (!chunk) break;

                if (chunk.content) {
                  accumulatedContent += chunk.content;
                  onUpdate({ type: "assistant_message", content: chunk.content });
                }

                if (chunk.tool_calls && chunk.tool_calls.length > 0) {
                  for (const tc of chunk.tool_calls) {
                    if (tc.name) {
                      onUpdate({
                        type: "tool_call",
                        toolCall: {
                          name: tc.name,
                          id: tc.id ?? "",
                          args: tc.args ?? {},
                        },
                      });
                    }
                  }
                }
                break;
              }

              case "updates": {
                // LangGraph updates: { nodeName: { messages: [...] } }
                if (typeof payload !== "object" || payload === null) break;
                for (const nodeOutput of Object.values(payload as Record<string, unknown>)) {
                  if (typeof nodeOutput !== "object" || nodeOutput === null) continue;
                  const nodeMessages = (nodeOutput as Record<string, unknown>).messages as
                    | Array<{
                        type?: string;
                        content?: string;
                        tool_calls?: Array<{
                          name: string;
                          args: Record<string, unknown>;
                          id: string;
                        }>;
                        usage_metadata?: {
                          input_tokens: number;
                          output_tokens: number;
                          total_tokens: number;
                        };
                      }>
                    | undefined;
                  if (!Array.isArray(nodeMessages)) continue;
                  for (const msg of nodeMessages) {
                    if (msg.type !== "ai" && msg.type !== "AIMessageChunk") continue;
                    if (msg.content) {
                      accumulatedContent += msg.content;
                      onUpdate({
                        type: "assistant_message",
                        content: msg.content,
                      });
                    }
                    if (msg.tool_calls && msg.tool_calls.length > 0) {
                      for (const tc of msg.tool_calls) {
                        if (tc.name) {
                          onUpdate({
                            type: "tool_call",
                            toolCall: {
                              name: tc.name,
                              id: tc.id ?? "",
                              args: tc.args ?? {},
                            },
                          });
                        }
                      }
                    }
                    if (msg.usage_metadata) {
                      onUpdate({
                        type: "usage",
                        usage: {
                          inputTokens: msg.usage_metadata.input_tokens,
                          outputTokens: msg.usage_metadata.output_tokens,
                          totalTokens: msg.usage_metadata.total_tokens,
                        },
                      });
                    }
                  }
                }
                break;
              }

              case "error": {
                const errorMsg =
                  typeof payload === "string"
                    ? payload
                    : typeof payload === "object" && payload !== null && "message" in payload
                      ? (payload as { message: string }).message
                      : "Unknown Ruska API error";
                onUpdate({ type: "error", error: errorMsg });
                throw new Error(`Ruska API stream error: ${errorMsg}`);
              }

              case "DONE": {
                // Extract final message from last values event
                const finalMessage = lastValuesPayload
                  ? extractFinalAIMessage(lastValuesPayload)
                  : undefined;

                const resultMessage =
                  finalMessage ?? new AIMessage({ content: accumulatedContent });

                // Extract usage for update
                const usageMeta = (
                  resultMessage as AIMessage & {
                    usage_metadata?: {
                      input_tokens: number;
                      output_tokens: number;
                      total_tokens: number;
                    };
                  }
                ).usage_metadata;

                if (usageMeta) {
                  onUpdate({
                    type: "usage",
                    usage: {
                      inputTokens: usageMeta.input_tokens,
                      outputTokens: usageMeta.output_tokens,
                      totalTokens: usageMeta.total_tokens,
                    },
                  });
                }

                onUpdate({
                  type: "final",
                  content: typeof resultMessage.content === "string" ? resultMessage.content : "",
                  usage: usageMeta
                    ? {
                        inputTokens: usageMeta.input_tokens,
                        outputTokens: usageMeta.output_tokens,
                        totalTokens: usageMeta.total_tokens,
                      }
                    : undefined,
                });

                return resultMessage;
              }
            }
          }

          // Stream ended without [DONE] — use last values payload or accumulated content
          if (lastValuesPayload) {
            const finalMessage = extractFinalAIMessage(lastValuesPayload);
            if (finalMessage) {
              onUpdate({
                type: "final",
                content: typeof finalMessage.content === "string" ? finalMessage.content : "",
              });
              return finalMessage;
            }
          }

          if (accumulatedContent) {
            const fallback = new AIMessage({ content: accumulatedContent });
            onUpdate({ type: "final", content: accumulatedContent });
            return fallback;
          }

          throw new Error("Ruska API: SSE stream ended with no response");
        } finally {
          clearTimeout(timer);
        }
      },

      bindTools(tools: StructuredToolInterface[]): ModelAdapter {
        return buildAdapter(tools);
      },
    };
  }

  return buildAdapter();
}
