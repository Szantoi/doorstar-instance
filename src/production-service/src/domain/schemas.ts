import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1),
  /** Human-facing project key; the API resolves it to an internal projectId. */
  projectKey: z.string().min(1).optional(),
  station: z.string().nullable().optional(),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day: z.number().int().min(0).max(6),
  urgent: z.boolean().optional(),
  description: z.string().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  /** Human-facing key; null removes the project from a free-standing task. */
  projectKey: z.string().min(1).nullable().optional(),
  /** Direct epic link for a free-standing task; null removes the link. */
  epicId: z.string().min(1).nullable().optional(),
  station: z.string().nullable().optional(),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  day: z.number().int().min(0).max(6).optional(),
  stepIndex: z.number().int().min(0).optional(),
  acknowledged: z.boolean().optional(),
  urgent: z.boolean().optional(),
  problem: z.boolean().optional(),
  dueDate: z.string().nullable().optional(),
  description: z.string().optional(),
  quantity: z.number().nonnegative().nullable().optional(),
  unitHours: z.number().nonnegative().nullable().optional(),
  dependsOnId: z.string().nullable().optional(),
});

export const addCommentSchema = z.object({ text: z.string().min(1) });

// Client downscales/compresses to a JPEG data URI before upload — capped
// generously so a stray full-resolution photo can't bloat the DB row.
export const addImageSchema = z.object({ url: z.string().min(1).max(2_000_000) });

export const orderItemSchema = z.object({ label: z.string().min(1) });
export const updateOrderItemSchema = z.object({
  label: z.string().min(1).optional(),
  done: z.boolean().optional(),
});

export const weekNoteSchema = z.object({
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string(),
});

export const capacitySchema = z.object({ hoursPerDay: z.number().positive() });

export const epicStepSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  station: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  unitHours: z.number().nullable().optional(),
  planDate: z.string().nullable().optional(),
  planLocked: z.boolean().optional(),
  disabled: z.boolean().optional(),
});

export const epicSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  quantityLabel: z.string().nullable().optional(),
  disabled: z.boolean().optional(),
  steps: z.array(epicStepSchema),
});

export const saveEpicsSchema = z.object({ epics: z.array(epicSchema) });

export const createProjectSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  num: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  num: z.string().nullable().optional(),
  kezdes: z.string().nullable().optional(),
  beepites: z.string().nullable().optional(),
  szinTok: z.string().nullable().optional(),
  szinLap: z.string().nullable().optional(),
});

/** Publishing uses the per-step planned dates saved on the work sheet.
 * Deliberately reject the former automatic working-day scheduler payload. */
export const scheduleSchema = z.object({}).strict();

export const sheetTemplateSchema = z.object({
  name: z.string().min(1),
  epics: z.array(epicSchema),
});

export const epikTemplateSchema = z.object({
  name: z.string().min(1),
  epic: epicSchema,
});

export const projectSheetKindSchema = z.enum(["QUANTITIES", "CUTTING", "HARDWARE"]);

const nullableText = z.string().trim().min(1).nullable().optional();
const nullableMillimetres = z.number().positive().nullable().optional();
const nullableSurface = z.string().trim().min(1).max(240).nullable().optional();
const catalogKey = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).nullable().optional();
const catalogKeys = z.array(z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)).max(30).optional();

export const orderPositionSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(240),
  quantity: z.number().int().positive(),
  productType: nullableText,
  openingDirection: nullableText,
  openingWidthMm: nullableMillimetres,
  openingHeightMm: nullableMillimetres,
  openingDepthMm: nullableMillimetres,
  doorWidthMm: nullableMillimetres,
  doorHeightMm: nullableMillimetres,
  doorThicknessMm: nullableMillimetres,
  surface: nullableSurface,
  wallTreatment: z.enum(["NONE", "WALL_PANEL", "BLENDE"]).nullable().optional(),
  glazing: z.enum(["NONE", "GLAZED"]).nullable().optional(),
  glazingSpecification: nullableSurface,
  doorTypeKey: catalogKey,
  finishKey: catalogKey,
  glassKey: catalogKey,
  hardwareKeys: catalogKeys,
  wallSolutionKey: catalogKey,
  materialKey: catalogKey,
  machiningKeys: catalogKeys,
  technicalNotes: z.string().max(10_000).optional(),
  notes: z.string().max(10_000).optional(),
});

