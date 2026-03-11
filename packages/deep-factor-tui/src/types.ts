import type {
  TokenUsage,
  DeepFactorAgentSettings,
  AgentMode,
  AgentThread,
  ToolDisplayMetadata,
  ToolFileReadSummary,
} from "deep-factor-agent";

/** Extract tool array type from agent settings to avoid direct @langchain/core import */
export type AgentTools = NonNullable<DeepFactorAgentSettings["tools"]>;

export type AgentStatus = "idle" | "running" | "done" | "error" | "pending_input";
export type ProviderType = "langchain" | "claude" | "codex";
export type LegacyProviderType = "claude-sdk";
export type ProviderInput = ProviderType | LegacyProviderType;

export const DEFAULT_PROVIDER: ProviderType = "langchain";

export const DEFAULT_MODELS: Record<ProviderType, string> = {
  langchain: "gpt-4.1-mini",
  claude: "sonnet",
  codex: "gpt-5.4",
};

export function isProviderType(value: string): value is ProviderType {
  return value === "langchain" || value === "claude" || value === "codex";
}

export function normalizeProvider(value: string | undefined): ProviderType | undefined {
  if (!value) return undefined;
  if (value === "langchain") return "langchain";
  if (value === "claude" || value === "claude-sdk") return "claude";
  if (value === "codex") return "codex";
  return undefined;
}

/** Roles supported by ChatMessage — original 4 plus unified log event types. */
export type ChatMessageRole =
  | "user"
  | "assistant"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "plan"
  | "summary"
  | "status"
  | "error"
  | "rate_limit"
  | "file_change"
  | "approval"
  | "human_input"
  | "completion";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolCallId?: string;
  durationMs?: number;
  parallelGroup?: string;
  toolDisplay?: ToolDisplayMetadata;
  /** Extended thinking content (role === 'thinking') */
  thinking?: string;
  /** Plan content (role === 'plan') */
  planContent?: string;
  /** Status metadata (role === 'status') */
  statusInfo?: { status: string; usage?: Record<string, unknown>; iterations?: number };
  /** Rate limit metadata (role === 'rate_limit') */
  rateLimitInfo?: { retryAfterMs?: number; message?: string };
}

export type TranscriptSegment =
  | { kind: "assistant"; id: string; content: string }
  | { kind: "thinking"; id: string; content: string }
  | {
      kind: "tool";
      id: string;
      toolName: string;
      toolArgs?: Record<string, unknown>;
      toolCallId?: string;
      result?: string;
      durationMs?: number;
      parallelGroup?: string;
      toolDisplay?: ToolDisplayMetadata;
    };

export type AssistantTranscriptSegment = Extract<TranscriptSegment, { kind: "assistant" }>;
export type ThinkingTranscriptSegment = Extract<TranscriptSegment, { kind: "thinking" }>;
export type ToolTranscriptSegment = Extract<TranscriptSegment, { kind: "tool" }>;

export type TranscriptRenderBlock =
  | { kind: "assistant_block"; id: string; segment: AssistantTranscriptSegment }
  | { kind: "thinking_block"; id: string; segment: ThinkingTranscriptSegment }
  | { kind: "tool_block"; id: string; segment: ToolTranscriptSegment }
  | {
      kind: "file_read_group_block";
      id: string;
      segments: ToolTranscriptSegment[];
      fileReads: ToolFileReadSummary[];
      header: string;
      expandable: boolean;
    };

export interface TranscriptTurn {
  id: string;
  userMessage?: ChatMessage;
  segments: TranscriptSegment[];
  isCarryover?: boolean;
}

export interface UseAgentOptions {
  model: DeepFactorAgentSettings["model"];
  modelLabel: string;
  maxIter: number;
  tools?: AgentTools;
  parallelToolCalls?: boolean;
  mode?: AgentMode;
  provider: ProviderType;
  initialMessages?: ChatMessage[];
  initialThread?: AgentThread;
}

export type PendingAction = "approve" | "reject" | "edit";

export type PendingUiState =
  | {
      kind: "plan_review";
      title: string;
      question: string;
      plan: string;
      actions: PendingAction[];
    }
  | {
      kind: "approval";
      title: string;
      question: string;
      toolName: string;
      toolArgs?: Record<string, unknown>;
      reason?: string;
      actions: PendingAction[];
    }
  | {
      kind: "question";
      title: string;
      question: string;
      context?: string;
      urgency?: "low" | "medium" | "high";
      format: "free_text" | "yes_no" | "multiple_choice";
      choices?: string[];
    };

export type PendingSubmission =
  | { kind: "approve" }
  | { kind: "reject" }
  | { kind: "edit"; feedback: string }
  | { kind: "text"; value: string }
  | { kind: "choice"; value: string };

export interface UseAgentReturn {
  messages: ChatMessage[];
  status: AgentStatus;
  usage: TokenUsage;
  iterations: number;
  error: Error | null;
  plan: string | null;
  sendPrompt: (prompt: string) => void;
  submitPendingInput: (submission: PendingSubmission) => void;
  pendingUiState: PendingUiState | null;
}

export interface TuiAppProps {
  prompt?: string;
  provider: ProviderType;
  model: string;
  maxIter: number;
  sandbox: import("./tools/bash.js").SandboxMode;
  parallelToolCalls?: boolean;
  mode?: AgentMode;
  resumeMessages?: ChatMessage[];
  resumeThread?: AgentThread;
}
