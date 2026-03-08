import type {
  TokenUsage,
  HumanInputRequestedEvent,
  DeepFactorAgentSettings,
  AgentMode,
} from "deep-factor-agent";

/** Extract tool array type from agent settings to avoid direct @langchain/core import */
export type AgentTools = NonNullable<DeepFactorAgentSettings["tools"]>;

export type AgentStatus = "idle" | "running" | "done" | "error" | "pending_input";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  durationMs?: number;
  parallelGroup?: string;
}

export interface UseAgentOptions {
  model: string;
  maxIter: number;
  tools?: AgentTools;
  parallelToolCalls?: boolean;
  mode?: AgentMode;
}

export interface UseAgentReturn {
  messages: ChatMessage[];
  status: AgentStatus;
  usage: TokenUsage;
  iterations: number;
  error: Error | null;
  plan: string | null;
  sendPrompt: (prompt: string) => void;
  submitHumanInput: (
    input: string | { decision?: "approve" | "reject" | "edit"; response?: string },
  ) => void;
  humanInputRequest: HumanInputRequestedEvent | null;
}

export interface TuiAppProps {
  prompt?: string;
  model: string;
  maxIter: number;
  sandbox: import("./tools/bash.js").SandboxMode;
  parallelToolCalls?: boolean;
  mode?: AgentMode;
}
