import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { isImportTestSchema } from "./importSchemaGuard.js";

export const bulkPreviewRegistrationVersion = "doorstar-bulk-preview-registration/v1";
const candidateBatchSize = 250;

type PreviewRecord = Record<string, unknown>;

export type BulkPreviewArtifact = {
  relativePath: string;
  contentSha256: string;
  sourceFingerprint?: string;
  records: unknown[];
};

export type BulkPreviewRegistrationInput = {
  profileVersion: string;
  manifestRelativePath: string;
  manifestSha256: string;
  reviewedByRole: string;
  reviewNote: string;
  artifacts: BulkPreviewArtifact[];
};

export type BulkPreviewRegistrationResult = {
  importRunId: string;
  registrationKey: string;
  resumed: boolean;
  summary: { total: number; created: number; existing: number; ready: number; review: number; blocked: number };
  rows: Array<{ sourceRecordKey: string; artifact: string; row: number; status: "READY" | "REVIEW" | "BLOCKED"; errors: string[]; outcome: "created" | "existing" }>;
};

type PreparedCandidate = {
  sourceRecordKey: string;
  artifact: string;
  row: number;
  recordType: string;
  workNumber?: string;
  sourceRoot: string;
  relativePath: string;
  sheet?: string;
  page?: number;
  sourceRow?: number;
  normalizedPayload: Prisma.InputJsonValue;
  errors: string[];
  status: "READY" | "REVIEW" | "BLOCKED";
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asObject(value: unknown): PreviewRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as PreviewRecord : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function stringErrors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((error): error is string => typeof error === "string" && error.trim().length > 0).map((error) => error.trim().slice(0, 240));
}

function firstEvidence(record: PreviewRecord): PreviewRecord | undefined {
  const direct = record.evidence;
  if (Array.isArray(direct)) return direct.map(asObject).find(Boolean);
  if (asObject(direct)) return direct as PreviewRecord;
  const apiPayload = asObject(record.apiPayload);
  const apiEvidence = apiPayload?.evidence;
  return Array.isArray(apiEvidence) ? apiEvidence.map(asObject).find(Boolean) : undefined;
}

