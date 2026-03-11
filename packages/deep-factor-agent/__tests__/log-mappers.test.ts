import { describe, expect, it } from "vitest";
import { mapClaudeEvent } from "../src/log-mappers/claude-mapper.js";
import { mapCodexEvent } from "../src/log-mappers/codex-mapper.js";
import { mapLangchainEvent, mapAgentEvent } from "../src/log-mappers/langchain-mapper.js";
import { replayLog, logToThread, logToChatMessages } from "../src/log-mappers/replay.js";
import type { MapperContext } from "../src/log-mappers/types.js";
import type { UnifiedLogEntry } from "../src/unified-log.js";

function createCtx(overrides?: Partial<MapperContext>): MapperContext {
  return {
    sessionId: "test-session",
    sequence: 0,
    currentIteration: 1,
    provider: "langchain",
    model: "test-model",
    mode: "yolo",
    ...overrides,
  };
}

describe("claude-mapper", () => {
  it("maps system init to init entry", () => {
    const ctx = createCtx({ provider: "claude" });
    const entries = mapClaudeEvent(
      {
        type: "system",
        subtype: "init",
        cwd: "/home/user/project",
        tools: ["Bash", "Read"],
        model: "claude-opus-4-6",
        session_id: "abc",
        permissionMode: "default",
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("init");
    const init = entries[0] as Extract<UnifiedLogEntry, { type: "init" }>;
    expect(init.provider).toBe("claude");
    expect(init.model).toBe("claude-opus-4-6");
    expect(init.cwd).toBe("/home/user/project");
    expect(init.tools).toEqual(["Bash", "Read"]);
  });

  it("maps assistant message with text and tool_use blocks", () => {
    const ctx = createCtx({ provider: "claude" });
    const entries = mapClaudeEvent(
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Let me check that." },
            { type: "tool_use", id: "tc-1", name: "bash", input: { command: "ls" } },
          ],
        },
      },
      ctx,
    );

    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe("message");
    expect(entries[1].type).toBe("tool_call");

    const msg = entries[0] as Extract<UnifiedLogEntry, { type: "message" }>;
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("Let me check that.");

    const tc = entries[1] as Extract<UnifiedLogEntry, { type: "tool_call" }>;
    expect(tc.toolCallId).toBe("tc-1");
    expect(tc.toolName).toBe("bash");
    expect(tc.args).toEqual({ command: "ls" });
  });

  it("maps thinking blocks", () => {
    const ctx = createCtx({ provider: "claude" });
    const entries = mapClaudeEvent(
      {
        type: "assistant",
        message: {
          content: [{ type: "thinking", thinking: "I should think about this..." }],
        },
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("thinking");
    const thinking = entries[0] as Extract<UnifiedLogEntry, { type: "thinking" }>;
    expect(thinking.content).toBe("I should think about this...");
  });

  it("maps user tool_result blocks", () => {
    const ctx = createCtx({ provider: "claude" });
    const entries = mapClaudeEvent(
      {
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "tc-1", content: "file.txt", is_error: false },
          ],
        },
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("tool_result");
    const tr = entries[0] as Extract<UnifiedLogEntry, { type: "tool_result" }>;
    expect(tr.toolCallId).toBe("tc-1");
    expect(tr.isError).toBe(false);
  });

  it("maps result event to status + result entries", () => {
    const ctx = createCtx({ provider: "claude", currentIteration: 3 });
    const entries = mapClaudeEvent(
      {
        type: "result",
        subtype: "success",
        result: "Task completed",
        total_cost_usd: 0.05,
        usage: { input_tokens: 1000, output_tokens: 200 },
      },
      ctx,
    );

    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe("status");
    expect(entries[1].type).toBe("result");

    const result = entries[1] as Extract<UnifiedLogEntry, { type: "result" }>;
    expect(result.content).toBe("Task completed");
    expect(result.costUsd).toBe(0.05);
    expect(result.usage.inputTokens).toBe(1000);
  });

  it("maps rate_limit_event", () => {
    const ctx = createCtx({ provider: "claude" });
    const entries = mapClaudeEvent(
      {
        type: "rate_limit_event",
        retry_after_ms: 5000,
        message: "Rate limited",
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("rate_limit");
    const rl = entries[0] as Extract<UnifiedLogEntry, { type: "rate_limit" }>;
    expect(rl.retryAfterMs).toBe(5000);
  });
});

describe("codex-mapper", () => {
  it("maps thread.started to init", () => {
    const ctx = createCtx({ provider: "codex", model: "gpt-5.4" });
    const entries = mapCodexEvent(
      {
        type: "thread.started",
        thread_id: "thread-abc",
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("init");
    const init = entries[0] as Extract<UnifiedLogEntry, { type: "init" }>;
    expect(init.provider).toBe("codex");
    expect(init.model).toBe("gpt-5.4");
  });

  it("increments iteration on turn.started", () => {
    const ctx = createCtx({ provider: "codex", currentIteration: 0 });
    mapCodexEvent({ type: "turn.started" }, ctx);
    expect(ctx.currentIteration).toBe(1);
  });

  it("maps item.started command_execution to tool_call", () => {
    const ctx = createCtx({ provider: "codex" });
    const entries = mapCodexEvent(
      {
        type: "item.started",
        item: {
          id: "item_1",
          type: "command_execution",
          command: "/bin/bash -lc date",
          aggregated_output: "",
          exit_code: null,
          status: "in_progress",
        },
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("tool_call");
    const tc = entries[0] as Extract<UnifiedLogEntry, { type: "tool_call" }>;
    expect(tc.toolCallId).toBe("codex_item_1");
    expect(tc.toolName).toBe("bash");
    expect(tc.args).toEqual({ command: "/bin/bash -lc date" });
  });

  it("maps item.completed command_execution to tool_result", () => {
    const ctx = createCtx({ provider: "codex" });
    const entries = mapCodexEvent(
      {
        type: "item.completed",
        item: {
          id: "item_1",
          type: "command_execution",
          command: "/bin/bash -lc date",
          aggregated_output: "Mon Mar 10 2026\n",
          exit_code: 0,
          status: "completed",
        },
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("tool_result");
    const tr = entries[0] as Extract<UnifiedLogEntry, { type: "tool_result" }>;
    expect(tr.toolCallId).toBe("codex_item_1");
    expect(tr.isError).toBe(false);
    expect(tr.result).toBe("Mon Mar 10 2026\n");
  });

  it("marks non-zero exit code as error", () => {
    const ctx = createCtx({ provider: "codex" });
    const entries = mapCodexEvent(
      {
        type: "item.completed",
        item: {
          id: "item_2",
          type: "command_execution",
          command: "false",
          aggregated_output: "",
          exit_code: 1,
          status: "completed",
        },
      },
      ctx,
    );

    const tr = entries[0] as Extract<UnifiedLogEntry, { type: "tool_result" }>;
    expect(tr.isError).toBe(true);
  });

  it("maps item.completed agent_message to message", () => {
    const ctx = createCtx({ provider: "codex" });
    const entries = mapCodexEvent(
      {
        type: "item.completed",
        item: {
          id: "item_0",
          type: "agent_message",
          text: "I will check the directory.",
        },
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("message");
    const msg = entries[0] as Extract<UnifiedLogEntry, { type: "message" }>;
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("I will check the directory.");
  });

  it("maps item.completed file_change to file_change", () => {
    const ctx = createCtx({ provider: "codex" });
    const entries = mapCodexEvent(
      {
        type: "item.completed",
        item: {
          id: "item_8",
          type: "file_change",
          changes: [{ path: "/tmp/README.md", kind: "update" }],
          status: "completed",
        },
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("file_change");
    const fc = entries[0] as Extract<UnifiedLogEntry, { type: "file_change" }>;
    expect(fc.changes).toHaveLength(1);
    expect(fc.changes[0].path).toBe("/tmp/README.md");
    expect(fc.changes[0].change).toBe("edited");
  });

  it("maps turn.completed to status with usage", () => {
    const ctx = createCtx({ provider: "codex", currentIteration: 2 });
    const entries = mapCodexEvent(
      {
        type: "turn.completed",
        usage: {
          input_tokens: 50000,
          cached_input_tokens: 40000,
          output_tokens: 800,
        },
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("status");
    const st = entries[0] as Extract<UnifiedLogEntry, { type: "status" }>;
    expect(st.usage.inputTokens).toBe(50000);
    expect(st.usage.cacheReadTokens).toBe(40000);
    expect(st.usage.outputTokens).toBe(800);
    expect(st.iterations).toBe(2);
  });
});

describe("langchain-mapper", () => {
  it("maps init event", () => {
    const ctx = createCtx();
    const entries = mapLangchainEvent(
      {
        type: "init",
        provider: "langchain",
        model: "gpt-4.1-mini",
        mode: "yolo",
        maxIter: 10,
        sandbox: "workspace",
        timestamp: 1000,
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("init");
  });

  it("maps event wrapper with tool_call", () => {
    const ctx = createCtx();
    const entries = mapLangchainEvent(
      {
        type: "event",
        event: {
          type: "tool_call",
          toolName: "bash",
          toolCallId: "call_123",
          args: { command: "pwd" },
          display: { kind: "command", label: "Bash(pwd)" },
          timestamp: 1000,
          iteration: 1,
        },
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        iterations: 1,
        status: "running",
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("tool_call");
    const tc = entries[0] as Extract<UnifiedLogEntry, { type: "tool_call" }>;
    expect(tc.toolCallId).toBe("call_123");
  });

  it("maps status event", () => {
    const ctx = createCtx();
    const entries = mapLangchainEvent(
      {
        type: "status",
        usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600 },
        iterations: 2,
        status: "running",
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("status");
  });

  it("maps result event", () => {
    const ctx = createCtx();
    const entries = mapLangchainEvent(
      {
        type: "result",
        content: "Task done",
        stopReason: "completed",
        usage: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 },
        iterations: 3,
      },
      ctx,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("result");
    const result = entries[0] as Extract<UnifiedLogEntry, { type: "result" }>;
    expect(result.content).toBe("Task done");
  });

  it("maps error event", () => {
    const ctx = createCtx();
    const entries = mapLangchainEvent({ type: "error", error: "Something failed" }, ctx);

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("error");
  });
});

describe("mapAgentEvent", () => {
  it("maps all agent event types", () => {
    const ctx = createCtx();

    const messageEntries = mapAgentEvent(
      { type: "message", role: "user", content: "hi", timestamp: 1000, iteration: 1 },
      ctx,
    );
    expect(messageEntries[0].type).toBe("message");

    const completionEntries = mapAgentEvent(
      { type: "completion", result: "done", verified: true, timestamp: 1000, iteration: 1 },
      ctx,
    );
    expect(completionEntries[0].type).toBe("completion");

    const planEntries = mapAgentEvent(
      { type: "plan", content: "Plan step 1", timestamp: 1000, iteration: 1 },
      ctx,
    );
    expect(planEntries[0].type).toBe("plan");

    const summaryEntries = mapAgentEvent(
      {
        type: "summary",
        summarizedIterations: [1, 2],
        summary: "Summary text",
        timestamp: 1000,
        iteration: 3,
      },
      ctx,
    );
    expect(summaryEntries[0].type).toBe("summary");
  });

  it("propagates parallelGroup on 3 parallel tool calls", () => {
    const ctx = createCtx();
    const groupId = "pg_1_0_1234";

    const tc1 = mapAgentEvent(
      {
        type: "tool_call",
        toolName: "bash",
        toolCallId: "call_0_bash",
        args: { command: "ls" },
        parallelGroup: groupId,
        timestamp: 1000,
        iteration: 1,
      },
      ctx,
    );
    const tc2 = mapAgentEvent(
      {
        type: "tool_call",
        toolName: "bash",
        toolCallId: "call_0_bash2",
        args: { command: "pwd" },
        parallelGroup: groupId,
        timestamp: 1000,
        iteration: 1,
      },
      ctx,
    );
    const tc3 = mapAgentEvent(
      {
        type: "tool_call",
        toolName: "read_file",
        toolCallId: "call_0_read",
        args: { path: "/tmp/test" },
        parallelGroup: groupId,
        timestamp: 1000,
        iteration: 1,
      },
      ctx,
    );

    for (const entries of [tc1, tc2, tc3]) {
      expect(entries).toHaveLength(1);
      const entry = entries[0] as Extract<UnifiedLogEntry, { type: "tool_call" }>;
      expect(entry.type).toBe("tool_call");
      expect(entry.parallelGroup).toBe(groupId);
    }
  });

  it("preserves file_edit display metadata on tool_call and tool_result pair", () => {
    const ctx = createCtx();

    const tcEntries = mapAgentEvent(
      {
        type: "tool_call",
        toolName: "edit_file",
        toolCallId: "call_1_edit",
        args: { path: "/tmp/foo.ts", old_string: "a", new_string: "b" },
        display: { kind: "file_edit", label: "Edit(/tmp/foo.ts)" },
        timestamp: 1000,
        iteration: 1,
      },
      ctx,
    );
    expect(tcEntries).toHaveLength(1);
    const tc = tcEntries[0] as Extract<UnifiedLogEntry, { type: "tool_call" }>;
    expect(tc.display?.kind).toBe("file_edit");

    const trEntries = mapAgentEvent(
      {
        type: "tool_result",
        toolCallId: "call_1_edit",
        result: "File edited",
        display: {
          kind: "file_edit",
          label: "Edit(/tmp/foo.ts)",
          fileChanges: [{ path: "/tmp/foo.ts", change: "edited", additions: 1, deletions: 1 }],
        },
        durationMs: 45,
        timestamp: 1001,
        iteration: 1,
      },
      ctx,
    );
    expect(trEntries).toHaveLength(1);
    const tr = trEntries[0] as Extract<UnifiedLogEntry, { type: "tool_result" }>;
    expect(tr.durationMs).toBe(45);
    expect(tr.display?.fileChanges).toHaveLength(1);
    expect(tr.display?.fileChanges?.[0].path).toBe("/tmp/foo.ts");
  });

  it("produces monotonically incrementing sequences across multi-iteration events", () => {
    const ctx = createCtx();
    const allEntries: UnifiedLogEntry[] = [];

    // Iteration 1: message → tool_call → tool_result
    allEntries.push(
      ...mapAgentEvent(
        {
          type: "message",
          role: "assistant",
          content: "Let me check",
          timestamp: 1000,
          iteration: 1,
        },
        ctx,
      ),
    );
    allEntries.push(
      ...mapAgentEvent(
        {
          type: "tool_call",
          toolName: "bash",
          toolCallId: "c1",
          args: { command: "ls" },
          timestamp: 1001,
          iteration: 1,
        },
        ctx,
      ),
    );
    allEntries.push(
      ...mapAgentEvent(
        {
          type: "tool_result",
          toolCallId: "c1",
          result: "file.txt",
          timestamp: 1002,
          iteration: 1,
        },
        ctx,
      ),
    );

    // Iteration 2: tool_call → tool_result → completion
    allEntries.push(
      ...mapAgentEvent(
        {
          type: "tool_call",
          toolName: "read_file",
          toolCallId: "c2",
          args: { path: "file.txt" },
          timestamp: 1003,
          iteration: 2,
        },
        ctx,
      ),
    );
    allEntries.push(
      ...mapAgentEvent(
        {
          type: "tool_result",
          toolCallId: "c2",
          result: "contents",
          timestamp: 1004,
          iteration: 2,
        },
        ctx,
      ),
    );
    allEntries.push(
      ...mapAgentEvent(
        { type: "completion", result: "Done", verified: true, timestamp: 1005, iteration: 2 },
        ctx,
      ),
    );

    expect(allEntries).toHaveLength(6);
    for (let i = 1; i < allEntries.length; i++) {
      expect(allEntries[i].sequence).toBeGreaterThan(allEntries[i - 1].sequence);
    }
  });
});

describe("replay utilities", () => {
  const sampleLines = [
    JSON.stringify({
      type: "init",
      sessionId: "s1",
      timestamp: 1000,
      sequence: 0,
      provider: "langchain",
      model: "test",
      mode: "yolo",
    }),
    JSON.stringify({
      type: "message",
      sessionId: "s1",
      timestamp: 1001,
      sequence: 1,
      role: "user",
      content: "Hello",
      iteration: 1,
    }),
    JSON.stringify({
      type: "tool_call",
      sessionId: "s1",
      timestamp: 1002,
      sequence: 2,
      toolCallId: "tc-1",
      toolName: "bash",
      args: { command: "echo hi" },
      iteration: 1,
    }),
    JSON.stringify({
      type: "tool_result",
      sessionId: "s1",
      timestamp: 1003,
      sequence: 3,
      toolCallId: "tc-1",
      result: "hi\n",
      isError: false,
      iteration: 1,
    }),
    JSON.stringify({
      type: "completion",
      sessionId: "s1",
      timestamp: 1004,
      sequence: 4,
      result: "Done",
      verified: false,
      iteration: 1,
    }),
  ];

  describe("replayLog", () => {
    it("parses JSONL lines", () => {
      const entries = replayLog(sampleLines);
      expect(entries).toHaveLength(5);
      expect(entries[0].type).toBe("init");
      expect(entries[4].type).toBe("completion");
    });
  });

  describe("logToThread", () => {
    it("reconstructs an AgentThread", () => {
      const entries = replayLog(sampleLines);
      const thread = logToThread(entries);

      expect(thread.id).toBe("s1");
      expect(thread.events).toHaveLength(4); // init is skipped
      expect(thread.events[0].type).toBe("message");
      expect(thread.events[1].type).toBe("tool_call");
      expect(thread.events[2].type).toBe("tool_result");
      expect(thread.events[3].type).toBe("completion");
    });
  });

  describe("logToThread preserves parallelGroup", () => {
    it("preserves parallelGroup on tool_call and tool_result through logToThread and logToChatMessages", () => {
      const linesWithPG = [
        JSON.stringify({
          type: "init",
          sessionId: "s2",
          timestamp: 2000,
          sequence: 0,
          provider: "langchain",
          model: "test",
          mode: "yolo",
        }),
        JSON.stringify({
          type: "tool_call",
          sessionId: "s2",
          timestamp: 2001,
          sequence: 1,
          toolCallId: "tc-pg-1",
          toolName: "bash",
          args: { command: "ls" },
          parallelGroup: "pg_1",
          iteration: 1,
        }),
        JSON.stringify({
          type: "tool_call",
          sessionId: "s2",
          timestamp: 2002,
          sequence: 2,
          toolCallId: "tc-pg-2",
          toolName: "read_file",
          args: { path: "/tmp/a" },
          parallelGroup: "pg_1",
          iteration: 1,
        }),
        JSON.stringify({
          type: "tool_result",
          sessionId: "s2",
          timestamp: 2003,
          sequence: 3,
          toolCallId: "tc-pg-1",
          result: "file.txt",
          isError: false,
          parallelGroup: "pg_1",
          iteration: 1,
        }),
        JSON.stringify({
          type: "tool_result",
          sessionId: "s2",
          timestamp: 2004,
          sequence: 4,
          toolCallId: "tc-pg-2",
          result: "contents",
          isError: false,
          parallelGroup: "pg_1",
          iteration: 1,
        }),
      ];

      const entries = replayLog(linesWithPG);
      const thread = logToThread(entries);

      const threadTCs = thread.events.filter((e) => e.type === "tool_call");
      const threadTRs = thread.events.filter((e) => e.type === "tool_result");

      expect(threadTCs).toHaveLength(2);
      expect(threadTRs).toHaveLength(2);
      for (const tc of threadTCs) {
        expect((tc as { parallelGroup?: string }).parallelGroup).toBe("pg_1");
      }
      for (const tr of threadTRs) {
        expect((tr as { parallelGroup?: string }).parallelGroup).toBe("pg_1");
      }

      const msgs = logToChatMessages(entries);
      const msgTCs = msgs.filter((m) => m.role === "tool_call");
      const msgTRs = msgs.filter((m) => m.role === "tool_result");

      expect(msgTCs).toHaveLength(2);
      expect(msgTRs).toHaveLength(2);
      for (const m of msgTCs) {
        expect(m.parallelGroup).toBe("pg_1");
      }
      for (const m of msgTRs) {
        expect(m.parallelGroup).toBe("pg_1");
      }
    });
  });

  describe("logToChatMessages", () => {
    it("converts entries to chat messages", () => {
      const entries = replayLog(sampleLines);
      const messages = logToChatMessages(entries);

      expect(messages).toHaveLength(4); // init and status-like entries excluded
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Hello");
      expect(messages[1].role).toBe("tool_call");
      expect(messages[1].toolName).toBe("bash");
      expect(messages[2].role).toBe("tool_result");
      expect(messages[3].role).toBe("assistant");
      expect(messages[3].content).toBe("Done");
    });
  });
});
