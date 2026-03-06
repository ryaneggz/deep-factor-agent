import type {
  TokenUsage,
  HumanInputRequestedEvent,
  DeepFactorAgentSettings,
  ModelAdapter,
} from "deep-factor-agent";

/** Extract tool array type from agent settings to avoid direct @langchain/core import */
export type AgentTools = NonNullable<DeepFactorAgentSettings["tools"]>;

export type AgentStatus = "idle" | "running" | "done" | "error" | "pending_input";

export type ProviderType = "langchain" | "claude-sdk";

export const DEFAULT_MODELS: Record<ProviderType, string> = {
  langchain: "openai:gpt-4.1-mini",
  "claude-sdk": "claude-sonnet-4-6",
};

export interface ChatMessage {
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  durationMs?: number;
  parallelGroup?: string;
}

export interface UseAgentOptions {
  model: string | ModelAdapter;
  maxIter: number;
  tools?: AgentTools;
  parallelToolCalls?: boolean;
}

export interface UseAgentReturn {
  messages: ChatMessage[];
  status: AgentStatus;
  usage: TokenUsage;
  iterations: number;
  error: Error | null;
  sendPrompt: (prompt: string) => void;
  submitHumanInput: (response: string) => void;
  humanInputRequest: HumanInputRequestedEvent | null;
  resetThread: () => void;
}

export interface TuiAppProps {
  prompt?: string;
  model: string;
  maxIter: number;
  enableBash: boolean;
  parallelToolCalls?: boolean;
  provider: ProviderType;
}
