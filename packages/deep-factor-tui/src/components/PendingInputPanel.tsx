import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { InputBar } from "./InputBar.js";
import { formatToolArgsPreview } from "../transcript.js";
import type { PendingAction, PendingSubmission, PendingUiState } from "../types.js";

interface PendingInputPanelProps {
  pending: PendingUiState;
  onSubmit: (submission: PendingSubmission) => void;
  hotkeysVisible?: boolean;
  onToggleHotkeys?: () => void;
  onCloseHotkeys?: () => void;
  onToggleFileReadGroups?: () => void;
}

function getPanelColor(pending: PendingUiState): string {
  if (pending.kind === "plan_review") return "cyan";
  if (pending.kind === "approval") return "yellow";
  return pending.urgency === "high" ? "red" : "magenta";
}

function getQuestionHint(pending: Extract<PendingUiState, { kind: "question" }>): string {
  if (pending.format === "free_text") {
    return "Enter to submit | Alt+Enter for newline | Ctrl+/ for shortcuts";
  }
  if (pending.format === "yes_no") {
    return "Y/N to choose quickly | Enter submits typed text | Ctrl+/ for shortcuts";
  }
  if ((pending.choices?.length ?? 0) <= 9) {
    return "1-9 to choose quickly | Enter submits typed text | Ctrl+/ for shortcuts";
  }
  return "Enter submits typed choice | Alt+Enter for newline | Ctrl+/ for shortcuts";
}

function getActionLabel(action: PendingAction): string {
  if (action === "approve") return "[A] Approve";
  if (action === "reject") return "[R] Reject";
  return "[E] Edit";
}

