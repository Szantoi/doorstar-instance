import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const stableKey = z.string().trim().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const decimal = z.number().finite().nonnegative().max(10_000_000);
const integer = z.number().int().nonnegative().max(10_000_000);

const partialReleaseSchema = z.object({
  threshold: z.number().positive().max(10_000_000),
  scaleMaximum: z.number().positive().max(10_000_000),
}).strict().nullable();

const operationSchema = z.object({
  correlationKey: stableKey,
  familyKey: boundedText(160).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  operationKey: boundedText(160).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  description: boundedText(2_000),
  operationType: z.enum(["ActiveWork", "Summary"]),
  station: boundedText(240).nullable(),
  department: boundedText(240).nullable(),
  quantity: z.object({
    value: decimal,
    unit: boundedText(64),
    resolved: z.boolean(),
  }).strict(),
  time: z.object({
    setupMinutes: decimal,
    cycleMinutesPerUnit: decimal,
    passiveWaitMinutes: decimal,
    activeMinutes: decimal,
    elapsedMinutes: decimal,
    requiredWorkers: integer,
    workloadPersonMinutes: decimal,
  }).strict(),
  boardProjection: z.object({
    quantity: decimal,
    unitHours: decimal,
  }).strict(),
}).strict();

const dependencySchema = z.object({
  successor: stableKey,
  predecessor: stableKey,
  type: z.enum(["FS", "SS", "FF", "SF"]),
  lagMinutes: integer,
  partialRelease: partialReleaseSchema,
}).strict();

const relativeScheduleSchema = z.object({
  correlationKey: stableKey,
  startElapsedMinute: integer,
  finishElapsedMinute: integer,
}).strict();

const unresolvedSchema = z.object({
  code: boundedText(160).regex(/^[A-Z0-9_]+$/),
  field: boundedText(240),
  count: integer,
}).strict();

const absentMemberSchema = z.object({
  name: boundedText(240),
  reason: boundedText(2_000),
}).strict();

const findingSchema = z.object({
  code: boundedText(160).regex(/^[A-Z0-9_]+$/),
  severity: z.enum(["Information", "Warning", "Error"]),
  count: integer,
}).strict();

export const flowLabPlanArtifactSchema = z.object({
  schemaVersion: z.literal("doorstar.flow-lab.plan-materialization/v1"),
  sourceSetKey: boundedText(160).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  materializationKey: z.string().regex(/^flm-v1-[a-f0-9]{64}$/),
  contentHash: sha256,
  pins: z.object({
    catalogRevision: boundedText(160),
    catalogHash: sha256,
    planHash: sha256,
    engineIdentity: boundedText(240),
  }).strict(),
  operations: z.array(operationSchema).min(1).max(5_000),
  dependencies: z.array(dependencySchema).max(20_000),
  relativeSchedule: z.array(relativeScheduleSchema).min(1).max(5_000),
  unresolved: z.array(unresolvedSchema).max(1_000),
  absentMembers: z.array(absentMemberSchema).length(5),
  findings: z.array(findingSchema).max(1_000),
  productionAuthority: z.literal(false),
}).strict();

export type FlowLabPlanArtifact = z.infer<typeof flowLabPlanArtifactSchema>;

/** The board must supply this binding; sourceSetKey is never treated as a
 * project, revision, component snapshot or approval-hash lookup key. */
export const flowLabBoardBindingSchema = z.object({
  projectKey: boundedText(160),
  revision: z.number().int().positive().max(1_000_000),
  componentSnapshotId: boundedText(80),
  expectedOrderContentHash: sha256,
  expectedComponentOutputHash: sha256,
  stationMappingVersion: boundedText(160),
  stationMappingFingerprint: sha256,
  reviewNote: boundedText(2_000),
  actorRole: z.enum(["technical_preparation", "production_planner"]),
  actorPrincipal: boundedText(200),
}).strict();

export type FlowLabBoardBinding = z.infer<typeof flowLabBoardBindingSchema>;

export function parseFlowLabBoardBinding(value: unknown): FlowLabBoardBinding {
  return flowLabBoardBindingSchema.parse(value);
}

export class FlowLabArtifactError extends Error {
  constructor(
    public readonly code:
      | "flow_lab_file_name_invalid"
      | "flow_lab_sidecar_invalid"
      | "flow_lab_file_hash_mismatch"
      | "flow_lab_artifact_not_utf8"
      | "flow_lab_artifact_json_invalid"
      | "flow_lab_artifact_schema_invalid"
      | "flow_lab_artifact_not_canonical"
      | "flow_lab_materialization_key_mismatch"
      | "flow_lab_content_hash_mismatch",
    public readonly details?: Record<string, string>,
  ) {
    super(code);
    this.name = "FlowLabArtifactError";
  }
}

