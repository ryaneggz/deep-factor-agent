import React, { useEffect, useRef, useMemo } from "react";
import { Static, Box, Text } from "ink";
import { useAgent } from "./hooks/useAgent.js";
import { LiveSection } from "./components/LiveSection.js";
import { MessageBubble } from "./components/MessageBubble.js";
import { createBashTool } from "./tools/bash.js";
import type { TuiAppProps } from "./types.js";
import type { AgentTools, ChatMessage } from "./types.js";
import { appendSession } from "./session-logger.js";

type StaticItem =
  | { type: "header"; id: string; model: string }
  | { type: "message"; id: string; message: ChatMessage };

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
    submitHumanInput,
    humanInputRequest,
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
    if (status === "pending_input") {
      submitHumanInput(value);
    } else {
      sendPrompt(value);
    }
  };

  const staticItems: StaticItem[] = useMemo(() => {
    const items: StaticItem[] = [{ type: "header", id: "header", model }];
    for (const msg of messages) {
      items.push({ type: "message", id: msg.id, message: msg });
    }
    return items;
  }, [messages, model]);

  return (
    <>
      <Static items={staticItems}>
        {(item) => {
          if (item.type === "header") {
            return (
              <Box key={item.id} gap={2}>
                <Text bold>Deep Factor TUI</Text>
                <Text dimColor>Model: {item.model}</Text>
              </Box>
            );
          }
          return <MessageBubble key={item.id} message={item.message} />;
        }}
      </Static>
      <LiveSection
        status={status}
        error={error}
        plan={plan}
        humanInputRequest={humanInputRequest}
        usage={usage}
        iterations={iterations}
        onSubmit={handleSubmit}
      />
    </>
  );
}
