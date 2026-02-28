import { jsx as _jsx } from "react/jsx-runtime";
import { Static, Box, Text } from "ink";
import { ToolCall } from "./ToolCall.js";
export function Chat({ messages, verbose }) {
    if (messages.length === 0)
        return null;
    const visibleMessages = verbose
        ? messages
        : messages.filter((m) => m.role === "user" || m.role === "assistant");
    return (_jsx(Static, { items: visibleMessages.map((m, i) => ({ ...m, key: i })), children: (item) => {
            switch (item.role) {
                case "user":
                    return (_jsx(Box, { children: _jsx(Text, { color: "blue", children: "> " + item.content }) }, item.key));
                case "assistant":
                    return (_jsx(Box, { children: _jsx(Text, { color: "green", children: item.content }) }, item.key));
                case "tool_call":
                    return (_jsx(Box, { children: _jsx(ToolCall, { toolName: item.toolName ?? "unknown", args: item.toolArgs ?? {} }) }, item.key));
                case "tool_result":
                    return (_jsx(Box, { children: _jsx(Text, { color: "cyan", children: item.content.length > 200 ? item.content.slice(0, 200) + "..." : item.content }) }, item.key));
                default:
                    return null;
            }
        } }));
}
