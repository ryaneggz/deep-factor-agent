import React from "react";
import { Box, Text } from "ink";

interface PlanBlockProps {
  content: string;
}

export function PlanBlock({ content }: PlanBlockProps) {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text color="cyan" bold>
        Plan
      </Text>
      {lines.map((line, index) => (
        <Text key={index}> {line}</Text>
      ))}
    </Box>
  );
}
