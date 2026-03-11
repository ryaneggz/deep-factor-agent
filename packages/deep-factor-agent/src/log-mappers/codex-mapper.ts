import type { UnifiedLogEntry } from "../unified-log.js";
import type { MapperContext } from "./types.js";
import { nextSequence } from "./types.js";

/**
 * Maps a raw Codex CLI JSONL event into one or more UnifiedLogEntry items.
 *
 * Codex CLI format:
 * - { type: "thread.started", thread_id: "..." }
 * - { type: "turn.started" }
 * - { type: "item.started", item: { id, type, ... } }
 * - { type: "item.completed", item: { id, type, ... } }
 * - { type: "turn.completed", usage: { input_tokens, cached_input_tokens, output_tokens } }
 */
export function mapCodexEvent(raw: Record<string, unknown>, ctx: MapperContext): UnifiedLogEntry[] {
  const entries: UnifiedLogEntry[] = [];
  const base = {
    sessionId: ctx.sessionId,
    timestamp: Date.now(),
  };

  switch (raw.type) {
    case "thread.started": {
      entries.push({
        ...base,
        type: "init",
        sequence: nextSequence(ctx),
        provider: "codex",
        model: ctx.model ?? "unknown",
        mode: ctx.mode ?? "yolo",
        settings: {
          threadId: raw.thread_id,
        },
      });
      break;
    }

    case "turn.started": {
      ctx.currentIteration++;
      break;
    }

    case "item.started": {
      const item = raw.item as Record<string, unknown> | undefined;
      if (!item) break;
      const itemType = item.type as string;
      const itemId = `codex_${item.id as string}`;

      if (itemType === "command_execution") {
        entries.push({
          ...base,
          type: "tool_call",
          sequence: nextSequence(ctx),
          toolCallId: itemId,
          toolName: "bash",
          args: { command: item.command as string },
          display: {
            kind: "command",
            label: `Bash(${(item.command as string)?.slice(0, 80) ?? ""})`,
          },
          iteration: ctx.currentIteration,
        });
      }
      break;
    }

    case "item.completed": {
      const item = raw.item as Record<string, unknown> | undefined;
      if (!item) break;
      const itemType = item.type as string;
      const itemId = `codex_${item.id as string}`;

      if (itemType === "agent_message") {
        entries.push({
          ...base,
          type: "message",
          sequence: nextSequence(ctx),
          role: "assistant",
          content: (item.text as string) ?? "",
          iteration: ctx.currentIteration,
        });
      } else if (itemType === "command_execution") {
        const exitCode = item.exit_code as number | null;
        entries.push({
          ...base,
          type: "tool_result",
          sequence: nextSequence(ctx),
          toolCallId: itemId,
          result: (item.aggregated_output as string) ?? "",
          isError: exitCode !== null && exitCode !== 0,
          display: {
            kind: "command",
            label: `Bash(${(item.command as string)?.slice(0, 80) ?? ""})`,
            previewLines: ((item.aggregated_output as string) ?? "").trim().split("\n").slice(0, 5),
          },
          iteration: ctx.currentIteration,
          providerMeta: {
            exitCode,
            status: item.status,
          },
        });
      } else if (itemType === "file_change") {
        const rawChanges = item.changes as Array<Record<string, unknown>> | undefined;
        const changes = (rawChanges ?? []).map((c) => ({
          path: (c.path as string) ?? "",
          change: mapCodexChangeKind(c.kind as string),
        }));
        entries.push({
          ...base,
          type: "file_change",
          sequence: nextSequence(ctx),
          toolCallId: itemId,
          changes,
          iteration: ctx.currentIteration,
        });
      }
      break;
    }

    case "turn.completed": {
      const usage = raw.usage as Record<string, number> | undefined;
      entries.push({
        ...base,
        type: "status",
        sequence: nextSequence(ctx),
        status: "running",
        usage: {
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
          cacheReadTokens: usage?.cached_input_tokens,
        },
        iterations: ctx.currentIteration,
      });
      break;
    }
  }

  return entries;
}

function mapCodexChangeKind(kind: string | undefined): "created" | "edited" | "deleted" {
  if (kind === "create" || kind === "created") return "created";
  if (kind === "delete" || kind === "deleted") return "deleted";
  return "edited";
}
