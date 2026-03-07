import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["**/src/__tests__/**/*.test.ts"],
  },
});