const expectedAbsentMemberNames = [
  "operations[].boardProjection.setupMinutes",
  "operations[].boardProjection.passiveWaitMinutes",
  "operations[].boardProjection.requiredWorkers",
  "relativeSchedule[].absoluteDate",
  "operations[].assignedPeople",
] as const;

function sha256Hex(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Contract ordinal comparison is code-unit ordering, never locale-sensitive. */
export function compareFlowLabOrdinal(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertCanonicalOrder(artifact: FlowLabPlanArtifact) {
  const operationKeys = artifact.operations.map((operation) => operation.correlationKey);
  if (new Set(operationKeys).size !== operationKeys.length || operationKeys.some((key, index) => index && compareFlowLabOrdinal(operationKeys[index - 1]!, key) >= 0)) {
    throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "operations_must_be_unique_and_ordinal" });
  }
  const operationSet = new Set(operationKeys);
  for (const operation of artifact.operations) {
    if (!operation.correlationKey.startsWith(`${artifact.sourceSetKey}/`)) {
      throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "correlation_key_source_set_mismatch" });
    }
    const { time, quantity, boardProjection } = operation;
    const approximatelyEqual = (left: number, right: number) => Math.abs(left - right) <= 1e-9;
    if (
      !approximatelyEqual(time.activeMinutes, time.setupMinutes + quantity.value * time.cycleMinutesPerUnit)
      || !approximatelyEqual(time.elapsedMinutes, time.activeMinutes + time.passiveWaitMinutes)
      || !approximatelyEqual(time.workloadPersonMinutes, time.activeMinutes * time.requiredWorkers)
      || !approximatelyEqual(boardProjection.unitHours, time.cycleMinutesPerUnit / 60)
    ) {
      throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "operation_time_arithmetic_invalid" });
    }
    if (!operation.quantity.resolved) {
      throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "operation_quantity_unresolved" });
    }
    const expectedProjectionQuantity = operation.operationType === "Summary" ? 0 : quantity.value;
    if (operation.operationType === "Summary" && (
      operation.boardProjection.quantity !== 0 || operation.boardProjection.unitHours !== 0
      || Object.values(operation.time).some((value) => value !== 0)
    ) || !approximatelyEqual(boardProjection.quantity, expectedProjectionQuantity)) {
      throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "summary_projection_invalid" });
    }
  }
  const dependencySort = (left: FlowLabPlanArtifact["dependencies"][number], right: FlowLabPlanArtifact["dependencies"][number]) => {
    const leftTail = left.partialRelease?.threshold ?? -1;
    const rightTail = right.partialRelease?.threshold ?? -1;
    const leftMaximum = left.partialRelease?.scaleMaximum ?? -1;
    const rightMaximum = right.partialRelease?.scaleMaximum ?? -1;
    return compareFlowLabOrdinal(left.successor, right.successor)
      || compareFlowLabOrdinal(left.predecessor, right.predecessor)
      || compareFlowLabOrdinal(left.type, right.type)
      || left.lagMinutes - right.lagMinutes
      || leftTail - rightTail
      || leftMaximum - rightMaximum;
  };
  artifact.dependencies.forEach((dependency, index) => {
    if (
      !operationSet.has(dependency.successor) || !operationSet.has(dependency.predecessor)
      || dependency.successor === dependency.predecessor
      || (dependency.partialRelease && (dependency.type !== "FS" || dependency.partialRelease.threshold > dependency.partialRelease.scaleMaximum))
    ) {
      throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "dependency_reference_invalid" });
    }
    if (index && dependencySort(artifact.dependencies[index - 1]!, dependency) >= 0) {
      throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "dependencies_not_canonical" });
    }
  });
  const scheduled = artifact.relativeSchedule.map((entry) => entry.correlationKey);
  if (new Set(scheduled).size !== scheduled.length || scheduled.length !== operationKeys.length || scheduled.some((key) => !operationSet.has(key))) {
    throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "relative_schedule_operation_mismatch" });
  }
  artifact.relativeSchedule.forEach((entry, index) => {
    if (entry.finishElapsedMinute < entry.startElapsedMinute) {
      throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "relative_schedule_window_invalid" });
    }
    const operation = artifact.operations.find((candidate) => candidate.correlationKey === entry.correlationKey)!;
    if (entry.finishElapsedMinute - entry.startElapsedMinute !== operation.time.elapsedMinutes) {
      throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "relative_schedule_duration_invalid" });
    }
    const previous = artifact.relativeSchedule[index - 1];
    if (previous && (
      previous.startElapsedMinute > entry.startElapsedMinute
      || (previous.startElapsedMinute === entry.startElapsedMinute && previous.finishElapsedMinute > entry.finishElapsedMinute)
      || (previous.startElapsedMinute === entry.startElapsedMinute && previous.finishElapsedMinute === entry.finishElapsedMinute && compareFlowLabOrdinal(previous.correlationKey, entry.correlationKey) >= 0)
    )) {
      throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "relative_schedule_not_canonical" });
    }
  });
  if (artifact.unresolved.some((entry, index) => index && compareFlowLabOrdinal(artifact.unresolved[index - 1]!.code, entry.code) >= 0)) {
    throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "unresolved_not_canonical" });
  }
  if (artifact.absentMembers.some((entry, index) => entry.name !== expectedAbsentMemberNames[index])) {
    throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "absent_members_not_v1" });
  }
  const severityOrder = { Error: 3, Warning: 2, Information: 1 } as const;
  if (artifact.findings.some((entry, index) => {
    const previous = artifact.findings[index - 1];
    return Boolean(previous && (severityOrder[previous.severity] < severityOrder[entry.severity]
      || (previous.severity === entry.severity && compareFlowLabOrdinal(previous.code, entry.code) >= 0)));
  })) {
    throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "findings_not_canonical" });
  }
}

