import type { UnifiedLogEntry } from "../unified-log.js";
import type { AgentEvent, TokenUsage } from "../types.js";
import type { MapperContext } from "./types.js";
import { nextSequence } from "./types.js";

/**
 * Maps a raw LangChain/deep-factor-agent JSONL event into one or more UnifiedLogEntry items.
 *
 * LangChain format (current deep-factor-agent output):
 * - { type: "init", provider, model, mode, ... }
 * - { type: "event", event: AgentEvent, usage, iterations, status, stopReason? }
 * - { type: "status", usage, iterations, status }
 * - { type: "result", content, stopReason, usage, iterations }
 * - { type: "error", error: string }
 */
export function mapLangchainEvent(
  raw: Record<string, unknown>,
  ctx: MapperContext,
): UnifiedLogEntry[] {
  const entries: UnifiedLogEntry[] = [];
  const base = {
    sessionId: ctx.sessionId,
    timestamp: Date.now(),
  };

  switch (raw.type) {
    case "init": {
      entries.push({
        ...base,
        type: "init",
        sequence: nextSequence(ctx),
        provider: "langchain",
        model: (raw.model as string) ?? ctx.model ?? "unknown",
        mode:
          (raw.mode as string as UnifiedLogEntry["type"] extends "init" ? never : never) ??
          ctx.mode ??
          "yolo",
        settings: {
          maxIter: raw.maxIter,
          sandbox: raw.sandbox,
        },
      } as UnifiedLogEntry);
      break;
    }

    case "event": {
      const event = raw.event as AgentEvent | undefined;
      if (!event) break;
      const usage = raw.usage as TokenUsage | undefined;
      const iterations = raw.iterations as number | undefined;
      const status = raw.status as string | undefined;

      entries.push(...mapAgentEvent(event, ctx));

      // If there's a stopReason, emit a status update too
      if (raw.stopReason && status) {
        entries.push({
          ...base,
          type: "status",
          sequence: nextSequence(ctx),
          status: status as "running" | "pending_input" | "done" | "error",
          usage: usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          iterations: iterations ?? ctx.currentIteration,
        });
      }
      break;
    }

    case "status": {
      entries.push({
        ...base,
        type: "status",
        sequence: nextSequence(ctx),
        status:
          (raw.status as string as "running" | "pending_input" | "done" | "error") ?? "running",
        usage: (raw.usage as TokenUsage) ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        iterations: (raw.iterations as number) ?? ctx.currentIteration,
      });
      break;
    }

    case "result": {
      entries.push({
        ...base,
        type: "result",
        sequence: nextSequence(ctx),
        content: (raw.content as string) ?? "",
        stopReason: (raw.stopReason as string) ?? "completed",
        usage: (raw.usage as TokenUsage) ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        iterations: (raw.iterations as number) ?? ctx.currentIteration,
      });
      break;
    }

    case "error": {
      entries.push({
        ...base,
        type: "error",
        sequence: nextSequence(ctx),
        error: (raw.error as string) ?? "Unknown error",
        recoverable: false,
      });
      break;
    }
  }

  return entries;
}

/**
 * Maps a single AgentEvent (from the agent's internal event system)
 * into one or more UnifiedLogEntry items. Used both by the langchain mapper
 * and directly when emitting unified logs from the agent.
 */
export function mapAgentEvent(event: AgentEvent, ctx: MapperContext): UnifiedLogEntry[] {
  const base = {
    sessionId: ctx.sessionId,
    timestamp: event.timestamp,
  };

  switch (event.type) {
    case "message":
      return [
        {
          ...base,
          type: "message",
          sequence: nextSequence(ctx),
          role: event.role,
          content: event.content,
          iteration: event.iteration,
        },
      ];

    case "tool_call":
      return [
        {
          ...base,
          type: "tool_call",
          sequence: nextSequence(ctx),
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          display: event.display,
          parallelGroup: event.parallelGroup,
          iteration: event.iteration,
        },
      ];

    case "tool_result":
      return [
        {
          ...base,
          type: "tool_result",
          sequence: nextSequence(ctx),
          toolCallId: event.toolCallId,
          result: event.result,
          isError: false,
          display: event.display,
          durationMs: event.durationMs,
          parallelGroup: event.parallelGroup,
          iteration: event.iteration,
        },
      ];

    case "error":
      return [
        {
          ...base,
          type: "error",
          sequence: nextSequence(ctx),
          error: event.error,
          toolCallId: event.toolCallId,
          recoverable: event.recoverable,
          iteration: event.iteration,
        },
      ];

    case "approval":
      return [
        {
          ...base,
          type: "approval",
          sequence: nextSequence(ctx),
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          decision: event.decision,
          response: event.response,
          iteration: event.iteration,
        },
      ];

    case "human_input_requested":
      return [
        {
          ...base,
          type: "human_input_requested",
          sequence: nextSequence(ctx),
          kind: event.kind,
          question: event.question,
          format: event.format,
          choices: event.choices,
          iteration: event.iteration,
        },
      ];

    case "human_input_received":
      return [
        {
          ...base,
          type: "human_input_received",
          sequence: nextSequence(ctx),
          response: event.response,
          decision: event.decision,
          iteration: event.iteration,
        },
      ];

    case "completion":
      return [
        {
          ...base,
          type: "completion",
          sequence: nextSequence(ctx),
          result: event.result,
          verified: event.verified,
          iteration: event.iteration,
        },
      ];

    case "plan":
      return [
        {
          ...base,
          type: "plan",
          sequence: nextSequence(ctx),
          content: event.content,
          iteration: event.iteration,
        },
      ];

    case "summary":
      return [
        {
          ...base,
          type: "summary",
          sequence: nextSequence(ctx),
          summarizedIterations: event.summarizedIterations,
          summary: event.summary,
          iteration: event.iteration,
        },
      ];

    default:
      return [];
  }
}
