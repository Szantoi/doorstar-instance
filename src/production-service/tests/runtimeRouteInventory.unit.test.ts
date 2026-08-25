import type { Express } from "express";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { productionServiceOpenApiOperations } from "../src/openapi.js";
import { collectRuntimeOpenApiRoutes } from "../src/runtimeRouteInventory.js";

describe("runtime Express route inventory", () => {
  it("expands the actual application stack to the exact 85-operation OpenAPI inventory without a database request", () => {
    const actual = collectRuntimeOpenApiRoutes(createApp())
      .map(({ method, pathTemplate }) => `${method} ${pathTemplate}`)
      .sort();
    const documented = productionServiceOpenApiOperations
      .map(({ method, pathTemplate }) => `${method} ${pathTemplate}`)
      .sort();

    expect(actual).toEqual(documented);
    expect(actual).toHaveLength(85);
  });

  it("rejects a scoped middleware mount that could intercept an undeclared BFF path", () => {
    expect(() => collectRuntimeOpenApiRoutes(fakeApp([
      routeLayer("/healthz", { get: true }),
      scopedMiddlewareLayer("^\\/bff\\/?(?=\\/|$)"),
    ]))).toThrow("unregistered scoped middleware");
  });

  it("rejects an extra handler mounted beside an otherwise valid router group", () => {
    expect(() => collectRuntimeOpenApiRoutes(fakeApp([
      {
        regexp: { fast_slash: false, source: "^\\/api\\/?(?=\\/|$)" },
        handle: { stack: [routeLayer("/known", { get: true })] },
      },
      scopedMiddlewareLayer("^\\/api\\/?(?=\\/|$)"),
    ]))).toThrow("unregistered scoped middleware");
  });

  it("rejects an undocumented runtime method such as TRACE", () => {
    expect(() => collectRuntimeOpenApiRoutes(fakeApp([
      routeLayer("/trace", { trace: true }),
    ]))).toThrow("undocumented HTTP method TRACE");
  });

  it("rejects a dynamic runtime mount instead of guessing its OpenAPI path", () => {
    expect(() => collectRuntimeOpenApiRoutes(fakeApp([
      {
        regexp: { fast_slash: false, source: "^\\/(?:([^\\/]+?))\\/?(?=\\/|$)" },
        handle: { stack: [] },
      },
    ]))).toThrow("not a static safe path");
  });
});

function fakeApp(stack: readonly unknown[]): Express {
  return { _router: { stack } } as unknown as Express;
}

function routeLayer(path: string, methods: Record<string, boolean>) {
  return { route: { path, methods } };
}

function scopedMiddlewareLayer(source: string) {
  return {
    regexp: { fast_slash: false, source },
    handle: () => undefined,
  };
}
