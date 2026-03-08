import { describe, expect, it } from "vitest";
import { resolveSessionSettings } from "../src/session-logger.js";

describe("resolveSessionSettings", () => {
  it("reuses stored provider and model when flags are absent", () => {
    expect(
      resolveSessionSettings({
        entries: [
          {
            timestamp: "2026-03-08T10:00:00.000Z",
            sessionId: "abc",
            role: "user",
            content: "Hello",
            provider: "claude-sdk",
            model: "sonnet",
          },
        ],
        hasProviderFlag: false,
        hasModelFlag: false,
      }),
    ).toEqual({
      provider: "claude",
      model: "sonnet",
    });
  });

  it("falls back to defaults for older sessions without provider metadata", () => {
    expect(
      resolveSessionSettings({
        entries: [
          {
            timestamp: "2026-03-08T10:00:00.000Z",
            sessionId: "abc",
            role: "user",
            content: "Hello",
            model: "some-old-model",
          },
        ],
        hasProviderFlag: false,
        hasModelFlag: false,
      }),
    ).toEqual({
      provider: "langchain",
      model: "gpt-4.1-mini",
    });
  });

  it("lets explicit flags win over stored session metadata", () => {
    expect(
      resolveSessionSettings({
        entries: [
          {
            timestamp: "2026-03-08T10:00:00.000Z",
            sessionId: "abc",
            role: "user",
            content: "Hello",
            provider: "claude-sdk",
            model: "sonnet",
          },
        ],
        hasProviderFlag: true,
        providerFlag: "langchain",
        hasModelFlag: false,
      }),
    ).toEqual({
      provider: "langchain",
      model: "gpt-4.1-mini",
    });
  });
});
