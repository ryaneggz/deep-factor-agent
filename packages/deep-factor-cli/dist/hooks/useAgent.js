import { useState, useCallback, useRef } from "react";
import { createDeepFactorAgent, requestHumanInput, TOOL_NAME_REQUEST_HUMAN_INPUT, maxIterations, isPendingResult, } from "deep-factor-agent";
export function eventsToChatMessages(events) {
    const messages = [];
    for (const event of events) {
        switch (event.type) {
            case "message":
                if (event.role === "user" || event.role === "assistant") {
                    messages.push({ role: event.role, content: event.content });
                }
                break;
            case "tool_call":
                messages.push({
                    role: "tool_call",
                    content: event.toolName,
                    toolName: event.toolName,
                    toolArgs: event.args,
                });
                break;
            case "tool_result":
                messages.push({
                    role: "tool_result",
                    content: String(event.result),
                });
                break;
        }
    }
    return messages;
}
export function useAgent(options) {
    const [messages, setMessages] = useState([]);
    const [status, setStatus] = useState("idle");
    const [usage, setUsage] = useState({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
    });
    const [iterations, setIterations] = useState(0);
    const [error, setError] = useState(null);
    const [humanInputRequest, setHumanInputRequest] = useState(null);
    const pendingRef = useRef(null);
    const handleResult = useCallback((result) => {
        const newMessages = eventsToChatMessages(result.thread.events);
        setMessages(newMessages);
        setUsage(result.usage);
        setIterations(result.iterations);
        if (isPendingResult(result)) {
            pendingRef.current = result;
            const req = result.thread.events
                .filter((e) => e.type === "human_input_requested")
                .pop() ?? null;
            setHumanInputRequest(req);
            setStatus("pending_input");
        }
        else if (result.stopReason === "max_errors") {
            const detail = result.stopDetail ?? "Agent stopped due to repeated errors";
            setError(new Error(detail));
            setStatus("error");
        }
        else {
            setStatus("done");
        }
    }, []);
    const handleError = useCallback((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus("error");
    }, []);
    const sendPrompt = useCallback((prompt) => {
        setStatus("running");
        setError(null);
        setHumanInputRequest(null);
        pendingRef.current = null;
        const tools = [
            ...(options.tools ?? []),
            requestHumanInput,
        ];
        const agent = createDeepFactorAgent({
            model: options.model,
            tools,
            stopWhen: [maxIterations(options.maxIter)],
            interruptOn: [TOOL_NAME_REQUEST_HUMAN_INPUT],
        });
        agent.loop(prompt).then(handleResult).catch(handleError);
    }, [options.model, options.maxIter, options.tools, handleResult, handleError]);
    const submitHumanInput = useCallback((response) => {
        const pending = pendingRef.current;
        if (!pending)
            return;
        setStatus("running");
        setHumanInputRequest(null);
        pendingRef.current = null;
        pending.resume(response).then(handleResult).catch(handleError);
    }, [handleResult, handleError]);
    return {
        messages,
        status,
        usage,
        iterations,
        error,
        sendPrompt,
        submitHumanInput,
        humanInputRequest,
    };
}
