import { z } from "zod";

const stableKey = z.string().trim().min(1).max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, "stable ASCII key required");
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const processKind = z.enum(["TECHNOLOGICAL", "NON_TECHNOLOGICAL", "NATURAL"]);
const documentVersionReference = z.object({
  documentVersionId: z.string().trim().min(1).max(200),
  versionHash: sha256,
  locator: z.string().trim().min(1).max(2_000).nullable(),
});

export const operationCandidateInputSchema = z.object({
  id: stableKey,
  sourceOperationKey: stableKey,
  sourceComponentRequirementIds: z.array(z.string().trim().min(1).max(80)).min(1).max(500),
  sourceComponentLineHashes: z.array(sha256).min(1).max(500),
  outputAssemblyKey: stableKey.nullable(),
  sequence: z.number().int().nonnegative().max(100_000),
  workflowGroup: z.string().trim().min(1).max(160),
  processKind,
  operationType: z.string().trim().min(1).max(240),
  standardKey: stableKey,
  standardVersion: z.string().trim().min(1).max(160),
  qualifiers: z.record(z.string().max(500)).superRefine((value, ctx) => {
    if (Object.keys(value).some((key) => !key.trim())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "qualifier keys must not be blank" });
    }
  }),
  resourceKey: stableKey,
  machineKey: stableKey.nullable(),
  toolKeys: z.array(stableKey).max(100),
  quantity: z.number().positive(),
  quantityUnit: z.string().trim().min(1).max(32),
  setupMinutesPerBatch: z.number().nonnegative().nullable(),
  cycleMinutesPerUnit: z.number().positive().nullable(),
  nonTechnologicalMinutes: z.number().positive().nullable(),
  plannedNaturalHoldMinutes: z.number().positive().nullable(),
  timeStandardSource: documentVersionReference.extend({
    standardKey: stableKey,
    standardVersion: z.string().trim().min(1).max(160),
    unit: z.string().trim().min(1).max(32),
  }).nullable(),
  workforce: z.number().int().positive().max(1_000).nullable(),
  dependencies: z.array(z.object({
    predecessorOperationId: stableKey,
    type: z.enum(["FS", "SS", "FF", "SF"]),
    lagMinutes: z.number().int().nonnegative().max(10_000_000),
    releaseThresholdPercent: z.number().positive().max(100).optional(),
  })).max(500),
  documentReferences: z.array(documentVersionReference.extend({
    purpose: z.enum(["DRAWING", "SPECIFICATION", "TECHNOLOGY", "OTHER"]),
  })).max(500),
  workInstruction: documentVersionReference.extend({
    contentCoverage: z.array(z.enum([
      "PREREQUISITES", "MATERIAL_AND_RESOURCE_CHECK", "SETUP", "SAFETY",
      "EXECUTION", "DRAWING_REFERENCE", "IN_PROCESS_CONTROL", "OUTPUT_HANDLING",
    ])).min(1).max(8),
  }).nullable(),
  qualityCheckpoints: z.array(z.object({
    key: stableKey,
    label: z.string().trim().min(1).max(240),
    acceptanceRule: z.string().trim().min(1).max(2_000),
    measurementMethod: z.string().trim().min(1).max(1_000).nullable(),
    measurementToolKey: stableKey.nullable(),
    evidenceRequirement: z.string().trim().min(1).max(1_000).nullable(),
    required: z.boolean(),
  })).max(500),
  sourceEvidence: z.array(z.object({
    sourceKind: z.enum(["DOCUMENT", "KNOWLEDGE", "LEGACY_COMPARISON"]),
    documentVersionId: z.string().trim().min(1).max(200).nullable(),
    versionHash: sha256.nullable(),
    locator: z.string().trim().min(1).max(2_000),
    rawValue: z.string().max(10_000).nullable(),
    normalizedValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    confidence: z.number().min(0).max(1).nullable(),
    reviewState: z.enum(["OPEN", "RESOLVED", "REJECTED"]),
  })).min(1).max(1_000),
}).superRefine((operation, ctx) => {
  if (operation.sourceComponentRequirementIds.length !== operation.sourceComponentLineHashes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceComponentLineHashes"], message: "component requirement ids and line hashes must have equal length" });
  }
  for (const [field, values] of [
    ["sourceComponentRequirementIds", operation.sourceComponentRequirementIds],
    ["toolKeys", operation.toolKeys],
  ] as const) {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} must contain unique values` });
    }
  }
  const predecessors = operation.dependencies.map((dependency) => dependency.predecessorOperationId);
  if (new Set(predecessors).size !== predecessors.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dependencies"], message: "dependency predecessors must be unique" });
  }
  const checkpoints = operation.qualityCheckpoints.map((checkpoint) => checkpoint.key);
  if (new Set(checkpoints).size !== checkpoints.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["qualityCheckpoints"], message: "quality checkpoint keys must be unique" });
  }
});

export const createOperationPlanSnapshotSchema = z.object({
  componentSnapshotId: z.string().trim().min(1).max(80),
  expectedOrderContentHash: sha256,
  expectedComponentOutputHash: sha256,
  generatorProfileVersion: z.string().trim().min(1).max(160),
  reviewNote: z.string().trim().min(3).max(2_000),
  confirmation: z.literal("CREATE_OPERATION_PLAN_SNAPSHOT"),
  operations: z.array(operationCandidateInputSchema).min(1).max(5_000),
}).superRefine((value, ctx) => {
  for (const [field, values] of [
    ["id", value.operations.map((operation) => operation.id)],
    ["sourceOperationKey", value.operations.map((operation) => operation.sourceOperationKey)],
  ] as const) {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["operations"], message: `operation ${field} values must be unique` });
    }
  }
});

export const reviewOperationPlanSnapshotSchema = z.object({
  state: z.enum(["VERIFIED", "REJECTED"]),
  resolution: z.string().trim().min(3).max(2_000),
  expectedOutputHash: sha256,
});

export const persistedOperationCandidatesSchema = z.array(operationCandidateInputSchema).min(1).max(5_000);

export type CreateOperationPlanSnapshotInput = ReturnType<typeof createOperationPlanSnapshotSchema.parse>;
export type OperationCandidateInput = CreateOperationPlanSnapshotInput["operations"][number];
