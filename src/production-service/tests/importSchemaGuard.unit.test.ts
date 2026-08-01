import { describe, expect, it } from "vitest";
import { isImportTestSchema } from "../src/services/importSchemaGuard.js";

describe("import test-schema guard", () => {
  it("accepts the manually reviewed import schema", () => {
    expect(isImportTestSchema("doorstar_test")).toBe(true);
  });

  it("accepts a generated Vitest schema", () => {
    expect(isImportTestSchema("doorstar_test_vitest_4242_0123abcd")).toBe(true);
  });

  it("rejects public, production and arbitrary schemas", () => {
    expect(isImportTestSchema("public")).toBe(false);
    expect(isImportTestSchema("doorstar_production")).toBe(false);
    expect(isImportTestSchema("doorstar_test_copy")).toBe(false);
    expect(isImportTestSchema(null)).toBe(false);
  });
});
