import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useAgent } from "../hooks/useAgent.js";
import { Chat } from "../components/Chat.js";
import { Spinner } from "../components/Spinner.js";
import { StatusBar } from "../components/StatusBar.js";
import { HumanInput } from "../components/HumanInput.js";
import { PromptInput } from "../components/PromptInput.js";
import { bashTool } from "../tools/bash.js";
export function ChatPane({ model, maxIter, enableBash }) {
    const tools = enableBash ? [bashTool] : [];
    const { messages, status, usage, iterations, error, sendPrompt, submitHumanInput, humanInputRequest, } = useAgent({ model, maxIter, tools });
    return (_jsxs(Box, { flexDirection: "column", flexGrow: 1, children: [_jsx(Chat, { messages: messages, verbose: true }), status === "running" && _jsx(Spinner, {}), status === "pending_input" && humanInputRequest && (_jsx(HumanInput, { request: humanInputRequest, onSubmit: submitHumanInput })), error && (_jsx(Box, { children: _jsxs(Text, { color: "red", children: ["Error: ", error.message] }) })), _jsx(StatusBar, { usage: usage, iterations: iterations, status: status }), (status === "idle" || status === "done") && _jsx(PromptInput, { onSubmit: sendPrompt })] }));
}
