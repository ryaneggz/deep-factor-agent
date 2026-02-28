import type { UseAgentReturn } from "../types.js";
/** Provider to inject a UseAgentReturn value (real or mock) */
export declare const AgentProvider: import("react").Provider<UseAgentReturn | null>;
/**
 * Consume the injected agent state.
 * Returns null when no provider is present (production default).
 */
export declare function useAgentContext(): UseAgentReturn | null;
//# sourceMappingURL=agent-context.d.ts.map