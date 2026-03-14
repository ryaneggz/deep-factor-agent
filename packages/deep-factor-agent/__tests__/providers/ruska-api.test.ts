import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  convertToRuskaMessages,
  parseSSEStream,
  extractFinalAIMessage,
  createRuskaApiProvider,
} from "../../src/providers/ruska-api.js";
import type { ModelInvocationUpdate } from "../../src/providers/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSSEBody(events: Array<[string, unknown] | "DONE">): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let idx = 0;
  return new ReadableStream({
    pull(controller) {
      if (idx >= events.length) {
        controller.close();
        return;
      }
      const event = events[idx++];
      if (event === "DONE") {
        controller.enqueue(encoder.encode(`id: ${idx}-0\ndata: [DONE]\n\n`));
      } else {
        const [type, payload] = event;
        const data = JSON.stringify([type, payload]);
        controller.enqueue(encoder.encode(`id: ${idx}-0\ndata: ${data}\n\n`));
      }
    },
  });
}

function makeResponse(body: ReadableStream<Uint8Array>, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function mockTwoPhaseFlow(
  threadId: string,
  runId: string,
  sseEvents: Array<[string, unknown] | "DONE">,
  options?: { postStatus?: number; postBody?: string; sseStatus?: number; sseBody?: string },
): void {
  const fetchMock = vi.fn();

  // First call: POST returns {thread_id, run_id, distributed: true}
  if (options?.postStatus && options.postStatus !== 200) {
    fetchMock.mockResolvedValueOnce(
      new Response(options.postBody ?? "error", { status: options.postStatus }),
    );
  } else {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ thread_id: threadId, run_id: runId, distributed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  // Second call: GET returns SSE stream
  if (options?.sseStatus && options.sseStatus !== 200) {
    fetchMock.mockResolvedValueOnce(
      new Response(options.sseBody ?? "error", { status: options.sseStatus }),
    );
  } else {
    fetchMock.mockResolvedValueOnce(makeResponse(makeSSEBody(sseEvents)));
  }

  vi.stubGlobal("fetch", fetchMock);
}

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

describe("convertToRuskaMessages", () => {
  it("extracts system messages into systemPrompt", () => {
    const result = convertToRuskaMessages([
      new SystemMessage("You are helpful."),
      new HumanMessage("Hi"),
    ]);

    expect(result.systemPrompt).toBe("You are helpful.");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({ role: "user", content: "Hi" });
  });

  it("concatenates multiple system messages", () => {
    const result = convertToRuskaMessages([
      new SystemMessage("First"),
      new SystemMessage("Second"),
      new HumanMessage("Hello"),
    ]);

    expect(result.systemPrompt).toBe("First\n\nSecond");
  });

  it("maps human messages to user role", () => {
    const result = convertToRuskaMessages([new HumanMessage("What is 2+2?")]);

    expect(result.messages).toEqual([{ role: "user", content: "What is 2+2?" }]);
    expect(result.systemPrompt).toBeUndefined();
  });

  it("maps AI messages with tool_calls", () => {
    const result = convertToRuskaMessages([
      new AIMessage({
        content: "Let me check.",
        tool_calls: [
          { name: "calculator", args: { expr: "2+2" }, id: "call_1", type: "tool_call" },
        ],
      }),
    ]);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("assistant");
    expect(result.messages[0].content).toBe("Let me check.");
    expect(result.messages[0].tool_calls).toEqual([
      { name: "calculator", args: { expr: "2+2" }, id: "call_1", type: "tool_call" },
    ]);
  });

  it("maps tool messages with tool_call_id", () => {
    const result = convertToRuskaMessages([
      new ToolMessage({ tool_call_id: "call_1", content: "4" }),
    ]);

    expect(result.messages).toEqual([{ role: "tool", content: "4", tool_call_id: "call_1" }]);
  });

  it("handles AI messages without tool_calls", () => {
    const result = convertToRuskaMessages([new AIMessage("Just text")]);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("assistant");
    expect(result.messages[0].tool_calls).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

describe("parseSSEStream", () => {
  it("parses SSE events with id and data lines", async () => {
    const body = makeSSEBody([
      ["initializing", { run_id: "r1" }],
      ["metadata", { thread_id: "t1" }],
    ]);
    const response = makeResponse(body);

    const events: Array<[string, unknown]> = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(["initializing", { run_id: "r1" }]);
    expect(events[1]).toEqual(["metadata", { thread_id: "t1" }]);
  });

  it("handles [DONE] sentinel", async () => {
    const body = makeSSEBody([["values", { messages: [] }], "DONE"]);
    const response = makeResponse(body);

    const events: Array<[string, unknown]> = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[1]).toEqual(["DONE", null]);
  });

  it("skips malformed JSON lines", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: not valid json\n\n"));
        controller.enqueue(encoder.encode('data: ["valid", "event"]\n\n'));
        controller.close();
      },
    });
    const response = makeResponse(body);

    const events: Array<[string, unknown]> = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(["valid", "event"]);
  });

  it("throws when response has no body", async () => {
    const response = new Response(null);
    // Remove body by creating a mock
    const mockResponse = {
      ...response,
      body: null,
    } as unknown as Response;

    await expect(async () => {
      for await (const _ of parseSSEStream(mockResponse)) {
        // Should not reach here
      }
    }).rejects.toThrow("SSE response has no body");
  });
});

// ---------------------------------------------------------------------------
// Final message extraction
// ---------------------------------------------------------------------------

describe("extractFinalAIMessage", () => {
  it("extracts the last AI message from values payload", () => {
    const payload = {
      messages: [
        { type: "human", content: "hi" },
        {
          type: "ai",
          content: "Hello!",
          tool_calls: [],
          usage_metadata: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
          },
        },
      ],
    };

    const result = extractFinalAIMessage(payload);
    expect(result).toBeDefined();
    expect(result!.content).toBe("Hello!");
    expect(
      (result as AIMessage & { usage_metadata?: { input_tokens: number } }).usage_metadata
        ?.input_tokens,
    ).toBe(10);
  });

  it("extracts AIMessageChunk type", () => {
    const payload = {
      messages: [{ type: "AIMessageChunk", content: "Chunk content", tool_calls: [] }],
    };

    const result = extractFinalAIMessage(payload);
    expect(result).toBeDefined();
    expect(result!.content).toBe("Chunk content");
  });

  it("extracts tool_calls from AI message", () => {
    const payload = {
      messages: [
        {
          type: "ai",
          content: "",
          tool_calls: [
            { name: "write_todos", args: { items: ["a"] }, id: "call_1", type: "tool_call" },
          ],
        },
      ],
    };

    const result = extractFinalAIMessage(payload);
    expect(result).toBeDefined();
    expect(result!.tool_calls).toHaveLength(1);
    expect(result!.tool_calls![0].name).toBe("write_todos");
  });

  it("returns undefined for empty messages", () => {
    expect(extractFinalAIMessage({ messages: [] })).toBeUndefined();
    expect(extractFinalAIMessage({})).toBeUndefined();
  });

  it("returns undefined when no AI messages exist", () => {
    const payload = {
      messages: [{ type: "human", content: "hi" }],
    };
    expect(extractFinalAIMessage(payload)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Two-phase flow
// ---------------------------------------------------------------------------

describe("createRuskaApiProvider — two-phase flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST then GET in sequence", async () => {
    mockTwoPhaseFlow("thread-1", "run-1", [
      ["initializing", { run_id: "run-1" }],
      ["values", { messages: [{ type: "ai", content: "Hi!", tool_calls: [] }] }],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "openai:gpt-4.1-nano",
      bearerToken: "test-token",
    });

    await provider.invoke([new HumanMessage("Hello")]);

    const fetchCalls = vi.mocked(fetch).mock.calls;
    expect(fetchCalls).toHaveLength(2);

    // First call: POST
    expect(fetchCalls[0][0]).toBe("http://localhost:8000/api/llm/stream");
    expect((fetchCalls[0][1] as RequestInit).method).toBe("POST");

    // Second call: GET
    expect(fetchCalls[1][0]).toBe("http://localhost:8000/api/threads/thread-1/stream?run_id=run-1");
    expect((fetchCalls[1][1] as RequestInit).method).toBe("GET");
  });
});

// ---------------------------------------------------------------------------
// invoke()
// ---------------------------------------------------------------------------

describe("createRuskaApiProvider — invoke()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an AIMessage with content", async () => {
    mockTwoPhaseFlow("t1", "r1", [
      ["initializing", { run_id: "r1" }],
      ["metadata", { thread_id: "t1" }],
      ["values", { messages: [{ type: "ai", content: "Hello!", tool_calls: [] }] }],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "openai:gpt-4.1-nano",
      apiKey: "otk_test",
    });

    const result = await provider.invoke([new HumanMessage("Hi")]);

    expect(result).toBeInstanceOf(AIMessage);
    expect(result.content).toBe("Hello!");
  });

  it("returns an AIMessage with tool_calls and usage", async () => {
    mockTwoPhaseFlow("t1", "r1", [
      [
        "values",
        {
          messages: [
            {
              type: "ai",
              content: "",
              tool_calls: [
                {
                  name: "write_todos",
                  args: { items: ["buy milk"] },
                  id: "call_1",
                  type: "tool_call",
                },
              ],
              usage_metadata: {
                input_tokens: 100,
                output_tokens: 20,
                total_tokens: 120,
              },
            },
          ],
        },
      ],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "openai:gpt-4.1-nano",
    });

    const result = await provider.invoke([new HumanMessage("Add todo")]);

    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0].name).toBe("write_todos");

    const usage = (result as AIMessage & { usage_metadata?: { total_tokens: number } })
      .usage_metadata;
    expect(usage?.total_tokens).toBe(120);
  });

  it("sends correct headers with bearer token", async () => {
    mockTwoPhaseFlow("t1", "r1", [
      ["values", { messages: [{ type: "ai", content: "ok", tool_calls: [] }] }],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
      bearerToken: "my-jwt-token",
    });

    await provider.invoke([new HumanMessage("test")]);

    const headers = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers["Authorization"]).toBe("Bearer my-jwt-token");
  });

  it("sends correct headers with API key", async () => {
    mockTwoPhaseFlow("t1", "r1", [
      ["values", { messages: [{ type: "ai", content: "ok", tool_calls: [] }] }],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
      apiKey: "otk_secret",
    });

    await provider.invoke([new HumanMessage("test")]);

    const headers = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers["x-api-key"]).toBe("otk_secret");
  });

  it("sends correct request body shape", async () => {
    mockTwoPhaseFlow("t1", "r1", [
      ["values", { messages: [{ type: "ai", content: "ok", tool_calls: [] }] }],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "openai:gpt-4.1-nano",
      graphId: "deepagent",
    });

    await provider.invoke([new HumanMessage("test message")]);

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("openai:gpt-4.1-nano");
    expect(body.metadata.graph_id).toBe("deepagent");
    expect(body.input.messages).toBeDefined();
    expect(body.input.messages.some((m: { role: string }) => m.role === "user")).toBe(true);
  });

  it("includes system prompt in request messages", async () => {
    mockTwoPhaseFlow("t1", "r1", [
      ["values", { messages: [{ type: "ai", content: "ok", tool_calls: [] }] }],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
      systemPrompt: "Be helpful.",
    });

    await provider.invoke([new HumanMessage("test")]);

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    const systemMsg = body.input.messages.find((m: { role: string }) => m.role === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain("Be helpful.");
  });
});

