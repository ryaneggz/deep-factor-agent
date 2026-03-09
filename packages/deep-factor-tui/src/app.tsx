import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Static } from "ink";
import type { AgentMode, DeepFactorAgentSettings } from "deep-factor-agent";
import { useAgent } from "./hooks/useAgent.js";
import { Header } from "./components/Header.js";
import { LiveSection } from "./components/LiveSection.js";
import { TranscriptTurn } from "./components/TranscriptTurn.js";
import { createBashTool } from "./tools/bash.js";
import { resolveProviderModel } from "./provider-resolution.js";
import type { TuiAppProps } from "./types.js";
import type {
  AgentTools,
  TranscriptTurn as TranscriptTurnData,
  PendingSubmission,
} from "./types.js";
import { appendSession } from "./session-logger.js";
import { groupMessagesIntoTurns } from "./transcript.js";

function formatPendingSubmission(submission: PendingSubmission): string {
  switch (submission.kind) {
    case "approve":
      return "approve";
    case "reject":
      return "reject";
    case "edit":
      return submission.feedback;
    case "choice":
    case "text":
      return submission.value;
  }
}

export function TuiApp({
  prompt,
  provider,
  model,
  maxIter,
  sandbox,
  parallelToolCalls,
  mode,
  resumeMessages,
  resumeThread,
}: TuiAppProps) {
  const hasRun = useRef(false);
  const [activeMode, setActiveMode] = useState<AgentMode>(mode ?? "yolo");

  const tools: AgentTools = [createBashTool(sandbox)];
  const resolvedModel = useMemo<DeepFactorAgentSettings["model"]>(
    () => resolveProviderModel({ provider, model, mode: activeMode, liveUpdates: true }),
    [provider, model, activeMode],
  );

  const {
    messages,
    status,
    usage,
    iterations,
    error,
    plan,
    sendPrompt,
    submitPendingInput,
    pendingUiState,
  } = useAgent({
    model: resolvedModel,
    modelLabel: model,
    maxIter,
    tools,
    parallelToolCalls,
    mode: activeMode,
    provider,
    initialMessages: resumeMessages,
    initialThread: resumeThread,
  });

  const handleCycleMode = useCallback(() => {
    setActiveMode((currentMode) => {
      switch (currentMode) {
        case "plan":
          return "approve";
        case "approve":
          return "yolo";
        case "yolo":
          return "plan";
      }
    });
  }, []);

  const handleSubmit = useCallback(
    (value: string) => {
      appendSession({
        timestamp: new Date().toISOString(),
        role: "user",
        content: value,
        model,
        provider,
      });
      sendPrompt(value);
    },
    [model, provider, sendPrompt],
  );

  const handlePendingSubmit = useCallback(
    (submission: PendingSubmission) => {
      appendSession({
        timestamp: new Date().toISOString(),
        role: "user",
        content: formatPendingSubmission(submission),
        model,
        provider,
      });
      submitPendingInput(submission);
    },
    [model, provider, submitPendingInput],
  );

  useEffect(() => {
    if (prompt && !hasRun.current) {
      hasRun.current = true;
      handleSubmit(prompt);
    }
  }, [handleSubmit, prompt]);

  const transcriptTurns: TranscriptTurnData[] = useMemo(
    () => groupMessagesIntoTurns(messages),
    [messages],
  );
  const staticTurns = useMemo(() => transcriptTurns.slice(0, -1), [transcriptTurns]);
  const activeTurn =
    transcriptTurns.length > 0 ? transcriptTurns[transcriptTurns.length - 1] : null;

  return (
    <>
      <Header provider={provider} model={model} />
      <Static items={staticTurns}>{(turn) => <TranscriptTurn key={turn.id} turn={turn} />}</Static>
      {activeTurn && <TranscriptTurn turn={activeTurn} />}
      <LiveSection
        mode={activeMode}
        status={status}
        error={error}
        plan={plan}
        pendingUiState={pendingUiState}
        usage={usage}
        iterations={iterations}
        onPromptSubmit={handleSubmit}
        onPendingSubmit={handlePendingSubmit}
        onCycleMode={handleCycleMode}
      />
    </>
  );
}
