import { defineConfig } from "vitest/config";
import { getVitestSchemaName } from "./tests/testSchema.js";

// Set this before workers start, so every integration test process inherits
// the same one-off schema and global teardown can remove it afterwards.
getVitestSchemaName();

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/globalSetup.ts"],
    testTimeout: 15000,
    // One worker shares one run-scoped schema; no fixture reaches doorstar_test.
    fileParallelism: false,
  },
});
