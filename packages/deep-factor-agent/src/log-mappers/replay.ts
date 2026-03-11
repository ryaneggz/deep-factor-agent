import type { UnifiedLogEntry } from "../unified-log.js";
import type { AgentThread, AgentEvent, ToolDisplayMetadata } from "../types.js";

/**
 * Parse JSONL text into an array of UnifiedLogEntry.
 */
export function replayLog(lines: string[]): UnifiedLogEntry[] {
  return lines.filter(Boolean).map((line) => JSON.parse(line) as UnifiedLogEntry);
}

/**
 * Reconstruct an AgentThread from unified log entries.
 */
export function logToThread(entries: UnifiedLogEntry[]): AgentThread {
  const events: AgentEvent[] = [];
  let threadId = "";

  for (const entry of entries) {
    if (entry.type === "init") {
      threadId = entry.sessionId;
      continue;
    }

    const event = logEntryToAgentEvent(entry);
    if (event) events.push(event);
  }

  const now = Date.now();
  return {
    id: threadId || `replay-${Date.now()}`,
    events,
    metadata: {},
    createdAt: entries[0]?.timestamp ?? now,
    updatedAt: entries[entries.length - 1]?.timestamp ?? now,
  };
}

/** Role types supported by logToChatMessages output. */
export type ReplayChatMessageRole =
  | "user"
  | "assistant"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "plan"
  | "summary"
  | "status"
  | "error"
  | "rate_limit"
  | "file_change"
  | "approval"
  | "human_input"
  | "completion";

export interface ReplayChatMessage {
  id: string;
  role: ReplayChatMessageRole;
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolCallId?: string;
  durationMs?: number;
  parallelGroup?: string;
  toolDisplay?: ToolDisplayMetadata;
  thinking?: string;
  planContent?: string;
  statusInfo?: { status: string; usage?: Record<string, unknown>; iterations?: number };
  rateLimitInfo?: { retryAfterMs?: number; message?: string };
}

/**
 * Convert unified log entries to ChatMessage-compatible objects for TUI display.
 * Handles all 16 unified log types (excluding init and result which are session-level).
 */
export function logToChatMessages(entries: UnifiedLogEntry[]): ReplayChatMessage[] {
  const messages: ReplayChatMessage[] = [];

  for (const entry of entries) {
    const id = `${entry.sessionId}-${entry.sequence}`;

    switch (entry.type) {
      case "message":
        if (entry.role === "user" || entry.role === "assistant") {
          messages.push({ id, role: entry.role, content: entry.content });
        }
        break;

      case "tool_call":
        messages.push({
          id,
          role: "tool_call",
          content: JSON.stringify(entry.args),
          toolName: entry.toolName,
          toolArgs: entry.args,
          toolCallId: entry.toolCallId,
          parallelGroup: entry.parallelGroup,
          toolDisplay: entry.display,
        });
        break;

      case "tool_result":
        messages.push({
          id,
          role: "tool_result",
          content: typeof entry.result === "string" ? entry.result : JSON.stringify(entry.result),
          toolCallId: entry.toolCallId,
          durationMs: entry.durationMs,
          parallelGroup: entry.parallelGroup,
          toolDisplay: entry.display,
        });
        break;

      case "thinking":
        messages.push({
          id,
          role: "thinking",
          content: entry.content,
          thinking: entry.content,
        });
        break;

      case "plan":
        messages.push({
          id,
          role: "plan",
          content: entry.content,
          planContent: entry.content,
        });
        break;

      case "summary":
        messages.push({
          id,
          role: "summary",
          content: entry.summary,
        });
        break;

      case "status":
        messages.push({
          id,
          role: "status",
          content: `Status: ${entry.status}`,
          statusInfo: {
            status: entry.status,
            usage: entry.usage as unknown as Record<string, unknown>,
            iterations: entry.iterations,
          },
        });
        break;

      case "error":
        messages.push({
          id,
          role: "error",
          content: entry.error,
          toolCallId: entry.toolCallId,
        });
        break;

      case "rate_limit":
        messages.push({
          id,
          role: "rate_limit",
          content: entry.message ?? "Rate limited",
          rateLimitInfo: {
            retryAfterMs: entry.retryAfterMs,
            message: entry.message,
          },
        });
        break;

      case "file_change":
        messages.push({
          id,
          role: "file_change",
          content: entry.changes.map((c) => `${c.change}: ${c.path}`).join("\n"),
          toolCallId: entry.toolCallId,
        });
        break;

      case "approval":
        messages.push({
          id,
          role: "approval",
          content: `${entry.decision}: ${entry.toolName}`,
          toolCallId: entry.toolCallId,
          toolName: entry.toolName,
        });
        break;

      case "human_input_requested":
        messages.push({
          id,
          role: "human_input",
          content: entry.question,
        });
        break;

      case "human_input_received":
        messages.push({
          id,
          role: "human_input",
          content: entry.response,
        });
        break;

      case "completion":
        messages.push({
          id,
          role: "completion",
          content: entry.result,
        });
        break;

      // init and result are session-level entries, not rendered as chat messages
      case "init":
      case "result":
        break;
    }
  }

  return messages;
}

function logEntryToAgentEvent(entry: UnifiedLogEntry): AgentEvent | null {
  switch (entry.type) {
    case "message":
      return {
        type: "message",
        role: entry.role,
        content: entry.content,
        timestamp: entry.timestamp,
        iteration: entry.iteration,
      };

    case "tool_call":
      return {
        type: "tool_call",
        toolCallId: entry.toolCallId,
        toolName: entry.toolName,
        args: entry.args,
        display: entry.display,
        parallelGroup: entry.parallelGroup,
        timestamp: entry.timestamp,
        iteration: entry.iteration,
      };

    case "tool_result":
      return {
        type: "tool_result",
        toolCallId: entry.toolCallId,
        result: entry.result,
        display: entry.display,
        durationMs: entry.durationMs,
        parallelGroup: entry.parallelGroup,
        timestamp: entry.timestamp,
        iteration: entry.iteration,
      };

    case "error":
      return entry.iteration != null
        ? {
            type: "error",
            error: entry.error,
            toolCallId: entry.toolCallId,
            recoverable: entry.recoverable,
            timestamp: entry.timestamp,
            iteration: entry.iteration,
          }
        : null;

    case "approval":
      return {
        type: "approval",
        toolCallId: entry.toolCallId,
        toolName: entry.toolName,
        decision: entry.decision,
        response: entry.response,
        timestamp: entry.timestamp,
        iteration: entry.iteration,
      };

    case "human_input_requested":
      return {
        type: "human_input_requested",
        kind: entry.kind,
        question: entry.question,
        format: entry.format,
        choices: entry.choices,
        timestamp: entry.timestamp,
        iteration: entry.iteration,
      };

    case "human_input_received":
      return {
        type: "human_input_received",
        response: entry.response,
        decision: entry.decision,
        timestamp: entry.timestamp,
        iteration: entry.iteration,
      };

    case "completion":
      return {
        type: "completion",
        result: entry.result,
        verified: entry.verified,
        timestamp: entry.timestamp,
        iteration: entry.iteration,
      };

    case "plan":
      return {
        type: "plan",
        content: entry.content,
        timestamp: entry.timestamp,
        iteration: entry.iteration,
      };

    case "summary":
      return {
        type: "summary",
        summarizedIterations: entry.summarizedIterations,
        summary: entry.summary,
        timestamp: entry.timestamp,
        iteration: entry.iteration,
      };

    default:
      return null;
  }
}
