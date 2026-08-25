import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveOpenApiAssetPath } from "../src/openapi.js";

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("OpenAPI runtime asset resolution", () => {
  it("uses the source asset for source execution and the bundled asset for compiled execution", () => {
    expect(resolveOpenApiAssetPath(resolve(serviceRoot, "src")))
      .toBe(resolve(serviceRoot, "openapi/production-service.openapi.json"));
    expect(resolveOpenApiAssetPath(resolve(serviceRoot, "dist")))
      .toBe(resolve(serviceRoot, "dist/openapi/production-service.openapi.json"));
  });
});
