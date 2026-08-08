import type { FlowLabPins, FlowLabPredecessor } from "@/services/production/types";

/**
 * Read-only Flow Lab wire contract.
 *
 * This deliberately models only GET representations. Review, materialization
 * and board-change commands stay out of the browser client until an
 * authenticated policy boundary exists.
 */
export type FlowLabSnapshotState = "REVIEW" | "VERIFIED" | "REJECTED";
export type FlowLabOperationType = "ActiveWork" | "Summary";

export interface FlowLabReadinessBlocker {
  code: string;
  message: string;
  entityId?: string;
}

export interface FlowLabReadiness {
  ready: boolean;
  blockers: FlowLabReadinessBlocker[];
  allowedActions: string[];
}

export interface FlowLabPlanOperationRead {
  id: string;
  correlationKey: string;
  operationType: FlowLabOperationType;
  station: string | null;
  boardProjection: { quantity: number; unitHours: number };
  relativePosition: number;
  predecessors: FlowLabPredecessor[];
  /** The current Doorstar projection preserves the immutable operation text
   * under workflowGroup. It is optional in the formal OpenAPI envelope. */
  workflowGroup?: string;
  sourceOperationKey?: string;
  quantityUnit?: string;
}

export interface FlowLabFinding {
  code: string;
  severity: "Information" | "Warning" | "Error";
  count: number;
}

export interface FlowLabUnresolvedEvidence {
  code: string;
  field: string;
  count: number;
}

export interface FlowLabAbsentMember {
  name: string;
  reason: string;
}

/** Immutable artifact members supplied by the formal Flow Lab read contract. */
export interface FlowLabSnapshotEvidence {
  findings: FlowLabFinding[];
  unresolved: FlowLabUnresolvedEvidence[];
  absentMembers: FlowLabAbsentMember[];
  productionAuthority: false;
}

export interface FlowLabPlanSnapshotRead {
  id: string;
  origin: "FLOW_LAB";
  orderRevisionId: string;
  componentSnapshotId: string;
  state: FlowLabSnapshotState;
  schemaVersion: "doorstar.flow-lab.plan-materialization/v1";
  generatorProfileVersion: "flow-lab";
  generatorProfileFingerprint: string;
  standardCatalogVersion: string;
  standardCatalogFingerprint: string;
  sourceSetKey: string;
  materializationKey: string;
  pins: FlowLabPins;
  operations: FlowLabPlanOperationRead[];
  readiness: FlowLabReadiness;
  createdAt: string;
  reviewResolution: string | null;
  reviewedByRole: string | null;
  reviewedByPrincipal: string | null;
  reviewedAt: string | null;
  createdByRole: string;
  createdByPrincipal: string;
  reviewNote: string;
  orderContentHash: string;
  componentOutputHash: string;
  inputHash: string;
  outputHash: string;
  resourceMappingVersion: string;
  resourceMappingFingerprint: string;
  evidence: FlowLabSnapshotEvidence;
}

export interface FlowLabPlanSnapshotList {
  snapshots: FlowLabPlanSnapshotRead[];
}

export interface FlowLabDeviationPins extends FlowLabPins {
  sourceSetKey: string;
  materializationKey: string;
}

export interface FlowLabDeviationRecord {
  id: string;
  occurredAt: string;
  kind: string;
  correlationKey: string | null;
  actor: { role: string; principal: string };
  payload: Record<string, unknown>;
  materializationId: string;
  pins: FlowLabDeviationPins;
}

export interface FlowLabDeviationList {
  records: FlowLabDeviationRecord[];
  nextCursor: string | null;
}

