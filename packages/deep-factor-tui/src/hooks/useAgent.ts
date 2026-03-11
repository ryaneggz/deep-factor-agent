import { useState, useCallback, useRef } from "react";
import {
  createDeepFactorAgent,
  requestHumanInput,
  TOOL_NAME_REQUEST_HUMAN_INPUT,
  maxIterations,
  isPendingResult,
  isPlanResult,
  addUsage,
  nextSequence,
} from "deep-factor-agent";
import type {
  AgentResult,
  AgentExecutionUpdate,
  PendingResult,
  PlanResult,
  TokenUsage,
  HumanInputRequestedEvent,
  AgentEvent,
  AgentThread,
  HumanInputReceivedEvent,
  MapperContext,
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
import { appendUnifiedSession, getSessionId } from "../session-logger.js";
import { DEFAULT_TUI_AGENT_INSTRUCTIONS } from "../default-agent-instructions.js";

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

function extractJsonFence(content: string): string | null {
  const match = /^\s*```json\s*\n?([\s\S]*?)\n?```\s*$/.exec(content);
  return match?.[1] ?? null;
}

export function isToolCallEnvelopeMessage(content: string): boolean {
  const fencedJson = extractJsonFence(content);
  if (!fencedJson) {
    return false;
  }

  try {
    const parsed = JSON.parse(fencedJson) as { tool_calls?: unknown };
    return Array.isArray(parsed.tool_calls);
  } catch {
    return false;
  }
}

export function filterDisplayMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (message) => !(message.role === "assistant" && isToolCallEnvelopeMessage(message.content)),
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
          role: "tool_result",
          content: `Error: ${event.error}`,
          toolCallId: event.toolCallId,
        });
        break;
    }
  }
  return messages;
}

function findLatestPlan(events: AgentEvent[]): string | null {
  const event = [...events].reverse().find((item) => item.type === "plan");
  return event?.type === "plan" ? event.content : null;
}