class TypedHashWriter {
  private readonly hash = createHash("sha256");

  constructor(header: string) {
    this.scalar("string", header);
  }

  scalar(type: "string" | "bool" | "int32" | "decimal", value: string | number | boolean | null) {
    const typeBytes = Buffer.from(type, "utf8");
    this.writeLength(typeBytes.length);
    this.hash.update(typeBytes);
    if (value === null) {
      this.writeLength(-1);
      return;
    }
    const rendered = type === "decimal" ? canonicalDecimal(value as number) : String(value);
    const valueBytes = Buffer.from(rendered, "utf8");
    this.writeLength(valueBytes.length);
    this.hash.update(valueBytes);
  }

  count(value: number) {
    this.scalar("int32", value);
  }

  digest() {
    return this.hash.digest("hex");
  }

  private writeLength(value: number) {
    const bytes = Buffer.allocUnsafe(4);
    bytes.writeInt32BE(value, 0);
    this.hash.update(bytes);
  }
}

/** JSON and the typed hash both use non-exponent, insignificant-zero-free
 * decimal tokens. JavaScript's default String() uses exponent notation for
 * small values, so it cannot be used directly for the cross-language v1 hash. */
function canonicalDecimal(value: number) {
  if (!Number.isFinite(value) || value < 0 || Object.is(value, -0)) {
    throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "decimal_invalid" });
  }
  const rendered = String(value);
  if (!/[eE]/.test(rendered)) return rendered;
  const [coefficient, exponentText] = rendered.toLowerCase().split("e");
  const exponent = Number(exponentText);
  const [whole, fractional = ""] = coefficient!.split(".");
  const digits = `${whole}${fractional}`.replace(/^0+/, "") || "0";
  const decimalPoint = whole!.length + exponent;
  if (decimalPoint <= 0) return `0.${"0".repeat(-decimalPoint)}${digits}`;
  if (decimalPoint >= digits.length) return `${digits}${"0".repeat(decimalPoint - digits.length)}`;
  return `${digits.slice(0, decimalPoint)}.${digits.slice(decimalPoint)}`.replace(/\.?0+$/, "");
}

function writeOperation(writer: TypedHashWriter, operation: FlowLabPlanArtifact["operations"][number]) {
  writer.scalar("string", operation.correlationKey);
  writer.scalar("string", operation.familyKey);
  writer.scalar("string", operation.operationKey);
  writer.scalar("string", operation.description);
  writer.scalar("string", operation.operationType);
  writer.scalar("string", operation.station);
  writer.scalar("string", operation.department);
  writer.scalar("decimal", operation.quantity.value);
  writer.scalar("string", operation.quantity.unit);
  writer.scalar("bool", operation.quantity.resolved);
  writer.scalar("decimal", operation.time.setupMinutes);
  writer.scalar("decimal", operation.time.cycleMinutesPerUnit);
  writer.scalar("decimal", operation.time.passiveWaitMinutes);
  writer.scalar("decimal", operation.time.activeMinutes);
  writer.scalar("decimal", operation.time.elapsedMinutes);
  writer.scalar("int32", operation.time.requiredWorkers);
  writer.scalar("decimal", operation.time.workloadPersonMinutes);
  writer.scalar("decimal", operation.boardProjection.quantity);
  writer.scalar("decimal", operation.boardProjection.unitHours);
}

