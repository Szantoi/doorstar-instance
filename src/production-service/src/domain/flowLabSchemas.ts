import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i, "lower-case SHA-256 required");
const boundedText = (max: number) => z.string().trim().min(1).max(max);
const finiteNumber = z.number().finite();
const nonNegative = finiteNumber.min(0);
const stableKey = boundedText(240).regex(/^[^/\s]+(?:\/[^/\s]+){2}$/, "three-part correlation key required");
/** Calendar anchoring belongs to the board, and remains deliberately absent
 * from the Flow Lab artifact and deviation-feed contracts. */
const boardPlanDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "ISO calendar date required")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "valid calendar date required");

export const flowLabPlanSchemaVersion = "doorstar.flow-lab.plan-materialization/v1";
export const flowLabDeviationFeedSchemaVersion = "doorstar.flow-lab.board-deviation-feed/v1";

export const flowLabPlanOperationSchema = z.object({
  correlationKey: stableKey,
  familyKey: boundedText(160),
  operationKey: boundedText(160),
  description: boundedText(2_000),
  operationType: z.enum(["ActiveWork", "Summary"]),
  station: boundedText(240).nullable(),
  department: boundedText(240).nullable(),
  quantity: z.object({
    value: nonNegative,
    unit: boundedText(64),
    resolved: z.boolean(),
  }).strict(),
  time: z.object({
    setupMinutes: nonNegative,
    cycleMinutesPerUnit: nonNegative,
    passiveWaitMinutes: nonNegative,
    activeMinutes: nonNegative,
    elapsedMinutes: nonNegative,
    requiredWorkers: nonNegative,
    workloadPersonMinutes: nonNegative,
  }).strict(),
  boardProjection: z.object({
    quantity: nonNegative,
    unitHours: nonNegative,
  }).strict(),
}).strict().superRefine((operation, ctx) => {
  if (operation.operationType !== "Summary") return;
  if (operation.boardProjection.quantity !== 0 || operation.boardProjection.unitHours !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["boardProjection"],
      message: "Summary operation must preserve a zero board projection.",
    });
  }
});

export const flowLabRelativeScheduleEntrySchema = z.object({
  correlationKey: stableKey,
  startElapsedMinute: nonNegative,
  finishElapsedMinute: nonNegative,
}).strict().superRefine((entry, ctx) => {
  if (entry.finishElapsedMinute < entry.startElapsedMinute) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["finishElapsedMinute"], message: "finish must not precede start" });
  }
});

/** The two persisted payload members used to materialize board rows. */
export const flowLabPlanProjectionSchema = z.object({
  operations: z.array(flowLabPlanOperationSchema).min(1).max(5_000),
  relativeSchedule: z.array(flowLabRelativeScheduleEntrySchema).min(1).max(5_000),
}).strict().superRefine((payload, ctx) => {
  const operationKeys = payload.operations.map((operation) => operation.correlationKey);
  const scheduleKeys = payload.relativeSchedule.map((entry) => entry.correlationKey);
  if (new Set(operationKeys).size !== operationKeys.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["operations"], message: "operation correlation keys must be unique" });
  }
  if (new Set(scheduleKeys).size !== scheduleKeys.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["relativeSchedule"], message: "schedule correlation keys must be unique" });
  }
  const scheduleSet = new Set(scheduleKeys);
  for (const [index, key] of operationKeys.entries()) {
    if (!scheduleSet.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["operations", index, "correlationKey"], message: "operation missing relative schedule" });
    }
  }
  const operationSet = new Set(operationKeys);
  for (const [index, key] of scheduleKeys.entries()) {
    if (!operationSet.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["relativeSchedule", index, "correlationKey"], message: "schedule references unknown operation" });
    }
  }
});

export const reviewFlowLabPlanSnapshotSchema = z.object({
  state: z.enum(["VERIFIED", "REJECTED"]),
  resolution: boundedText(2_000),
  expectedContentHash: sha256,
}).strict();

export const materializeFlowLabPlanSnapshotSchema = z.object({}).strict();

