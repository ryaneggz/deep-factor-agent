import type { TokenUsage } from "deep-factor-agent";
import type { AgentStatus } from "../types.js";
interface StatusBarProps {
    usage: TokenUsage;
    iterations: number;
    status: AgentStatus;
}
export declare function StatusBar({ usage, iterations, status }: StatusBarProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=StatusBar.d.ts.map