/** Implements the length-prefixed semantic hash required by the Flow Lab v1
 * contract. The raw file SHA-256 remains a separate transport integrity pin. */
export function computeFlowLabPlanContentHash(artifact: Omit<FlowLabPlanArtifact, "contentHash"> | FlowLabPlanArtifact) {
  const writer = new TypedHashWriter("doorstar.flow-lab/canonical-plan-materialization/v1");
  writer.scalar("string", artifact.schemaVersion);
  writer.scalar("string", artifact.sourceSetKey);
  writer.scalar("string", artifact.materializationKey);
  writer.scalar("string", artifact.pins.catalogRevision);
  writer.scalar("string", artifact.pins.catalogHash);
  writer.scalar("string", artifact.pins.planHash);
  writer.scalar("string", artifact.pins.engineIdentity);
  writer.count(artifact.operations.length);
  artifact.operations.forEach((operation) => writeOperation(writer, operation));
  writer.count(artifact.dependencies.length);
  artifact.dependencies.forEach((dependency) => {
    writer.scalar("string", dependency.successor);
    writer.scalar("string", dependency.predecessor);
    writer.scalar("string", dependency.type);
    writer.scalar("decimal", dependency.lagMinutes);
    writer.scalar("bool", dependency.partialRelease !== null);
    writer.scalar("decimal", dependency.partialRelease?.threshold ?? null);
    writer.scalar("decimal", dependency.partialRelease?.scaleMaximum ?? null);
  });
  writer.count(artifact.relativeSchedule.length);
  artifact.relativeSchedule.forEach((entry) => {
    writer.scalar("string", entry.correlationKey);
    writer.scalar("decimal", entry.startElapsedMinute);
    writer.scalar("decimal", entry.finishElapsedMinute);
  });
  writer.count(artifact.unresolved.length);
  artifact.unresolved.forEach((entry) => {
    writer.scalar("string", entry.code);
    writer.scalar("string", entry.field);
    writer.scalar("int32", entry.count);
  });
  writer.count(artifact.absentMembers.length);
  artifact.absentMembers.forEach((entry) => {
    writer.scalar("string", entry.name);
    writer.scalar("string", entry.reason);
  });
  writer.count(artifact.findings.length);
  artifact.findings.forEach((entry) => {
    writer.scalar("string", entry.code);
    writer.scalar("string", entry.severity);
    writer.scalar("int32", entry.count);
  });
  writer.scalar("bool", artifact.productionAuthority);
  return writer.digest();
}

export function computeFlowLabMaterializationKey(input: Pick<FlowLabPlanArtifact, "schemaVersion" | "sourceSetKey" | "pins">) {
  const writer = new TypedHashWriter("doorstar.flow-lab/materialization-key/v1");
  writer.scalar("string", input.schemaVersion);
  writer.scalar("string", input.sourceSetKey);
  writer.scalar("string", input.pins.catalogRevision);
  writer.scalar("string", input.pins.engineIdentity);
  return `flm-v1-${writer.digest()}`;
}

function canonicalJson(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return canonicalDecimal(value);
  const indentation = "  ".repeat(depth);
  const nestedIndentation = "  ".repeat(depth + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((entry) => `${nestedIndentation}${canonicalJson(entry, depth + 1)}`).join(",\n")}\n${indentation}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return `{\n${entries.map(([key, entry]) => `${nestedIndentation}${JSON.stringify(key)}: ${canonicalJson(entry, depth + 1)}`).join(",\n")}\n${indentation}}`;
  }
  throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { reason: "json_value_invalid" });
}

function canonicalPlanBytes(artifact: FlowLabPlanArtifact) {
  // The Zod parser creates no unknown members. Rebuilding this literal fixes
  // the required root-member order rather than preserving caller object order.
  return Buffer.from(`${canonicalJson({
    schemaVersion: artifact.schemaVersion,
    sourceSetKey: artifact.sourceSetKey,
    materializationKey: artifact.materializationKey,
    contentHash: artifact.contentHash,
    pins: artifact.pins,
    operations: artifact.operations,
    dependencies: artifact.dependencies,
    relativeSchedule: artifact.relativeSchedule,
    unresolved: artifact.unresolved,
    absentMembers: artifact.absentMembers,
    findings: artifact.findings,
    productionAuthority: artifact.productionAuthority,
  })}\n`, "utf8");
}

