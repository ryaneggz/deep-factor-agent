import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { toJSONSchema } from "zod";
import type { ModelAdapter } from "./types.js";

export interface ClaudeAgentSdkProviderOptions {
  /** Claude model ID (e.g. "claude-opus-4-6"). */
  model?: string;
  /** Permission mode for the SDK session. Default: "bypassPermissions" */
  permissionMode?: "default" | "plan" | "acceptEdits" | "dontAsk" | "bypassPermissions";
  /** Working directory for file operations. */
  cwd?: string;
  /** Maximum agent turns before stopping. Default: 1 (single-turn). */
  maxTurns?: number;
  /** Thinking/reasoning configuration. */
  thinking?: { type: "adaptive" } | { type: "enabled"; budgetTokens: number };
  /** Effort level for output quality. */
  effort?: "low" | "medium" | "high" | "max";
  /** MCP server definitions. */
  mcpServers?: Record<string, { command: string; args?: string[] } | unknown>;
  /** Built-in tools the agent can use (e.g. ["Read", "Edit", "Bash"]). */
  allowedTools?: string[];
  /** Tools to explicitly disallow. */
  disallowedTools?: string[];
  /** Custom system prompt for the session. */
  systemPrompt?: string;
  /** Whether to persist/resume the SDK session. */
  persistSession?: boolean;
  /** Timeout in milliseconds for the query. Default: 120000 (2 min). */
  timeout?: number;
}

