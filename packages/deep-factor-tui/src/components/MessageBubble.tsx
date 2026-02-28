import React from "react";
import { Box, Text } from "ink";
import { ToolCallBlock } from "./ToolCallBlock.js";
import type { ChatMessage } from "../types.js";

interface MessageBubbleProps {
  message: ChatMessage;
}

const MAX_TOOL_RESULT_LENGTH = 200;

export function MessageBubble({ message }: MessageBubbleProps) {
  switch (message.role) {
    case "user":
      return (
        <Box>
          <Text color="blue" bold>
            You:{" "}
          </Text>
          <Text>{message.content}</Text>
        </Box>
      );

    case "assistant":
      return (
        <Box>
          <Text color="green" bold>
            AI:{" "}
          </Text>
          <Text>{message.content}</Text>
        </Box>
      );

    case "tool_call":
      return (
        <ToolCallBlock toolName={message.toolName ?? message.content} toolArgs={message.toolArgs} />
      );

    case "tool_result": {
      const content =
        message.content.length > MAX_TOOL_RESULT_LENGTH
          ? message.content.slice(0, MAX_TOOL_RESULT_LENGTH) + "..."
          : message.content;
      const timing = message.durationMs != null ? ` (${message.durationMs}ms)` : "";
      const parallel = message.parallelGroup ? " [parallel]" : "";
      return (
        <Box>
          <Text color="cyan" dimColor>
            Result{timing}
            {parallel}: {content}
          </Text>
        </Box>
      );
    }
  }
}
