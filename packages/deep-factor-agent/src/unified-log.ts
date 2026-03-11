import type { TokenUsage, AgentMode, ToolDisplayMetadata, ToolFileChangeSummary } from "./types.js";

// --- Unified Log Types ---

export type UnifiedLogType =
  | "init"
  | "message"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "file_change"
  | "error"
  | "approval"
  | "human_input_requested"
  | "human_input_received"
  | "plan"
  | "summary"
  | "status"
  | "rate_limit"
  | "completion"
  | "result";

export type ProviderType = "langchain" | "claude" | "codex";

export interface UnifiedLogBase {
  type: UnifiedLogType;
  sessionId: string;
  timestamp: number;
  sequence: number;
  providerMeta?: Record<string, unknown>;
}

export interface InitLog extends UnifiedLogBase {
  type: "init";
  provider: ProviderType;
  model: string;
  mode: AgentMode;
  cwd?: string;
  tools?: string[];
  settings?: Record<string, unknown>;
}

export interface MessageLog extends UnifiedLogBase {
  type: "message";
  role: "user" | "assistant" | "system";
  content: string;
  iteration: number;
}

export interface ThinkingLog extends UnifiedLogBase {
  type: "thinking";
  content: string;
  iteration: number;
}

export interface ToolCallLog extends UnifiedLogBase {
  type: "tool_call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  display?: ToolDisplayMetadata;
  parallelGroup?: string;
  iteration: number;
}

export interface ToolResultLog extends UnifiedLogBase {
  type: "tool_result";
  toolCallId: string;
  result: unknown;
  isError: boolean;
  display?: ToolDisplayMetadata;
  durationMs?: number;
  parallelGroup?: string;
  iteration: number;
}

export interface FileChangeLog extends UnifiedLogBase {
  type: "file_change";
  toolCallId?: string;
  changes: ToolFileChangeSummary[];
  iteration: number;
}

export interface ErrorLog extends UnifiedLogBase {
  type: "error";
  error: string;
  toolCallId?: string;
  recoverable: boolean;
  iteration?: number;
}

export interface ApprovalLog extends UnifiedLogBase {
  type: "approval";
  toolCallId: string;
  toolName: string;
  decision: "approve" | "reject" | "edit";
  response?: string;
  iteration: number;
}

export interface HumanInputRequestedLog extends UnifiedLogBase {
  type: "human_input_requested";
  kind?: "question" | "approval" | "plan_review";
  question: string;
  format?: "free_text" | "yes_no" | "multiple_choice";
  choices?: string[];
  iteration: number;
}

export interface HumanInputReceivedLog extends UnifiedLogBase {
  type: "human_input_received";
  response: string;
  decision?: "approve" | "reject" | "edit";
  iteration: number;
}

export interface PlanLog extends UnifiedLogBase {
  type: "plan";
  content: string;
  iteration: number;
}

export interface SummaryLog extends UnifiedLogBase {
  type: "summary";
  summarizedIterations: number[];
  summary: string;
  iteration: number;
}

export interface StatusLog extends UnifiedLogBase {
  type: "status";
  status: "running" | "pending_input" | "done" | "error";
  usage: TokenUsage;
  iterations: number;
  costUsd?: number;
}

export interface RateLimitLog extends UnifiedLogBase {
  type: "rate_limit";
  retryAfterMs?: number;
  message?: string;
}

export interface CompletionLog extends UnifiedLogBase {
  type: "completion";
  result: string;
  verified: boolean;
  iteration: number;
}

export interface ResultLog extends UnifiedLogBase {
  type: "result";
  content: string;
  stopReason: string;
  usage: TokenUsage;
  iterations: number;
  durationMs?: number;
  costUsd?: number;
}

export type UnifiedLogEntry =
  | InitLog
  | MessageLog
  | ThinkingLog
  | ToolCallLog
  | ToolResultLog
  | FileChangeLog
  | ErrorLog
  | ApprovalLog
  | HumanInputRequestedLog
  | HumanInputReceivedLog
  | PlanLog
  | SummaryLog
  | StatusLog
  | RateLimitLog
  | CompletionLog
  | ResultLog;

// --- Factory ---

let _sequenceCounter = 0;

export function resetSequence(value = 0): void {
  _sequenceCounter = value;
}

export function createLogEntry<T extends UnifiedLogType>(
  sessionId: string,
  type: T,
  fields: Omit<
    Extract<UnifiedLogEntry, { type: T }>,
    "type" | "sessionId" | "timestamp" | "sequence"
  >,
): Extract<UnifiedLogEntry, { type: T }> {
  return {
    type,
    sessionId,
    timestamp: Date.now(),
    sequence: _sequenceCounter++,
    ...fields,
  } as Extract<UnifiedLogEntry, { type: T }>;
}

// --- Parser ---

export function parseLogLine(line: string): UnifiedLogEntry {
  return JSON.parse(line) as UnifiedLogEntry;
}

export function parseLogLines(text: string): UnifiedLogEntry[] {
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => parseLogLine(line));
}

export function serializeLogEntry(entry: UnifiedLogEntry): string {
  return JSON.stringify(entry);
}
