import type { ChatMessage, TranscriptSegment, TranscriptTurn } from "./types.js";

const MAX_TOOL_ARG_PREVIEW = 48;
const MAX_TOOL_RESULT_LINE_LENGTH = 88;
const MAX_TOOL_RESULT_LINES = 2;

export interface ToolResultPreview {
  lines: string[];
  overflowLineCount: number;
}

function truncateInline(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, Math.max(0, maxLength - 3)) + "...";
}

function formatPreviewValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(truncateInline(value, MAX_TOOL_ARG_PREVIEW));
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const preview = value.slice(0, 2).map((item) => formatPreviewValue(item));
    return `[${preview.join(", ")}${value.length > 2 ? ", ..." : ""}]`;
  }
  if (typeof value === "object") {
    return "{...}";
  }
  return JSON.stringify(String(value));
}

export function formatToolArgsPreview(toolArgs?: Record<string, unknown>): string | null {
  if (!toolArgs || Object.keys(toolArgs).length === 0) {
    return null;
  }

  const entries = Object.entries(toolArgs);
  const preview = entries
    .slice(0, 2)
    .map(([key, value]) => `${key}=${formatPreviewValue(value)}`)
    .join(", ");
  return `${preview}${entries.length > 2 ? ", ..." : ""}`;
}

export function formatToolLabel(toolName: string, toolArgs?: Record<string, unknown>): string {
  if (toolName === "bash" && typeof toolArgs?.command === "string") {
    return `Bash(${truncateInline(toolArgs.command, MAX_TOOL_RESULT_LINE_LENGTH)})`;
  }

  const prefix = toolName === "bash" ? "Bash" : `Tool ${toolName}`;
  if (!toolArgs || Object.keys(toolArgs).length === 0) {
    return prefix;
  }

  const entries = Object.entries(toolArgs);
  const preview = formatToolArgsPreview(toolArgs);
  return `${prefix}(${preview ?? entries.length})`;
}

export function formatToolResultPreview(result: string): ToolResultPreview {
  const normalized = result.replace(/\r\n/g, "\n");
  const rawLines = normalized.split("\n").map((line) => line.trimEnd());
  const meaningfulLines = rawLines.filter((line) => line.trim().length > 0);
  const sourceLines = meaningfulLines.length > 0 ? meaningfulLines : rawLines.slice(0, 1);

  const lines = sourceLines
    .slice(0, MAX_TOOL_RESULT_LINES)
    .map((line) => truncateInline(line, MAX_TOOL_RESULT_LINE_LENGTH));

  return {
    lines,
    overflowLineCount: Math.max(0, sourceLines.length - lines.length),
  };
}

function createTurn(index: number, userMessage?: ChatMessage, isCarryover = false): TranscriptTurn {
  return {
    id: `turn-${index}`,
    userMessage,
    segments: [],
    ...(isCarryover ? { isCarryover: true } : {}),
  };
}

function ensureCurrentTurn(
  turns: TranscriptTurn[],
  currentTurn: TranscriptTurn | null,
): TranscriptTurn {
  if (currentTurn) {
    return currentTurn;
  }

  const carryoverTurn = createTurn(turns.length, undefined, true);
  turns.push(carryoverTurn);
  return carryoverTurn;
}

function findPendingToolSegment(
  segments: TranscriptSegment[],
  toolCallId?: string,
): Extract<TranscriptSegment, { kind: "tool" }> | undefined {
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    if (segment.kind !== "tool" || segment.result != null) {
      continue;
    }
    if (toolCallId && segment.toolCallId === toolCallId) {
      return segment;
    }
  }

  if (!toolCallId) {
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const segment = segments[i];
      if (segment.kind === "tool" && segment.result == null) {
        return segment;
      }
    }
  }

  return undefined;
}

export function groupMessagesIntoTurns(messages: ChatMessage[]): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  let currentTurn: TranscriptTurn | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      currentTurn = createTurn(turns.length, message);
      turns.push(currentTurn);
      continue;
    }

    currentTurn = ensureCurrentTurn(turns, currentTurn);

    if (message.role === "assistant") {
      currentTurn.segments.push({
        kind: "assistant",
        id: message.id,
        content: message.content,
      });
      continue;
    }

    if (message.role === "tool_call") {
      currentTurn.segments.push({
        kind: "tool",
        id: message.id,
        toolName: message.toolName ?? message.content,
        toolArgs: message.toolArgs,
        toolCallId: message.toolCallId,
      });
      continue;
    }

    const pendingTool = findPendingToolSegment(currentTurn.segments, message.toolCallId);
    if (pendingTool) {
      pendingTool.result = message.content;
      pendingTool.durationMs = message.durationMs;
      pendingTool.parallelGroup = message.parallelGroup;
      continue;
    }

    currentTurn.segments.push({
      kind: "tool",
      id: message.id,
      toolName: "Tool result",
      toolCallId: message.toolCallId,
      result: message.content,
      durationMs: message.durationMs,
      parallelGroup: message.parallelGroup,
    });
  }

  return turns;
}
