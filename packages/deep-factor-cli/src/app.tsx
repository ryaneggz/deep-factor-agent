import React, { useEffect, useRef } from "react";
import { Box, Text, useApp } from "ink";
import { useAgent } from "./hooks/useAgent.js";
import { Chat } from "./components/Chat.js";
import { Spinner } from "./components/Spinner.js";
import { HumanInput } from "./components/HumanInput.js";
import { StatusBar } from "./components/StatusBar.js";
import { PromptInput } from "./components/PromptInput.js";
import { bashTool } from "./tools/bash.js";
import type { AppProps } from "./types.js";
import type { AgentTools } from "./types.js";

export function App({
  prompt,
  model,
  maxIter,
  verbose,
  enableBash,
  interactive,
}: AppProps) {
  const { exit } = useApp();
  const hasRun = useRef(false);

  const tools: AgentTools = enableBash ? [bashTool] : [];

  const {
    messages,
    status,
    usage,
    iterations,
    error,
    sendPrompt,
    submitHumanInput,
    humanInputRequest,
  } = useAgent({ model, maxIter, tools, verbose });

  // Single-prompt mode: run on mount
  useEffect(() => {
    if (prompt && !hasRun.current) {
      hasRun.current = true;
      sendPrompt(prompt);
    }
  }, [prompt, sendPrompt]);

  // Single-prompt mode: exit when done or error
  useEffect(() => {
    if (!interactive && (status === "done" || status === "error")) {
      exit(status === "error" ? new Error(error?.message) : undefined);
    }
  }, [interactive, status, error, exit]);

  // Interactive mode: reset hasRun when done so PromptInput shows
  useEffect(() => {
    if (interactive && status === "done") {
      hasRun.current = false;
    }
  }, [interactive, status]);

  return (
    <Box flexDirection="column">
      <Chat messages={messages} verbose={verbose} />

      {status === "running" && <Spinner />}

      {status === "pending_input" && humanInputRequest && (
        <HumanInput request={humanInputRequest} onSubmit={submitHumanInput} />
      )}

      {error && <Text color="red">Error: {error.message}</Text>}

      <StatusBar usage={usage} iterations={iterations} status={status} />

      {interactive && (status === "idle" || status === "done") && (
        <PromptInput onSubmit={sendPrompt} />
      )}
    </Box>
  );
}
