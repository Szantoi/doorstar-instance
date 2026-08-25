import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { documentedHttpMethods, type DocumentedHttpMethod } from "./httpRouteTopology.js";

export type { DocumentedHttpMethod } from "./httpRouteTopology.js";

export interface ProductionServiceOpenApiDocument {
  readonly openapi: string;
  readonly info: { readonly title: string; readonly version: string };
  readonly paths: Readonly<Record<string, unknown>>;
}

/** Stable inventory key used by the M2 route-access policy. */
export interface DocumentedOpenApiOperation {
  readonly operationId: string;
  readonly method: DocumentedHttpMethod;
  readonly pathTemplate: string;
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const specPath = resolveOpenApiAssetPath(moduleDirectory);

/**
 * Runtime copy of the checked-in API contract. The build copies this JSON next
 * to `dist/`, so development and the deployed service expose the same source.
 */
export const productionServiceOpenApi = JSON.parse(readFileSync(specPath, "utf8")) as ProductionServiceOpenApiDocument;

/**
 * Source execution reads the checked-in root asset; compiled execution reads
 * only the asset copied beside `dist/openapi.js`. A dist-only package must not
 * silently depend on a source checkout remaining alongside it.
 */
export function resolveOpenApiAssetPath(moduleDirectory: string): string {
  const assetRoot = basename(moduleDirectory) === "dist"
    ? moduleDirectory
    : resolve(moduleDirectory, "..");
  return resolve(assetRoot, "openapi/production-service.openapi.json");
}

/**
 * Produces a fail-closed operation inventory from an OpenAPI 3.1 document.
 * Route policy owns only operationId → mode; method and path always stay in
 * this checked-in contract rather than being copied into policy code.
 */
export function collectDocumentedOpenApiOperations(document: unknown): readonly DocumentedOpenApiOperation[] {
  const paths = asRecord(asRecord(document)?.paths);
  if (paths === undefined) throw new Error("OpenAPI document needs a paths object.");

  const operationIds = new Set<string>();
  const operations: DocumentedOpenApiOperation[] = [];
  for (const pathTemplate of Object.keys(paths).sort()) {
    if (!pathTemplate.startsWith("/")) throw new Error(`OpenAPI path must start with '/': ${pathTemplate}.`);
    const pathItem = asRecord(paths[pathTemplate]);
    if (pathItem === undefined) throw new Error(`OpenAPI path ${pathTemplate} must be an object.`);

    for (const method of documentedHttpMethods) {
      const operation = pathItem[method];
      if (operation === undefined) continue;
      const operationRecord = asRecord(operation);
      const operationId = operationRecord?.operationId;
      const responses = asRecord(operationRecord?.responses);
      if (typeof operationId !== "string" || operationId.length === 0 || operationId.trim() !== operationId || responses === undefined || Object.keys(responses).length === 0) {
        throw new Error(`OpenAPI operation ${method.toUpperCase()} ${pathTemplate} needs a non-empty operationId and responses.`);
      }
      if (operationIds.has(operationId)) throw new Error(`OpenAPI operationId must be unique: ${operationId}.`);

      operationIds.add(operationId);
      operations.push(Object.freeze({ operationId, method, pathTemplate }));
    }
  }
  return Object.freeze(operations);
}

export const productionServiceOpenApiOperations = collectDocumentedOpenApiOperations(productionServiceOpenApi);

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}