export class FlowLabContractError extends Error {
  constructor() {
    super("A Flow Lab olvasó nézetének válasza nem felel meg a kiadott szerződésnek.");
    this.name = "FlowLabContractError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Matches OpenAPI `additionalProperties: false` without recreating domain
 * validation in the browser. */
function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[]) {
  return Object.keys(value).length === required.length
    && required.every((key) => Object.hasOwn(value, key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function readRequiredNullableString(value: Record<string, unknown>, key: string): string | null {
  const candidate = value[key];
  if (!Object.hasOwn(value, key) || !isNullableString(candidate)) throw new FlowLabContractError();
  return candidate;
}

function readRequiredText(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];
  if (typeof candidate !== "string") throw new FlowLabContractError();
  return candidate;
}

function readRequiredHash(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];
  if (!isSha256(candidate)) throw new FlowLabContractError();
  return candidate;
}

function parsePins(value: unknown): FlowLabPins {
  if (!isRecord(value)
    || !hasExactKeys(value, ["catalogRevision", "catalogHash", "planHash", "engineIdentity"])
    || !isNonEmptyString(value.catalogRevision)
    || !isSha256(value.catalogHash)
    || !isSha256(value.planHash)
    || !isNonEmptyString(value.engineIdentity)) throw new FlowLabContractError();
  return {
    catalogRevision: value.catalogRevision,
    catalogHash: value.catalogHash,
    planHash: value.planHash,
    engineIdentity: value.engineIdentity,
  };
}

function parsePredecessor(value: unknown): FlowLabPredecessor {
  if (!isRecord(value)
    || !hasExactKeys(value, ["correlationKey", "type", "lagMinutes", "partialRelease"])
    || !isNonEmptyString(value.correlationKey)
    || !["FS", "SS", "FF", "SF"].includes(String(value.type))
    || !isFiniteNonNegative(value.lagMinutes)
    || !Number.isInteger(value.lagMinutes)
    || !(value.partialRelease === null || typeof value.partialRelease === "string")) throw new FlowLabContractError();
  return {
    correlationKey: value.correlationKey,
    type: value.type as FlowLabPredecessor["type"],
    lagMinutes: value.lagMinutes,
    partialRelease: value.partialRelease,
  };
}

function parseOperation(value: unknown): FlowLabPlanOperationRead {
  const relativePosition = isRecord(value) ? value.relativePosition : undefined;
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.correlationKey)
    || !(value.operationType === "ActiveWork" || value.operationType === "Summary")
    || !(value.station === null || typeof value.station === "string")
    || !isRecord(value.boardProjection)
    || !hasExactKeys(value.boardProjection, ["quantity", "unitHours"])
    || !isFiniteNonNegative(value.boardProjection.quantity)
    || !isFiniteNonNegative(value.boardProjection.unitHours)
    || typeof relativePosition !== "number"
    || !Number.isInteger(relativePosition)
    || relativePosition < 1
    || !Array.isArray(value.predecessors)) throw new FlowLabContractError();

  if (value.workflowGroup !== undefined && typeof value.workflowGroup !== "string") throw new FlowLabContractError();
  if (value.sourceOperationKey !== undefined && typeof value.sourceOperationKey !== "string") throw new FlowLabContractError();
  if (value.quantityUnit !== undefined && typeof value.quantityUnit !== "string") throw new FlowLabContractError();

  return {
    id: value.id,
    correlationKey: value.correlationKey,
    operationType: value.operationType,
    station: value.station,
    boardProjection: {
      quantity: value.boardProjection.quantity,
      unitHours: value.boardProjection.unitHours,
    },
    relativePosition,
    predecessors: value.predecessors.map(parsePredecessor),
    ...(value.workflowGroup === undefined ? {} : { workflowGroup: value.workflowGroup }),
    ...(value.sourceOperationKey === undefined ? {} : { sourceOperationKey: value.sourceOperationKey }),
    ...(value.quantityUnit === undefined ? {} : { quantityUnit: value.quantityUnit }),
  };
}

function parseReadinessBlocker(value: unknown): FlowLabReadinessBlocker {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["code", "message", "entityId"])
    || !isNonEmptyString(value.code)
    || !isNonEmptyString(value.message)
    || !(value.entityId === undefined || isNonEmptyString(value.entityId))) throw new FlowLabContractError();
  return {
    code: value.code,
    message: value.message,
    ...(value.entityId === undefined ? {} : { entityId: value.entityId }),
  };
}

function parseReadiness(value: unknown): FlowLabReadiness {
  if (!isRecord(value)
    || !hasExactKeys(value, ["ready", "blockers", "allowedActions"])
    || typeof value.ready !== "boolean"
    || !Array.isArray(value.blockers)
    || !Array.isArray(value.allowedActions)
    || !value.allowedActions.every(isNonEmptyString)) throw new FlowLabContractError();
  return {
    ready: value.ready,
    blockers: value.blockers.map(parseReadinessBlocker),
    allowedActions: value.allowedActions,
  };
}

