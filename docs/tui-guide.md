# TUI User Guide

The `deepfactor` CLI provides an interactive terminal UI for running agents.

## Installation

```bash
pnpm -C packages/deep-factor-tui build
```

The build creates a `deepfactor` binary linked via the package bin field.

## Usage

```bash
# Interactive mode
deepfactor

# With initial prompt
deepfactor "Explain how React hooks work"

# Print mode (non-interactive, stdout output)
deepfactor -p "What is 2+2?"

# Pipe from stdin
cat PROMPT.md | deepfactor -p

# JSONL log output
deepfactor -p -o stream-json "What is 2+2?"

# Resume last session
deepfactor -r

# Specific provider and model
deepfactor --provider claude -m opus "Refactor this code"

# Local sandbox (allows file system access)
deepfactor -s local "Run system commands"
```

## CLI Flags

| Flag              | Short | Values                   | Default              | Description                |
| ----------------- | ----- | ------------------------ | -------------------- | -------------------------- |
| `--provider`      |       | langchain, claude, codex | langchain            | Model provider             |
| `--model`         | `-m`  | string                   | per-provider default | Model identifier           |
| `--max-iter`      | `-i`  | number                   | 10                   | Maximum loop iterations    |
| `--mode`          |       | plan, approve, yolo      | yolo                 | Execution mode             |
| `--sandbox`       | `-s`  | workspace, local, docker | workspace            | Bash tool sandbox level    |
| `--print`         | `-p`  |                          | false                | Non-interactive print mode |
| `--output-format` | `-o`  | text, stream-json        | text                 | Output format (print mode) |
| `--resume`        | `-r`  |                          | false                | Resume previous session    |

## Default Models

| Provider  | Default Model  |
| --------- | -------------- |
| langchain | `gpt-4.1-mini` |
| claude    | `sonnet`       |
| codex     | `gpt-5.4`      |

## Keyboard Shortcuts

| Shortcut    | Action                             |
| ----------- | ---------------------------------- |
| `Enter`     | Send message                       |
| `Alt+Enter` | New line (multi-line input)        |
| `Shift+Tab` | Cycle mode (plan → approve → yolo) |
| `Ctrl+/`    | Toggle hotkey menu                 |
| `Ctrl+O`    | Toggle expanded file read groups   |
| `Escape`    | Cancel current input / close menu  |

### Pending Input Shortcuts

When the agent requests approval or input:

| Shortcut | Context                | Action                      |
| -------- | ---------------------- | --------------------------- |
| `A`      | Plan review / Approval | Approve                     |
| `R`      | Plan review / Approval | Reject                      |
| `E`      | Plan review / Approval | Edit (switch to text input) |
| `Y`      | Yes/No question        | Yes                         |
| `N`      | Yes/No question        | No                          |
| `1-9`    | Multiple choice        | Select option               |

## Execution Modes

### Yolo Mode (default)

All tools execute without prompting. Best for trusted prompts and automated workflows.

### Approve Mode

Mutating tools (file writes, edits, bash) require explicit approval before execution. The TUI shows the tool name, arguments, and asks for A/R/E.

### Plan Mode

The agent generates a plan without executing any mutating tools. The plan is displayed for review. You can approve, reject, or edit the plan.

**Mode cycling:** Press `Shift+Tab` to cycle through modes during a session.

## Built-in Tools

| Tool         | Description                                                  | Mutates State |
| ------------ | ------------------------------------------------------------ | ------------- |
| `bash`       | Execute shell commands (sandbox-restricted)                  | Yes           |
| `read_file`  | Read file contents with optional line ranges (max 400 lines) | No            |
| `write_file` | Create or overwrite files (shows unified diff)               | Yes           |
| `edit_file`  | Replace text in files (oldString → newString, shows diff)    | Yes           |

## Sandbox Modes

| Mode        | Behavior                                           |
| ----------- | -------------------------------------------------- |
| `workspace` | Commands run in workspace directory only (default) |
| `local`     | Full local filesystem access                       |
| `docker`    | Docker container isolation (not yet implemented)   |

## Session Management

Sessions are saved automatically to `~/.deepfactor/sessions/` as JSONL files.

**Resume last session:**

```bash
deepfactor -r
```

The TUI loads the previous session's messages, provider, and model settings, then continues the conversation.

## Output Formats

### Text (default)

Plain text output to stdout. Used in print mode (`-p`).

### Stream JSON

JSONL unified log entries streamed in real-time. Each line is a complete JSON object following the [unified log format](./unified-log.md).

```bash
deepfactor -p -o stream-json "What is 2+2?" > session.jsonl
```

## Environment

The TUI loads environment variables from:

1. `~/.deepfactor/.env` (global)
2. `.env` (local, in current directory)

Required variables depend on the provider:

- **langchain**: `OPENAI_API_KEY` (or other provider keys)
- **claude**: `claude` CLI authenticated
- **codex**: `codex` CLI authenticated
