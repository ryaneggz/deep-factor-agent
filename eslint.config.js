import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      ".huntley/",
      ".ralph/",
      ".claude/",
      "**/coverage/",
      "**/vitest.config.ts",
      "packages/deep-factor-agent/logs/",
      "packages/deep-factor-agent/examples/",
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules for agent package (.ts files)
  {
    files: [
      "packages/deep-factor-agent/src/**/*.ts",
      "packages/deep-factor-agent/__tests__/**/*.ts",
    ],
    extends: [...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // TypeScript + React rules for CLI package (.ts/.tsx files)
  {
    files: [
      "packages/deep-factor-cli/src/**/*.{ts,tsx}",
      "packages/deep-factor-cli/__tests__/**/*.{ts,tsx}",
    ],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },

  // TypeScript + React rules for TUI package (.ts/.tsx files)
  {
    files: [
      "packages/deep-factor-tui/src/**/*.{ts,tsx}",
      "packages/deep-factor-tui/__tests__/**/*.{ts,tsx}",
    ],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },

  // Relaxed rules for test files
  {
    files: ["**/__tests__/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Prettier must be last to disable conflicting formatting rules
  eslintConfigPrettier,
);