function parseFinding(value: unknown): FlowLabFinding {
  if (!isRecord(value)
    || !hasExactKeys(value, ["code", "severity", "count"])
    || !isNonEmptyString(value.code)
    || !["Information", "Warning", "Error"].includes(String(value.severity))
    || !isFiniteNonNegative(value.count)
    || !Number.isInteger(value.count)) throw new FlowLabContractError();
  return { code: value.code, severity: value.severity as FlowLabFinding["severity"], count: value.count };
}

function parseUnresolved(value: unknown): FlowLabUnresolvedEvidence {
  if (!isRecord(value)
    || !hasExactKeys(value, ["code", "field", "count"])
    || !isNonEmptyString(value.code)
    || !isNonEmptyString(value.field)
    || !isFiniteNonNegative(value.count)
    || !Number.isInteger(value.count)) throw new FlowLabContractError();
  return { code: value.code, field: value.field, count: value.count };
}

function parseAbsentMember(value: unknown): FlowLabAbsentMember {
  if (!isRecord(value)
    || !hasExactKeys(value, ["name", "reason"])
    || !isNonEmptyString(value.name)
    || !isNonEmptyString(value.reason)) throw new FlowLabContractError();
  return { name: value.name, reason: value.reason };
}

function parseEvidenceFields(value: Record<string, unknown>): FlowLabSnapshotEvidence {
  if (!hasExactKeys(value, ["findings", "unresolved", "absentMembers", "productionAuthority"])
    || !Array.isArray(value.findings)
    || !Array.isArray(value.unresolved)
    || !Array.isArray(value.absentMembers)
    || value.productionAuthority !== false) throw new FlowLabContractError();
  return {
    findings: value.findings.map(parseFinding),
    unresolved: value.unresolved.map(parseUnresolved),
    absentMembers: value.absentMembers.map(parseAbsentMember),
    productionAuthority: false,
  };
}

function parseEvidence(value: Record<string, unknown>): FlowLabSnapshotEvidence {
  if (!isRecord(value.evidence)) throw new FlowLabContractError();
  return parseEvidenceFields(value.evidence);
}

function parseSnapshot(value: unknown): FlowLabPlanSnapshotRead {
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || value.origin !== "FLOW_LAB"
    || !isNonEmptyString(value.orderRevisionId)
    || !isNonEmptyString(value.componentSnapshotId)
    || !["REVIEW", "VERIFIED", "REJECTED"].includes(String(value.state))
    || value.schemaVersion !== "doorstar.flow-lab.plan-materialization/v1"
    || value.generatorProfileVersion !== "flow-lab"
    || !isNonEmptyString(value.generatorProfileFingerprint)
    || !isNonEmptyString(value.standardCatalogVersion)
    || !isSha256(value.standardCatalogFingerprint)
    || !isNonEmptyString(value.sourceSetKey)
    || !(typeof value.materializationKey === "string" && /^flm-v1-[a-f0-9]{64}$/.test(value.materializationKey))
    || !Array.isArray(value.operations)
    || !isIsoDateTime(value.createdAt)) throw new FlowLabContractError();

  const reviewedAt = value.reviewedAt;
  if (!(reviewedAt === null || isIsoDateTime(reviewedAt))) throw new FlowLabContractError();
  return {
    id: value.id,
    origin: "FLOW_LAB",
    orderRevisionId: value.orderRevisionId,
    componentSnapshotId: value.componentSnapshotId,
    state: value.state as FlowLabSnapshotState,
    schemaVersion: value.schemaVersion,
    generatorProfileVersion: "flow-lab",
    generatorProfileFingerprint: value.generatorProfileFingerprint,
    standardCatalogVersion: value.standardCatalogVersion,
    standardCatalogFingerprint: value.standardCatalogFingerprint,
    sourceSetKey: value.sourceSetKey,
    materializationKey: value.materializationKey,
    pins: parsePins(value.pins),
    operations: value.operations.map(parseOperation),
    readiness: parseReadiness(value.readiness),
    createdAt: value.createdAt,
    reviewResolution: readRequiredNullableString(value, "reviewResolution"),
    reviewedByRole: readRequiredNullableString(value, "reviewedByRole"),
    reviewedByPrincipal: readRequiredNullableString(value, "reviewedByPrincipal"),
    reviewedAt,
    createdByRole: readRequiredText(value, "createdByRole"),
    createdByPrincipal: readRequiredText(value, "createdByPrincipal"),
    reviewNote: readRequiredText(value, "reviewNote"),
    orderContentHash: readRequiredHash(value, "orderContentHash"),
    componentOutputHash: readRequiredHash(value, "componentOutputHash"),
    inputHash: readRequiredHash(value, "inputHash"),
    outputHash: readRequiredHash(value, "outputHash"),
    resourceMappingVersion: readRequiredText(value, "resourceMappingVersion"),
    resourceMappingFingerprint: readRequiredHash(value, "resourceMappingFingerprint"),
    evidence: parseEvidence(value),
  };
}