export const flowLabDeviationKindSchema = z.enum([
  "QUANTITY_CHANGED",
  "UNIT_HOURS_CHANGED",
  "STEP_DISABLED",
  "STEP_ENABLED",
  "STEP_REORDERED",
  "STATION_CHANGED",
  "PLAN_LOCKED",
  "PLAN_UNLOCKED",
  "STEP_ADDED_BY_HAND",
  "TASK_PROBLEM_FLAGGED",
]);

const quantityPayload = z.object({
  quantityBefore: nonNegative,
  quantityAfter: nonNegative,
  quantityUnit: boundedText(64),
}).strict();
const unitHoursPayload = z.object({
  unitHoursBefore: nonNegative,
  unitHoursAfter: nonNegative,
}).strict();
const reorderPayload = z.object({
  positionBefore: z.number().int().nonnegative(),
  positionAfter: z.number().int().nonnegative(),
}).strict();
const stationPayload = z.object({
  stationBefore: boundedText(240).nullable(),
  stationAfter: boundedText(240).nullable(),
}).strict();
const handAddedPayload = z.object({
  handAddedName: boundedText(500),
  handAddedStation: boundedText(240).nullable(),
  handAddedPosition: z.number().int().nonnegative(),
}).strict();
const problemPayload = z.object({
  problem: z.boolean(),
  problemComment: z.string().trim().max(2_000).nullable(),
}).strict();

export const flowLabDeviationInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("QUANTITY_CHANGED"), correlationKey: stableKey, payload: quantityPayload }).strict(),
  z.object({ kind: z.literal("UNIT_HOURS_CHANGED"), correlationKey: stableKey, payload: unitHoursPayload }).strict(),
  z.object({ kind: z.literal("STEP_DISABLED"), correlationKey: stableKey, payload: z.object({ disabled: z.literal(true) }).strict() }).strict(),
  z.object({ kind: z.literal("STEP_ENABLED"), correlationKey: stableKey, payload: z.object({ disabled: z.literal(false) }).strict() }).strict(),
  z.object({ kind: z.literal("STEP_REORDERED"), correlationKey: stableKey, payload: reorderPayload }).strict(),
  z.object({ kind: z.literal("STATION_CHANGED"), correlationKey: stableKey, payload: stationPayload }).strict(),
  z.object({ kind: z.literal("PLAN_LOCKED"), correlationKey: stableKey, payload: z.object({ planLocked: z.literal(true) }).strict() }).strict(),
  z.object({ kind: z.literal("PLAN_UNLOCKED"), correlationKey: stableKey, payload: z.object({ planLocked: z.literal(false) }).strict() }).strict(),
  z.object({ kind: z.literal("STEP_ADDED_BY_HAND"), correlationKey: z.null(), payload: handAddedPayload }).strict(),
  z.object({ kind: z.literal("TASK_PROBLEM_FLAGGED"), correlationKey: stableKey, payload: problemPayload }).strict(),
]);

export const flowLabDeviationListQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const updateFlowLabMaterializedStepSchema = z.object({
  quantity: nonNegative.optional(),
  unitHours: nonNegative.optional(),
  station: boundedText(240).nullable().optional(),
  planDate: boardPlanDate.nullable().optional(),
  disabled: z.boolean().optional(),
  planLocked: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "at least one editable field required");

export const addFlowLabManualStepSchema = z.object({
  name: boundedText(500),
  station: boundedText(240).nullable().optional(),
  quantity: nonNegative.nullable().optional(),
  unitHours: nonNegative.nullable().optional(),
  planDate: boardPlanDate.nullable().optional(),
  disabled: z.boolean().optional(),
  planLocked: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
}).strict();

export type FlowLabPlanProjection = z.infer<typeof flowLabPlanProjectionSchema>;
export type FlowLabPlanOperation = z.infer<typeof flowLabPlanOperationSchema>;
export type FlowLabDeviationInput = z.infer<typeof flowLabDeviationInputSchema>;
export type ReviewFlowLabPlanSnapshotInput = z.infer<typeof reviewFlowLabPlanSnapshotSchema>;
