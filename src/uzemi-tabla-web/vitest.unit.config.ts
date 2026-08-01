import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

/** Pure Planning visualization tests, independent from the production API. */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: { environment: "jsdom", include: ["src/**/*.unit.test.{ts,tsx}"] },
});
