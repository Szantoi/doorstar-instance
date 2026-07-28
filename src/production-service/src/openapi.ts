import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type OpenApiDocument = {
  openapi: string;
  info: { title: string; version: string };
};

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(moduleDirectory, "../openapi/production-service.openapi.json");

/**
 * Runtime copy of the checked-in API contract. The build copies this JSON next
 * to `dist/`, so development and the deployed service expose the same source.
 */
export const productionServiceOpenApi = JSON.parse(readFileSync(specPath, "utf8")) as OpenApiDocument;
