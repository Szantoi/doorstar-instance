import { defineConfig } from "vitest/config";

/** F-phase tests are deliberately pure: they do not connect to PostgreSQL,
 * Docker, an IdP, a browser, or another Doorstar application. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.unit.test.ts"],
  },
});
