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