/** Existing IDs are accepted only on DRAFT updates so survey saves can retain
 * field-level provenance. Creation payloads remain ID-free. */
export const orderPositionUpdateSchema = orderPositionSchema.extend({
  id: z.string().trim().min(1).optional(),
});

/** Draft-only order intake. Approval validation is intentionally a later gate. */
export const createOrderRevisionSchema = z.object({
  projectKey: z.string().trim().min(1),
  customerName: z.string().trim().min(1).max(240),
  customerAddress: nullableText,
  contactName: nullableText,
  contactPhone: nullableText,
  contactEmail: z.string().email().nullable().optional(),
  deliveryAddress: nullableText,
  expectedDelivery: z.string().datetime().nullable().optional(),
  plannedStart: z.string().datetime().nullable().optional(),
  priority: z.number().int().min(0).max(9).optional(),
  notes: z.string().max(10_000).optional(),
  positions: z.array(orderPositionSchema).min(1).max(200),
});

/** Sales always opens a fresh Project for a customer order. Re-orders are not
 * attached to an older installation/project, even when the customer matches. */
export const createSalesIntakeSchema = createOrderRevisionSchema.omit({ projectKey: true }).extend({
  projectKey: z.string().trim().min(1).max(80),
  projectName: z.string().trim().min(1).max(240),
  projectNum: z.string().trim().min(1).max(80).optional(),
});

/** A DRAFT can be completed by the surveyor. Once it enters review or is
 * approved, revisions remain immutable and a new revision must be created. */
export const updateOrderRevisionSchema = createOrderRevisionSchema.omit({ projectKey: true }).extend({
  positions: z.array(orderPositionUpdateSchema).min(1).max(200),
});

export const updateOrderIntakeStageSchema = z.object({
  stage: z.enum(["SALES_DOCUMENTS_RECEIVED", "SURVEY_PENDING", "SURVEY_COMPLETED", "SURVEY_EXCEPTION_REVIEW", "TECHNICAL_PREPARATION"]),
  exceptionReason: z.string().trim().min(3).max(2_000).optional(),
}).superRefine((value, ctx) => {
  if (value.stage === "SURVEY_EXCEPTION_REVIEW" && !value.exceptionReason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["exceptionReason"], message: "survey exception reason is required" });
  }
});

/** Metadata reference only: the path stays relative to the approved source,
 * avoiding accidental local-drive exposure through the API. */
export const addOrderDocumentSchema = z.object({
  source: z.enum(["LEGACY_FOLDER", "SHAREPOINT"]),
  kind: z.enum(["SALES_ORDER", "SURVEY", "DRAWING", "OTHER"]),
  displayName: z.string().trim().min(1).max(500),
  relativePath: z.string().trim().min(1).max(2_000).refine((path) => !/^(?:[A-Za-z]:[\\/]|[\\/])/.test(path) && !path.split(/[\\/]/).includes(".."), "relative document path required"),
  driveId: z.string().trim().min(1).max(240).optional(),
  itemId: z.string().trim().min(1).max(240).optional(),
  versionId: z.string().trim().min(1).max(240).optional(),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  supersedesDocumentId: z.string().trim().min(1).max(80).optional(),
}).superRefine((value, ctx) => {
  if (value.source === "SHAREPOINT" && (!value.driveId || !value.itemId || !value.versionId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["driveId"], message: "stable SharePoint identity is required" });
  }
});

export const linkOrderDocumentToPositionSchema = z.object({
  orderPositionId: z.string().trim().min(1).max(80),
});

/** A release links exact immutable document records; future work-package
 * ownership uses the same external key without permitting a moving "latest". */
export const issueOrderDocumentReferencesSchema = z.object({
  issuedWorkPackageKey: z.string().trim().min(1).max(160),
  documentIds: z.array(z.string().trim().min(1).max(80)).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length, "document ids must be unique"),
  releaseNote: z.string().trim().min(3).max(2_000),
  confirmation: z.literal("ISSUE_DOCUMENT_VERSIONS"),
});