// ---------------------------------------------------------------------------
// invokeWithUpdates()
// ---------------------------------------------------------------------------

describe("createRuskaApiProvider — invokeWithUpdates()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("emits assistant_message, usage, and final updates", async () => {
    mockTwoPhaseFlow("t1", "r1", [
      ["messages", [{ content: "Hello ", tool_calls: [] }, {}]],
      ["messages", [{ content: "world!", tool_calls: [] }, {}]],
      [
        "values",
        {
          messages: [
            {
              type: "ai",
              content: "Hello world!",
              tool_calls: [],
              usage_metadata: { input_tokens: 50, output_tokens: 10, total_tokens: 60 },
            },
          ],
        },
      ],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
    });

    const updates: ModelInvocationUpdate[] = [];
    await provider.invokeWithUpdates!([new HumanMessage("Hi")], (u) => updates.push(u));

    const types = updates.map((u) => u.type);
    expect(types).toContain("assistant_message");
    expect(types).toContain("usage");
    expect(types).toContain("final");

    const assistantUpdates = updates.filter((u) => u.type === "assistant_message");
    expect(assistantUpdates).toHaveLength(2);
    expect((assistantUpdates[0] as { content: string }).content).toBe("Hello ");
    expect((assistantUpdates[1] as { content: string }).content).toBe("world!");
  });

  it("emits tool_call updates for streaming tool calls", async () => {
    mockTwoPhaseFlow("t1", "r1", [
      [
        "messages",
        [
          {
            content: "",
            tool_calls: [{ name: "calculator", args: { expr: "2+2" }, id: "call_1" }],
          },
          {},
        ],
      ],
      [
        "values",
        {
          messages: [
            {
              type: "ai",
              content: "",
              tool_calls: [
                { name: "calculator", args: { expr: "2+2" }, id: "call_1", type: "tool_call" },
              ],
            },
          ],
        },
      ],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
    });

    const updates: ModelInvocationUpdate[] = [];
    await provider.invokeWithUpdates!([new HumanMessage("calc")], (u) => updates.push(u));

    const toolCallUpdates = updates.filter((u) => u.type === "tool_call");
    expect(toolCallUpdates).toHaveLength(1);
    expect((toolCallUpdates[0] as { toolCall: { name: string } }).toolCall.name).toBe("calculator");
  });
});

