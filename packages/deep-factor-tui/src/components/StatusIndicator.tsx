import React from "react";
import { Box, Text } from "ink";

interface StatusIndicatorProps {
  role: "rate_limit" | "error";
  content: string;
  retryAfterMs?: number;
  message?: string;
}

export function StatusIndicator({ role, content, retryAfterMs, message }: StatusIndicatorProps) {
  if (role === "rate_limit") {
    const displayMessage = message ?? content;
    return (
      <Box flexDirection="column">
        <Text color="yellow" bold>
          [Rate Limit]
        </Text>
        {displayMessage && <Text color="yellow">{displayMessage}</Text>}
        {retryAfterMs != null && (
          <Text color="yellow" dimColor>
            Retry after {Math.ceil(retryAfterMs / 1000)}s
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="red" bold>
        [Error]
      </Text>
      <Text color="red">{content}</Text>
    </Box>
  );
}
