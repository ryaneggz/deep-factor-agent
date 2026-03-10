import { bench, describe } from "vitest";

describe("startup", () => {
  bench("dynamic import deep-factor-agent", async () => {
    // Measure the cost of dynamically importing the agent package.
    // This tracks import regression from new dependencies.
    await import("deep-factor-agent");
  });
});
