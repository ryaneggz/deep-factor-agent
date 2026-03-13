import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Static } from "ink";
import type { AgentMode, DeepFactorAgentSettings } from "deep-factor-agent";
import { useAgent } from "./hooks/useAgent.js";
import { Header } from "./components/Header.js";
import { LiveSection } from "./components/LiveSection.js";
import { TranscriptTurn } from "./components/TranscriptTurn.js";
import { createDefaultTools } from "./tools/default-tools.js";
import { resolveProviderModel } from "./provider-resolution.js";
import type { TuiAppProps } from "./types.js";
import type {
  AgentTools,
  TranscriptTurn as TranscriptTurnData,
  PendingSubmission,
} from "./types.js";
import { groupMessagesIntoTurns } from "./transcript.js";

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
  const [expandActiveFileReadGroups, setExpandActiveFileReadGroups] = useState(false);

  const tools = useMemo<AgentTools>(() => createDefaultTools(sandbox), [sandbox]);
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
      sendPrompt(value);
    },
    [sendPrompt],
  );

  const handlePendingSubmit = useCallback(
    (submission: PendingSubmission) => {
      submitPendingInput(submission);
    },
    [submitPendingInput],
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
  type StaticItem =
    | { kind: "header"; id: "header"; provider: string; model: string }
    | { kind: "turn"; id: string; turn: TranscriptTurnData };

  const staticItems = useMemo<StaticItem[]>(
    () => [
      { kind: "header", id: "header", provider, model },
      ...transcriptTurns.slice(0, -1).map((turn) => ({ kind: "turn" as const, id: turn.id, turn })),
    ],
    [provider, model, transcriptTurns],
  );
  const activeTurn =
    transcriptTurns.length > 0 ? transcriptTurns[transcriptTurns.length - 1] : null;

  const prevActiveTurnId = useRef<string | null>(null);
  if (activeTurn?.id !== prevActiveTurnId.current) {
    prevActiveTurnId.current = activeTurn?.id ?? null;
    if (expandActiveFileReadGroups) {
      setExpandActiveFileReadGroups(false);
    }
  }

  const handleToggleFileReadGroups = useCallback(() => {
    setExpandActiveFileReadGroups((current) => !current);
  }, []);

  return (
    <>
      <Static items={staticItems}>
        {(item) =>
          item.kind === "header" ? (
            <Header key="header" provider={item.provider} model={item.model} />
          ) : (
            <TranscriptTurn key={item.id} turn={item.turn} isActiveTurn={false} />
          )
        }
      </Static>
      {activeTurn && (
        <TranscriptTurn
          turn={activeTurn}
          isActiveTurn={true}
          expandFileReadGroups={expandActiveFileReadGroups}
        />
      )}
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
        onToggleFileReadGroups={handleToggleFileReadGroups}
      />
    </>
  );
}
