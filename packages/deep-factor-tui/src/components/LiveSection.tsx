import React, { useState, useCallback } from "react";
import { Box, Text } from "ink";
import { StatusLine } from "./StatusLine.js";
import { InputBar } from "./InputBar.js";
import { HotkeyMenu } from "./HotkeyMenu.js";
import { PendingInputPanel } from "./PendingInputPanel.js";
import type { TokenUsage } from "deep-factor-agent";
import type { AgentStatus, PendingSubmission, PendingUiState } from "../types.js";

interface LiveSectionProps {
  status: AgentStatus;
  error: Error | null;
  plan: string | null;
  pendingUiState: PendingUiState | null;
  usage: TokenUsage;
  iterations: number;
  onPromptSubmit: (value: string) => void;
  onPendingSubmit: (submission: PendingSubmission) => void;
}

export function LiveSection({
  status,
  error,
  plan,
  pendingUiState,
  usage,
  iterations,
  onPromptSubmit,
  onPendingSubmit,
}: LiveSectionProps) {
  const showInput = (status === "idle" || status === "done") && pendingUiState == null;
  const [showHotkeyMenu, setShowHotkeyMenu] = useState(false);

  const handleHotkeyMenu = useCallback(() => {
    setShowHotkeyMenu((prev) => !prev);
  }, []);

  const handleEscape = useCallback(() => {
    setShowHotkeyMenu(false);
  }, []);

  return (
    <Box flexDirection="column">
      {status === "running" && (
        <Text color="yellow" dimColor>
          Thinking...
        </Text>
      )}

      {status === "pending_input" && pendingUiState && (
        <PendingInputPanel
          pending={pendingUiState}
          onSubmit={onPendingSubmit}
          hotkeysVisible={showHotkeyMenu}
          onToggleHotkeys={handleHotkeyMenu}
          onCloseHotkeys={handleEscape}
        />
      )}

      {status === "done" && plan && (
        <Box flexDirection="column">
          <Text color="green" bold>
            Approved plan:
          </Text>
          <Text>{plan}</Text>
        </Box>
      )}

      {error && <Text color="red">Error: {error.message}</Text>}

      {showInput && showHotkeyMenu && <HotkeyMenu />}
      {showInput && (
        <InputBar
          onSubmit={onPromptSubmit}
          onHotkeyMenu={handleHotkeyMenu}
          onEscape={showHotkeyMenu ? handleEscape : undefined}
        />
      )}
      {!showInput && showHotkeyMenu && <HotkeyMenu />}
      <StatusLine usage={usage} iterations={iterations} status={status} />
    </Box>
  );
}