function findLatestHumanInputRequest(events: AgentEvent[]): HumanInputRequestedEvent | null {
  return (
    events
      .filter((event): event is HumanInputRequestedEvent => event.type === "human_input_requested")
      .pop() ?? null
  );
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
  const mapperCtxRef = useRef<MapperContext>({
    sessionId: getSessionId(),
    sequence: 0,
    currentIteration: 0,
    provider: options.provider,
    model: options.modelLabel,
    mode: options.mode,
  });
  // Track how many chat messages have already been persisted to the session log.
  // Starts at the count of initial/resumed messages so we don't re-log them.
  const loggedMessageCountRef = useRef<number>(options.initialMessages?.length ?? 0);
  const usageBaseRef = useRef<TokenUsage>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  });

  const applyThreadSnapshot = useCallback((thread: AgentThread): ChatMessage[] => {
    threadRef.current = thread;
    const rawMessages = eventsToChatMessages(thread.events);
    const resumedCount = resumedMessagesRef.current.length;
    const displayMessages =
      resumedCount > 0
        ? [...resumedMessagesRef.current, ...rawMessages.slice(resumedCount)]
        : rawMessages;
    setMessages(filterDisplayMessages(displayMessages));
    return rawMessages;
  }, []);

  const handleUpdate = useCallback(
    (update: AgentExecutionUpdate) => {
      applyThreadSnapshot(update.thread);
      setUsage(addUsage(usageBaseRef.current, update.usage));
      setIterations(update.iterations);
      setStatus(update.status);

      if (update.lastEvent?.type === "plan") {
        setPlan(update.lastEvent.content);
      }

      const latestPlan = findLatestPlan(update.thread.events);
      const latestRequest = findLatestHumanInputRequest(update.thread.events);

      if (update.status === "pending_input" && latestRequest) {
        const nextPlan = latestRequest.kind === "plan_review" ? latestPlan : null;
        setPlan(nextPlan);
        setPendingUiState(buildPendingUiState(latestRequest, nextPlan));
      } else {
        setPendingUiState(null);
      }

      if (update.lastEvent?.type === "error") {
        setError(new Error(update.lastEvent.error));
        return;
      }

      if (update.status !== "error") {
        setError(null);
      }
    },
    [applyThreadSnapshot],
  );

  const handleResult = useCallback(
    (result: AgentResult | PendingResult | PlanResult) => {
      const newMessages = applyThreadSnapshot(result.thread);
      setUsage(addUsage(usageBaseRef.current, result.usage));
      setIterations(result.iterations);

      // Persist only NEW messages to session log (skip already-logged ones)
      const alreadyLogged = loggedMessageCountRef.current;
      const messagesToLog = newMessages.slice(alreadyLogged);
      loggedMessageCountRef.current = newMessages.length;
      const ctx = mapperCtxRef.current;
      for (const msg of messagesToLog) {
        if (msg.role === "user") continue; // user messages logged at submit time
        const ts = Date.now();
        if (msg.role === "assistant") {
          appendUnifiedSession({
            type: "message",
            sessionId: ctx.sessionId,
            timestamp: ts,
            sequence: nextSequence(ctx),
            role: "assistant",
            content: msg.content,
            iteration: ctx.currentIteration,
            providerMeta: { model: options.modelLabel, provider: options.provider },
          });
        } else if (msg.role === "tool_call") {
          appendUnifiedSession({
            type: "tool_call",
            sessionId: ctx.sessionId,
            timestamp: ts,
            sequence: nextSequence(ctx),
            toolCallId: msg.toolCallId ?? "",
            toolName: msg.toolName ?? "unknown",
            args: msg.toolArgs ?? {},
            display: msg.toolDisplay,
            parallelGroup: msg.parallelGroup,
            iteration: ctx.currentIteration,
          });
        } else if (msg.role === "tool_result") {
          appendUnifiedSession({
            type: "tool_result",
            sessionId: ctx.sessionId,
            timestamp: ts,
            sequence: nextSequence(ctx),
            toolCallId: msg.toolCallId ?? "",
            result: msg.content,
            isError: false,
            display: msg.toolDisplay,
            durationMs: msg.durationMs,
            parallelGroup: msg.parallelGroup,
            iteration: ctx.currentIteration,
          });
        }
      }

      if (isPlanResult(result)) {
        setError(null);
        setPlan(result.plan);
        setPendingUiState(null);
        setStatus("done");
      } else if (isPendingResult(result)) {
        const nextPlan = findLatestPlan(result.thread.events);
        const req = findLatestHumanInputRequest(result.thread.events);

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
        setError(null);
        setPendingUiState(null);
        setStatus("done");
      }
    },
    [applyThreadSnapshot, options.modelLabel, options.provider],
  );

  const handleError = useCallback((err: unknown) => {
    setError(err instanceof Error ? err : new Error(String(err)));
    setStatus("error");
  }, []);

  const shouldStreamUpdates =
    options.provider === "langchain" ||
    options.provider === "claude" ||
    options.provider === "codex";

  const sendPrompt = useCallback(
    (prompt: string) => {
      setStatus("running");
      setError(null);
      setPlan(null);
      setPendingUiState(null);
      pendingRef.current = null;
      usageBaseRef.current = usage;

      const tools: AgentTools = [...(options.tools ?? []), requestHumanInput];

      // Write init entry at session start (first invocation only)
      const existingThread = threadRef.current;
      if (!existingThread) {
        const ctx = mapperCtxRef.current;
        appendUnifiedSession({
          type: "init",
          sessionId: ctx.sessionId,
          timestamp: Date.now(),
          sequence: nextSequence(ctx),
          provider: options.provider,
          model: options.modelLabel,
          mode: options.mode ?? "yolo",
          settings: { maxIter: options.maxIter, sandbox: options.mode ?? "yolo" },
          cwd: process.cwd(),
          tools: tools.map((t) =>
            typeof t === "object" && "name" in t ? (t.name as string) : String(t),
          ),
        });
      }

      const agent = createDeepFactorAgent({
        model: options.model,
        tools,
        instructions: DEFAULT_TUI_AGENT_INSTRUCTIONS,
        stopWhen: [maxIterations(options.maxIter)],
        interruptOn: [TOOL_NAME_REQUEST_HUMAN_INPUT],
        parallelToolCalls: options.parallelToolCalls ?? true,
        mode: options.mode ?? "yolo",
        streamMode: shouldStreamUpdates ? "updates" : "final",
        onUpdate: shouldStreamUpdates ? handleUpdate : undefined,
      });

      if (existingThread) {
        agent.continueLoop(existingThread, prompt).then(handleResult).catch(handleError);
      } else {
        agent.loop(prompt).then(handleResult).catch(handleError);
      }
    },
    [
      options.model,
      options.modelLabel,
      options.provider,
      options.maxIter,
      options.tools,
      options.parallelToolCalls,
      options.mode,
      shouldStreamUpdates,
      handleResult,
      handleError,
      handleUpdate,
      usage,
    ],
  );

  const submitPendingInput = useCallback(
    (submission: PendingSubmission) => {
      const pending = pendingRef.current;
      if (!pending) return;

      setStatus("running");
      setPendingUiState(null);
      pendingRef.current = null;
      usageBaseRef.current = usage;

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
    [handleResult, handleError, usage],
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
