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
        // Implemented in US-002/003/004
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
