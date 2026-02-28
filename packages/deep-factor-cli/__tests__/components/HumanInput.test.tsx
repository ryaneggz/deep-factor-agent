import React from "react";
import { render } from "ink-testing-library";
import { describe, test, expect, vi } from "vitest";
import { HumanInput } from "../../src/components/HumanInput.js";
import type { HumanInputRequestedEvent } from "deep-factor-agent";

vi.mock("deep-factor-agent", () => ({}));

function makeRequest(overrides: Partial<HumanInputRequestedEvent> = {}): HumanInputRequestedEvent {
  return {
    type: "human_input_requested",
    question: "What color?",
    timestamp: Date.now(),
    iteration: 1,
    ...overrides,
  };
}

const delay = () => new Promise((r) => setTimeout(r, 0));

describe("HumanInput", () => {
  test("renders question text", () => {
    const { lastFrame } = render(<HumanInput request={makeRequest()} onSubmit={() => {}} />);
    expect(lastFrame()).toContain("What color?");
  });

  test("renders choices when present", () => {
    const { lastFrame } = render(
      <HumanInput
        request={makeRequest({ choices: ["Red", "Blue", "Green"] })}
        onSubmit={() => {}}
      />,
    );
    expect(lastFrame()).toContain("1. Red");
    expect(lastFrame()).toContain("2. Blue");
    expect(lastFrame()).toContain("3. Green");
  });

  test("does not render choices when absent", () => {
    const { lastFrame } = render(<HumanInput request={makeRequest()} onSubmit={() => {}} />);
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("1.");
  });

  test("appends character on keypress", async () => {
    const { lastFrame, stdin } = render(<HumanInput request={makeRequest()} onSubmit={() => {}} />);
    stdin.write("a");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("a");
    });
  });

  test("appends multiple characters", async () => {
    const { lastFrame, stdin } = render(<HumanInput request={makeRequest()} onSubmit={() => {}} />);
    stdin.write("h");
    await delay();
    stdin.write("i");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("hi");
    });
  });

  test("backspace removes last character", async () => {
    const { lastFrame, stdin } = render(<HumanInput request={makeRequest()} onSubmit={() => {}} />);
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

  test("delete key removes last character", async () => {
    const { lastFrame, stdin } = render(<HumanInput request={makeRequest()} onSubmit={() => {}} />);
    stdin.write("x");
    await delay();
    stdin.write("y");
    await delay();
    stdin.write("\x7f"); // use backspace (both backspace and delete trigger same handler)
    await vi.waitFor(() => {
      const frame = lastFrame() ?? "";
      expect(frame).toContain("x");
      expect(frame).not.toContain("xy");
    });
  });

  test("backspace on empty input is a no-op", () => {
    const { lastFrame, stdin } = render(<HumanInput request={makeRequest()} onSubmit={() => {}} />);
    stdin.write("\x7f");
    expect(lastFrame()).toContain("What color?");
  });

  test("ignores ctrl key combinations", async () => {
    const { lastFrame, stdin } = render(<HumanInput request={makeRequest()} onSubmit={() => {}} />);
    stdin.write("a");
    await delay();
    stdin.write("\x01"); // ctrl+a
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("a");
    });
  });

  test("ignores meta key combinations", async () => {
    const { lastFrame, stdin } = render(<HumanInput request={makeRequest()} onSubmit={() => {}} />);
    stdin.write("a");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("a");
    });
  });

  test("enter submits the input", async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = render(<HumanInput request={makeRequest()} onSubmit={onSubmit} />);
    stdin.write("R");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("R");
    });
    stdin.write("e");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Re");
    });
    stdin.write("d");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Red");
    });
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("Red");
    });
  });

  test("enter on empty input is a no-op", () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<HumanInput request={makeRequest()} onSubmit={onSubmit} />);
    stdin.write("\r");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("clears input after submit", async () => {
    const { lastFrame, stdin } = render(<HumanInput request={makeRequest()} onSubmit={() => {}} />);
    stdin.write("R");
    await delay();
    stdin.write("e");
    await delay();
    stdin.write("d");
    await delay();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("Red");
    });
  });

  test("trims whitespace before submitting", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<HumanInput request={makeRequest()} onSubmit={onSubmit} />);
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
    });
  });

  test("shows cursor indicator", () => {
    const { lastFrame } = render(<HumanInput request={makeRequest()} onSubmit={() => {}} />);
    expect(lastFrame()).toContain("_");
  });

  test("shows input prefix '? '", () => {
    const { lastFrame } = render(<HumanInput request={makeRequest()} onSubmit={() => {}} />);
    expect(lastFrame()).toContain("?");
  });
});
