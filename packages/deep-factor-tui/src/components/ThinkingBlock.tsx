import React from "react";
import { Box, Text } from "ink";

interface ThinkingBlockProps {
  content: string;
}

const MAX_PREVIEW_LINES = 3;

export function ThinkingBlock({ content }: ThinkingBlockProps) {
  const lines = content.split("\n");
  const previewLines = lines.slice(0, MAX_PREVIEW_LINES);
  const overflowCount = lines.length - previewLines.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingLeft={1}
      paddingRight={1}
    >
      <Text dimColor italic>
        [Thinking...]
      </Text>
      {previewLines.map((line, index) => (
        <Text key={index} dimColor italic>
          {line}
        </Text>
      ))}
      {overflowCount > 0 && (
        <Text dimColor italic>
          [+{overflowCount} more lines]
        </Text>
      )}
    </Box>
  );
}