export function PendingInputPanel({
  pending,
  onSubmit,
  hotkeysVisible = false,
  onToggleHotkeys,
  onCloseHotkeys,
  onToggleFileReadGroups,
}: PendingInputPanelProps) {
  const defaultMode =
    pending.kind === "plan_review" || pending.kind === "approval" ? "action" : "edit";
  const [prevPending, setPrevPending] = useState(pending);
  const [mode, setMode] = useState<"action" | "edit">(defaultMode);

  if (prevPending !== pending) {
    setPrevPending(pending);
    const nextMode =
      pending.kind === "plan_review" || pending.kind === "approval" ? "action" : "edit";
    if (nextMode !== mode) {
      setMode(nextMode);
    }
  }

  const panelColor = getPanelColor(pending);
  const isDecisionPanel = pending.kind === "plan_review" || pending.kind === "approval";

  useInput(
    (inputChar, key) => {
      if (hotkeysVisible) {
        if (key.escape) {
          onCloseHotkeys?.();
        }
        return;
      }
      if (inputChar === "\x1f") {
        onToggleHotkeys?.();
        return;
      }
      if (!isDecisionPanel || mode !== "action") {
        return;
      }
      const lower = inputChar.toLowerCase();
      if (lower === "a") {
        onSubmit({ kind: "approve" });
      } else if (lower === "r") {
        onSubmit({ kind: "reject" });
      } else if (lower === "e") {
        setMode("edit");
      }
    },
    { isActive: isDecisionPanel && mode === "action" },
  );

  const renderQuestionInput = () => {
    if (pending.kind !== "question") return null;

    return (
      <InputBar
        onSubmit={(value) => {
          const normalized = value.trim();
          if (pending.format === "free_text") {
            onSubmit({ kind: "text", value });
            return;
          }
          if (pending.format === "yes_no") {
            const lower = normalized.toLowerCase();
            if (lower === "y") {
              onSubmit({ kind: "choice", value: "yes" });
              return;
            }
            if (lower === "n") {
              onSubmit({ kind: "choice", value: "no" });
              return;
            }
            onSubmit({ kind: "choice", value: normalized });
            return;
          }
          onSubmit({ kind: "choice", value: normalized });
        }}
        isActive={!hotkeysVisible}
        onHotkeyMenu={onToggleHotkeys}
        onCtrlO={onToggleFileReadGroups}
        onEscape={hotkeysVisible ? onCloseHotkeys : undefined}
        onKeyPress={(inputChar, key, currentValue) => {
          if (key.ctrl || key.meta || currentValue.trim().length > 0) {
            return false;
          }
          const lower = inputChar.toLowerCase();
          if (pending.format === "yes_no") {
            if (lower === "y") {
              onSubmit({ kind: "choice", value: "yes" });
              return true;
            }
            if (lower === "n") {
              onSubmit({ kind: "choice", value: "no" });
              return true;
            }
          }
          if (
            pending.format === "multiple_choice" &&
            pending.choices &&
            pending.choices.length > 0 &&
            pending.choices.length <= 9 &&
            /^[1-9]$/.test(inputChar)
          ) {
            const index = Number(inputChar) - 1;
            if (pending.choices[index]) {
              onSubmit({ kind: "choice", value: pending.choices[index] });
              return true;
            }
          }
          return false;
        }}
        placeholder={
          pending.format === "free_text"
            ? "Type your response..."
            : pending.format === "yes_no"
              ? "Type yes/no or use Y/N..."
              : "Type an option or use the shortcuts..."
        }
        hint={getQuestionHint(pending)}
        borderColor={panelColor}
      />
    );
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={panelColor}
      paddingLeft={1}
      paddingRight={1}
    >
      <Box justifyContent="space-between">
        <Text color={panelColor} bold>
          {pending.title}
        </Text>
        {pending.kind === "question" && pending.urgency && (
          <Text color={pending.urgency === "high" ? "red" : panelColor}>
            {pending.urgency.toUpperCase()}
          </Text>
        )}
      </Box>

      <Text>{pending.question}</Text>

      {pending.kind === "plan_review" && (
        <Box
          marginTop={1}
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          paddingLeft={1}
          paddingRight={1}
        >
          <Text color="cyan" bold>
            Proposed Plan
          </Text>
          <Text>{pending.plan}</Text>
        </Box>
      )}

      {pending.kind === "approval" && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>
            Tool
          </Text>
          <Text>{pending.toolName}</Text>
          {pending.reason && (
            <>
              <Text color="yellow" bold>
                Reason
              </Text>
              <Text>{pending.reason}</Text>
            </>
          )}
          {pending.toolArgs && (
            <>
              <Text color="yellow" bold>
                Args
              </Text>
              <Text>{formatToolArgsPreview(pending.toolArgs) ?? "(none)"}</Text>
            </>
          )}
        </Box>
      )}

      {pending.kind === "question" && pending.context && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={panelColor} bold>
            Context
          </Text>
          <Text>{pending.context}</Text>
        </Box>
      )}

      {pending.kind === "question" && pending.choices && pending.choices.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={panelColor} bold>
            Options
          </Text>
          {pending.choices.map((choice, index) => (
            <Text key={`${choice}-${index}`}>
              {index < 9 ? `${index + 1}. ` : "- "}
              {choice}
            </Text>
          ))}
        </Box>
      )}

      {isDecisionPanel && mode === "action" && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={panelColor}>{pending.actions.map(getActionLabel).join("  ")}</Text>
          <Text dimColor>Choose an action directly from the keyboard.</Text>
        </Box>
      )}

      {isDecisionPanel && mode === "edit" && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={panelColor} bold>
            Revision Feedback
          </Text>
          <InputBar
            onSubmit={(value) => onSubmit({ kind: "edit", feedback: value })}
            isActive={!hotkeysVisible}
            onHotkeyMenu={onToggleHotkeys}
            onCtrlO={onToggleFileReadGroups}
            onEscape={hotkeysVisible ? onCloseHotkeys : () => setMode("action")}
            placeholder={
              pending.kind === "plan_review"
                ? "Describe the revision you want..."
                : "Explain what should change before proceeding..."
            }
            hint="Enter submits feedback | Alt+Enter for newline | Esc returns to actions | Ctrl+/ for shortcuts"
            borderColor={panelColor}
          />
        </Box>
      )}

      {pending.kind === "question" && (
        <Box flexDirection="column" marginTop={1}>
          {renderQuestionInput()}
        </Box>
      )}
    </Box>
  );
}