// ---------------------------------------------------------------------------
// bindTools()
// ---------------------------------------------------------------------------

describe("createRuskaApiProvider — bindTools()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a new ModelAdapter instance", () => {
    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
    });

    const readFileTool = tool(async ({ path }: { path: string }) => `Contents of ${path}`, {
      name: "read_file",
      description: "Read a file",
      schema: z.object({ path: z.string() }),
    });

    const bound = provider.bindTools!([readFileTool]);
    expect(bound).toBeDefined();
    expect(bound).not.toBe(provider);
    expect(typeof bound.invoke).toBe("function");
  });

  it("sends tool names in request body", async () => {
    mockTwoPhaseFlow("t1", "r1", [
      ["values", { messages: [{ type: "ai", content: "ok", tool_calls: [] }] }],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
    });

    const readFileTool = tool(async ({ path }: { path: string }) => `Contents of ${path}`, {
      name: "read_file",
      description: "Read a file",
      schema: z.object({ path: z.string() }),
    });

    const bound = provider.bindTools!([readFileTool]);
    await bound.invoke([new HumanMessage("read something")]);

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.tools).toEqual(["read_file"]);
  });

  it("injects tool schemas into system prompt", async () => {
    mockTwoPhaseFlow("t1", "r1", [
      ["values", { messages: [{ type: "ai", content: "ok", tool_calls: [] }] }],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
    });

    const readFileTool = tool(async ({ path }: { path: string }) => `Contents of ${path}`, {
      name: "read_file",
      description: "Read a file",
      schema: z.object({ path: z.string() }),
    });

    const bound = provider.bindTools!([readFileTool]);
    await bound.invoke([new HumanMessage("read something")]);

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    const systemMsg = body.input.messages.find((m: { role: string }) => m.role === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain("read_file");
    expect(systemMsg.content).toContain("Available Tools");
  });

  it("does not inject schemas when injectToolSchemas is false", async () => {
    mockTwoPhaseFlow("t1", "r1", [
      ["values", { messages: [{ type: "ai", content: "ok", tool_calls: [] }] }],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
      injectToolSchemas: false,
    });

    const readFileTool = tool(async ({ path }: { path: string }) => `Contents of ${path}`, {
      name: "read_file",
      description: "Read a file",
      schema: z.object({ path: z.string() }),
    });

    const bound = provider.bindTools!([readFileTool]);
    await bound.invoke([new HumanMessage("read something")]);

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    const systemMsg = body.input.messages.find((m: { role: string }) => m.role === "system");
    // No system message should be injected for tool schemas
    expect(systemMsg).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("createRuskaApiProvider — error handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws on POST 401 Unauthorized", async () => {
    mockTwoPhaseFlow("t1", "r1", [], { postStatus: 401, postBody: "Unauthorized" });

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
    });

    await expect(provider.invoke([new HumanMessage("test")])).rejects.toThrow(
      "POST /api/llm/stream failed (401)",
    );
  });

  it("throws on POST 500 error", async () => {
    mockTwoPhaseFlow("t1", "r1", [], { postStatus: 500, postBody: "Internal Server Error" });

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
    });

    await expect(provider.invoke([new HumanMessage("test")])).rejects.toThrow("(500)");
  });

  it("throws on SSE GET 500 error", async () => {
    mockTwoPhaseFlow("t1", "r1", [], { sseStatus: 500, sseBody: "Stream error" });

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
    });

    await expect(provider.invoke([new HumanMessage("test")])).rejects.toThrow(
      "GET /api/threads/t1/stream failed (500)",
    );
  });

  it("throws on SSE error event", async () => {
    mockTwoPhaseFlow("t1", "r1", [["error", { message: "Rate limit exceeded" }]]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
    });

    await expect(provider.invoke([new HumanMessage("test")])).rejects.toThrow(
      "Rate limit exceeded",
    );
  });

  it("throws when stream ends with no response", async () => {
    // SSE stream with no values and no DONE
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: ["initializing", {"run_id": "r1"}]\n\n'));
        controller.close();
      },
    });

    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ thread_id: "t1", run_id: "r1", distributed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(makeResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
    });

    await expect(provider.invoke([new HumanMessage("test")])).rejects.toThrow(
      "SSE stream ended with no response",
    );
  });
});

