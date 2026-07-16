import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1),
  station: z.string().nullable().optional(),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day: z.number().int().min(0).max(6),
  urgent: z.boolean().optional(),
  description: z.string().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  station: z.string().nullable().optional(),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  day: z.number().int().min(0).max(6).optional(),
  stepIndex: z.number().int().min(0).optional(),
  acknowledged: z.boolean().optional(),
  urgent: z.boolean().optional(),
  problem: z.boolean().optional(),
  dueDate: z.string().nullable().optional(),
  description: z.string().optional(),
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

export const scheduleSchema = z.object({
  schedDays: z.array(z.boolean()).length(7).optional(),
});

export const sheetTemplateSchema = z.object({
  name: z.string().min(1),
  epics: z.array(epicSchema),
});

export const epikTemplateSchema = z.object({
  name: z.string().min(1),
  epic: epicSchema,
});

export const projectSheetKindSchema = z.enum(["QUANTITIES", "CUTTING", "HARDWARE"]);
