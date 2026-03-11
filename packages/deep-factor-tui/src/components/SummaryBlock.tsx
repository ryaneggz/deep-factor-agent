import React from "react";
import { Box, Text } from "ink";

interface SummaryBlockProps {
  content: string;
  iterationRange?: string;
}

export function SummaryBlock({ content, iterationRange }: SummaryBlockProps) {
  const header = iterationRange
    ? `[Context summarized: iterations ${iterationRange}]`
    : "[Context summarized]";

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingLeft={1}
      paddingRight={1}
    >
      <Text dimColor>{header}</Text>
      <Text dimColor>{content}</Text>
    </Box>
  );
}
