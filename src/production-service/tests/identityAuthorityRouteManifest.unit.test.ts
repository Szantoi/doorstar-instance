import { describe, expect, it } from "vitest";
import {
  collectDocumentedOpenApiOperations,
  productionServiceOpenApi,
  productionServiceOpenApiOperations,
  type DocumentedOpenApiOperation,
} from "../src/openapi.js";
import { legacyProductionRouteGroup } from "../src/httpRouteTopology.js";
import {
  buildDoorstarRouteManifest,
  initialDoorstarRouteManifest,
  initialRouteAccessPolicy,
} from "../src/services/identityAuthority/routeManifest.js";

describe("M2 Doorstar route-access manifest", () => {
  it("covers every unique OpenAPI operation exactly once without copying path or method policy", () => {
    expect(productionServiceOpenApiOperations).toHaveLength(85);
    expect(initialRouteAccessPolicy).toHaveLength(85);
    expect(initialDoorstarRouteManifest).toHaveLength(85);
    expect(new Set(initialRouteAccessPolicy.map(([operationId]) => operationId)).size).toBe(85);

    for (const entry of initialDoorstarRouteManifest) {
      const documented = productionServiceOpenApiOperations.find(({ operationId }) => operationId === entry.operationId);
      expect(documented).toEqual({
        operationId: entry.operationId,
        method: entry.method,
        pathTemplate: entry.pathTemplate,
      });
    }
  });

  it("keeps every current production operation legacy-only and exposes only operational root routes", () => {
    const productionOperations = initialDoorstarRouteManifest.filter(({ pathTemplate }) => pathTemplate.startsWith(`${legacyProductionRouteGroup.mountPath}/`));
    const publicOperational = initialDoorstarRouteManifest
      .filter(({ accessMode }) => accessMode === "public-operational")
      .map(({ operationId }) => operationId)
      .sort();

    expect(productionOperations).toHaveLength(82);
    expect(productionOperations.every(({ accessMode }) => accessMode === "legacy-only")).toBe(true);
    expect(publicOperational).toEqual(["getHealth", "getOpenApiContract", "getReadiness"]);
    expect(initialDoorstarRouteManifest.filter(({ accessMode }) => accessMode === "bff-only")).toEqual([]);
  });

  it("rejects a missing, stale, duplicate, or invalid policy instead of silently defaulting a route", () => {
    const operations = twoOperations();

    expect(() => buildDoorstarRouteManifest(operations, [["one", "legacy-only"]]))
      .toThrow("missing operationId: two");
    expect(() => buildDoorstarRouteManifest(operations, [
      ["one", "legacy-only"],
      ["one", "legacy-only"],
    ])).toThrow("duplicated: one");
    expect(() => buildDoorstarRouteManifest(operations, [
      ["one", "legacy-only"],
      ["stale", "legacy-only"],
    ])).toThrow("stale: stale");
    expect(() => buildDoorstarRouteManifest(operations, [
      ["one", "legacy-only"],
      ["two", "not-a-mode" as never],
    ])).toThrow("policy entry is invalid");
  });

  it("rejects a duplicate OpenAPI operationId before any policy is applied", () => {
    const [first] = twoOperations();
    expect(() => buildDoorstarRouteManifest([first, { ...first, pathTemplate: "/another" }], [["one", "legacy-only"]]))
      .toThrow("OpenAPI operationId is duplicated: one");
  });

  it("also rejects a duplicate operationId in a raw OpenAPI document", () => {
    expect(() => collectDocumentedOpenApiOperations({
      paths: {
        "/one": { get: { operationId: "same", responses: { 200: {} } } },
        "/two": { post: { operationId: "same", responses: { 201: {} } } },
      },
    })).toThrow("operationId must be unique: same");
  });

  it("uses the checked-in OpenAPI document as the inventory source", () => {
    expect(collectDocumentedOpenApiOperations(productionServiceOpenApi)).toEqual(productionServiceOpenApiOperations);
  });
});

function twoOperations(): readonly DocumentedOpenApiOperation[] {
  return [
    { operationId: "one", method: "get", pathTemplate: "/one" },
    { operationId: "two", method: "post", pathTemplate: "/two" },
  ];
}
