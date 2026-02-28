import React from "react";
import { App } from "../app.js";
import { AgentProvider } from "./agent-context.js";
import {
  useMockAgent,
  slowConversation,
  rapidBurst,
  mixedPressure,
  longRunning,
  errorRecovery,
  humanInputFlow,
  largePayload,
} from "./mock-agent.js";
import type { MockAgentConfig } from "./mock-agent.js";

const presets: Record<string, () => MockAgentConfig> = {
  slow: slowConversation,
  burst: rapidBurst,
  mixed: mixedPressure,
  long: longRunning,
  error: errorRecovery,
  human: humanInputFlow,
  large: largePayload,
};

interface MockAppProps {
  /** Pre-built mock config, OR use `scenario` shorthand */
  config?: MockAgentConfig;
  /** Shorthand: scenario name to use a preset factory */
  scenario?: "slow" | "burst" | "mixed" | "long" | "error" | "human" | "large";
  /** App props that still matter for rendering */
  verbose?: boolean;
  interactive?: boolean;
}

function resolveConfig(props: MockAppProps): MockAgentConfig {
  if (props.config) return props.config;
  const factory = presets[props.scenario ?? "mixed"];
  return factory();
}

export function MockApp(props: MockAppProps) {
  const config = resolveConfig(props);
  const mockAgent = useMockAgent(config);

  return (
    <AgentProvider value={mockAgent}>
      <App
        model="mock-model"
        maxIter={99}
        verbose={props.verbose ?? true}
        enableBash={false}
        interactive={props.interactive ?? true}
      />
    </AgentProvider>
  );
}
