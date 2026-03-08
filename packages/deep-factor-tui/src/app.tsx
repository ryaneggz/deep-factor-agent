import React, { useEffect, useRef, useMemo } from "react";
import { Static } from "ink";
import { useAgent } from "./hooks/useAgent.js";
import { Header } from "./components/Header.js";
import { LiveSection } from "./components/LiveSection.js";
import { TranscriptTurn } from "./components/TranscriptTurn.js";
import { createBashTool } from "./tools/bash.js";
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
  model,
  maxIter,
  sandbox,
  parallelToolCalls,
  mode,
  resumeMessages,
  resumeThread,
}: TuiAppProps) {
  const hasRun = useRef(false);

  const tools: AgentTools = [createBashTool(sandbox)];

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
    model,
    maxIter,
    tools,
    parallelToolCalls,
    mode,
    initialMessages: resumeMessages,
    initialThread: resumeThread,
  });

  // Send initial prompt on mount if provided
  useEffect(() => {
    if (prompt && !hasRun.current) {
      hasRun.current = true;
      sendPrompt(prompt);
    }
  }, [prompt, sendPrompt]);

  const handleSubmit = (value: string) => {
    appendSession({
      timestamp: new Date().toISOString(),
      role: "user",
      content: value,
      model,
    });
    sendPrompt(value);
  };

  const handlePendingSubmit = (submission: PendingSubmission) => {
    appendSession({
      timestamp: new Date().toISOString(),
      role: "user",
      content: formatPendingSubmission(submission),
      model,
    });
    submitPendingInput(submission);
  };

  const transcriptTurns: TranscriptTurnData[] = useMemo(
    () => groupMessagesIntoTurns(messages),
    [messages],
  );
  const staticTurns = useMemo(() => transcriptTurns.slice(0, -1), [transcriptTurns]);
  const activeTurn =
    transcriptTurns.length > 0 ? transcriptTurns[transcriptTurns.length - 1] : null;

  return (
    <>
      <Header model={model} />
      <Static items={staticTurns}>{(turn) => <TranscriptTurn key={turn.id} turn={turn} />}</Static>
      {activeTurn && <TranscriptTurn turn={activeTurn} />}
      <LiveSection
        status={status}
        error={error}
        plan={plan}
        pendingUiState={pendingUiState}
        usage={usage}
        iterations={iterations}
        onPromptSubmit={handleSubmit}
        onPendingSubmit={handlePendingSubmit}
      />
    </>
  );
}
