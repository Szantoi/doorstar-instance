import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { legacyProductionRouteGroup } from "../src/httpRouteTopology.js";
import {
  assertUniqueDeclaredOpenApiRoutes,
  discoverLegacyProductionRouteDeclarations,
  readLegacyRouteSources,
  type LegacyRouteDiscoveryConfig,
  type RouteSource,
} from "../scripts/openApiRouteDiscovery.js";

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("OpenAPI route topology discovery", () => {
  it("derives the recursively registered legacy route inventory from the shared topology", async () => {
    const routeSources = await readLegacyRouteSources(resolve(serviceRoot, "src/routes"));
    const legacy = discoverLegacyProductionRouteDeclarations(routeSources, legacyProductionRouteGroup);

    expect(legacy).toHaveLength(82);
    expect(assertUniqueDeclaredOpenApiRoutes(legacy)).toHaveLength(82);
    expect(legacy.every(({ pathTemplate }) => pathTemplate.startsWith("/api/production/"))).toBe(true);
  });

  it("fails closed when the source registry is missing or contains a stale route file", () => {
    const config: LegacyRouteDiscoveryConfig = { mountPath: "/api/production", sourceFiles: ["alpha.ts"] };
    expect(() => discoverLegacyProductionRouteDeclarations([routerSource("beta.ts", "betaRouter", "/beta")], config))
      .toThrow("Route topology source registry drift. Missing: alpha.ts. Stale: beta.ts.");
  });

  it("rejects duplicate declarations with both source locations before a Set or Map can hide them", () => {
    const config: LegacyRouteDiscoveryConfig = {
      mountPath: "/api/production",
      sourceFiles: ["first.ts", "nested/second.ts"],
    };
    expect(() => discoverLegacyProductionRouteDeclarations([
      routerSource("first.ts", "firstRouter", "/same"),
      routerSource("nested/second.ts", "secondRouter", "/same"),
    ], config)).toThrow("Duplicate Express route declaration GET /api/production/same: first.ts:2 and nested/second.ts:2.");
  });

  it("rejects dynamic path and nested-router syntax instead of silently omitting it", () => {
    const config: LegacyRouteDiscoveryConfig = { mountPath: "/api/production", sourceFiles: ["unsafe.ts"] };
    const dynamicPath: RouteSource = {
      relativePath: "unsafe.ts",
      content: "const unsafeRouter = Router();\nunsafeRouter.get(pathTemplate, handler);",
    };
    expect(() => discoverLegacyProductionRouteDeclarations([dynamicPath], config))
      .toThrow("must use a literal path");

    const nestedRouter: RouteSource = {
      relativePath: "unsafe.ts",
      content: "const unsafeRouter = Router();\nunsafeRouter.use(childRouter);",
    };
    expect(() => discoverLegacyProductionRouteDeclarations([nestedRouter], config))
      .toThrow("Unsupported nested Express router syntax");
  });

});

function routerSource(relativePath: string, routerName: string, pathTemplate: string): RouteSource {
  return {
    relativePath,
    content: `const ${routerName} = Router();\n${routerName}.get(\"${pathTemplate}\", handler);`,
  };
}
