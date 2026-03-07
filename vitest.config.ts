import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["**/src/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      obsidian: "./cubicj-plugin-package/src/__tests__/__mocks__/obsidian.ts",
    },
  },
});
