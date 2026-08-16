import js from "@eslint/js";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

const scannerRulesDisabledForTests = Object.fromEntries(
  obsidianmd.configs.recommended
    .flatMap((config) => Object.keys(config.rules ?? {}))
    .map((rule) => [rule, "off"]),
);

export default tseslint.config(
  {
    ignores: [
      "main.js",
      "node_modules/",
      "Docs/",
      "scripts/",
      "esbuild.config.mjs",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          brands: ["Obsidian", "CubicJ"],
          acronyms: [],
          enforceCamelCaseLower: true,
        },
      ],
    },
  },
  {
    files: ["src/modules/font-loader.ts"],
    rules: {
      "obsidianmd/no-forbidden-elements": "off",
    },
  },
  {
    files: ["tests/**/*.test.mjs"],
    ...js.configs.recommended,
    rules: {
      ...scannerRulesDisabledForTests,
      ...js.configs.recommended.rules,
    },
  },
);
