import React from "react";
import { Box } from "ink";
import { MessageBubble } from "./MessageBubble.js";
import type { ChatMessage } from "../types.js";

interface MessageListProps {
  messages: ChatMessage[];
  maxVisible?: number;
}

export function MessageList({ messages, maxVisible = 50 }: MessageListProps) {
  const visible = messages.slice(-maxVisible);

  return (
    <Box flexDirection="column" gap={0}>
      {visible.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}
    </Box>
  );
}
