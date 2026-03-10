import React from "react";
import { Box, Text } from "ink";
import type { TranscriptRenderBlock } from "../types.js";
import {
  formatFileChangeTotals,
  formatToolChangeSummary,
  formatToolLabel,
  formatToolResultPreview,
} from "../transcript.js";

interface TranscriptSegmentProps {
  block: TranscriptRenderBlock;
  expandFileReadGroups?: boolean;
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

function DiffLine({ line }: { line: string }) {
  let color: string | undefined;
  let dimColor = false;

  if (line.startsWith("@@")) {
    color = "cyan";
    dimColor = true;
  } else if (line.startsWith("+")) {
    color = "green";
  } else if (line.startsWith("-")) {
    color = "red";
  } else if (line.startsWith(" ")) {
    dimColor = true;
  }

  return (
    <Text color={color} dimColor={dimColor}>
      {line}
    </Text>
  );
}

function renderAssistantBlock(content: string, id: string) {
  const lines = content.split("\n");

  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Box key={`${id}-assistant-${index}`}>
          <Text>{index === 0 ? "• " : "  "}</Text>
          <Text>{line}</Text>
        </Box>
      ))}
    </Box>
  );
}

function renderToolBlock(block: Extract<TranscriptRenderBlock, { kind: "tool_block" }>) {
  const { segment } = block;
  const preview = segment.result
    ? formatToolResultPreview(segment.result, segment.toolDisplay)
    : null;
  const changeTotals = formatFileChangeTotals(segment.toolDisplay);

  return (
    <Box flexDirection="column">
      <Box>
        <Text>• </Text>
        <Text bold>{formatToolLabel(segment.toolName, segment.toolArgs, segment.toolDisplay)}</Text>
        <ToolMetadata durationMs={segment.durationMs} parallelGroup={segment.parallelGroup} />
      </Box>
      {changeTotals && (
        <Box>
          <Text dimColor> └ </Text>
          <Text>{changeTotals}</Text>
        </Box>
      )}
      {preview?.fileChanges?.map((change, index) => (
        <Box key={`${segment.id}-change-${index}`}>
          <Text dimColor>{index === 0 && !changeTotals ? "  └ " : "    "}</Text>
          <Text>{formatToolChangeSummary(change)}</Text>
        </Box>
      ))}
      {preview && (preview.fileOverflowCount ?? 0) > 0 && (
        <Box>
          <Text dimColor> ... +{preview.fileOverflowCount} files</Text>
        </Box>
      )}
      {preview?.diffPreviewLines?.map((line, index) => (
        <Box key={`${segment.id}-diff-${index}`}>
          <Text dimColor>{index === 0 ? "    " : "    "}</Text>
          <DiffLine line={line} />
        </Box>
      ))}
      {preview && (preview.diffOverflowLineCount ?? 0) > 0 && (
        <Box>
          <Text dimColor> ... +{preview.diffOverflowLineCount} lines</Text>
        </Box>
      )}
      {preview?.lines.map((line, index) => (
        <Box key={`${segment.id}-result-${index}`}>
          <Text dimColor>{index === 0 ? "  └ " : "    "}</Text>
          <Text>{line}</Text>
        </Box>
      ))}
      {preview && preview.overflowLineCount > 0 && (
        <Box>
          <Text dimColor> ... +{preview.overflowLineCount} lines</Text>
        </Box>
      )}
    </Box>
  );
}

function renderFileReadGroup(
  block: Extract<TranscriptRenderBlock, { kind: "file_read_group_block" }>,
  expandFileReadGroups: boolean,
) {
  const isExpanded = expandFileReadGroups && block.expandable;

  return (
    <Box flexDirection="column">
      <Box>
        <Text>• </Text>
        <Text bold>{block.header}</Text>
      </Box>
      {block.fileReads.map((fileRead, index) => (
        <Box key={`${block.id}-file-${index}`} flexDirection="column">
          <Box>
            <Text dimColor>{index === 0 ? "  └ " : "    "}</Text>
            <Text>{`Loaded ${fileRead.path}`}</Text>
          </Box>
          {isExpanded &&
            fileRead.detailLines?.map((line: string, lineIndex: number) => (
              <Box key={`${block.id}-detail-${index}-${lineIndex}`}>
                <Text dimColor> </Text>
                <Text>{line}</Text>
              </Box>
            ))}
          {isExpanded && (fileRead.overflowLineCount ?? 0) > 0 && (
            <Box>
              <Text dimColor> ... +{fileRead.overflowLineCount} lines</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

export function TranscriptSegment({ block, expandFileReadGroups = false }: TranscriptSegmentProps) {
  if (block.kind === "assistant_block") {
    return renderAssistantBlock(block.segment.content, block.segment.id);
  }

  if (block.kind === "file_read_group_block") {
    return renderFileReadGroup(block, expandFileReadGroups);
  }

  return renderToolBlock(block);
}
