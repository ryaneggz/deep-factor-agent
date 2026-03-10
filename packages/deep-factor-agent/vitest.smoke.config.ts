import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.smoke.ts"],
    passWithNoTests: false,
    reporters: ["default", "./vitest.setup.ts"],
  },
});
