import type { Express } from "express";
import { documentedHttpMethods, type DocumentedHttpMethod } from "./httpRouteTopology.js";

export interface RuntimeOpenApiRoute {
  readonly method: DocumentedHttpMethod;
  readonly pathTemplate: string;
  /** Runtime stack location, retained for actionable duplicate errors. */
  readonly source: string;
}

interface ExpressLayer {
  readonly route?: {
    readonly path?: unknown;
    readonly methods?: unknown;
  };
  readonly handle?: { readonly stack?: unknown };
  readonly regexp?: {
    readonly fast_slash?: unknown;
    readonly source?: unknown;
  };
}

/**
 * Expands the actual Express 4 runtime stack without sending a request or
 * opening a database connection. Only static mounts are accepted: a dynamic
 * or scoped middleware mount must be declared explicitly rather than silently
 * disappearing from the OpenAPI/manifest gate.
 */
export function collectRuntimeOpenApiRoutes(app: Express): readonly RuntimeOpenApiRoute[] {
  const stack = extractStack(app, "application");
  const routes: RuntimeOpenApiRoute[] = [];
  visitStack(stack, "", "app", routes);
  return assertUniqueRuntimeRoutes(routes);
}

function visitStack(
  stack: readonly unknown[],
  prefix: string,
  location: string,
  routes: RuntimeOpenApiRoute[],
): void {
  for (const [index, value] of stack.entries()) {
    const layer = asLayer(value, `${location}[${index}]`);
    const layerLocation = `${location}[${index}]`;
    if (layer.route !== undefined) {
      for (const route of extractRouteMethods(layer.route, layerLocation)) {
        routes.push(Object.freeze({
          method: route.method,
          pathTemplate: toOpenApiPath(joinMountPath(prefix, route.path), layerLocation),
          source: layerLocation,
        }));
      }
      continue;
    }

    const nestedStack = layer.handle?.stack;
    const mountPath = extractStaticMountPath(layer, layerLocation);
    if (Array.isArray(nestedStack)) {
      visitStack(nestedStack, joinMountPath(prefix, mountPath), layerLocation, routes);
      continue;
    }

    // Global middleware has an empty mount path and cannot add a reachable
    // route. A path-scoped handler could intercept or implement an undeclared
    // BFF route, so it is deliberately a verifier failure.
    if (mountPath.length > 0) {
      throw new Error(`Runtime Express stack contains unregistered scoped middleware at ${layerLocation}: ${mountPath}.`);
    }
  }
}

function extractStack(value: unknown, location: string): readonly unknown[] {
  const router = asRecord(value)?._router;
  const stack = asRecord(router)?.stack;
  if (!Array.isArray(stack)) throw new Error(`Runtime Express ${location} has no inspectable router stack.`);
  return stack;
}

function asLayer(value: unknown, location: string): ExpressLayer {
  const record = asRecord(value);
  if (record === undefined) throw new Error(`Runtime Express stack contains a malformed layer at ${location}.`);
  return record as ExpressLayer;
}

function extractRouteMethods(
  route: NonNullable<ExpressLayer["route"]>,
  location: string,
): readonly { readonly method: DocumentedHttpMethod; readonly path: string }[] {
  if (typeof route.path !== "string" || !route.path.startsWith("/")) {
    throw new Error(`Runtime Express route at ${location} must have a static string path.`);
  }
  const methods = asRecord(route.methods);
  if (methods === undefined) throw new Error(`Runtime Express route at ${location} has no method inventory.`);

  const result: { method: DocumentedHttpMethod; path: string }[] = [];
  for (const [method, enabled] of Object.entries(methods)) {
    if (enabled !== true) continue;
    if (!isDocumentedHttpMethod(method)) {
      throw new Error(`Runtime Express route at ${location} uses undocumented HTTP method ${method.toUpperCase()}.`);
    }
    result.push(Object.freeze({ method, path: route.path }));
  }
  if (result.length === 0) throw new Error(`Runtime Express route at ${location} has no enabled documented method.`);
  return Object.freeze(result);
}

function extractStaticMountPath(layer: ExpressLayer, location: string): string {
  const regexp = layer.regexp;
  if (regexp === undefined || regexp.fast_slash === true) return "";
  if (typeof regexp.source !== "string") {
    throw new Error(`Runtime Express mount at ${location} has no inspectable static regexp.`);
  }

  const suffix = "\\/?(?=\\/|$)";
  if (!regexp.source.startsWith("^") || !regexp.source.endsWith(suffix)) {
    throw new Error(`Runtime Express mount at ${location} is dynamic or unsupported: ${regexp.source}.`);
  }
  const encodedPath = regexp.source.slice(1, -suffix.length);
  if (encodedPath.length === 0) return "";
  if (!/^(?:\\\/[A-Za-z0-9_-]+)*$/u.test(encodedPath)) {
    throw new Error(`Runtime Express mount at ${location} is not a static safe path: ${regexp.source}.`);
  }
  return encodedPath.replace(/\\\//gu, "/");
}

function joinMountPath(prefix: string, path: string): string {
  if (prefix.length === 0) return path;
  if (path.length === 0) return prefix;
  return `${prefix}${path}`;
}

function toOpenApiPath(path: string, location: string): string {
  if (!path.startsWith("/")) throw new Error(`Runtime Express path at ${location} is not absolute: ${path}.`);
  return path.replace(/:([A-Za-z0-9_]+)/gu, "{$1}");
}

function assertUniqueRuntimeRoutes(routes: readonly RuntimeOpenApiRoute[]): readonly RuntimeOpenApiRoute[] {
  const byOperation = new Map<string, RuntimeOpenApiRoute>();
  for (const route of routes) {
    const operation = `${route.method.toUpperCase()} ${route.pathTemplate}`;
    const previous = byOperation.get(operation);
    if (previous !== undefined) {
      throw new Error(`Runtime Express route is duplicated: ${operation} at ${previous.source} and ${route.source}.`);
    }
    byOperation.set(operation, route);
  }
  return Object.freeze([...routes]);
}

function isDocumentedHttpMethod(value: string): value is DocumentedHttpMethod {
  return (documentedHttpMethods as readonly string[]).includes(value);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return (typeof value === "object" || typeof value === "function") && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}
