// Types
export type {
  AgentEventType,
  BaseEvent,
  ToolCallEvent,
  ToolResultEvent,
  ErrorEvent,
  HumanInputRequestedEvent,
  HumanInputReceivedEvent,
  MessageEvent,
  CompletionEvent,
  SummaryEvent,
  AgentEvent,
  AgentThread,
  TokenUsage,
  StopConditionContext,
  StopConditionResult,
  StopCondition,
  VerifyContext,
  VerifyResult,
  VerifyCompletion,
  ContextManagementConfig,
  MiddlewareContext,
  AgentMiddleware,
  DeepFactorAgentSettings,
  AgentResult,
  PendingResult,
} from "./types.js";

export { isPendingResult } from "./types.js";

// Stop conditions
export {
  maxIterations,
  maxTokens,
  maxInputTokens,
  maxOutputTokens,
  maxCost,
  calculateCost,
  MODEL_PRICING,
  evaluateStopConditions,
} from "./stop-conditions.js";

// Middleware
export {
  composeMiddleware,
  todoMiddleware,
  errorRecoveryMiddleware,
  TOOL_NAME_WRITE_TODOS,
} from "./middleware.js";

export type { ComposedMiddleware, ComposeMiddlewareOptions } from "./middleware.js";

// Context management
export { ContextManager, estimateTokens } from "./context-manager.js";

// Agent
export { DeepFactorAgent, addUsage } from "./agent.js";

// Factory
export { createDeepFactorAgent } from "./create-agent.js";

// Human-in-the-loop
export {
  requestHumanInput,
  requestHumanInputSchema,
  TOOL_NAME_REQUEST_HUMAN_INPUT,
} from "./human-in-the-loop.js";

// Tool adapter utilities
export {
  createLangChainTool,
  toolArrayToMap,
  findToolByName,
} from "./tool-adapter.js";

// XML thread serializer
export { serializeThreadToXml, escapeXml } from "./xml-serializer.js";
export type { XmlSerializerOptions } from "./xml-serializer.js";
