import type { MockAgentConfig } from "./mock-agent.js";
interface MockAppProps {
    /** Pre-built mock config, OR use `scenario` shorthand */
    config?: MockAgentConfig;
    /** Shorthand: scenario name to use a preset factory */
    scenario?: "slow" | "burst" | "mixed" | "long" | "error" | "human" | "large";
    /** App props that still matter for rendering */
    verbose?: boolean;
    interactive?: boolean;
}
export declare function MockApp(props: MockAppProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=MockApp.d.ts.map