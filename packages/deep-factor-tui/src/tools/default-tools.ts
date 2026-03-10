import type { AgentTools } from "../types.js";
import { createBashTool } from "./bash.js";
import { createReadFileTool } from "./read-file.js";
import { createWriteFileTool } from "./write-file.js";
import { createEditFileTool } from "./edit-file.js";

export function createDefaultTools(sandbox: Parameters<typeof createBashTool>[0]): AgentTools {
  return [
    createBashTool(sandbox),
    createReadFileTool(),
    createWriteFileTool(),
    createEditFileTool(),
  ] as AgentTools;
}
