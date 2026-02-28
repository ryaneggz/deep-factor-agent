import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, useApp } from "ink";
import { SideBar } from "./SideBar.js";
import { ChatPane } from "./ChatPane.js";
import { SettingsPane } from "./SettingsPane.js";
const navItems = [
    { label: "Chat", value: "chat" },
    { label: "Settings", value: "settings" },
    { label: "Exit", value: "exit" },
];
export function TuiApp({ model: initialModel, maxIter, enableBash: initialEnableBash, }) {
    const { exit } = useApp();
    const [currentPane, setCurrentPane] = useState("chat");
    const [model, setModel] = useState(initialModel);
    const [enableBash, setEnableBash] = useState(initialEnableBash);
    const handleSelect = (item) => {
        if (item.value === "exit") {
            exit();
            return;
        }
        setCurrentPane(item.value);
    };
    return (_jsxs(Box, { flexDirection: "row", height: "100%", children: [_jsx(SideBar, { items: navItems, onSelect: handleSelect }), _jsxs(Box, { flexDirection: "column", flexGrow: 1, borderStyle: "single", paddingX: 1, children: [currentPane === "chat" && (_jsx(ChatPane, { model: model, maxIter: maxIter, enableBash: enableBash })), currentPane === "settings" && (_jsx(SettingsPane, { model: model, enableBash: enableBash, maxIter: maxIter, onModelChange: setModel, onBashToggle: () => setEnableBash((prev) => !prev) }))] })] }));
}
