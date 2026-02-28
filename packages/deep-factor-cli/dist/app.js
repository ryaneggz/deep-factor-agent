import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { Box, Text, useApp } from "ink";
import { useAgent } from "./hooks/useAgent.js";
import { useAgentContext } from "./testing/agent-context.js";
import { Chat } from "./components/Chat.js";
import { Spinner } from "./components/Spinner.js";
import { HumanInput } from "./components/HumanInput.js";
import { StatusBar } from "./components/StatusBar.js";
import { PromptInput } from "./components/PromptInput.js";
import { bashTool } from "./tools/bash.js";
export function App({ prompt, model, maxIter, verbose, enableBash, interactive }) {
    const { exit } = useApp();
    const hasRun = useRef(false);
    const tools = enableBash ? [bashTool] : [];
    const agentFromContext = useAgentContext();
    const agentFromHook = useAgent({ model, maxIter, tools });
    const { messages, status, usage, iterations, error, sendPrompt, submitHumanInput, humanInputRequest, } = agentFromContext ?? agentFromHook;
    // Single-prompt mode: run on mount
    useEffect(() => {
        if (prompt && !hasRun.current) {
            hasRun.current = true;
            sendPrompt(prompt);
        }
    }, [prompt, sendPrompt]);
    // Single-prompt mode: exit when done or error
    useEffect(() => {
        if (!interactive && (status === "done" || status === "error")) {
            exit(status === "error" ? new Error(error?.message) : undefined);
        }
    }, [interactive, status, error, exit]);
    // Interactive mode: reset hasRun when done so PromptInput shows
    useEffect(() => {
        if (interactive && status === "done") {
            hasRun.current = false;
        }
    }, [interactive, status]);
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Chat, { messages: messages, verbose: verbose }), status === "running" && _jsx(Spinner, {}), status === "pending_input" && humanInputRequest && (_jsx(HumanInput, { request: humanInputRequest, onSubmit: submitHumanInput })), error && _jsxs(Text, { color: "red", children: ["Error: ", error.message] }), _jsx(StatusBar, { usage: usage, iterations: iterations, status: status }), interactive && (status === "idle" || status === "done") && (_jsx(PromptInput, { onSubmit: sendPrompt }))] }));
}
