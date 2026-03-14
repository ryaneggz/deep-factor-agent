/**
 * Pure utility functions for converting agent events to chat messages.
 * Extracted from useAgent.ts to reduce hook complexity and enable
 * independent testing without React dependencies.
 */
import type {
  AgentEvent,
  HumanInputRequestedEvent,
  HumanInputReceivedEvent,
} from "deep-factor-agent";
import type { ChatMessage, PendingUiState, PendingAction } from "./types.js";
import { decodeXmlEntities } from "./sanitize.js";

function isPendingAction(value: string): value is PendingAction {
  return value === "approve" || value === "reject" || value === "edit";
}

function normalizeActions(choices?: string[]): PendingAction[] {
  const actions = (choices ?? []).filter(isPendingAction);
  return actions.length > 0 ? actions : ["approve", "reject", "edit"];
}

function isSyntheticUserMessage(content: string): boolean {
  return (
    content.includes("Plan mode requires exactly one") ||
    content === "Approved. Continue." ||
    content.startsWith("Rejected.") ||
    content.startsWith("Edit required:") ||
    content.startsWith("Please revise the plan based on this feedback:\n")
  );
}

export function containsToolCallBlock(content: string): boolean {
  // Check fenced JSON blocks (unanchored)
  for (const match of content.matchAll(/```json\s*\n?([\s\S]*?)\n?\s*```/g)) {
    try {
      const parsed = JSON.parse(match[1]) as { tool_calls?: unknown };
      if (Array.isArray(parsed.tool_calls)) return true;
    } catch {
      // not a tool call block
    }
  }

  // Check bare JSON objects with tool_calls key
  const stripped = content.replace(/```[\s\S]*?```/g, "");
  if (/\{\s*"tool_calls"\s*:\s*\[/.test(stripped)) return true;

  // Check bare JSON arrays that look like tool calls
  for (const match of stripped.matchAll(/\[\s*\{[\s\S]*?\}\s*\]/g)) {
    try {
      const parsed = JSON.parse(match[0]);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every(
          (item: unknown) =>
            typeof item === "object" &&
            item !== null &&
            "name" in item &&
            typeof (item as Record<string, unknown>).name === "string",
        )
      ) {
        return true;
      }
    } catch {
      // not valid JSON
    }
  }

  return false;
}

/** @deprecated Use containsToolCallBlock instead */
export function isToolCallEnvelopeMessage(content: string): boolean {
  return containsToolCallBlock(content);
}

function stripToolCallBlocks(content: string): string {
  // Strip fenced JSON blocks containing tool_calls
  let result = content.replace(/```json\s*\n?[\s\S]*?\n?\s*```/g, "");
  // Strip bare JSON objects with tool_calls key
  result = result.replace(/\{\s*"tool_calls"\s*:\s*\[[\s\S]*?\]\s*\}/g, "");
  // Strip bare JSON arrays that look like tool call arrays
  result = result.replace(/\[\s*\{\s*"name"\s*:[\s\S]*?\}\s*\]/g, "");
  return result.trim();
}

export function filterDisplayMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .map((message) => {
      if (message.role !== "assistant") return message;
      if (!containsToolCallBlock(message.content)) return message;
      const stripped = stripToolCallBlocks(message.content);
      if (!stripped) return null;
      return { ...message, content: stripped };
    })
    .filter((m): m is ChatMessage => m !== null);
}

function formatHumanInputReceived(event: HumanInputReceivedEvent): string {
  if (event.decision === "approve") {
    return "approve";
  }
  if (event.decision === "reject") {
    return event.response ? `reject: ${event.response}` : "reject";
  }
  if (event.decision === "edit") {
    return event.response?.trim() ? event.response : "edit";
  }
  return event.response?.trim() ?? "";
}

