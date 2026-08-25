/**
 * Runtime-safe OpenAPI drift guard. The API uses Express
 * routers, so this discovers their literal declarations and requires the
 * checked-in OpenAPI 3.1 document to contain exactly the same operations.
 * App topology is expanded from the actual Express runtime stack without
 * opening a database connection; source discovery separately guards the
 * legacy source-file registry.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectDocumentedOpenApiOperations } from "../src/openapi.js";
import { createApp } from "../src/app.js";
import { collectRuntimeOpenApiRoutes } from "../src/runtimeRouteInventory.js";
import { initialDoorstarRouteManifest } from "../src/services/identityAuthority/routeManifest.js";
import { legacyProductionRouteGroup } from "../src/httpRouteTopology.js";
import {
  discoverLegacyProductionRouteDeclarations,
  readLegacyRouteSources,
} from "./openApiRouteDiscovery.js";

type OpenApiDocument = { openapi?: unknown; info?: { title?: unknown; version?: unknown } };

const serviceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const routesDirectory = join(serviceRoot, "src", "routes");
const specPath = join(serviceRoot, "openapi", "production-service.openapi.json");

const document = JSON.parse(await readFile(specPath, "utf8")) as OpenApiDocument;
if (document.openapi !== "3.1.0" || !document.info?.title || !document.info.version) {
  throw new Error("OpenAPI document must declare version 3.1.0 plus non-empty title and version.");
}

const routeSources = await readLegacyRouteSources(routesDirectory);
const legacySourceRoutes = discoverLegacyProductionRouteDeclarations(routeSources, legacyProductionRouteGroup);
const runtimeRoutes = collectRuntimeOpenApiRoutes(createApp());
const declared = new Set(runtimeRoutes.map(({ method, pathTemplate }) => `${method} ${pathTemplate}`));
const documentedInventory = collectDocumentedOpenApiOperations(document);
const documented = new Set(documentedInventory.map(({ method, pathTemplate }) => `${method} ${pathTemplate}`));
const missing = [...declared].filter((operation) => !documented.has(operation));
const stale = [...documented].filter((operation) => !declared.has(operation));
if (missing.length || stale.length) {
  throw new Error(`OpenAPI route drift. Missing: ${missing.join(", ") || "none"}. Stale: ${stale.join(", ") || "none"}.`);
}

const documentedLegacy = new Set(documentedInventory
  .filter(({ pathTemplate }) => pathTemplate.startsWith(`${legacyProductionRouteGroup.mountPath}/`))
  .map(({ method, pathTemplate }) => `${method} ${pathTemplate}`));
const discoveredLegacy = new Set(legacySourceRoutes.map(({ method, pathTemplate }) => `${method} ${pathTemplate}`));
const missingLegacySource = [...discoveredLegacy].filter((operation) => !documentedLegacy.has(operation));
const staleLegacySource = [...documentedLegacy].filter((operation) => !discoveredLegacy.has(operation));
if (missingLegacySource.length || staleLegacySource.length) {
  throw new Error(`OpenAPI legacy source route drift. Missing: ${missingLegacySource.join(", ") || "none"}. Stale: ${staleLegacySource.join(", ") || "none"}.`);
}

const manifestByOperationId = new Map(initialDoorstarRouteManifest.map((entry) => [entry.operationId, entry]));
const missingManifest = documentedInventory
  .filter(({ operationId }) => !manifestByOperationId.has(operationId))
  .map(({ operationId }) => operationId);
const staleManifest = initialDoorstarRouteManifest
  .filter(({ operationId }) => !documentedInventory.some((operation) => operation.operationId === operationId))
  .map(({ operationId }) => operationId);
const manifestMismatch = documentedInventory
  .filter(({ operationId, method, pathTemplate }) => {
    const manifest = manifestByOperationId.get(operationId);
    return manifest === undefined || manifest.method !== method || manifest.pathTemplate !== pathTemplate;
  })
  .map(({ operationId }) => operationId);
if (missingManifest.length || staleManifest.length || manifestMismatch.length) {
  throw new Error(`OpenAPI route-manifest drift. Missing: ${missingManifest.join(", ") || "none"}. Stale: ${staleManifest.join(", ") || "none"}. Mismatch: ${manifestMismatch.join(", ") || "none"}.`);
}

console.log(JSON.stringify({
  openapi: document.openapi,
  operations: documented.size,
  runtimeOperations: declared.size,
  legacySourceOperations: discoveredLegacy.size,
  routeCoverage: "complete",
  routeManifestCoverage: "complete",
}, null, 2));
