import { z } from "zod";
import { createLangChainTool } from "deep-factor-agent";
import { buildReadFileResult, readWorkspaceFile } from "./file-utils.js";

const readFileSchema = z.object({
  path: z.string().describe("Workspace-relative or absolute path to the file to read"),
  startLine: z.number().int().positive().optional(),
  lineCount: z.number().int().positive().max(400).optional(),
});

export function createReadFileTool() {
  return createLangChainTool("read_file", {
    description:
      "Read a workspace file. Prefer this over bash cat/sed for normal file inspection tasks.",
    schema: readFileSchema,
    metadata: { mutatesState: false },
    execute: async ({ path, startLine, lineCount }) => {
      const content = readWorkspaceFile(path);
      return buildReadFileResult({ path, content, startLine, lineCount });
    },
  });
}
