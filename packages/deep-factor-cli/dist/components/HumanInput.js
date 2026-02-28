import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTextInput } from "../hooks/useTextInput.js";
export function HumanInput({ request, onSubmit }) {
    const { input } = useTextInput({ onSubmit });
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { color: "magenta", bold: true, children: request.question }), request.choices && request.choices.length > 0 && (_jsx(Box, { flexDirection: "column", marginLeft: 2, children: request.choices.map((choice, i) => (_jsxs(Text, { children: [i + 1, ". ", choice] }, choice))) })), _jsxs(Text, { children: [_jsx(Text, { color: "cyan", children: "? " }), input, _jsx(Text, { dimColor: true, children: "_" })] })] }));
}
