# Tool System

## Creating Tools

Use LangChain's `tool()` factory or the `createLangChainTool` helper.

### LangChain tool() Factory

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const getWeather = tool(async ({ city }) => `72°F and sunny in ${city}`, {
  name: "getWeather",
  description: "Get weather for a city",
  schema: z.object({ city: z.string() }),
});
```

### createLangChainTool Helper

Adds metadata support for mode-aware execution:

```typescript
import { createLangChainTool } from "deep-factor-agent";

const writeFile = createLangChainTool("write_file", {
  description: "Write content to a file",
  schema: z.object({
    path: z.string(),
    content: z.string(),
  }),
  execute: async ({ path, content }) => {
    // ... write file
    return "File written successfully";
  },
  metadata: {
    mutatesState: true,
    modeAvailability: {
      plan: false,
      approve: true,
      yolo: true,
    },
  },
});
```

### Rich Tool Results

Tools can return `ToolExecutionResult` for rich display metadata:

```typescript
const editFile = createLangChainTool("edit_file", {
  description: "Edit a file",
  schema: z.object({ path: z.string(), old: z.string(), new: z.string() }),
  executeRaw: async ({ path, old, new: newStr }) => ({
    result: "File edited",
    display: {
      kind: "file_edit" as const,
      label: `Edit ${path}`,
      primaryPath: path,
      fileChanges: [
        {
          filePath: path,
          changeType: "edited",
          additions: 5,
          deletions: 3,
          diff: "--- a/file\n+++ b/file\n@@ ...",
        },
      ],
    },
  }),
});
```

## Tool Metadata

```typescript
interface AgentToolMetadata {
  mutatesState?: boolean; // does this tool change external state?
  modeAvailability?: {
    plan?: boolean; // available in plan mode?
    approve?: boolean; // available in approve mode?
    yolo?: boolean; // available in yolo mode?
  };
}
```

When `mutatesState: true`:

- **Plan mode**: Tool is blocked, agent gets feedback to plan instead
- **Approve mode**: Tool execution pauses for user approval
- **Yolo mode**: Tool executes normally

## Tool Display

The agent automatically generates display metadata for tool calls and results:

**Auto-detected tool kinds:**

| Kind         | Matched Tools                           |
| ------------ | --------------------------------------- |
| `command`    | Bash, bash                              |
| `file_read`  | Read, View, read_file                   |
| `file_edit`  | Edit, MultiEdit, apply_patch, edit_file |
| `file_write` | Write, write_file                       |
| `generic`    | Everything else                         |

Display metadata includes:

- **Label**: Human-readable description (e.g., "Bash(ls -la)")
- **Primary path**: File path extracted from tool args
- **Preview lines**: Truncated result content
- **File changes**: Diff summaries with +/- line counts

## Tool Utilities

```typescript
import { toolArrayToMap, findToolByName, getToolMetadata } from "deep-factor-agent";

// Convert array to name → tool map
const toolMap = toolArrayToMap(tools);

// Find by name
const bashTool = findToolByName(tools, "bash");

// Get metadata
const meta = getToolMetadata(bashTool); // { mutatesState, modeAvailability }
```

## Parallel Tool Execution

Enable concurrent execution of independent tool calls:

```typescript
const agent = createDeepFactorAgent({
  model: "openai:gpt-4.1-mini",
  tools: [readFile, getWeather],
  parallelToolCalls: true,
});
```

When enabled:

- Independent tool calls execute via `Promise.all`
- Human-in-the-loop tools are excluded from parallel batches
- Each tool's `durationMs` is tracked independently
- Parallel calls share a `parallelGroup` ID in log entries

## Default TUI Tools

The TUI provides four built-in tools via `createDefaultTools(sandbox)`:

| Tool         | Schema                                                                                 | Notes                                       |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------------------------- |
| `bash`       | `{ command: string }`                                                                  | Sandbox-restricted, 30s timeout, 1MB buffer |
| `read_file`  | `{ file_path: string, offset?: number, limit?: number }`                               | Max 400 lines per read                      |
| `write_file` | `{ file_path: string, content: string }`                                               | Returns unified diff                        |
| `edit_file`  | `{ file_path: string, old_string: string, new_string: string, replace_all?: boolean }` | Returns unified diff                        |
