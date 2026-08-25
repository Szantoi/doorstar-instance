import {
  productionServiceOpenApiOperations,
  type DocumentedOpenApiOperation,
} from "../../openapi.js";
import { documentedHttpMethods } from "../../httpRouteTopology.js";

export const routeAccessModes = ["legacy-only", "bff-only", "public-operational"] as const;
export type RouteAccessMode = typeof routeAccessModes[number];

export interface DoorstarRouteManifestEntry extends DocumentedOpenApiOperation {
  readonly accessMode: RouteAccessMode;
}

type RouteAccessPolicyEntry = readonly [operationId: string, accessMode: RouteAccessMode];

/**
 * The policy is intentionally exhaustive and operationId-only. There is no
 * implicit fallback for a new OpenAPI operation: construction fails until its
 * access mode is reviewed and added here.
 */
export const initialRouteAccessPolicy = Object.freeze([
  ["addOrderDocument", "legacy-only"],
  ["addTaskComment", "legacy-only"],
  ["addTaskImage", "legacy-only"],
  ["advanceOrderIntakeStage", "legacy-only"],
  ["applyEpikTemplate", "legacy-only"],
  ["applyImportRunDraft", "legacy-only"],
  ["applyManufacturedItemCandidates", "legacy-only"],
  ["applySheetTemplate", "legacy-only"],
  ["approveOrderRevision", "legacy-only"],
  ["archiveProject", "legacy-only"],
  ["createComponentSnapshot", "legacy-only"],
  ["createDeadlineObservation", "legacy-only"],
  ["createImportCandidate", "legacy-only"],
  ["createManufacturedItem", "legacy-only"],
  ["createOperationPlanSnapshot", "legacy-only"],
  ["createOrder", "legacy-only"],
  ["createOrderPositionEvidence", "legacy-only"],
  ["createOrderRevision", "legacy-only"],
  ["createOrderSupplementaryItem", "legacy-only"],
  ["createProject", "legacy-only"],
  ["createSalesIntake", "legacy-only"],
  ["createTask", "legacy-only"],
  ["deleteEpic", "legacy-only"],
  ["deleteOrder", "legacy-only"],
  ["deleteOrderSupplementaryItem", "legacy-only"],
  ["deleteTask", "legacy-only"],
  ["deleteTaskImage", "legacy-only"],
  ["deleteWorkflowColumn", "legacy-only"],
  ["getBoard", "legacy-only"],
  ["getComponentCalculatorProfiles", "legacy-only"],
  ["getEpikRollup", "legacy-only"],
  ["getHealth", "public-operational"],
  ["getImportInbox", "legacy-only"],
  ["getImportRunEvidence", "legacy-only"],
  ["getImportWorkNumberEvidence", "legacy-only"],
  ["getKanban", "legacy-only"],
  ["getLoad", "legacy-only"],
  ["getOpenApiContract", "public-operational"],
  ["getOrderRevisionReadiness", "legacy-only"],
  ["getOverview", "legacy-only"],
  ["getProductionOrder", "legacy-only"],
  ["getProject", "legacy-only"],
  ["getProjectSheet", "legacy-only"],
  ["getProjectWorkflow", "legacy-only"],
  ["getReadiness", "public-operational"],
  ["getStations", "legacy-only"],
  ["getTask", "legacy-only"],
  ["getTechnicalCatalog", "legacy-only"],
  ["issueOrderDocumentReferences", "legacy-only"],
  ["issueProjectSession", "legacy-only"],
  ["issueProjectStep", "legacy-only"],
  ["linkOrderDocumentToPosition", "legacy-only"],
  ["listComponentSnapshots", "legacy-only"],
  ["listEpikTemplates", "legacy-only"],
  ["listImportRuns", "legacy-only"],
  ["listOperationPlanSnapshots", "legacy-only"],
  ["listOrderFeedback", "legacy-only"],
  ["listOrders", "legacy-only"],
  ["listProductionOrders", "legacy-only"],
  ["listProjects", "legacy-only"],
  ["listSheetTemplates", "legacy-only"],
  ["registerImportPreview", "legacy-only"],
  ["reportOrderFeedback", "legacy-only"],
  ["requestOrderReview", "legacy-only"],
  ["resolveOrderFeedback", "legacy-only"],
  ["reviewComponentSnapshot", "legacy-only"],
  ["reviewManufacturedItem", "legacy-only"],
  ["reviewManufacturedItemEvidence", "legacy-only"],
  ["reviewOperationPlanSnapshot", "legacy-only"],
  ["reviewOrderPositionEvidence", "legacy-only"],
  ["reviewOrderSupplementaryItem", "legacy-only"],
  ["reviewOrderSupplementaryItemEvidence", "legacy-only"],
  ["revokeProjectStep", "legacy-only"],
  ["saveEpics", "legacy-only"],
  ["saveEpikTemplate", "legacy-only"],
  ["saveProjectSheet", "legacy-only"],
  ["saveSheetTemplate", "legacy-only"],
  ["saveStationWorkflow", "legacy-only"],
  ["saveWeekNote", "legacy-only"],
  ["setCapacity", "legacy-only"],
  ["updateDraftOrderRevision", "legacy-only"],
  ["updateOrder", "legacy-only"],
  ["updateOrderSupplementaryItem", "legacy-only"],
  ["updateProject", "legacy-only"],
  ["updateTask", "legacy-only"],
] as const satisfies readonly RouteAccessPolicyEntry[]);

