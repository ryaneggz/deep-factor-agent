import type { StructuredToolInterface } from "@langchain/core/tools";
import { DeepFactorAgent } from "./agent.js";
import type { DeepFactorAgentSettings } from "./types.js";
export declare function createDeepFactorAgent<TTools extends StructuredToolInterface[] = StructuredToolInterface[]>(settings: DeepFactorAgentSettings<TTools>): DeepFactorAgent<TTools>;
//# sourceMappingURL=create-agent.d.ts.map