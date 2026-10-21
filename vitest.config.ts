import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/collector/**/*.test.ts",
      "apps/web/**/*.test.ts",
    ],
    pool: "forks",
  },
});
