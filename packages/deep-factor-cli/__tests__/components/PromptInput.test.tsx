import React from "react";
import { render } from "ink-testing-library";
import { describe, test, expect, vi } from "vitest";
import { PromptInput } from "../../src/components/PromptInput.js";

const delay = () => new Promise((r) => setTimeout(r, 0));

describe("PromptInput", () => {
  test("renders '> ' prefix", () => {
    const { lastFrame } = render(<PromptInput onSubmit={() => {}} />);
    expect(lastFrame()).toContain(">");
  });

  test("appends character on keypress", async () => {
    const { lastFrame, stdin } = render(<PromptInput onSubmit={() => {}} />);
    stdin.write("a");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("a");
    });
  });

  test("appends multiple characters", async () => {
    const { lastFrame, stdin } = render(<PromptInput onSubmit={() => {}} />);
    stdin.write("h");
    await delay();
    stdin.write("e");
    await delay();
    stdin.write("l");
    await delay();
    stdin.write("l");
    await delay();
    stdin.write("o");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("hello");
    });
  });

  test("backspace removes last character", async () => {
    const { lastFrame, stdin } = render(<PromptInput onSubmit={() => {}} />);
    stdin.write("a");
    await delay();
    stdin.write("b");
    await delay();
    stdin.write("\x7f"); // backspace
    await vi.waitFor(() => {
      const frame = lastFrame() ?? "";
      expect(frame).toContain("a");
      expect(frame).not.toContain("ab");
    });
  });

  test("delete removes last character", async () => {
    const { lastFrame, stdin } = render(<PromptInput onSubmit={() => {}} />);
    stdin.write("x");
    await delay();
    stdin.write("y");
    await delay();
    stdin.write("\x7f"); // backspace (same handler as delete)
    await vi.waitFor(() => {
      const frame = lastFrame() ?? "";
      expect(frame).toContain("x");
      expect(frame).not.toContain("xy");
    });
  });

  test("backspace on empty input is a no-op", () => {
    const { lastFrame, stdin } = render(<PromptInput onSubmit={() => {}} />);
    stdin.write("\x7f");
    expect(lastFrame()).toContain(">");
  });

  test("ignores ctrl key combinations", async () => {
    const { lastFrame, stdin } = render(<PromptInput onSubmit={() => {}} />);
    stdin.write("a");
    await delay();
    stdin.write("\x01"); // ctrl+a
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("a");
    });
  });

  test("ignores meta key combinations", async () => {
    const { lastFrame, stdin } = render(<PromptInput onSubmit={() => {}} />);
    stdin.write("a");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("a");
    });
  });

  test("enter submits the input", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<PromptInput onSubmit={onSubmit} />);
    stdin.write("h");
    await delay();
    stdin.write("i");
    await delay();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("hi");
    });
  });

  test("enter on empty input is a no-op", () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<PromptInput onSubmit={onSubmit} />);
    stdin.write("\r");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
