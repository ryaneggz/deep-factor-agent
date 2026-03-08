// Types
export type {
  AgentEventType,
  BaseEvent,
  ToolCallEvent,
  ApprovalEvent,
  ToolResultEvent,
  ErrorEvent,
  HumanInputRequestedEvent,
  HumanInputReceivedEvent,
  MessageEvent,
  CompletionEvent,
  PlanEvent,
  SummaryEvent,
  AgentEvent,
  AgentThread,
  TokenUsage,
  AgentExecutionUpdate,
  StopConditionContext,
  StopConditionResult,
  StopCondition,
  VerifyContext,
  VerifyResult,
  VerifyCompletion,
  ContextManagementConfig,
  MiddlewareContext,
  AgentMiddleware,
  AgentToolMetadata,
  AgentMode,
  ApprovalDecision,
  HumanInputKind,
  DeepFactorAgentSettings,
  AgentResult,
  PlanResult,
  PendingResult,
  ResumeInput,
} from "./types.js";

export { isPendingResult, isPlanResult } from "./types.js";

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
  getToolMetadata,
} from "./tool-adapter.js";

// XML thread serializer
export { serializeThreadToXml, escapeXml } from "./xml-serializer.js";
export type { XmlSerializerOptions } from "./xml-serializer.js";

// Providers
export type { ModelAdapter, ModelInvocationUpdate } from "./providers/types.js";
export { isModelAdapter } from "./providers/types.js";
export { createClaudeCliProvider } from "./providers/claude-cli.js";
export type { ClaudeCliProviderOptions } from "./providers/claude-cli.js";
export { createCodexCliProvider } from "./providers/codex-cli.js";
export type { CodexCliProviderOptions } from "./providers/codex-cli.js";
export {
  createClaudeAgentSdkProvider,
  extractSystemPrompt,
  convertMessagesToPrompt,
  convertMessages,
  parseResponseText,
  parseToolUseBlocks,
  parseUsageMetadata,
  throwOnSdkError,
  parseSdkResponse,
  formatToolDefinitions,
} from "./providers/claude-agent-sdk.js";
export type {
  ClaudeAgentSdkProviderOptions,
  ConvertedMessages,
  SdkTextBlock,
  SdkToolUseBlock,
  SdkContentBlock,
  SdkUsage,
  SdkResponseMessage,
  SdkErrorType,
  SdkErrorResult,
} from "./providers/claude-agent-sdk.js";
