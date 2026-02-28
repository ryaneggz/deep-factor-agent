import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
function fmt(n) {
    return n.toLocaleString("en-US");
}
const STATUS_COLORS = {
    idle: "gray",
    running: "yellow",
    done: "green",
    error: "red",
    pending_input: "cyan",
};
export function StatusBar({ usage, iterations, status }) {
    const color = STATUS_COLORS[status];
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { dimColor: true, children: "─".repeat(process.stdout.columns || 50) }), _jsxs(Text, { children: ["Tokens: ", fmt(usage.inputTokens), " in / ", fmt(usage.outputTokens), " out (", fmt(usage.totalTokens), " total) | Iterations: ", iterations, " | Status: ", _jsx(Text, { color: color, children: status })] })] }));
}
