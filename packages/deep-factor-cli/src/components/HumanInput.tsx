import React from "react";
import { Box, Text } from "ink";
import type { HumanInputRequestedEvent } from "deep-factor-agent";
import { useTextInput } from "../hooks/useTextInput.js";

interface HumanInputProps {
  request: HumanInputRequestedEvent;
  onSubmit: (response: string) => void;
}

export function HumanInput({ request, onSubmit }: HumanInputProps) {
  const { input } = useTextInput({ onSubmit });

  return (
    <Box flexDirection="column">
      <Text color="magenta" bold>
        {request.question}
      </Text>
      {request.choices && request.choices.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {request.choices.map((choice, i) => (
            <Text key={choice}>
              {i + 1}. {choice}
            </Text>
          ))}
        </Box>
      )}
      <Text>
        <Text color="cyan">{"? "}</Text>
        {input}
        <Text dimColor>_</Text>
      </Text>
    </Box>
  );
}
