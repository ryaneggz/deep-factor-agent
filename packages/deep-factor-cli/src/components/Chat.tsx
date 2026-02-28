import React from "react";
import { Static, Box, Text } from "ink";
import { ToolCall } from "./ToolCall.js";
import type { ChatMessage } from "../types.js";

interface ChatProps {
  messages: ChatMessage[];
  verbose: boolean;
}

export function Chat({ messages, verbose }: ChatProps) {
  if (messages.length === 0) return null;

  const visibleMessages = verbose
    ? messages
    : messages.filter((m) => m.role === "user" || m.role === "assistant");

  return (
    <Static items={visibleMessages.map((m, i) => ({ ...m, key: i }))}>
      {(item) => {
        switch (item.role) {
          case "user":
            return (
              <Box key={item.key}>
                <Text color="blue">{"> " + item.content}</Text>
              </Box>
            );
          case "assistant":
            return (
              <Box key={item.key}>
                <Text color="green">{item.content}</Text>
              </Box>
            );
          case "tool_call":
            return (
              <Box key={item.key}>
                <ToolCall toolName={item.toolName ?? "unknown"} args={item.toolArgs ?? {}} />
              </Box>
            );
          case "tool_result":
            return (
              <Box key={item.key}>
                <Text color="cyan">
                  {item.content.length > 200 ? item.content.slice(0, 200) + "..." : item.content}
                </Text>
              </Box>
            );
          default:
            return null;
        }
      }}
    </Static>
  );
}
