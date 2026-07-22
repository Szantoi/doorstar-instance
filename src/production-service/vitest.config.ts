import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    // setup.ts provisions one isolated Prisma schema for this process.
    fileParallelism: false,
  },
});
