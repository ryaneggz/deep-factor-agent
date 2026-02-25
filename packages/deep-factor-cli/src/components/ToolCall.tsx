import React from "react";
import { Box, Text } from "ink";

interface ToolCallProps {
  toolName: string;
  args: Record<string, unknown>;
}

function truncateValues(
  obj: Record<string, unknown>,
  maxLen: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const str = typeof value === "string" ? value : JSON.stringify(value);
    result[key] = str.length > maxLen ? str.slice(0, maxLen) + "..." : value;
  }
  return result;
}

export function ToolCall({ toolName, args }: ToolCallProps) {
  const truncated = truncateValues(args, 120);
  const argsStr = JSON.stringify(truncated, null, 2);

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text>
        {"  Tool: "}
        <Text bold>{toolName}</Text>
      </Text>
      <Text dimColor>{"  Args: " + argsStr}</Text>
    </Box>
  );
}