/** Runtime contract gate for the formal, read-only Flow Lab snapshot endpoint. */
export function parseFlowLabPlanSnapshotList(value: unknown): FlowLabPlanSnapshotList {
  if (!isRecord(value) || !Array.isArray(value.snapshots)) throw new FlowLabContractError();
  const snapshots = value.snapshots.map(parseSnapshot);
  if (new Set(snapshots.map((snapshot) => snapshot.id)).size !== snapshots.length) throw new FlowLabContractError();
  return { snapshots };
}

function parseDeviationPins(value: unknown): FlowLabDeviationPins {
  if (!isRecord(value)
    || !hasExactKeys(value, ["sourceSetKey", "materializationKey", "catalogRevision", "catalogHash", "planHash", "engineIdentity"])
    || !isNonEmptyString(value.sourceSetKey)
    || !(typeof value.materializationKey === "string" && /^flm-v1-[a-f0-9]{64}$/.test(value.materializationKey))) throw new FlowLabContractError();
  const pins = parsePins({
    catalogRevision: value.catalogRevision,
    catalogHash: value.catalogHash,
    planHash: value.planHash,
    engineIdentity: value.engineIdentity,
  });
  return {
    ...pins,
    sourceSetKey: value.sourceSetKey,
    materializationKey: value.materializationKey,
  };
}

function parseDeviationRecord(value: unknown): FlowLabDeviationRecord {
  if (!isRecord(value)
    || !hasExactKeys(value, ["id", "occurredAt", "kind", "correlationKey", "actor", "payload", "materializationId", "pins"])
    || !isNonEmptyString(value.id)
    || !isIsoDateTime(value.occurredAt)
    || !isNonEmptyString(value.kind)
    || !(value.correlationKey === null || isNonEmptyString(value.correlationKey))
    || !isRecord(value.actor)
    || !hasExactKeys(value.actor, ["role", "principal"])
    || !isNonEmptyString(value.actor.role)
    || !isNonEmptyString(value.actor.principal)
    || !isRecord(value.payload)
    || !isNonEmptyString(value.materializationId)) throw new FlowLabContractError();
  return {
    id: value.id,
    occurredAt: value.occurredAt,
    kind: value.kind,
    correlationKey: value.correlationKey,
    actor: { role: value.actor.role, principal: value.actor.principal },
    payload: value.payload,
    materializationId: value.materializationId,
    pins: parseDeviationPins(value.pins),
  };
}

/** Runtime contract gate for the cursor-paginated append-only deviation feed. */
export function parseFlowLabDeviationList(value: unknown): FlowLabDeviationList {
  if (!isRecord(value)
    || !hasExactKeys(value, ["records", "nextCursor"])
    || !Array.isArray(value.records)
    || !(value.nextCursor === null || isNonEmptyString(value.nextCursor))) throw new FlowLabContractError();
  const records = value.records.map(parseDeviationRecord);
  if (records.length > 100 || new Set(records.map((record) => record.id)).size !== records.length) throw new FlowLabContractError();
  return { records, nextCursor: value.nextCursor };
}

export function flowLabSnapshotStateLabel(state: FlowLabSnapshotState): string {
  return {
    REVIEW: "Felülvizsgálatra vár",
    VERIFIED: "Ellenőrzött",
    REJECTED: "Elutasított",
  }[state];
}

export function flowLabOperationLabel(operation: FlowLabPlanOperationRead): string {
  return operation.workflowGroup?.trim() || operation.sourceOperationKey?.trim() || operation.correlationKey;
}

/** JSON is displayed as inert text, never as an editable field or HTML. */
export function formatFlowLabPayloadValue(value: unknown): string {
  if (value === null) return "nincs érték";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "nem megjeleníthető strukturált érték";
  }
}
