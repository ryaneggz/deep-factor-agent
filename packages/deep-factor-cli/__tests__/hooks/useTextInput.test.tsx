import React from "react";
import { render } from "ink-testing-library";
import { describe, test, expect, vi } from "vitest";
import { Text } from "ink";
import { useTextInput } from "../../src/hooks/useTextInput.js";

/** Minimal component that exposes the hook's state for testing. */
function TestInput({ onSubmit }: { onSubmit: (v: string) => void }) {
  const { input } = useTextInput({ onSubmit });
  return (
    <Text>
      [{input}]<Text dimColor>_</Text>
    </Text>
  );
}

const delay = () => new Promise((r) => setTimeout(r, 0));

describe("useTextInput", () => {
  test("accumulates characters", async () => {
    const { lastFrame, stdin } = render(<TestInput onSubmit={() => {}} />);
    stdin.write("a");
    await delay();
    stdin.write("b");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("[ab]");
    });
  });

  test("backspace removes last character", async () => {
    const { lastFrame, stdin } = render(<TestInput onSubmit={() => {}} />);
    stdin.write("a");
    await delay();
    stdin.write("b");
    await delay();
    stdin.write("\x7f");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("[a]");
    });
  });

  test("backspace on empty is a no-op", async () => {
    const { lastFrame, stdin } = render(<TestInput onSubmit={() => {}} />);
    stdin.write("\x7f");
    await delay();
    expect(lastFrame()).toContain("[]");
  });

  test("enter submits trimmed value and clears input", async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = render(<TestInput onSubmit={onSubmit} />);
    stdin.write(" ");
    await delay();
    stdin.write("h");
    await delay();
    stdin.write("i");
    await delay();
    stdin.write(" ");
    await delay();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("hi");
      expect(lastFrame()).toContain("[]");
    });
  });

  test("enter on empty input does not submit", () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<TestInput onSubmit={onSubmit} />);
    stdin.write("\r");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("ignores ctrl key combinations", async () => {
    const { lastFrame, stdin } = render(<TestInput onSubmit={() => {}} />);
    stdin.write("a");
    await delay();
    stdin.write("\x01"); // ctrl+a
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("[a]");
    });
  });

  test("ref-based state avoids stale closure on submit", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<TestInput onSubmit={onSubmit} />);
    // Type several characters across multiple ticks — the ref must
    // track the latest value even though useInput's closure is stale.
    stdin.write("h");
    await delay();
    stdin.write("e");
    await delay();
    stdin.write("l");
    await delay();
    stdin.write("l");
    await delay();
    stdin.write("o");
    await delay();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("hello");
    });
  });
});
