/**
 * Lightweight, dependency-free OpenAPI drift guard. The API uses Express
 * routers, so this discovers their literal declarations and requires the
 * checked-in OpenAPI 3.1 document to contain exactly the same operations.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type OpenApiOperation = { operationId?: unknown; responses?: unknown };
type OpenApiDocument = { openapi?: unknown; info?: { title?: unknown; version?: unknown }; paths?: Record<string, Record<string, OpenApiOperation>> };

const serviceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const routesDirectory = join(serviceRoot, "src", "routes");
const specPath = join(serviceRoot, "openapi", "production-service.openapi.json");
const methods = new Set(["get", "post", "put", "patch", "delete"]);

function toOpenApiPath(routePath: string): string {
  return `/api/production${routePath.replace(/:([A-Za-z0-9_]+)/g, "{$1}")}`;
}

async function declaredOperations(): Promise<Set<string>> {
  const files = await readdir(routesDirectory);
  const operations = new Set<string>(["get /healthz", "get /readyz", "get /openapi.json"]);
  for (const file of files.filter((entry) => entry.endsWith(".ts"))) {
    const content = await readFile(join(routesDirectory, file), "utf8");
    const expression = /\w+Router\.(get|post|put|patch|delete)\("([^"\n]+)"/g;
    for (const match of content.matchAll(expression)) operations.add(`${match[1]} ${toOpenApiPath(match[2])}`);
  }
  return operations;
}

function documentedOperations(document: OpenApiDocument): Set<string> {
  const operations = new Set<string>();
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!methods.has(method)) continue;
      if (!operation.operationId || !operation.responses) throw new Error(`OpenAPI operation ${method.toUpperCase()} ${path} needs operationId and responses.`);
      operations.add(`${method} ${path}`);
    }
  }
  return operations;
}

const document = JSON.parse(await readFile(specPath, "utf8")) as OpenApiDocument;
if (document.openapi !== "3.1.0" || !document.info?.title || !document.info.version) {
  throw new Error("OpenAPI document must declare version 3.1.0 plus non-empty title and version.");
}

const declared = await declaredOperations();
const documented = documentedOperations(document);
const missing = [...declared].filter((operation) => !documented.has(operation));
const stale = [...documented].filter((operation) => !declared.has(operation));
if (missing.length || stale.length) {
  throw new Error(`OpenAPI route drift. Missing: ${missing.join(", ") || "none"}. Stale: ${stale.join(", ") || "none"}.`);
}

console.log(JSON.stringify({ openapi: document.openapi, operations: documented.size, routeCoverage: "complete" }, null, 2));
