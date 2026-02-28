import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from "react";
import { Box, Text, useInput } from "ink";
export function PromptInput({ onSubmit }) {
    const [input, setInput] = useState("");
    const inputRef = useRef(input);
    useInput((inputChar, key) => {
        if (key.return) {
            const current = inputRef.current.trim();
            if (current.length > 0) {
                onSubmit(current);
                inputRef.current = "";
                setInput("");
            }
            return;
        }
        if (key.backspace || key.delete) {
            const next = inputRef.current.slice(0, -1);
            inputRef.current = next;
            setInput(next);
            return;
        }
        if (!key.ctrl && !key.meta && inputChar) {
            const next = inputRef.current + inputChar;
            inputRef.current = next;
            setInput(next);
        }
    });
    return (_jsxs(Box, { children: [_jsx(Text, { color: "blue", children: "> " }), _jsxs(Text, { children: [input, _jsx(Text, { dimColor: true, children: "_" })] })] }));
}
