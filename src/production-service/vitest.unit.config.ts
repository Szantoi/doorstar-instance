import { defineConfig } from "vitest/config";

/** Pure unit tests that must run without the local PostgreSQL/Docker runtime. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.unit.test.ts", "tests/**/*Baseline.test.ts"],
  },
});
