import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
function truncateValues(obj, maxLen) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const str = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
        result[key] = str.length > maxLen ? str.slice(0, maxLen) + "..." : value;
    }
    return result;
}
export function ToolCall({ toolName, args }) {
    const truncated = truncateValues(args, 120);
    const argsStr = JSON.stringify(truncated, null, 2);
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [_jsxs(Text, { children: ["  Tool: ", _jsx(Text, { bold: true, children: toolName })] }), _jsx(Text, { dimColor: true, children: "  Args: " + argsStr })] }));
}
