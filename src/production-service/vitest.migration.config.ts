import { defineConfig } from "vitest/config";

/**
 * Deliberately isolated from vitest.config.ts: no setup file, global setup, or
 * db push is permitted in a raw-constraint `prisma migrate deploy` proof.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/migration/**/*.migrate.ts"],
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
