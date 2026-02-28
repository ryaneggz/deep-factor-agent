import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    passWithNoTests: true,
    reporters: ["default", "./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
