import React from "react";
import { Box, Text } from "ink";
import { MessageList } from "./MessageList.js";
import type { ChatMessage, AgentStatus } from "../types.js";
import type { HumanInputRequestedEvent } from "deep-factor-agent";

interface ContentProps {
  messages: ChatMessage[];
  status: AgentStatus;
  error: Error | null;
  humanInputRequest: HumanInputRequestedEvent | null;
}

export function Content({ messages, status, error, humanInputRequest }: ContentProps) {
  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <MessageList messages={messages} />

      {status === "running" && (
        <Text color="yellow" dimColor>
          Thinking...
        </Text>
      )}

      {status === "pending_input" && humanInputRequest && (
        <Box flexDirection="column">
          <Text color="magenta" bold>
            Agent requests input:
          </Text>
          <Text color="magenta">{humanInputRequest.question}</Text>
          {humanInputRequest.choices && humanInputRequest.choices.length > 0 && (
            <Box flexDirection="column" marginLeft={2}>
              {humanInputRequest.choices.map((choice, i) => (
                <Text key={i} dimColor>
                  {i + 1}. {choice}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}

      {error && <Text color="red">Error: {error.message}</Text>}
    </Box>
  );
}
