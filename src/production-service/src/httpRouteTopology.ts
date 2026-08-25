/**
 * Service-owned HTTP topology. The app mounts these exact route groups and
 * the OpenAPI verifier reads the same declaration, so a source-file or mount
 * change cannot silently leave the contract check on an old hard-coded list.
 */
export const documentedHttpMethods = ["get", "post", "put", "patch", "delete"] as const;
export type DocumentedHttpMethod = typeof documentedHttpMethods[number];

export interface OperationalRouteDefinition {
  readonly method: DocumentedHttpMethod;
  readonly pathTemplate: string;
}

export const operationalRouteDefinitions = Object.freeze({
  health: Object.freeze({ method: "get", pathTemplate: "/healthz" }),
  readiness: Object.freeze({ method: "get", pathTemplate: "/readyz" }),
  openApi: Object.freeze({ method: "get", pathTemplate: "/openapi.json" }),
} as const satisfies Readonly<Record<string, OperationalRouteDefinition>>);

export const legacyProductionRouteGroup = Object.freeze({
  mountPath: "/api/production",
  /**
   * Ordered to preserve the existing Express registration order. Route source
   * discovery compares this list with the recursive directory inventory.
   */
  sourceFiles: [
    "board.ts",
    "tasks.ts",
    "kanban.ts",
    "load.ts",
    "projects.ts",
    "templates.ts",
    "overview.ts",
    "productionOrders.ts",
    "orderPositionEvidence.ts",
    "manufacturedItems.ts",
    "supplementaryItems.ts",
    "componentSnapshots.ts",
    "operationPlanSnapshots.ts",
    "readiness.ts",
    "technicalCatalog.ts",
    "importRuns.ts",
  ],
} as const);

export type LegacyProductionRouteSourceFile = typeof legacyProductionRouteGroup.sourceFiles[number];
