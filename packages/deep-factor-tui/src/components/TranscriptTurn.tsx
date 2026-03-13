import React from "react";
import { Box, Text } from "ink";
import type { TranscriptTurn as TranscriptTurnData } from "../types.js";
import { buildTranscriptRenderBlocks } from "../transcript.js";
import { TranscriptSegment } from "./TranscriptSegment.js";
import { colors } from "../theme.js";

interface TranscriptTurnProps {
  turn: TranscriptTurnData;
  isActiveTurn?: boolean;
  expandFileReadGroups?: boolean;
}

export function TranscriptTurn({
  turn,
  isActiveTurn = false,
  expandFileReadGroups = false,
}: TranscriptTurnProps) {
  const blocks = buildTranscriptRenderBlocks(turn.segments);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {turn.userMessage ? (
        <Box backgroundColor={colors.userMessageBg} width="100%">
          <Text bold>{">  "}</Text>
          <Text bold>{turn.userMessage.content}</Text>
        </Box>
      ) : (
        <Text dimColor>Earlier activity</Text>
      )}

      {blocks.length > 0 && (
        <Box flexDirection="column" marginTop={turn.userMessage ? 1 : 0}>
          {blocks.map((block) => (
            <TranscriptSegment
              key={block.id}
              block={block}
              expandFileReadGroups={isActiveTurn && expandFileReadGroups}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
