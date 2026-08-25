import { defineConfig } from "vitest/config";

/** A distinct approval-gated suite for the M2B OIDC transaction migration. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/migration/**/*.m2b.migrate.ts"],
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