export interface ConvertedMessages {
  /** Combined SystemMessage content to pass as SDK systemPrompt option. */
  systemPrompt: string | undefined;
  /** Serialized conversation prompt string for SDK query(). */
  prompt: string;
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

export function extractSystemPrompt(messages: BaseMessage[]): string | undefined {
  const systemParts: string[] = [];
  for (const msg of messages) {
    if (msg._getType() === "system") {
      systemParts.push(extractContent(msg.content));
    }
  }
  return systemParts.length > 0 ? systemParts.join("\n\n") : undefined;
}

export function convertMessagesToPrompt(messages: BaseMessage[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    const type = msg._getType();

    switch (type) {
      case "system":
        break;

      case "human":
        parts.push(`[User]: ${extractContent(msg.content)}`);
        break;

      case "ai": {
        const aiMsg = msg as AIMessage;
        const text = extractContent(aiMsg.content);
        const toolCalls = aiMsg.tool_calls ?? [];

        if (toolCalls.length > 0) {
          const toolCallLines = toolCalls.map(
            (tc) => `  - ${tc.name}(${JSON.stringify(tc.args)}) [id: ${tc.id}]`,
          );
          const toolSection = `[Tool Calls]:\n${toolCallLines.join("\n")}`;
          if (text) {
            parts.push(`[Assistant]: ${text}\n${toolSection}`);
          } else {
            parts.push(`[Assistant]:\n${toolSection}`);
          }
        } else if (text) {
          parts.push(`[Assistant]: ${text}`);
        }
        break;
      }

      case "tool": {
        const toolCallId = (msg as unknown as { tool_call_id?: string }).tool_call_id ?? "unknown";
        parts.push(`[Tool Result (${toolCallId})]: ${extractContent(msg.content)}`);
        break;
      }

      default:
        parts.push(`[${type}]: ${extractContent(msg.content)}`);
        break;
    }
  }

  return parts.join("\n\n");
}

export function convertMessages(messages: BaseMessage[]): ConvertedMessages {
  return {
    systemPrompt: extractSystemPrompt(messages),
    prompt: convertMessagesToPrompt(messages),
  };
}

export interface SdkTextBlock {
  type: "text";
  text: string;
}

export interface SdkToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export type SdkContentBlock =
  | SdkTextBlock
  | SdkToolUseBlock
  | { type: string; [key: string]: unknown };

export interface SdkUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface SdkResponseMessage {
  role: "assistant";
  content: SdkContentBlock[];
  usage?: SdkUsage;
  stop_reason?: string | null;
}

export type SdkErrorType = "rate_limit" | "auth_failed" | "overloaded" | "api_error";

export interface SdkErrorResult {
  type: "error";
  error_type: SdkErrorType | string;
  message?: string;
}

export function parseResponseText(content: SdkContentBlock[]): string {
  return content
    .filter((block): block is SdkTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export function parseToolUseBlocks(
  content: SdkContentBlock[],
): Array<{ name: string; args: Record<string, unknown>; id: string; type: "tool_call" }> {
  return content
    .filter((block): block is SdkToolUseBlock => block.type === "tool_use")
    .map((block) => ({
      name: block.name,
      args: (typeof block.input === "object" && block.input !== null ? block.input : {}) as Record<
        string,
        unknown
      >,
      id: block.id,
      type: "tool_call" as const,
    }));
}

export function parseUsageMetadata(
  usage: SdkUsage | undefined,
): { input_tokens: number; output_tokens: number; total_tokens: number } | undefined {
  if (!usage) return undefined;
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens: usage.input_tokens + usage.output_tokens,
  };
}

export function throwOnSdkError(result: unknown): void {
  if (
    typeof result === "object" &&
    result !== null &&
    "type" in result &&
    (result as { type: string }).type === "error"
  ) {
    const err = result as SdkErrorResult;
    const errorType = err.error_type ?? "unknown";
    const message = err.message ?? "Unknown SDK error";

    switch (errorType) {
      case "rate_limit":
        throw new Error(`Claude Agent SDK rate limited: ${message}`);
      case "auth_failed":
        throw new Error(`Claude Agent SDK authentication failed: ${message}`);
      case "overloaded":
        throw new Error(`Claude Agent SDK overloaded: ${message}`);
      default:
        throw new Error(`Claude Agent SDK error (${errorType}): ${message}`);
    }
  }
}

export function parseSdkResponse(response: SdkResponseMessage): AIMessage {
  const text = parseResponseText(response.content);
  const toolCalls = parseToolUseBlocks(response.content);
  const usageMeta = parseUsageMetadata(response.usage);

  const message = new AIMessage({
    content: text,
    tool_calls: toolCalls,
  });

  if (usageMeta) {
    (message as AIMessage & { usage_metadata?: unknown }).usage_metadata = usageMeta;
  }

  return message;
}

function isAssistantMessage(message: unknown): message is SdkResponseMessage {
  if (typeof message !== "object" || message === null) return false;

  if (
    "role" in message &&
    (message as { role: unknown }).role === "assistant" &&
    "content" in message &&
    Array.isArray((message as { content: unknown }).content)
  ) {
    return true;
  }

  if (
    "type" in message &&
    (message as { type: unknown }).type === "assistant" &&
    "message" in message
  ) {
    return isAssistantMessage((message as { message: unknown }).message);
  }

  return false;
}

function extractAssistantMessage(message: unknown): SdkResponseMessage {
  if (typeof message === "object" && message !== null && "message" in message) {
    const inner = (message as { message: unknown }).message;
    if (
      typeof inner === "object" &&
      inner !== null &&
      "role" in inner &&
      (inner as { role: unknown }).role === "assistant" &&
      "content" in inner
    ) {
      return inner as SdkResponseMessage;
    }
  }
  return message as SdkResponseMessage;
}

function extractToolSchema(tool: StructuredToolInterface): Record<string, unknown> {
  if ("schema" in tool && tool.schema) {
    const schema = tool.schema as object;
    if ("_zod" in schema) {
      return toJSONSchema(schema as import("zod").ZodType) as Record<string, unknown>;
    }
    return schema as Record<string, unknown>;
  }
  return {};
}

export function formatToolDefinitions(tools: StructuredToolInterface[]): string {
  const toolDefs = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: extractToolSchema(tool),
  }));
  return (
    `[Available Tools]\n${JSON.stringify(toolDefs, null, 2)}\n\n` +
    "When you need to call a tool, respond with a tool_use block for the matching tool name."
  );
}