const supplementaryEvidenceSchema = z.object({
  orderDocumentId: z.string().trim().min(1).max(80).optional(),
  sourceRoot: z.string().trim().min(1).max(80),
  relativePath: z.string().trim().min(1).max(2_000).refine((path) => !/^(?:[A-Za-z]:[\\/]|[\\/])/.test(path) && !path.split(/[\\/]/).includes(".."), "relative source path required"),
  page: z.number().int().positive().optional(), row: z.number().int().positive().optional(),
  field: z.string().trim().min(1).max(80), rawValue: z.string().max(10_000),
  normalizedValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1).optional(),
  // Final evidence decisions belong to the dedicated review command so their
  // actor, reason and timestamp cannot be bypassed during item creation.
  reviewState: z.enum(["UNVERIFIED", "REVIEW"]).optional(),
});

export const createOrderSupplementaryItemSchema = z.object({
  entryMode: z.enum(["MANUAL", "SOURCE_REVIEW"]), category: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(80).optional(), name: z.string().trim().min(1).max(240),
  quantity: z.number().positive().optional(), unit: z.string().trim().min(1).max(32).optional(),
  calculatedQuantity: z.number().positive().optional(), calculatedUnit: z.string().trim().min(1).max(32).optional(),
  notes: z.string().max(10_000).optional(), manualReason: z.string().trim().min(3).max(2_000).optional(),
  evidence: z.array(supplementaryEvidenceSchema).max(100).optional(),
}).superRefine((value, ctx) => {
  if (value.entryMode === "MANUAL" && (!value.quantity || !value.unit || !value.manualReason)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "manual item needs quantity, unit and reason" });
  if (value.entryMode === "SOURCE_REVIEW" && !value.evidence?.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["evidence"], message: "source-reviewed item needs evidence" });
});

export const updateOrderSupplementaryItemSchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
  code: z.string().trim().min(1).max(80).nullable().optional(),
  name: z.string().trim().min(1).max(240).optional(),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().trim().min(1).max(32).nullable().optional(),
  calculatedQuantity: z.number().positive().nullable().optional(),
  calculatedUnit: z.string().trim().min(1).max(32).nullable().optional(),
  notes: z.string().max(10_000).optional(),
  manualReason: z.string().trim().min(3).max(2_000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "at least one field is required");

export const reviewOrderSupplementaryItemSchema = z.object({
  state: z.enum(["VERIFIED", "REJECTED"]),
  resolution: z.string().trim().min(3).max(2_000),
});

export const reviewOrderSupplementaryItemEvidenceSchema = z.object({
  reviewState: z.enum(["RESOLVED", "REJECTED"]),
  resolution: z.string().trim().min(3).max(2_000),
});

const componentDimensionSetSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().positive(),
});
const stableComponentKeySchema = z.string().trim().min(1).max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, "stable ASCII component key required");
const componentCatalogKeySchema = z.string().trim().min(1).max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

export const createComponentSnapshotSchema = z.object({
  calculatorProfileVersion: z.string().trim().min(1).max(160),
  expectedOrderContentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  reviewNote: z.string().trim().min(3).max(2_000),
  confirmation: z.literal("CREATE_COMPONENT_SNAPSHOT"),
  requirements: z.array(z.object({
    source: z.object({
      kind: z.enum(["ORDER_POSITION", "MANUFACTURED_ITEM", "SUPPLEMENTARY_ITEM"]),
      id: z.string().trim().min(1).max(80),
    }),
    requirementKind: z.enum(["CUT_PART", "PURCHASED_PART"]),
    sourceComponentKey: stableComponentKeySchema,
    componentKey: stableComponentKeySchema,
    name: z.string().trim().min(1).max(240),
    quantity: z.number().positive(),
    quantityUnit: z.string().trim().min(1).max(32),
    materialKey: componentCatalogKeySchema.optional(),
    finishKey: componentCatalogKeySchema.optional(),
    finishedDimensionsMm: componentDimensionSetSchema.optional(),
    cuttingDimensionsMm: componentDimensionSetSchema.optional(),
    grainDirection: z.string().trim().min(1).max(80).optional(),
    notes: z.string().max(10_000).optional(),
  }).superRefine((requirement, ctx) => {
    if (requirement.requirementKind !== "CUT_PART") return;
    if (!requirement.materialKey) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["materialKey"], message: "cut part material key is required" });
    if (!requirement.finishedDimensionsMm) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["finishedDimensionsMm"], message: "cut part finished dimensions are required" });
    if (!requirement.cuttingDimensionsMm) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cuttingDimensionsMm"], message: "cut part cutting dimensions are required" });
  })).min(1).max(10_000),
}).superRefine((value, ctx) => {
  const keys = value.requirements.map((requirement) => requirement.sourceComponentKey);
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requirements"], message: "source component keys must be unique" });
  }
});

