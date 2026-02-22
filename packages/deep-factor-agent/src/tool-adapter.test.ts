import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createLangChainTool,
  toolArrayToMap,
  findToolByName,
} from "./tool-adapter.js";

describe("createLangChainTool", () => {
  it("returns a StructuredToolInterface with correct name and description", () => {
    const t = createLangChainTool("greet", {
      description: "Say hello",
      schema: z.object({ name: z.string() }),
      execute: async ({ name }) => `Hello, ${name}!`,
    });

    expect(t.name).toBe("greet");
    expect(t.description).toBe("Say hello");
  });

  it("passes through string return values unchanged", async () => {
    const t = createLangChainTool("echo", {
      description: "Echo input",
      schema: z.object({ text: z.string() }),
      execute: async ({ text }) => text,
    });

    const result = await t.invoke({ text: "hello" });
    expect(result).toBe("hello");
  });

  it("auto-stringifies non-string return values via JSON.stringify", async () => {
    const t = createLangChainTool("obj", {
      description: "Return an object",
      schema: z.object({}),
      execute: async () => ({ key: "value", count: 42 }),
    });

    const result = await t.invoke({});
    expect(result).toBe(JSON.stringify({ key: "value", count: 42 }));
  });

  it("auto-stringifies array return values", async () => {
    const t = createLangChainTool("arr", {
      description: "Return an array",
      schema: z.object({}),
      execute: async () => [1, 2, 3],
    });

    const result = await t.invoke({});
    expect(result).toBe("[1,2,3]");
  });

  it("auto-stringifies numeric return values", async () => {
    const t = createLangChainTool("num", {
      description: "Return a number",
      schema: z.object({}),
      execute: async () => 42,
    });

    const result = await t.invoke({});
    expect(result).toBe("42");
  });

  it("auto-stringifies null return values", async () => {
    const t = createLangChainTool("nil", {
      description: "Return null",
      schema: z.object({}),
      execute: async () => null,
    });

    const result = await t.invoke({});
    expect(result).toBe("null");
  });
});

describe("toolArrayToMap", () => {
  it("converts an array of tools to a name-keyed record", () => {
    const toolA = createLangChainTool("alpha", {
      description: "A",
      schema: z.object({}),
      execute: async () => "a",
    });
    const toolB = createLangChainTool("beta", {
      description: "B",
      schema: z.object({}),
      execute: async () => "b",
    });

    const map = toolArrayToMap([toolA, toolB]);
    expect(Object.keys(map)).toEqual(["alpha", "beta"]);
    expect(map["alpha"]).toBe(toolA);
    expect(map["beta"]).toBe(toolB);
  });

  it("returns an empty record for an empty array", () => {
    const map = toolArrayToMap([]);
    expect(map).toEqual({});
  });

  it("last tool wins when duplicate names exist", () => {
    const first = createLangChainTool("dup", {
      description: "First",
      schema: z.object({}),
      execute: async () => "first",
    });
    const second = createLangChainTool("dup", {
      description: "Second",
      schema: z.object({}),
      execute: async () => "second",
    });

    const map = toolArrayToMap([first, second]);
    expect(Object.keys(map)).toEqual(["dup"]);
    expect(map["dup"].description).toBe("Second");
  });
});

describe("findToolByName", () => {
  const tools = [
    createLangChainTool("foo", {
      description: "Foo",
      schema: z.object({}),
      execute: async () => "foo",
    }),
    createLangChainTool("bar", {
      description: "Bar",
      schema: z.object({}),
      execute: async () => "bar",
    }),
  ];

  it("returns the tool when the name matches", () => {
    const result = findToolByName(tools, "foo");
    expect(result).toBeDefined();
    expect(result!.name).toBe("foo");
  });

  it("returns the correct tool among multiple", () => {
    const result = findToolByName(tools, "bar");
    expect(result).toBeDefined();
    expect(result!.name).toBe("bar");
  });

  it("returns undefined when no tool matches", () => {
    const result = findToolByName(tools, "nonexistent");
    expect(result).toBeUndefined();
  });

  it("returns undefined for an empty array", () => {
    const result = findToolByName([], "foo");
    expect(result).toBeUndefined();
  });
});