export function createClaudeAgentSdkProvider(opts?: ClaudeAgentSdkProviderOptions): ModelAdapter {
  const options = { ...opts };

  function buildAdapter(boundTools: StructuredToolInterface[] = []): ModelAdapter {
    return {
      async invoke(messages: BaseMessage[]): Promise<AIMessage> {
        const sdkModuleId = "@anthropic-ai/claude-agent-sdk";
        let query: (args: {
          prompt: string;
          options?: Record<string, unknown>;
        }) => AsyncIterable<unknown>;

        try {
          const sdk = (await import(/* webpackIgnore: true */ sdkModuleId)) as {
            query: typeof query;
          };
          query = sdk.query;
        } catch {
          throw new Error(
            "Claude Agent SDK (@anthropic-ai/claude-agent-sdk) is not installed. " +
              "Install it with: pnpm add @anthropic-ai/claude-agent-sdk",
          );
        }

        const converted = convertMessages(messages);

        const sdkOptions: Record<string, unknown> = {
          maxTurns: options.maxTurns ?? 1,
          permissionMode: options.permissionMode ?? "bypassPermissions",
        };

        const systemParts: string[] = [];
        if (options.systemPrompt) systemParts.push(options.systemPrompt);
        if (converted.systemPrompt) systemParts.push(converted.systemPrompt);
        if (boundTools.length > 0) systemParts.push(formatToolDefinitions(boundTools));
        if (systemParts.length > 0) {
          sdkOptions.systemPrompt = systemParts.join("\n\n");
        }

        if (sdkOptions.permissionMode === "bypassPermissions") {
          sdkOptions.allowDangerouslySkipPermissions = true;
        }
        if (options.model) sdkOptions.model = options.model;
        if (options.cwd) sdkOptions.cwd = options.cwd;
        if (options.thinking) sdkOptions.thinking = options.thinking;
        if (options.effort) sdkOptions.effort = options.effort;
        if (options.mcpServers) sdkOptions.mcpServers = options.mcpServers;

        const allowedToolNames = [
          ...(options.allowedTools ?? []),
          ...boundTools.map((t) => t.name),
        ];
        if (allowedToolNames.length > 0) {
          sdkOptions.allowedTools = allowedToolNames;
        }

        if (options.disallowedTools) sdkOptions.disallowedTools = options.disallowedTools;
        if (options.persistSession !== undefined) {
          sdkOptions.persistSession = options.persistSession;
        }

        let lastAssistantMessage: SdkResponseMessage | undefined;
        let resultText: string | undefined;
        let resultUsage: SdkUsage | undefined;

        const runQuery = async () => {
          for await (const message of query({ prompt: converted.prompt, options: sdkOptions })) {
            throwOnSdkError(message);

            if (isAssistantMessage(message)) {
              lastAssistantMessage = extractAssistantMessage(message);
            }

            if (
              typeof message === "object" &&
              message !== null &&
              "type" in message &&
              (message as { type: string }).type === "result"
            ) {
              const resultMessage = message as { result?: string; usage?: SdkUsage };
              if (typeof resultMessage.result === "string") {
                resultText = resultMessage.result;
              }
              if (resultMessage.usage) {
                resultUsage = resultMessage.usage;
              }
            }
          }
        };

        const timeoutMs = options.timeout ?? 120_000;
        const timeoutPromise = new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`Claude Agent SDK query timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
          if (typeof timer === "object" && "unref" in timer) timer.unref();
        });

        await Promise.race([runQuery(), timeoutPromise]);

        if (lastAssistantMessage) {
          if (resultUsage) {
            lastAssistantMessage = { ...lastAssistantMessage, usage: resultUsage };
          }
          return parseSdkResponse(lastAssistantMessage);
        }

        if (resultText !== undefined) {
          const message = new AIMessage({ content: resultText });
          if (resultUsage) {
            const usageMeta = parseUsageMetadata(resultUsage);
            if (usageMeta) {
              (message as AIMessage & { usage_metadata?: unknown }).usage_metadata = usageMeta;
            }
          }
          return message;
        }

        throw new Error("Claude Agent SDK query returned no assistant message");
      },

      bindTools(tools: StructuredToolInterface[]): ModelAdapter {
        return buildAdapter(tools);
      },
    };
  }

  return buildAdapter();
}
