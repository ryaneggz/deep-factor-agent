import React from "react";
import { Box, Text } from "ink";
import { ToolCallBlock } from "./ToolCallBlock.js";
import { ThinkingBlock } from "./ThinkingBlock.js";
import { PlanBlock } from "./PlanBlock.js";
import { SummaryBlock } from "./SummaryBlock.js";
import { StatusIndicator } from "./StatusIndicator.js";
import { formatToolResultPreview } from "../transcript.js";
import type { ChatMessage } from "../types.js";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  switch (message.role) {
    case "user":
      return (
        <Box>
          <Text bold color="green">
            You:{" "}
          </Text>
          <Text color="green">{message.content}</Text>
        </Box>
      );

    case "assistant":
      return (
        <Box>
          <Text bold color="blue">
            AI:{" "}
          </Text>
          <Text>{message.content}</Text>
        </Box>
      );

    case "thinking":
      return <ThinkingBlock content={message.thinking ?? message.content} />;

    case "plan":
      return <PlanBlock content={message.planContent ?? message.content} />;

    case "summary":
      return <SummaryBlock content={message.content} />;

    case "rate_limit":
      return (
        <StatusIndicator
          role="rate_limit"
          content={message.content}
          retryAfterMs={message.rateLimitInfo?.retryAfterMs}
          message={message.rateLimitInfo?.message}
        />
      );

    case "error":
      return <StatusIndicator role="error" content={message.content} />;

    case "tool_call":
      return (
        <ToolCallBlock
          toolName={message.toolName ?? message.content}
          toolArgs={message.toolArgs}
          toolDisplay={message.toolDisplay}
        />
      );

    case "tool_result": {
      const preview = formatToolResultPreview(message.content, message.toolDisplay);
      const metadata = [
        message.durationMs != null ? `${message.durationMs}ms` : null,
        message.parallelGroup ? "[parallel]" : null,
      ]
        .filter(Boolean)
        .join(" ");
      return (
        <Box flexDirection="column">
          {preview.fileChanges?.map((change, index) => (
            <Box key={`${message.id}-change-${index}`}>
              <Text dimColor color="yellow">
                {index === 0 ? "Result" : "      "}
              </Text>
              <Text>{` ${change.change} ${change.path}`}</Text>
            </Box>
          ))}
          {preview.lines.map((line, index) => (
            <Box key={`${message.id}-${index}`}>
              <Text dimColor color="yellow">
                {index === 0 ? "Result" : "      "}
              </Text>
              <Text>
                {index === 0 && metadata ? ` ${metadata}: ` : index === 0 ? ": " : "  "}
                {line}
              </Text>
            </Box>
          ))}
          {preview.overflowLineCount > 0 && (
            <Text dimColor> ... +{preview.overflowLineCount} more lines</Text>
          )}
        </Box>
      );
    }
  }
}
