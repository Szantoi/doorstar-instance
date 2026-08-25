import { defineConfig } from "vitest/config";

/**
 * Deliberately isolated from vitest.config.ts: no setup file, global setup, or
 * db push is permitted in a raw-constraint `prisma migrate deploy` proof.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/migration/**/*.migrate.ts"],
    // M2B has a separate command and a distinct explicit approval token. Do
    // not even collect it through the older M1B proof configuration.
    exclude: ["tests/migration/**/*.m2b.migrate.ts"],
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
