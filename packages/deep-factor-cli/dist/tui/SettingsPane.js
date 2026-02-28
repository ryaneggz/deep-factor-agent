import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from "react";
import { Box, Text, useInput } from "ink";
export function SettingsPane({ model, enableBash, maxIter, onModelChange, onBashToggle, }) {
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
    return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsx(Text, { bold: true, underline: true, children: "Settings" }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [editingModel ? (_jsxs(Box, { children: [_jsx(Text, { children: "Model: " }), _jsxs(Text, { children: [modelDraft, _jsx(Text, { dimColor: true, children: "_" })] })] })) : (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["Model: ", _jsx(Text, { bold: true, children: model })] }), _jsx(Text, { dimColor: true, children: " Press 'm' to change model" })] })), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsxs(Text, { children: ["Bash Tool:", " ", _jsx(Text, { bold: true, color: enableBash ? "green" : "red", children: enableBash ? "enabled" : "disabled" })] }), _jsx(Text, { dimColor: true, children: " Press 'b' to toggle" })] }), _jsx(Box, { marginTop: 1, children: _jsxs(Text, { children: ["Max Iterations: ", _jsx(Text, { bold: true, children: maxIter })] }) }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsx(Text, { dimColor: true, children: "Environment Files:" }), _jsx(Text, { dimColor: true, children: " ~/.deep-factor/.env (global)" }), _jsx(Text, { dimColor: true, children: " .env (local)" })] })] })] }));
}
