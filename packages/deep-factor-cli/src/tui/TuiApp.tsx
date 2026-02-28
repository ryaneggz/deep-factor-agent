import React, { useState } from "react";
import { Box, useApp } from "ink";
import { SideBar } from "./SideBar.js";
import type { SideBarItem } from "./SideBar.js";
import { ChatPane } from "./ChatPane.js";
import { SettingsPane } from "./SettingsPane.js";

type PaneId = "chat" | "settings" | "exit";

interface TuiAppProps {
  model: string;
  maxIter: number;
  enableBash: boolean;
}

const navItems: Array<SideBarItem<PaneId>> = [
  { label: "Chat", value: "chat" },
  { label: "Settings", value: "settings" },
  { label: "Exit", value: "exit" },
];

export function TuiApp({
  model: initialModel,
  maxIter,
  enableBash: initialEnableBash,
}: TuiAppProps) {
  const { exit } = useApp();
  const [currentPane, setCurrentPane] = useState<PaneId>("chat");
  const [model, setModel] = useState(initialModel);
  const [enableBash, setEnableBash] = useState(initialEnableBash);

  const handleSelect = (item: SideBarItem<PaneId>) => {
    if (item.value === "exit") {
      exit();
      return;
    }
    setCurrentPane(item.value);
  };

  return (
    <Box flexDirection="row" height="100%">
      <SideBar items={navItems} onSelect={handleSelect} />
      <Box flexDirection="column" flexGrow={1} borderStyle="single" paddingX={1}>
        {currentPane === "chat" && (
          <ChatPane model={model} maxIter={maxIter} enableBash={enableBash} />
        )}
        {currentPane === "settings" && (
          <SettingsPane
            model={model}
            enableBash={enableBash}
            maxIter={maxIter}
            onModelChange={setModel}
            onBashToggle={() => setEnableBash((prev) => !prev)}
          />
        )}
      </Box>
    </Box>
  );
}
