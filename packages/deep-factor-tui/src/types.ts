import type {
  TokenUsage,
  HumanInputRequestedEvent,
  DeepFactorAgentSettings,
} from "deep-factor-agent";

/** Extract tool array type from agent settings to avoid direct @langchain/core import */
export type AgentTools = NonNullable<DeepFactorAgentSettings["tools"]>;

export type AgentStatus = "idle" | "running" | "done" | "error" | "pending_input";

export interface ChatMessage {
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}

export interface UseAgentOptions {
  model: string;
  maxIter: number;
  tools?: AgentTools;
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
}

export interface TuiAppProps {
  prompt?: string;
  model: string;
  maxIter: number;
  enableBash: boolean;
}
