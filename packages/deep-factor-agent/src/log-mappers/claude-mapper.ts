import type { UnifiedLogEntry } from "../unified-log.js";
import type { MapperContext } from "./types.js";
import { nextSequence } from "./types.js";

/**
 * Maps a raw Claude CLI JSONL event into one or more UnifiedLogEntry items.
 *
 * Claude CLI format:
 * - { type: "system", subtype: "init", ... }
 * - { type: "assistant", message: { content: [...blocks...] } }
 * - { type: "user", message: { content: [...blocks...] } }
 * - { type: "result", subtype: "success"|"error", result: "...", total_cost_usd, ... }
 * - { type: "rate_limit_event", ... }
 */
export function mapClaudeEvent(
  raw: Record<string, unknown>,
  ctx: MapperContext,
): UnifiedLogEntry[] {
  const entries: UnifiedLogEntry[] = [];
  const base = {
    sessionId: ctx.sessionId,
    timestamp: Date.now(),
  };

  switch (raw.type) {
    case "system": {
      if (raw.subtype === "init") {
        const tools = Array.isArray(raw.tools) ? (raw.tools as string[]) : [];
        entries.push({
          ...base,
          type: "init",
          sequence: nextSequence(ctx),
          provider: "claude",
          model: (raw.model as string) ?? ctx.model ?? "unknown",
          mode: ctx.mode ?? "yolo",
          cwd: raw.cwd as string | undefined,
          tools,
          settings: {
            sessionId: raw.session_id,
            permissionMode: raw.permissionMode,
          },
        });
      }
      break;
    }

    case "assistant": {
      const message = raw.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b.type === "thinking") {
            entries.push({
              ...base,
              type: "thinking",
              sequence: nextSequence(ctx),
              content: (b.thinking as string) ?? "",
              iteration: ctx.currentIteration,
            });
          } else if (b.type === "text") {
            entries.push({
              ...base,
              type: "message",
              sequence: nextSequence(ctx),
              role: "assistant",
              content: (b.text as string) ?? "",
              iteration: ctx.currentIteration,
            });
          } else if (b.type === "tool_use") {
            const toolName = (b.name as string) ?? "unknown";
            entries.push({
              ...base,
              type: "tool_call",
              sequence: nextSequence(ctx),
              toolCallId: (b.id as string) ?? "",
              toolName,
              args: (b.input as Record<string, unknown>) ?? {},
              display: {
                kind: inferToolKind(toolName),
                label: `${toolName}(${summarizeArgs(b.input as Record<string, unknown>)})`,
              },
              iteration: ctx.currentIteration,
            });
          }
        }
      }
      break;
    }

    case "user": {
      const message = raw.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b.type === "tool_result") {
            entries.push({
              ...base,
              type: "tool_result",
              sequence: nextSequence(ctx),
              toolCallId: (b.tool_use_id as string) ?? "",
              result: b.content ?? "",
              isError: (b.is_error as boolean) ?? false,
              iteration: ctx.currentIteration,
            });
          }
        }
      } else if (typeof content === "string") {
        entries.push({
          ...base,
          type: "message",
          sequence: nextSequence(ctx),
          role: "user",
          content,
          iteration: ctx.currentIteration,
        });
      }
      break;
    }

    case "result": {
      const usage = raw.usage as Record<string, number> | undefined;
      entries.push({
        ...base,
        type: "status",
        sequence: nextSequence(ctx),
        status: "done",
        usage: {
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
          cacheReadTokens: usage?.cache_read_input_tokens,
          cacheWriteTokens: usage?.cache_creation_input_tokens,
        },
        iterations: ctx.currentIteration,
        costUsd: raw.total_cost_usd as number | undefined,
      });
      entries.push({
        ...base,
        type: "result",
        sequence: nextSequence(ctx),
        content: (raw.result as string) ?? "",
        stopReason: raw.subtype === "error" ? "error" : "completed",
        usage: {
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
          cacheReadTokens: usage?.cache_read_input_tokens,
          cacheWriteTokens: usage?.cache_creation_input_tokens,
        },
        iterations: ctx.currentIteration,
        costUsd: raw.total_cost_usd as number | undefined,
      });
      break;
    }

    case "rate_limit_event": {
      entries.push({
        ...base,
        type: "rate_limit",
        sequence: nextSequence(ctx),
        retryAfterMs: raw.retry_after_ms as number | undefined,
        message: raw.message as string | undefined,
      });
      break;
    }
  }

  return entries;
}

function inferToolKind(
  toolName: string,
): "command" | "file_read" | "file_edit" | "file_write" | "generic" {
  const lower = toolName.toLowerCase();
  if (lower === "bash" || lower === "execute_command") return "command";
  if (lower === "read" || lower.includes("read_file")) return "file_read";
  if (lower === "edit" || lower.includes("edit_file")) return "file_edit";
  if (lower === "write" || lower.includes("write_file")) return "file_write";
  return "generic";
}

function summarizeArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const first = Object.values(args)[0];
  if (typeof first === "string") return first.slice(0, 60);
  return "";
}
