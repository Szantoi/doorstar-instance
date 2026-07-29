import { defineConfig } from "vitest/config";

/** Pure Planning visualization tests, independent from the production API. */
export default defineConfig({ test: { environment: "jsdom", include: ["src/**/*.unit.test.{ts,tsx}"] } });