/**
 * Passive M2 inventory only. It is not an Express router and must not be used
 * to wrap legacy routes: bff-only remains empty until an atomic native cutover.
 */
export const initialDoorstarRouteManifest = buildDoorstarRouteManifest(
  productionServiceOpenApiOperations,
  initialRouteAccessPolicy,
);

export function buildDoorstarRouteManifest(
  operations: readonly DocumentedOpenApiOperation[],
  policy: readonly (readonly [string, RouteAccessMode])[],
): readonly DoorstarRouteManifestEntry[] {
  const operationsById = new Map<string, DocumentedOpenApiOperation>();
  for (const operation of operations) {
    if (!isValidOperation(operation)) throw new Error("Route manifest received an invalid OpenAPI operation.");
    if (operationsById.has(operation.operationId)) {
      throw new Error(`Route manifest OpenAPI operationId is duplicated: ${operation.operationId}.`);
    }
    operationsById.set(operation.operationId, operation);
  }

  const accessByOperationId = new Map<string, RouteAccessMode>();
  for (const entry of policy) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !routeAccessModes.includes(entry[1])) {
      throw new Error("Route manifest policy entry is invalid.");
    }
    const [operationId, accessMode] = entry;
    if (accessByOperationId.has(operationId)) throw new Error(`Route manifest policy operationId is duplicated: ${operationId}.`);
    if (!operationsById.has(operationId)) throw new Error(`Route manifest policy operationId is stale: ${operationId}.`);
    accessByOperationId.set(operationId, accessMode);
  }

  if (accessByOperationId.size !== operationsById.size) {
    const missingOperationId = [...operationsById.keys()].find((operationId) => !accessByOperationId.has(operationId));
    throw new Error(`Route manifest policy is missing operationId: ${missingOperationId ?? "unknown"}.`);
  }

  return Object.freeze(operations.map((operation) => Object.freeze({
    ...operation,
    accessMode: accessByOperationId.get(operation.operationId)!,
  })));
}

function isValidOperation(value: DocumentedOpenApiOperation): boolean {
  return typeof value.operationId === "string"
    && value.operationId.length > 0
    && value.operationId.trim() === value.operationId
    && documentedHttpMethods.includes(value.method)
    && typeof value.pathTemplate === "string"
    && value.pathTemplate.startsWith("/");
}
