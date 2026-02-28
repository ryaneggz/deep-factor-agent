import { jsx as _jsx } from "react/jsx-runtime";
import { App } from "../app.js";
import { AgentProvider } from "./agent-context.js";
import { useMockAgent, slowConversation, rapidBurst, mixedPressure, longRunning, errorRecovery, humanInputFlow, largePayload, } from "./mock-agent.js";
const presets = {
    slow: slowConversation,
    burst: rapidBurst,
    mixed: mixedPressure,
    long: longRunning,
    error: errorRecovery,
    human: humanInputFlow,
    large: largePayload,
};
function resolveConfig(props) {
    if (props.config)
        return props.config;
    const factory = presets[props.scenario ?? "mixed"];
    return factory();
}
export function MockApp(props) {
    const config = resolveConfig(props);
    const mockAgent = useMockAgent(config);
    return (_jsx(AgentProvider, { value: mockAgent, children: _jsx(App, { model: "mock-model", maxIter: 99, verbose: props.verbose ?? true, enableBash: false, interactive: props.interactive ?? true }) }));
}
