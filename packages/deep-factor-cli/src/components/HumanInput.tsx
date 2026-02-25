import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { HumanInputRequestedEvent } from "deep-factor-agent";

interface HumanInputProps {
  request: HumanInputRequestedEvent;
  onSubmit: (response: string) => void;
}

export function HumanInput({ request, onSubmit }: HumanInputProps) {
  const [input, setInput] = useState("");

  useInput((inputChar, key) => {
    if (key.return) {
      if (input.trim().length > 0) {
        onSubmit(input.trim());
        setInput("");
      }
      return;
    }
    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }
    if (!key.ctrl && !key.meta && inputChar) {
      setInput((prev) => prev + inputChar);
    }
  });

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
