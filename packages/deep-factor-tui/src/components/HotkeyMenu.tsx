import React from "react";
import { Box, Text } from "ink";

const shortcuts = [
  { keys: "Alt+Enter", description: "Insert newline" },
  { keys: "Enter", description: "Submit message" },
  { keys: "Shift+Tab", description: "Cycle mode" },
  { keys: "Ctrl+/", description: "Show shortcuts" },
  { keys: "Esc", description: "Dismiss menu" },
  { keys: "Backspace", description: "Delete character" },
];

export function HotkeyMenu() {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingLeft={1}
      paddingRight={1}
    >
      <Text color="cyan" bold>
        Keyboard Shortcuts
      </Text>
      <Text> </Text>
      {shortcuts.map(({ keys, description }) => (
        <Box key={keys}>
          <Text color="yellow" bold>
            {keys.padEnd(12)}
          </Text>
          <Text> {description}</Text>
        </Box>
      ))}
      <Text> </Text>
      <Text dimColor>Press Esc to close</Text>
    </Box>
  );
}
