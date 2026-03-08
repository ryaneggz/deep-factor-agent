import React, { useState, useCallback } from "react";
import { Box, Text } from "ink";
import { StatusLine } from "./StatusLine.js";
import { InputBar } from "./InputBar.js";
import { HotkeyMenu } from "./HotkeyMenu.js";
import type { TokenUsage, HumanInputRequestedEvent } from "deep-factor-agent";
import type { AgentStatus } from "../types.js";

interface LiveSectionProps {
  status: AgentStatus;
  error: Error | null;
  plan: string | null;
  humanInputRequest: HumanInputRequestedEvent | null;
  usage: TokenUsage;
  iterations: number;
  onSubmit: (value: string) => void;
}

export function LiveSection({
  status,
  error,
  plan,
  humanInputRequest,
  usage,
  iterations,
  onSubmit,
}: LiveSectionProps) {
  const showInput = status === "idle" || status === "done" || status === "pending_input";
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

      {status === "pending_input" && humanInputRequest?.kind === "plan_review" && plan && (
        <Box flexDirection="column">
          <Text color="cyan" bold>
            Proposed plan:
          </Text>
          <Text>{plan}</Text>
          <Text color="magenta" bold>
            {"\n"}Review:
          </Text>
          <Text color="magenta">
            Type &quot;approve&quot; to accept, &quot;reject&quot; to cancel, or provide feedback to
            revise.
          </Text>
        </Box>
      )}

      {status === "pending_input" &&
        humanInputRequest &&
        humanInputRequest.kind !== "plan_review" && (
          <Box flexDirection="column">
            <Text color="magenta" bold>
              {humanInputRequest.kind === "approval"
                ? "Approval required:"
                : "Agent requests input:"}
            </Text>
            <Text color="magenta">{humanInputRequest.question}</Text>
            {humanInputRequest.choices && humanInputRequest.choices.length > 0 && (
              <Box flexDirection="column" marginLeft={2}>
                {humanInputRequest.choices.map((choice, i) => (
                  <Text key={i} dimColor>
                    {i + 1}. {choice}
                  </Text>
                ))}
              </Box>
            )}
          </Box>
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
          onSubmit={onSubmit}
          onHotkeyMenu={handleHotkeyMenu}
          onEscape={showHotkeyMenu ? handleEscape : undefined}
        />
      )}
      <StatusLine usage={usage} iterations={iterations} status={status} />
    </Box>
  );
}
