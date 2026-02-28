import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTextInput } from "../hooks/useTextInput.js";
export function PromptInput({ onSubmit }) {
    const { input } = useTextInput({ onSubmit });
    return (_jsxs(Box, { children: [_jsx(Text, { color: "blue", children: "> " }), _jsxs(Text, { children: [input, _jsx(Text, { dimColor: true, children: "_" })] })] }));
}
