import type { ToolDisplayMetadata, ToolFileChangeSummary } from "deep-factor-agent";
import type {
  ChatMessage,
  ToolTranscriptSegment,
  TranscriptRenderBlock,
  TranscriptSegment,
  TranscriptTurn,
} from "./types.js";

const MAX_TOOL_ARG_PREVIEW = 48;
const MAX_TOOL_RESULT_LINE_LENGTH = 88;
const MAX_TOOL_RESULT_LINES = 2;

export interface ToolResultPreview {
  lines: string[];
  overflowLineCount: number;
  fileChanges?: ToolFileChangeSummary[];
  fileOverflowCount?: number;
  diffPreviewLines?: string[];
  diffOverflowLineCount?: number;
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

export function formatToolLabel(
  toolName: string,
  toolArgs?: Record<string, unknown>,
  toolDisplay?: ToolDisplayMetadata,
): string {
  if (toolDisplay?.label) {
    return toolDisplay.label;
  }

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

export function formatToolChangeSummary(change: ToolFileChangeSummary): string {
  const prefix =
    change.change === "created" ? "created" : change.change === "deleted" ? "deleted" : "edited";
  const counts =
    change.additions != null || change.deletions != null
      ? ` (+${change.additions ?? 0} -${change.deletions ?? 0})`
      : "";
  return `${prefix} ${change.path}${counts}`;
}

export function formatFileChangeTotals(toolDisplay?: ToolDisplayMetadata): string | null {
  if (!toolDisplay?.fileChanges || toolDisplay.fileChanges.length === 0) {
    return null;
  }

  const totals = toolDisplay.fileChanges.reduce(
    (acc, change) => {
      acc.additions += change.additions ?? 0;
      acc.deletions += change.deletions ?? 0;
      acc.hasCounts = acc.hasCounts || change.additions != null || change.deletions != null;
      return acc;
    },
    { additions: 0, deletions: 0, hasCounts: false },
  );

  if (!totals.hasCounts) {
    return null;
  }

  return `Added ${totals.additions} lines, removed ${totals.deletions} lines`;
}

export function formatToolResultPreview(
  result: string,
  toolDisplay?: ToolDisplayMetadata,
): ToolResultPreview {
  if (toolDisplay?.fileChanges && toolDisplay.fileChanges.length > 0) {
    return {
      lines: [],
      overflowLineCount: 0,
      fileChanges: toolDisplay.fileChanges,
      fileOverflowCount: toolDisplay.overflowLineCount ?? 0,
      diffPreviewLines: toolDisplay.diffPreviewLines,
      diffOverflowLineCount: toolDisplay.diffOverflowLineCount,
    };
  }

  if (toolDisplay?.previewLines && toolDisplay.previewLines.length > 0) {
    return {
      lines: toolDisplay.previewLines,
      overflowLineCount: toolDisplay.overflowLineCount ?? 0,
    };
  }

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

function isGroupedFileReadSegment(segment: TranscriptSegment): segment is ToolTranscriptSegment {
  return (
    segment.kind === "tool" &&
    segment.toolDisplay?.kind === "file_read" &&
    Array.isArray(segment.toolDisplay.fileReads) &&
    segment.toolDisplay.fileReads.length > 0
  );
}

export function buildTranscriptRenderBlocks(
  segments: TranscriptSegment[],
): TranscriptRenderBlock[] {
  const blocks: TranscriptRenderBlock[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment.kind === "assistant") {
      blocks.push({
        kind: "assistant_block",
        id: segment.id,
        segment,
      });
      continue;
    }

    if (segment.kind === "thinking") {
      blocks.push({
        kind: "thinking_block",
        id: segment.id,
        segment,
      });
      continue;
    }

    if (!isGroupedFileReadSegment(segment)) {
      const toolSegment = segment as ToolTranscriptSegment;
      blocks.push({
        kind: "tool_block",
        id: toolSegment.id,
        segment: toolSegment,
      });
      continue;
    }

    const groupedSegments: ToolTranscriptSegment[] = [segment];
    const fileReads = [...(segment.toolDisplay?.fileReads ?? [])];

    while (index + 1 < segments.length && isGroupedFileReadSegment(segments[index + 1]!)) {
      index += 1;
      const next = segments[index] as ToolTranscriptSegment;
      groupedSegments.push(next);
      fileReads.push(...(next.toolDisplay?.fileReads ?? []));
    }

    const readCount = fileReads.length;
    const expandable = fileReads.some((read) => (read.detailLines?.length ?? 0) > 0);
    blocks.push({
      kind: "file_read_group_block",
      id: groupedSegments.map((item) => item.id).join("__"),
      segments: groupedSegments,
      fileReads,
      header: expandable
        ? `Read ${readCount} file${readCount === 1 ? "" : "s"} (ctrl+o to expand)`
        : `Read ${readCount} file${readCount === 1 ? "" : "s"}`,
      expandable,
    });
  }

  return blocks;
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

    if (message.role === "thinking") {
      currentTurn.segments.push({
        kind: "thinking",
        id: message.id,
        content: message.thinking ?? message.content,
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
        toolDisplay: message.toolDisplay,
      });
      continue;
    }

    const pendingTool = findPendingToolSegment(currentTurn.segments, message.toolCallId);
    if (pendingTool) {
      pendingTool.result = message.content;
      pendingTool.durationMs = message.durationMs;
      pendingTool.parallelGroup = message.parallelGroup;
      pendingTool.toolDisplay = message.toolDisplay ?? pendingTool.toolDisplay;
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
      toolDisplay: message.toolDisplay,
    });
  }

  return turns;
}