export function buildPendingUiState(
  request: HumanInputRequestedEvent | null,
  plan: string | null,
): PendingUiState | null {
  if (!request) {
    return null;
  }

  if (request.kind === "plan_review") {
    if (plan) {
      return {
        kind: "plan_review",
        title: "Plan Review",
        question: request.question,
        plan,
        actions: normalizeActions(request.choices),
      };
    }

    return {
      kind: "question",
      title: "Plan Review",
      question: request.question,
      format: request.format ?? "free_text",
      choices: request.choices,
      urgency: request.urgency,
    };
  }

  if (request.kind === "approval") {
    return {
      kind: "approval",
      title: "Approval Required",
      question: request.question,
      toolName: request.approvalRequest?.toolName ?? "Unknown tool",
      toolArgs: request.approvalRequest?.args,
      reason: request.approvalRequest?.reason,
      actions: normalizeActions(request.choices),
    };
  }

  return {
    kind: "question",
    title: "Input Requested",
    question: request.question,
    context: request.context,
    urgency: request.urgency,
    format: request.format ?? "free_text",
    choices: request.choices,
  };
}

export function eventsToChatMessages(events: AgentEvent[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  // Collect tool_call IDs whose results contain "blocked in plan mode" so we can skip both
  const blockedToolCallIds = new Set<string>();
  for (const event of events) {
    if (
      event.type === "tool_result" &&
      typeof event.result === "string" &&
      event.result.includes("blocked in plan mode")
    ) {
      blockedToolCallIds.add(event.toolCallId);
    }
  }

  for (const event of events) {
    switch (event.type) {
      case "message":
        if (event.role === "user" && isSyntheticUserMessage(event.content)) break;
        if (event.role === "user" || event.role === "assistant") {
          const content =
            event.role === "assistant" ? decodeXmlEntities(event.content) : event.content;
          messages.push({ id: `msg-${messages.length}`, role: event.role, content });
        }
        break;
      case "human_input_received": {
        const content = formatHumanInputReceived(event);
        if (content.length > 0) {
          messages.push({ id: `msg-${messages.length}`, role: "user", content });
        }
        break;
      }
      case "tool_call":
        if (blockedToolCallIds.has(event.toolCallId)) break;
        messages.push({
          id: `msg-${messages.length}`,
          role: "tool_call",
          content: event.toolName,
          toolName: event.toolName,
          toolArgs: event.args,
          toolCallId: event.toolCallId,
          parallelGroup: event.parallelGroup,
          toolDisplay: event.display,
        });
        break;
      case "tool_result":
        if (blockedToolCallIds.has(event.toolCallId)) break;
        messages.push({
          id: `msg-${messages.length}`,
          role: "tool_result",
          content: String(event.result),
          toolCallId: event.toolCallId,
          durationMs: event.durationMs,
          parallelGroup: event.parallelGroup,
          toolDisplay: event.display,
        });
        break;
      case "error":
        messages.push({
          id: `msg-${messages.length}`,
          role: "error",
          content: `Error: ${event.error}`,
          toolCallId: event.toolCallId,
        });
        break;
      case "plan":
        messages.push({
          id: `msg-${messages.length}`,
          role: "plan",
          content: event.content,
          planContent: event.content,
        });
        break;
      case "summary":
        messages.push({
          id: `msg-${messages.length}`,
          role: "summary",
          content: event.summary,
        });
        break;
      case "completion":
        // completion events duplicate the final assistant message — skip for display
        break;
      case "approval":
        messages.push({
          id: `msg-${messages.length}`,
          role: "approval",
          content: `${event.decision}: ${event.toolName}`,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
        });
        break;
      case "human_input_requested":
        messages.push({
          id: `msg-${messages.length}`,
          role: "human_input",
          content: event.question,
        });
        break;
    }
  }
  return messages;
}

export function findLatestPlan(events: AgentEvent[]): string | null {
  const event = [...events].reverse().find((item) => item.type === "plan");
  return event?.type === "plan" ? event.content : null;
}

export function findLatestHumanInputRequest(events: AgentEvent[]): HumanInputRequestedEvent | null {
  return (
    events
      .filter((event): event is HumanInputRequestedEvent => event.type === "human_input_requested")
      .pop() ?? null
  );
}
