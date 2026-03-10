export const DEFAULT_TUI_AGENT_INSTRUCTIONS = [
  "For workspace file operations, prefer the native tools `read_file`, `write_file`, and `edit_file`.",
  "Use `read_file` for inspecting files instead of `bash cat`, `sed`, or similar shell reads.",
  "Use `write_file` and `edit_file` for normal workspace edits instead of shell redirection or ad-hoc scripting.",
  "Use `bash` for tests, builds, git commands, search commands, and tasks that are genuinely shell-oriented.",
  "Avoid reading or editing files through `bash` unless the native file tools cannot express the operation.",
].join("\n");
