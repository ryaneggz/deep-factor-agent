import { useState, useRef, useEffect, useCallback } from "react";
// --- Hook ---
export function useMockAgent(config) {
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
    const stepIndexRef = useRef(0);
    const pausedRef = useRef(false);
    const timeoutsRef = useRef([]);
    const iterationsRef = useRef(0);
    useEffect(() => {
        return () => {
            timeoutsRef.current.forEach(clearTimeout);
        };
    }, []);
    const processStep = useCallback((step) => {
        switch (step.type) {
            case "message": {
                const msg = step.data;
                setMessages((prev) => [...prev, msg]);
                if (msg.role === "assistant") {
                    iterationsRef.current += 1;
                    setIterations(iterationsRef.current);
                }
                break;
            }
            case "tool_call": {
                const data = step.data;
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "tool_call",
                        content: data.toolName ?? data.content,
                        toolName: data.toolName ?? data.content,
                        toolArgs: data.toolArgs,
                    },
                ]);
                break;
            }
            case "tool_result": {
                const data = step.data;
                setMessages((prev) => [...prev, { role: "tool_result", content: data.content }]);
                break;
            }
            case "human_input": {
                const data = step.data;
                setStatus("pending_input");
                setHumanInputRequest({
                    type: "human_input_requested",
                    question: data.question,
                    choices: data.choices,
                    timestamp: Date.now(),
                    iteration: iterationsRef.current,
                });
                pausedRef.current = true;
                break;
            }
            case "error": {
                const data = step.data;
                setStatus("error");
                setError(new Error(data.message));
                break;
            }
            case "done": {
                setStatus("done");
                if (config.usage) {
                    setUsage((prev) => ({
                        inputTokens: config.usage?.inputTokens ?? prev.inputTokens,
                        outputTokens: config.usage?.outputTokens ?? prev.outputTokens,
                        totalTokens: config.usage?.totalTokens ?? prev.totalTokens,
                    }));
                }
                iterationsRef.current += 1;
                setIterations(iterationsRef.current);
                break;
            }
        }
    }, [config.usage]);
    const scheduleSteps = useCallback((fromIndex) => {
        const steps = config.scenario;
        let cumulativeDelay = 0;
        for (let i = fromIndex; i < steps.length; i++) {
            const step = steps[i];
            cumulativeDelay += step.delay;
            const handle = setTimeout(() => {
                stepIndexRef.current = i;
                processStep(step);
            }, cumulativeDelay);
            timeoutsRef.current.push(handle);
            // Stop scheduling past human_input or error — they pause the sequence
            if (step.type === "human_input" || step.type === "error") {
                break;
            }
        }
    }, [config.scenario, processStep]);
    const sendPrompt = useCallback((prompt) => {
        // Clear pending timeouts from previous run
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];
        setMessages((prev) => [...prev, { role: "user", content: prompt }]);
        setStatus("running");
        setError(null);
        setHumanInputRequest(null);
        stepIndexRef.current = 0;
        pausedRef.current = false;
        scheduleSteps(0);
    }, [scheduleSteps]);
    const submitHumanInput = useCallback((response) => {
        if (!pausedRef.current)
            return;
        pausedRef.current = false;
        setStatus("running");
        setHumanInputRequest(null);
        setMessages((prev) => [...prev, { role: "user", content: response }]);
        // Resume from next step after the human_input step
        scheduleSteps(stepIndexRef.current + 1);
    }, [scheduleSteps]);
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
// --- Preset Scenario Factories ---
export function slowConversation(delayMs = 1500) {
    return {
        scenario: [
            {
                type: "message",
                delay: 0,
                data: { role: "assistant", content: "Let me search for that..." },
            },
            {
                type: "tool_call",
                delay: delayMs,
                data: {
                    role: "tool_call",
                    content: "search",
                    toolName: "search",
                    toolArgs: { query: "test" },
                },
            },
            {
                type: "tool_result",
                delay: delayMs,
                data: { role: "tool_result", content: "Found 3 results" },
            },
            {
                type: "message",
                delay: delayMs,
                data: { role: "assistant", content: "Here are the results I found." },
            },
            {
                type: "done",
                delay: 100,
                data: {},
            },
        ],
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    };
}
export function rapidBurst(count = 50, delayMs = 10) {
    const steps = [];
    for (let i = 0; i < count; i++) {
        steps.push({
            type: "tool_call",
            delay: delayMs,
            data: {
                role: "tool_call",
                content: `tool_${i}`,
                toolName: `tool_${i}`,
                toolArgs: { index: i },
            },
        });
        steps.push({
            type: "tool_result",
            delay: delayMs,
            data: { role: "tool_result", content: `Result ${i}` },
        });
    }
    steps.push({
        type: "message",
        delay: delayMs,
        data: { role: "assistant", content: `Completed ${count} operations.` },
    });
    steps.push({
        type: "done",
        delay: 0,
        data: {},
    });
    return {
        scenario: steps,
        usage: { inputTokens: count * 10, outputTokens: count * 5, totalTokens: count * 15 },
    };
}
export function mixedPressure() {
    const steps = [];
    // Phase 1 (slow): 3 steps at 2000ms each
    steps.push({
        type: "tool_call",
        delay: 2000,
        data: {
            role: "tool_call",
            content: "analyze",
            toolName: "analyze",
            toolArgs: { target: "main" },
        },
    });
    steps.push({
        type: "tool_result",
        delay: 2000,
        data: { role: "tool_result", content: "Analysis complete" },
    });
    steps.push({
        type: "message",
        delay: 2000,
        data: {
            role: "assistant",
            content: "Analysis phase done. Running quick checks...",
        },
    });
    // Phase 2 (fast): 10 steps at 10ms each (5 tool_call/tool_result pairs)
    for (let i = 0; i < 5; i++) {
        steps.push({
            type: "tool_call",
            delay: 10,
            data: {
                role: "tool_call",
                content: `check_${i}`,
                toolName: `check_${i}`,
                toolArgs: {},
            },
        });
        steps.push({
            type: "tool_result",
            delay: 10,
            data: { role: "tool_result", content: `Check ${i} passed` },
        });
    }
    // Phase 3 (slow): 2 steps at 2000ms each
    steps.push({
        type: "message",
        delay: 2000,
        data: { role: "assistant", content: "All checks passed. Done." },
    });
    steps.push({
        type: "done",
        delay: 2000,
        data: {},
    });
    return {
        scenario: steps,
        usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
    };
}
export function longRunning(iterations = 20, delayMs = 500) {
    const steps = [];
    for (let i = 0; i < iterations; i++) {
        steps.push({
            type: "tool_call",
            delay: delayMs,
            data: {
                role: "tool_call",
                content: `task_${i}`,
                toolName: `task_${i}`,
                toolArgs: { iteration: i },
            },
        });
        steps.push({
            type: "tool_result",
            delay: delayMs,
            data: { role: "tool_result", content: `Task ${i} result` },
        });
        steps.push({
            type: "message",
            delay: delayMs,
            data: { role: "assistant", content: `Iteration ${i + 1} complete` },
        });
    }
    steps.push({
        type: "done",
        delay: 0,
        data: {},
    });
    return {
        scenario: steps,
        usage: {
            inputTokens: iterations * 50,
            outputTokens: iterations * 25,
            totalTokens: iterations * 75,
        },
    };
}
export function errorRecovery() {
    return {
        scenario: [
            {
                type: "tool_call",
                delay: 500,
                data: {
                    role: "tool_call",
                    content: "api_call",
                    toolName: "api_call",
                    toolArgs: { endpoint: "/data" },
                },
            },
            {
                type: "tool_result",
                delay: 500,
                data: { role: "tool_result", content: "Connecting..." },
            },
            {
                type: "error",
                delay: 1000,
                data: { message: "API timeout" },
            },
        ],
    };
}
export function humanInputFlow() {
    return {
        scenario: [
            {
                type: "tool_call",
                delay: 500,
                data: {
                    role: "tool_call",
                    content: "gather_options",
                    toolName: "gather_options",
                    toolArgs: {},
                },
            },
            {
                type: "tool_result",
                delay: 500,
                data: { role: "tool_result", content: "Options gathered" },
            },
            {
                type: "human_input",
                delay: 500,
                data: { question: "Pick one", choices: ["Option A", "Option B"] },
            },
            {
                type: "message",
                delay: 500,
                data: { role: "assistant", content: "You chose an option. Proceeding..." },
            },
            {
                type: "done",
                delay: 100,
                data: {},
            },
        ],
        usage: { inputTokens: 80, outputTokens: 40, totalTokens: 120 },
    };
}
export function largePayload(charCount = 5000) {
    return {
        scenario: [
            {
                type: "message",
                delay: 100,
                data: { role: "assistant", content: "A".repeat(charCount) },
            },
            {
                type: "done",
                delay: 0,
                data: {},
            },
        ],
        usage: {
            inputTokens: 50,
            outputTokens: Math.ceil(charCount / 4),
            totalTokens: 50 + Math.ceil(charCount / 4),
        },
    };
}