// ---------------------------------------------------------------------------
// Thread continuity
// ---------------------------------------------------------------------------

describe("createRuskaApiProvider — thread continuity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reuses thread_id from metadata event in subsequent calls", async () => {
    const fetchMock = vi.fn();

    // First invocation
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ thread_id: "thread-A", run_id: "run-1", distributed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      makeResponse(
        makeSSEBody([
          ["metadata", { thread_id: "thread-A" }],
          ["values", { messages: [{ type: "ai", content: "First", tool_calls: [] }] }],
          "DONE",
        ]),
      ),
    );

    // Second invocation
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ thread_id: "thread-A", run_id: "run-2", distributed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      makeResponse(
        makeSSEBody([
          ["values", { messages: [{ type: "ai", content: "Second", tool_calls: [] }] }],
          "DONE",
        ]),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
    });

    // First call
    await provider.invoke([new HumanMessage("first")]);

    // Second call — should include thread_id in body
    await provider.invoke([new HumanMessage("second")]);

    const secondBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(secondBody.thread_id).toBe("thread-A");
  });

  it("uses initial threadId from options", async () => {
    mockTwoPhaseFlow("existing-thread", "r1", [
      ["values", { messages: [{ type: "ai", content: "ok", tool_calls: [] }] }],
      "DONE",
    ]);

    const provider = createRuskaApiProvider({
      baseUrl: "http://localhost:8000",
      model: "test-model",
      threadId: "existing-thread",
    });

    await provider.invoke([new HumanMessage("test")]);

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.thread_id).toBe("existing-thread");
  });
});
