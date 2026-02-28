import React, { useState, useRef } from "react";
import { Box, Text, useInput } from "ink";

interface SettingsPaneProps {
  model: string;
  enableBash: boolean;
  maxIter: number;
  onModelChange: (model: string) => void;
  onBashToggle: () => void;
}

export function SettingsPane({
  model,
  enableBash,
  maxIter,
  onModelChange,
  onBashToggle,
}: SettingsPaneProps) {
  const [editingModel, setEditingModel] = useState(false);
  const [modelDraft, setModelDraft] = useState(model);
  const modelDraftRef = useRef(model);

  useInput((input, key) => {
    if (editingModel) {
      if (key.return) {
        const trimmed = modelDraftRef.current.trim();
        if (trimmed) {
          onModelChange(trimmed);
        }
        setEditingModel(false);
        return;
      }
      if (key.escape) {
        setEditingModel(false);
        return;
      }
      if (key.backspace || key.delete) {
        const next = modelDraftRef.current.slice(0, -1);
        modelDraftRef.current = next;
        setModelDraft(next);
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        const next = modelDraftRef.current + input;
        modelDraftRef.current = next;
        setModelDraft(next);
      }
      return;
    }

    if (input === "b") {
      onBashToggle();
    }
    if (input === "m") {
      modelDraftRef.current = model;
      setModelDraft(model);
      setEditingModel(true);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>
        Settings
      </Text>

      <Box marginTop={1} flexDirection="column">
        {editingModel ? (
          <Box>
            <Text>Model: </Text>
            <Text>
              {modelDraft}
              <Text dimColor>_</Text>
            </Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Text>
              Model: <Text bold>{model}</Text>
            </Text>
            <Text dimColor>{" Press 'm' to change model"}</Text>
          </Box>
        )}

        <Box marginTop={1} flexDirection="column">
          <Text>
            Bash Tool:{" "}
            <Text bold color={enableBash ? "green" : "red"}>
              {enableBash ? "enabled" : "disabled"}
            </Text>
          </Text>
          <Text dimColor>{" Press 'b' to toggle"}</Text>
        </Box>

        <Box marginTop={1}>
          <Text>
            Max Iterations: <Text bold>{maxIter}</Text>
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Environment Files:</Text>
          <Text dimColor> ~/.deep-factor/.env (global)</Text>
          <Text dimColor> .env (local)</Text>
        </Box>
      </Box>
    </Box>
  );
}
