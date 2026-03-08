import React from "react";
import { Box, Text } from "ink";
import type { TranscriptSegment as TranscriptSegmentData } from "../types.js";
import { formatToolLabel, formatToolResultPreview } from "../transcript.js";

interface TranscriptSegmentProps {
  segment: TranscriptSegmentData;
}

function ToolMetadata({
  durationMs,
  parallelGroup,
}: {
  durationMs?: number;
  parallelGroup?: string;
}) {
  const parts: string[] = [];
  if (durationMs != null) {
    parts.push(`${durationMs}ms`);
  }
  if (parallelGroup) {
    parts.push("[parallel]");
  }

  if (parts.length === 0) {
    return null;
  }

  return <Text dimColor> {parts.join(" ")}</Text>;
}

export function TranscriptSegment({ segment }: TranscriptSegmentProps) {
  if (segment.kind === "assistant") {
    return (
      <Box>
        <Text dimColor>| </Text>
        <Text bold>- </Text>
        <Text>{segment.content}</Text>
      </Box>
    );
  }

  const preview = segment.result ? formatToolResultPreview(segment.result) : null;

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>| </Text>
        <Text bold>{formatToolLabel(segment.toolName, segment.toolArgs)}</Text>
        <ToolMetadata durationMs={segment.durationMs} parallelGroup={segment.parallelGroup} />
      </Box>
      {preview?.lines.map((line, index) => (
        <Box key={`${segment.id}-result-${index}`}>
          <Text dimColor>| </Text>
          <Text>{line}</Text>
        </Box>
      ))}
      {preview && preview.overflowLineCount > 0 && (
        <Box>
          <Text dimColor>| ... +{preview.overflowLineCount} more lines</Text>
        </Box>
      )}
    </Box>
  );
}
