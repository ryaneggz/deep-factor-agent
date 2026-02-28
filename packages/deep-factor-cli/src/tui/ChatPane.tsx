import React from "react";
import { Box, Text } from "ink";
import { useAgent } from "../hooks/useAgent.js";
import { Chat } from "../components/Chat.js";
import { Spinner } from "../components/Spinner.js";
import { StatusBar } from "../components/StatusBar.js";
import { HumanInput } from "../components/HumanInput.js";
import { PromptInput } from "../components/PromptInput.js";
import { bashTool } from "../tools/bash.js";
import type { AgentTools } from "../types.js";

interface ChatPaneProps {
  model: string;
  maxIter: number;
  enableBash: boolean;
}

export function ChatPane({ model, maxIter, enableBash }: ChatPaneProps) {
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
  } = useAgent({ model, maxIter, tools });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Chat messages={messages} verbose={true} />

      {status === "running" && <Spinner />}

      {status === "pending_input" && humanInputRequest && (
        <HumanInput request={humanInputRequest} onSubmit={submitHumanInput} />
      )}

      {error && (
        <Box>
          <Text color="red">Error: {error.message}</Text>
        </Box>
      )}

      <StatusBar usage={usage} iterations={iterations} status={status} />

      {(status === "idle" || status === "done") && <PromptInput onSubmit={sendPrompt} />}
    </Box>
  );
}
