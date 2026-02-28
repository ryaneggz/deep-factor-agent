// Mock agent hook and preset factories
export {
  useMockAgent,
  slowConversation,
  rapidBurst,
  mixedPressure,
  longRunning,
  errorRecovery,
  humanInputFlow,
  largePayload,
} from "./mock-agent.js";
export type { MockScenarioStep, MockAgentConfig } from "./mock-agent.js";

// Agent context for hook injection
export { AgentProvider, useAgentContext } from "./agent-context.js";

// MockApp test wrapper
export { MockApp } from "./MockApp.js";
