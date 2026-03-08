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
} from "deep-factor-agent";
import type {
  ChatMessage,
  AgentStatus,
  UseAgentOptions,
  UseAgentReturn,
  AgentTools,
} from "../types.js";
import { appendSession } from "../session-logger.js";

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
        if (event.role === "user" && event.content.includes("Plan mode requires exactly one")) {
          break; // skip plan-mode retry prompts
        }
        if (event.role === "user" || event.role === "assistant") {
          messages.push({ id: `msg-${messages.length}`, role: event.role, content: event.content });
        }
        break;
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
  const [humanInputRequest, setHumanInputRequest] = useState<HumanInputRequestedEvent | null>(null);
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
      setStatus("done");
    } else if (
      isPendingResult(result) &&
      result.thread.events.some(
        (e) => e.type === "human_input_requested" && e.kind === "plan_review",
      )
    ) {
      // Plan review pending — extract plan content from the plan event
      const planEvent = result.thread.events.find((e) => e.type === "plan");
      if (planEvent?.type === "plan") {
        setPlan(planEvent.content);
      }
      pendingRef.current = result;
      const req =
        result.thread.events
          .filter((e): e is HumanInputRequestedEvent => e.type === "human_input_requested")
          .pop() ?? null;
      setHumanInputRequest(req);
      setStatus("pending_input");
    } else if (isPendingResult(result)) {
      pendingRef.current = result;
      const req =
        result.thread.events
          .filter((e): e is HumanInputRequestedEvent => e.type === "human_input_requested")
          .pop() ?? null;
      setHumanInputRequest(req);
      setStatus("pending_input");
    } else if (result.stopReason === "max_errors") {
      const detail = result.stopDetail ?? "Agent stopped due to repeated errors";
      setError(new Error(detail));
      setStatus("error");
    } else {
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
      setHumanInputRequest(null);
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

  const submitHumanInput = useCallback(
    (input: string | { decision?: "approve" | "reject" | "edit"; response?: string }) => {
      const pending = pendingRef.current;
      if (!pending) return;

      setStatus("running");
      setHumanInputRequest(null);
      pendingRef.current = null;

      // Translate plain-string input for plan_review
      const currentReq = pending.thread.events
        .filter((e): e is HumanInputRequestedEvent => e.type === "human_input_requested")
        .pop();
      let resumeInput: string | { decision?: "approve" | "reject" | "edit"; response?: string } =
        input;
      if (currentReq?.kind === "plan_review" && typeof input === "string") {
        const lower = input.trim().toLowerCase();
        if (lower === "approve") {
          resumeInput = { decision: "approve" };
        } else if (lower === "reject") {
          resumeInput = { decision: "reject" };
        } else {
          resumeInput = { decision: "edit", response: input };
        }
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
    submitHumanInput,
    humanInputRequest,
  };
}