function locatorPage(evidence: PreviewRecord | undefined): number | undefined {
  const direct = positiveInteger(evidence?.page);
  if (direct) return direct;
  const locator = nonEmptyString(evidence?.locator);
  const match = locator?.match(/page\s+(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function prepareCandidate(artifact: BulkPreviewArtifact, row: number, value: unknown): PreparedCandidate {
  const sourceRecordKey = sha256(`${artifact.contentSha256}:${row}`);
  const record = asObject(value);
  if (!record) {
    return {
      sourceRecordKey, artifact: artifact.relativePath, row, recordType: "InvalidPreviewRecord",
      sourceRoot: "preview-artifact", relativePath: artifact.relativePath,
      normalizedPayload: { value: value as Prisma.InputJsonValue },
      errors: ["preview_record_must_be_an_object"], status: "BLOCKED",
    };
  }

  const evidence = firstEvidence(record);
  const sourceRoot = nonEmptyString(evidence?.sourceRoot) ?? nonEmptyString(evidence?.sourceKind) ?? "preview-artifact";
  const relativePath = nonEmptyString(evidence?.relativePath) ?? artifact.relativePath;
  const sourceLocatorMissing = !nonEmptyString(evidence?.relativePath);
  const action = nonEmptyString(record.action);
  const errors = stringErrors(record.errors);
  if (sourceLocatorMissing) errors.push("source_locator_missing");
  const status = action === "QUARANTINE" || sourceLocatorMissing
    ? "BLOCKED"
    : action === "READY" && errors.length === 0 ? "READY" : "REVIEW";
  const apiEndpoint = asObject(record.apiEndpoint);

  return {
    sourceRecordKey,
    artifact: artifact.relativePath,
    row,
    recordType: nonEmptyString(record.recordType) ?? "UnknownPreviewRecord",
    workNumber: nonEmptyString(record.workNumber) ?? nonEmptyString(record.projectKey) ?? nonEmptyString(apiEndpoint?.projectKey),
    sourceRoot,
    relativePath,
    sheet: nonEmptyString(evidence?.sheet),
    page: locatorPage(evidence),
    sourceRow: positiveInteger(evidence?.row),
    normalizedPayload: record as Prisma.InputJsonValue,
    errors: [...new Set(errors)],
    status,
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

/**
 * Registers a reviewed manifest without promoting any preview record to an
 * order or a manufactured item. The record key is deterministic, so a retry
 * after a process interruption fills only absent rows.
 */
export async function registerBulkPreview(
  prisma: PrismaClient,
  input: BulkPreviewRegistrationInput,
): Promise<BulkPreviewRegistrationResult> {
  const schema = new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema");
  if (!isImportTestSchema(schema)) throw new Error("bulk_preview_registration_requires_test_schema");
  if (!['administrator', 'vezeto'].includes(input.reviewedByRole)) throw new Error("bulk_preview_registration_requires_administrator");
  if (input.reviewNote.trim().length < 10) throw new Error("bulk_preview_registration_requires_review_note");
  const registrationKey = sha256(`${bulkPreviewRegistrationVersion}\n${input.profileVersion}\n${input.manifestSha256}`);
  const sourceFingerprint = sha256(input.artifacts
    .map((artifact) => `${artifact.relativePath}:${artifact.contentSha256}:${artifact.sourceFingerprint ?? ""}`)
    .sort()
    .join("\n"));
  const candidates = input.artifacts.flatMap((artifact) => artifact.records.map((record, index) => prepareCandidate(artifact, index + 1, record)));

  const existingRun = await prisma.importRun.findUnique({ where: { registrationKey } });
  const run = existingRun ?? await prisma.importRun.create({ data: {
    registrationKey,
    registrationVersion: bulkPreviewRegistrationVersion,
    artifactFingerprint: input.manifestSha256,
    reviewNote: input.reviewNote,
    profileVersion: input.profileVersion,
    sourceFingerprint,
    previewArtifact: input.manifestRelativePath,
    targetSchema: "doorstar_test",
    candidateCount: candidates.length,
    createdByRole: input.reviewedByRole,
  } });

  if (run.artifactFingerprint && run.artifactFingerprint !== input.manifestSha256) {
    throw new Error("bulk_preview_registration_key_collision");
  }

  const outcomes = new Map<string, "created" | "existing">();
  for (const batch of chunks(candidates, candidateBatchSize)) {
    const keys = batch.map((candidate) => candidate.sourceRecordKey);
    const existing = await prisma.importCandidate.findMany({
      where: { importRunId: run.id, sourceRecordKey: { in: keys } },
      select: { sourceRecordKey: true },
    });
    const existingKeys = new Set(existing.flatMap((candidate) => candidate.sourceRecordKey ? [candidate.sourceRecordKey] : []));
    for (const candidate of batch) outcomes.set(candidate.sourceRecordKey, existingKeys.has(candidate.sourceRecordKey) ? "existing" : "created");
    await prisma.importCandidate.createMany({
      data: batch.map((candidate) => ({
        importRunId: run.id,
        sourceRecordKey: candidate.sourceRecordKey,
        recordType: candidate.recordType,
        workNumber: candidate.workNumber,
        sourceRoot: candidate.sourceRoot,
        relativePath: candidate.relativePath,
        sheet: candidate.sheet,
        page: candidate.page,
        row: candidate.sourceRow,
        normalizedPayload: candidate.normalizedPayload,
        errors: candidate.errors,
        status: candidate.status,
      })),
      skipDuplicates: true,
    });
  }

  const rows = candidates.map((candidate) => ({
    sourceRecordKey: candidate.sourceRecordKey,
    artifact: candidate.artifact,
    row: candidate.row,
    status: candidate.status,
    errors: candidate.errors,
    outcome: outcomes.get(candidate.sourceRecordKey) ?? "existing",
  }));
  return {
    importRunId: run.id,
    registrationKey,
    resumed: Boolean(existingRun),
    summary: {
      total: rows.length,
      created: rows.filter((row) => row.outcome === "created").length,
      existing: rows.filter((row) => row.outcome === "existing").length,
      ready: rows.filter((row) => row.status === "READY").length,
      review: rows.filter((row) => row.status === "REVIEW").length,
      blocked: rows.filter((row) => row.status === "BLOCKED").length,
    },
    rows,
  };
}
