import { useState, useCallback, useRef } from "react";
import {
  createDeepFactorAgent,
  requestHumanInput,
  TOOL_NAME_REQUEST_HUMAN_INPUT,
  maxIterations,
  isPendingResult,
  isPlanResult,
  addUsage,
} from "deep-factor-agent";
import type {
  AgentResult,
  PendingResult,
  PlanResult,
  TokenUsage,
  HumanInputRequestedEvent,
  AgentEvent,
  AgentThread,
  HumanInputReceivedEvent,
} from "deep-factor-agent";
import type {
  ChatMessage,
  AgentStatus,
  UseAgentOptions,
  UseAgentReturn,
  AgentTools,
  PendingUiState,
  PendingSubmission,
  PendingAction,
} from "../types.js";
import { appendSession } from "../session-logger.js";

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
          messages.push({ id: `msg-${messages.length}`, role: event.role, content: event.content });
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
        });
        break;
    }
  }
  return messages;
}

export function useAgent(options: UseAgentOptions): UseAgentReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(options.initialMessages ?? []);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [usage, setUsage] = useState<TokenUsage>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  });
  const [iterations, setIterations] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [pendingUiState, setPendingUiState] = useState<PendingUiState | null>(null);
  const [plan, setPlan] = useState<string | null>(null);

  const pendingRef = useRef<PendingResult | null>(null);
  const threadRef = useRef<AgentThread | null>(options.initialThread ?? null);
  const resumedMessagesRef = useRef<ChatMessage[]>(options.initialMessages ?? []);
  // Track how many chat messages have already been persisted to the session log.
  // Starts at the count of initial/resumed messages so we don't re-log them.
  const loggedMessageCountRef = useRef<number>(options.initialMessages?.length ?? 0);

  const handleResult = useCallback((result: AgentResult | PendingResult | PlanResult) => {
    threadRef.current = result.thread;
    const newMessages = eventsToChatMessages(result.thread.events);
    // Prepend resumed display messages so they stay visible, but skip the
    // events that came from the seeded thread (they'll be in newMessages too).
    const resumedCount = resumedMessagesRef.current.length;
    setMessages(
      resumedCount > 0
        ? [...resumedMessagesRef.current, ...newMessages.slice(resumedCount)]
        : newMessages,
    );
    setUsage((prev) => addUsage(prev, result.usage));
    setIterations(result.iterations);

    // Persist only NEW messages to session log (skip already-logged ones)
    const alreadyLogged = loggedMessageCountRef.current;
    const messagesToLog = newMessages.slice(alreadyLogged);
    loggedMessageCountRef.current = newMessages.length;
    for (const msg of messagesToLog) {
      if (msg.role === "user") continue; // user messages logged at submit time
      appendSession({
        timestamp: new Date().toISOString(),
        role: msg.role,
        content: msg.content,
        ...(msg.toolName ? { toolName: msg.toolName } : {}),
        ...(msg.toolArgs ? { toolArgs: msg.toolArgs } : {}),
        ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
      });
    }

    if (isPlanResult(result)) {
      setPlan(result.plan);
      setPendingUiState(null);
      setStatus("done");
    } else if (isPendingResult(result)) {
      const planEvent = [...result.thread.events].reverse().find((e) => e.type === "plan");
      const nextPlan = planEvent?.type === "plan" ? planEvent.content : null;
      const req =
        result.thread.events
          .filter((e): e is HumanInputRequestedEvent => e.type === "human_input_requested")
          .pop() ?? null;

      setPlan(req?.kind === "plan_review" ? nextPlan : null);
      pendingRef.current = result;
      setPendingUiState(buildPendingUiState(req, req?.kind === "plan_review" ? nextPlan : null));
      setStatus("pending_input");
    } else if (result.stopReason === "max_errors") {
      const detail = result.stopDetail ?? "Agent stopped due to repeated errors";
      setError(new Error(detail));
      setPendingUiState(null);
      setStatus("error");
    } else {
      setPendingUiState(null);
      setStatus("done");
    }
  }, []);

  const handleError = useCallback((err: unknown) => {
    setError(err instanceof Error ? err : new Error(String(err)));
    setStatus("error");
  }, []);

  const sendPrompt = useCallback(
    (prompt: string) => {
      setStatus("running");
      setError(null);
      setPlan(null);
      setPendingUiState(null);
      pendingRef.current = null;

      const tools: AgentTools = [...(options.tools ?? []), requestHumanInput];

      const agent = createDeepFactorAgent({
        model: options.model,
        tools,
        stopWhen: [maxIterations(options.maxIter)],
        interruptOn: [TOOL_NAME_REQUEST_HUMAN_INPUT],
        parallelToolCalls: options.parallelToolCalls ?? true,
        mode: options.mode ?? "yolo",
      });

      const existingThread = threadRef.current;
      if (existingThread) {
        agent.continueLoop(existingThread, prompt).then(handleResult).catch(handleError);
      } else {
        agent.loop(prompt).then(handleResult).catch(handleError);
      }
    },
    [
      options.model,
      options.maxIter,
      options.tools,
      options.parallelToolCalls,
      options.mode,
      handleResult,
      handleError,
    ],
  );

  const submitPendingInput = useCallback(
    (submission: PendingSubmission) => {
      const pending = pendingRef.current;
      if (!pending) return;

      setStatus("running");
      setPendingUiState(null);
      pendingRef.current = null;

      let resumeInput: string | { decision?: "approve" | "reject" | "edit"; response?: string };
      switch (submission.kind) {
        case "approve":
          resumeInput = { decision: "approve" };
          break;
        case "reject":
          resumeInput = { decision: "reject" };
          break;
        case "edit":
          resumeInput = { decision: "edit", response: submission.feedback };
          break;
        case "choice":
        case "text":
          resumeInput = submission.value;
          break;
      }

      pending.resume(resumeInput).then(handleResult).catch(handleError);
    },
    [handleResult, handleError],
  );

  return {
    messages,
    status,
    usage,
    iterations,
    error,
    plan,
    sendPrompt,
    submitPendingInput,
    pendingUiState,
  };
}