export const reviewComponentSnapshotSchema = z.object({
  state: z.enum(["VERIFIED", "REJECTED"]),
  resolution: z.string().trim().min(3).max(2_000),
});

export const requestOrderReviewSchema = z.object({
  note: z.string().trim().max(2_000).optional(),
});

export const approveOrderRevisionSchema = z.object({
  note: z.string().trim().min(3).max(2_000),
});

export const createImportRunSchema = z.object({
  profileVersion: z.string().trim().min(1).max(160),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  previewArtifact: z.string().trim().min(1).max(2_000).refine((path) => !/^(?:[A-Za-z]:[\\/]|[\\/])/.test(path) && !path.split(/[\\/]/).includes(".."), "relative preview artifact path required"),
  targetSchema: z.literal("doorstar_test"),
  candidateCount: z.number().int().nonnegative().max(1_000_000),
});

/** The only database-writing legacy import payload. It is intentionally
 * limited to a fresh Sales DRAFT plus metadata-only document references. */
export const applyImportRunDraftSchema = createSalesIntakeSchema.extend({
  documents: z.array(addOrderDocumentSchema).min(1).max(100),
});

export const createOrderFeedbackSchema = z.object({
  category: z.enum(["DATA_QUALITY", "IMPORT_MAPPING", "DOCUMENT_REFERENCE", "WORKFLOW"]),
  message: z.string().trim().min(3).max(4_000),
});

export const resolveOrderFeedbackSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED"]),
  resolution: z.string().trim().min(3).max(4_000),
});

const importSourceLocatorSchema = z.object({
  sourceRoot: z.string().trim().min(1).max(80),
  relativePath: z.string().trim().min(1).max(2_000).refine((path) => !/^(?:[A-Za-z]:[\\/]|[\\/])/.test(path) && !path.split(/[\\/]/).includes(".."), "relative source path required"),
  sheet: z.string().trim().min(1).max(240).optional(),
  page: z.number().int().positive().optional(),
  row: z.number().int().positive().optional(),
});

export const createImportCandidateSchema = importSourceLocatorSchema.extend({
  recordType: z.string().trim().min(1).max(120),
  workNumber: z.string().trim().min(1).max(80).optional(),
  normalizedPayload: z.record(z.unknown()),
  errors: z.array(z.string().trim().min(1).max(240)).max(100).optional(),
  status: z.enum(["READY", "REVIEW", "BLOCKED", "APPLIED", "SKIPPED"]).optional(),
});

/** Human-gated selection of exact READY records from one immutable preview. */
export const applyManufacturedItemCandidatesSchema = z.object({
  orderRevisionId: z.string().trim().min(1),
  sourceFingerprint: z.string().regex(/^[a-fA-F0-9]{64}$/),
  candidateIds: z.array(z.string().trim().min(1)).min(1).max(200)
    .refine((ids) => new Set(ids).size === ids.length, "candidate ids must be unique"),
  confirmation: z.literal("APPLY_READY_MANUFACTURED_ITEMS"),
});

export const createDeadlineObservationSchema = importSourceLocatorSchema.extend({
  orderRevisionId: z.string().trim().min(1).optional(),
  workNumber: z.string().trim().min(1).max(80),
  kind: z.enum(["CONTRACTUAL", "PLANNED_INSTALL", "PRODUCTION_END", "NOTE"]),
  rawValue: z.string().trim().min(1).max(2_000),
  normalizedDate: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reviewState: z.enum(["UNVERIFIED", "REVIEW", "RESOLVED", "REJECTED"]).optional(),
  resolution: z.string().trim().min(1).max(2_000).optional(),
});