function validateFileName(fileName: string) {
  if (
    path.basename(fileName) !== fileName
    || !/^doorstar-flow-lab-plan-materialization\.[A-Za-z0-9][A-Za-z0-9._-]*\.[a-f0-9]{64}\.v1\.json$/.test(fileName)
  ) {
    throw new FlowLabArtifactError("flow_lab_file_name_invalid");
  }
}

function parseSidecar(sidecarBytes: Buffer, fileName: string) {
  const sidecar = sidecarBytes.toString("ascii");
  const match = /^([a-f0-9]{64})  ([^\r\n/\\]+)\n$/.exec(sidecar);
  if (!match || match[2] !== fileName || !sidecarBytes.equals(Buffer.from(sidecar, "ascii"))) {
    throw new FlowLabArtifactError("flow_lab_sidecar_invalid");
  }
  return match[1]!;
}

export interface FlowLabPlanArtifactBytes {
  fileName: string;
  rawBytes: Buffer;
  sidecarBytes: Buffer;
}

export interface ValidatedFlowLabPlanArtifact {
  artifact: FlowLabPlanArtifact;
  fileName: string;
  fileSha256: string;
}

export function parseFlowLabPlanArtifact(input: FlowLabPlanArtifactBytes): ValidatedFlowLabPlanArtifact {
  validateFileName(input.fileName);
  const expectedFileSha256 = parseSidecar(input.sidecarBytes, input.fileName);
  const actualFileSha256 = sha256Hex(input.rawBytes);
  if (actualFileSha256 !== expectedFileSha256) {
    throw new FlowLabArtifactError("flow_lab_file_hash_mismatch", { expectedFileSha256, actualFileSha256 });
  }
  if (input.rawBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    throw new FlowLabArtifactError("flow_lab_artifact_not_utf8", { reason: "utf8_bom_forbidden" });
  }
  const decoded = input.rawBytes.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(input.rawBytes)) {
    throw new FlowLabArtifactError("flow_lab_artifact_not_utf8", { reason: "invalid_utf8" });
  }
  let unknown: unknown;
  try {
    unknown = JSON.parse(decoded);
  } catch {
    throw new FlowLabArtifactError("flow_lab_artifact_json_invalid");
  }
  const parsed = flowLabPlanArtifactSchema.safeParse(unknown);
  if (!parsed.success) {
    throw new FlowLabArtifactError("flow_lab_artifact_schema_invalid", { issue: parsed.error.issues[0]?.path.join(".") || "root" });
  }
  const artifact = parsed.data;
  const expectedFileName = `doorstar-flow-lab-plan-materialization.${artifact.sourceSetKey}.${artifact.pins.planHash}.v1.json`;
  if (input.fileName !== expectedFileName) {
    throw new FlowLabArtifactError("flow_lab_file_name_invalid", { expectedFileName, actualFileName: input.fileName });
  }
  assertCanonicalOrder(artifact);
  if (!canonicalPlanBytes(artifact).equals(input.rawBytes)) {
    throw new FlowLabArtifactError("flow_lab_artifact_not_canonical");
  }
  const expectedMaterializationKey = computeFlowLabMaterializationKey(artifact);
  if (artifact.materializationKey !== expectedMaterializationKey) {
    throw new FlowLabArtifactError("flow_lab_materialization_key_mismatch", { expectedMaterializationKey, actualMaterializationKey: artifact.materializationKey });
  }
  const expectedContentHash = computeFlowLabPlanContentHash(artifact);
  if (artifact.contentHash !== expectedContentHash) {
    throw new FlowLabArtifactError("flow_lab_content_hash_mismatch", { expectedContentHash, actualContentHash: artifact.contentHash });
  }
  return { artifact, fileName: input.fileName, fileSha256: actualFileSha256 };
}

/** Reads only a configured directory and a validated bare final filename.
 * No caller-controlled path, URL or artefact bytes cross this helper's API. */
export function readFlowLabPlanArtifactFromInbox(input: { inboxDirectory: string; fileName: string }) {
  validateFileName(input.fileName);
  const root = path.resolve(input.inboxDirectory);
  const artifactPath = path.resolve(root, input.fileName);
  const sidecarPath = path.resolve(root, `${input.fileName}.sha256`);
  if (path.dirname(artifactPath) !== root || path.dirname(sidecarPath) !== root) {
    throw new FlowLabArtifactError("flow_lab_file_name_invalid");
  }
  return parseFlowLabPlanArtifact({
    fileName: input.fileName,
    rawBytes: readFileSync(artifactPath),
    sidecarBytes: readFileSync(sidecarPath),
  });
}
