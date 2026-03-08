import React from "react";
import { Box, Text } from "ink";
import type { TranscriptTurn as TranscriptTurnData } from "../types.js";
import { TranscriptSegment } from "./TranscriptSegment.js";

interface TranscriptTurnProps {
  turn: TranscriptTurnData;
}

export function TranscriptTurn({ turn }: TranscriptTurnProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {turn.userMessage ? (
        <Box>
          <Text bold>You</Text>
          <Text>: {turn.userMessage.content}</Text>
        </Box>
      ) : (
        <Text dimColor>Earlier activity</Text>
      )}

      {turn.segments.length > 0 && (
        <Box flexDirection="column" marginTop={turn.userMessage ? 1 : 0}>
          {turn.segments.map((segment) => (
            <TranscriptSegment key={segment.id} segment={segment} />
          ))}
        </Box>
      )}
    </Box>
  );
}