export const orderPositionEvidenceFields = [
  "CODE", "NAME", "QUANTITY", "PRODUCT_TYPE", "OPENING_DIRECTION",
  "OPENING_WIDTH_MM", "OPENING_HEIGHT_MM", "OPENING_DEPTH_MM",
  "DOOR_WIDTH_MM", "DOOR_HEIGHT_MM", "DOOR_THICKNESS_MM", "SURFACE",
  "WALL_TREATMENT", "GLAZING", "GLAZING_SPECIFICATION", "NOTES",
] as const;

const evidenceNormalizedValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const createOrderPositionEvidenceSchema = importSourceLocatorSchema.extend({
  orderDocumentId: z.string().trim().min(1).optional(),
  field: z.enum(orderPositionEvidenceFields),
  rawValue: z.string().trim().min(1).max(2_000),
  normalizedValue: evidenceNormalizedValueSchema,
  confidence: z.number().min(0).max(1).optional(),
  // Final states are accepted only by the one-way review command below.
  reviewState: z.enum(["UNVERIFIED", "REVIEW"]).optional(),
});

export const resolveOrderPositionEvidenceSchema = z.object({
  reviewState: z.enum(["RESOLVED", "REJECTED"]),
  resolution: z.string().trim().min(3).max(2_000),
});

export const manufacturedItemEvidenceFields = [
  "CODE", "NAME", "ITEM_TYPE", "COMPONENT_NAME", "QUANTITY", "WIDTH_MM",
  "HEIGHT_MM", "THICKNESS_MM", "MATERIAL", "SURFACE", "COLOUR", "PATTERN",
  "WORK_KIND", "NOTES",
] as const;

const manufacturedItemEvidenceSchema = importSourceLocatorSchema.extend({
  orderDocumentId: z.string().trim().min(1).optional(),
  field: z.enum(manufacturedItemEvidenceFields),
  rawValue: z.string().trim().min(1).max(2_000),
  normalizedValue: evidenceNormalizedValueSchema,
  confidence: z.number().min(0).max(1).optional(),
  // Final decisions are accepted only by the evidence review command, which
  // records the reviewer and timestamp atomically.
  reviewState: z.enum(["UNVERIFIED", "REVIEW"]).optional(),
});

const nullableManufacturedItemText = z.string().trim().min(1).max(500).nullable().optional();

/** A standalone panel/front candidate always arrives with source evidence.
 * It remains outside the door-position namespace and production workflow. */
export const createManufacturedItemSchema = z.object({
  relatedOrderPositionId: z.string().trim().min(1).optional(),
  importCandidateId: z.string().trim().min(1).optional(),
  kind: z.enum(["WALL_PANEL", "FURNITURE_FRONT"]),
  code: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(240),
  itemType: nullableManufacturedItemText,
  componentName: nullableManufacturedItemText,
  quantity: z.number().int().positive().max(100_000),
  widthMm: nullableMillimetres,
  heightMm: nullableMillimetres,
  thicknessMm: nullableMillimetres,
  material: nullableManufacturedItemText,
  surface: nullableManufacturedItemText,
  colour: nullableManufacturedItemText,
  pattern: nullableManufacturedItemText,
  workKind: z.enum(["STANDARD", "REWORK", "REMANUFACTURE", "REPLACEMENT"]),
  state: z.enum(["CANDIDATE", "REVIEW"]).optional(),
  notes: z.string().max(10_000).optional(),
  evidence: z.array(manufacturedItemEvidenceSchema).min(1).max(100),
});

export const reviewManufacturedItemSchema = z.object({
  state: z.enum(["VERIFIED", "REJECTED"]),
  resolution: z.string().trim().min(3).max(2_000),
});

export const reviewManufacturedItemEvidenceSchema = z.object({
  reviewState: z.enum(["RESOLVED", "REJECTED"]),
  resolution: z.string().trim().min(3).max(2_000),
});
