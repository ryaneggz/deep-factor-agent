import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { TokenUsage } from "../types.js";

export interface ModelInvocationToolCall {
  name: string;
  id: string;
  args: Record<string, unknown>;
}

export type ModelInvocationUpdate =
  | {
      type: "tool_call";
      toolCall: ModelInvocationToolCall;
    }
  | {
      type: "assistant_message";
      content: string;
    }
  | {
      type: "usage";
      usage: TokenUsage;
      rawStopReason?: string;
    }
  | {
      type: "error";
      error: string;
      rawStopReason?: string;
    }
  | {
      type: "final";
      content?: string;
      usage?: TokenUsage;
      rawStopReason?: string;
    };

/**
 * Lightweight model adapter interface matching the two methods the agent loop
 * actually uses: `invoke()` and `bindTools()`. This avoids requiring the full
 * `BaseChatModel` abstract class for CLI-based providers that shell out to
 * external processes.
 */
export interface ModelAdapter {
  invoke(messages: BaseMessage[]): Promise<AIMessage>;
  invokeWithUpdates?(
    messages: BaseMessage[],
    onUpdate: (update: ModelInvocationUpdate) => void,
  ): Promise<AIMessage>;
  bindTools?(tools: StructuredToolInterface[]): ModelAdapter;
}

/**
 * Type guard distinguishing `ModelAdapter` from `BaseChatModel`.
 *
 * `BaseChatModel` always has the abstract `_generate` method; `ModelAdapter`
 * never does. This is a reliable discriminator that avoids false positives
 * from duck-typing `invoke` alone (which both types share).
 */
export function isModelAdapter(obj: unknown): obj is ModelAdapter {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "invoke" in obj &&
    typeof (obj as ModelAdapter).invoke === "function" &&
    !("_generate" in obj)
  );
}
