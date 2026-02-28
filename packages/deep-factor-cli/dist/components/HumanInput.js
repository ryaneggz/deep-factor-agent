import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
export function HumanInput({ request, onSubmit }) {
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
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { color: "magenta", bold: true, children: request.question }), request.choices && request.choices.length > 0 && (_jsx(Box, { flexDirection: "column", marginLeft: 2, children: request.choices.map((choice, i) => (_jsxs(Text, { children: [i + 1, ". ", choice] }, choice))) })), _jsxs(Text, { children: [_jsx(Text, { color: "cyan", children: "? " }), input, _jsx(Text, { dimColor: true, children: "_" })] })] }));
}
