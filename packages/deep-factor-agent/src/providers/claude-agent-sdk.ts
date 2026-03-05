import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
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

// --- Message conversion (LangChain → SDK) ---

/** Result of converting LangChain messages for the SDK query() call. */
export interface ConvertedMessages {
  /** Combined SystemMessage content to pass as SDK systemPrompt option. */
  systemPrompt: string | undefined;
  /** Serialized conversation prompt string for SDK query(). */
  prompt: string;
}

/** Extract text content from a LangChain message content field. */
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

/**
 * Extract SystemMessage content from a LangChain message array.
 * Multiple SystemMessages are joined with double-newlines.
 */
export function extractSystemPrompt(messages: BaseMessage[]): string | undefined {
  const systemParts: string[] = [];
  for (const msg of messages) {
    if (msg._getType() === "system") {
      systemParts.push(extractContent(msg.content));
    }
  }
  return systemParts.length > 0 ? systemParts.join("\n\n") : undefined;
}

/**
 * Convert LangChain messages to a structured prompt string for the SDK.
 *
 * - SystemMessages are skipped (extracted separately via extractSystemPrompt)
 * - HumanMessage content maps to `[User]: ...`
 * - AIMessage text content maps to `[Assistant]: ...`
 * - AIMessage tool_calls are serialized as `[Tool Calls]: ...`
 * - ToolMessage results are serialized as `[Tool Result (<id>)]: ...`
 */
export function convertMessagesToPrompt(messages: BaseMessage[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    const type = msg._getType();

    switch (type) {
      case "system":
        // Skipped — extracted via extractSystemPrompt()
        break;

      case "human":
        parts.push(`[User]: ${extractContent(msg.content)}`);
        break;

      case "ai": {
        const aiMsg = msg as AIMessage;
        const text = extractContent(aiMsg.content);
        const toolCalls = aiMsg.tool_calls ?? [];

        if (toolCalls.length > 0) {
          const tcLines = toolCalls.map(
            (tc) => `  - ${tc.name}(${JSON.stringify(tc.args)}) [id: ${tc.id}]`,
          );
          const toolSection = `[Tool Calls]:\n${tcLines.join("\n")}`;
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

/**
 * Convert a full LangChain message array into the shape needed by SDK query().
 * Combines extractSystemPrompt() and convertMessagesToPrompt().
 */
export function convertMessages(messages: BaseMessage[]): ConvertedMessages {
  return {
    systemPrompt: extractSystemPrompt(messages),
    prompt: convertMessagesToPrompt(messages),
  };
}

// --- SDK response types (local definitions to avoid hard dependency) ---

/** A text content block from the SDK BetaMessage. */
export interface SdkTextBlock {
  type: "text";
  text: string;
}

/** A tool_use content block from the SDK BetaMessage. */
export interface SdkToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

/** Union of content block types we handle from BetaMessage. */
export type SdkContentBlock =
  | SdkTextBlock
  | SdkToolUseBlock
  | { type: string; [key: string]: unknown };

/** Token usage data from the SDK response. */
export interface SdkUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Subset of BetaMessage fields needed for response parsing. */
export interface SdkResponseMessage {
  role: "assistant";
  content: SdkContentBlock[];
  usage?: SdkUsage;
  stop_reason?: string | null;
}

/** Known SDK error result types. */
export type SdkErrorType = "rate_limit" | "auth_failed" | "overloaded" | "api_error";

/** SDK error result shape. */
export interface SdkErrorResult {
  type: "error";
  error_type: SdkErrorType | string;
  message?: string;
}

// --- Response parsing (SDK → LangChain) ---

/**
 * Extract text content from SDK content blocks.
 * Joins all text blocks with empty string (they are contiguous parts).
 */
export function parseResponseText(content: SdkContentBlock[]): string {
  return content
    .filter((block): block is SdkTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Extract tool_use blocks from SDK content and map to LangChain tool_calls format.
 */
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

/**
 * Map SDK usage data to LangChain usage_metadata format.
 */
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

/**
 * Check if an SDK result is an error and throw a descriptive error.
 */
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

/**
 * Parse an SDK BetaMessage-shaped response into a LangChain AIMessage.
 *
 * - Text content blocks → AIMessage.content (joined string)
 * - tool_use content blocks → AIMessage.tool_calls array
 * - usage data → AIMessage.usage_metadata
 */
export function parseSdkResponse(response: SdkResponseMessage): AIMessage {
  const text = parseResponseText(response.content);
  const toolCalls = parseToolUseBlocks(response.content);
  const usageMeta = parseUsageMetadata(response.usage);

  const msg = new AIMessage({
    content: text,
    tool_calls: toolCalls,
  });

  if (usageMeta) {
    // LangChain AIMessage supports usage_metadata as a dynamic property
    (msg as AIMessage & { usage_metadata?: unknown }).usage_metadata = usageMeta;
  }

  return msg;
}

// --- Provider factory ---

/**
 * Create a Claude Agent SDK model adapter.
 *
 * Uses `@anthropic-ai/claude-agent-sdk` query() to run prompts through
 * the Claude agent with built-in tools, MCP support, and permissions.
 * The SDK is dynamically imported so it remains an optional dependency.
 */
export function createClaudeAgentSdkProvider(opts?: ClaudeAgentSdkProviderOptions): ModelAdapter {
  const options = { ...opts };
  let boundTools: StructuredToolInterface[] = [];

  function buildAdapter(): ModelAdapter {
    return {
      async invoke(messages: BaseMessage[]): Promise<AIMessage> {
        // Implemented in US-003/004
        void messages;
        void options;
        void boundTools;
        throw new Error("claude-agent-sdk provider invoke() not yet implemented");
      },

      bindTools(tools: StructuredToolInterface[]): ModelAdapter {
        boundTools = tools;
        return buildAdapter();
      },
    };
  }

  return buildAdapter();
}
