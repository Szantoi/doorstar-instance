import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { createSalesDraft } from "../src/services/orderDrafts.js";

const projectKey = "DSMR-26148";
const confirmationArgument = "--confirm-dsmr-26148-utf8-reload";
const defaultPreviewPath = resolve(process.cwd(), "../../docs/projects/doorstar-order-data-chain/IMPORT_PREVIEW_DSMR_26148.json");

type PreviewRecord = {
  recordType: string;
  action: string;
  customerName?: string;
  code?: string;
  name?: string;
  quantity?: number;
  productType?: string | null;
  openingDirection?: string | null;
  openingWidthMm?: number | null;
  openingHeightMm?: number | null;
  openingDepthMm?: number | null;
  doorWidthMm?: number | null;
  doorHeightMm?: number | null;
  doorThicknessMm?: number | null;
  surface?: string | null;
  wallTreatment?: "NONE" | "WALL_PANEL" | "BLENDE" | null;
  glazing?: "NONE" | "GLAZED" | null;
  documentKind?: "SALES_ORDER" | "SURVEY" | "DRAWING" | "OTHER";
  relativePath?: string;
  contentSha256?: string;
  observedValue?: string;
  normalisedValue?: string | null;
  errors?: string[];
  evidence?: { relativePath?: string; sourceKind?: string; locator?: string };
};

type RecoveryPreview = {
  projectKey: string;
  sourceFingerprint: string;
  records: PreviewRecord[];
  feedbackCandidates: Array<{ category: "DATA_QUALITY" | "IMPORT_MAPPING" | "DOCUMENT_REFERENCE" | "WORKFLOW"; message: string }>;
};

function requireDoorstarTestSchema(): void {
  const schema = new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema");
  if (schema !== "doorstar_test") {
    throw new Error("DSMR-26148 recovery is allowed only with DATABASE_URL?schema=doorstar_test");
  }
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fingerprintWithoutPrefix(sourceFingerprint: string): string {
  const fingerprint = sourceFingerprint.replace(/^sha256:/i, "");
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw new Error("preview sourceFingerprint must be SHA-256");
  return fingerprint;
}

function candidateSource(record: PreviewRecord) {
  const relativePath = record.relativePath ?? record.evidence?.relativePath ?? "IMPORT_PREVIEW_DSMR_26148.json";
  const pageMatch = record.evidence?.locator?.match(/page\s+(\d+)/i);
  return { relativePath, page: pageMatch ? Number(pageMatch[1]) : undefined };
}

async function main() {
  if (!process.argv.includes(confirmationArgument)) {
    throw new Error(`Human confirmation required: ${confirmationArgument}`);
  }
  requireDoorstarTestSchema();

  const previewPath = resolve(readArgument("--preview") ?? defaultPreviewPath);
  const preview = JSON.parse(await readFile(previewPath, "utf8")) as RecoveryPreview;
  if (preview.projectKey !== projectKey) throw new Error(`Expected ${projectKey} preview, received ${preview.projectKey}`);

  const project = preview.records.find((record) => record.recordType === "Project");
  const positions = preview.records.filter((record) => record.recordType === "OrderPosition");
  const document = preview.records.find((record) => record.recordType === "OrderDocument");
  const deadlines = preview.records.filter((record) => record.recordType === "DeadlineObservation");
  if (!project?.customerName || !document?.relativePath || !document.contentSha256 || positions.length === 0) {
    throw new Error("DSMR-26148 preview is missing its reviewed project, document, or positions");
  }

  const sourceFingerprint = fingerprintWithoutPrefix(preview.sourceFingerprint);
  const customerName = project.customerName;
  const documentRelativePath = document.relativePath;
  const documentContentSha256 = document.contentSha256;
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const staleRunIds = (await tx.orderRevision.findMany({
        where: { order: { project: { key: projectKey } } },
        select: { importRunId: true },
      })).flatMap((revision) => revision.importRunId ? [revision.importRunId] : []);

      // The project key is the complete recovery scope. A stale run is removed
      // only when no other revision references it, so its character-corrupted
      // candidate payload cannot remain visible after this replacement.
      await tx.project.deleteMany({ where: { key: projectKey } });
      if (staleRunIds.length > 0) {
        await tx.importRun.deleteMany({ where: { id: { in: staleRunIds }, revisions: { none: {} } } });
      }

      const run = await tx.importRun.create({
        data: {
          profileVersion: "doorstar-import-preview-evidence/v1-utf8-recovery",
          sourceFingerprint,
          previewArtifact: "docs/projects/doorstar-order-data-chain/IMPORT_PREVIEW_DSMR_26148.json",
          targetSchema: "doorstar_test",
          candidateCount: preview.records.length,
          createdByRole: "administrator",
        },
      });
      const revision = await createSalesDraft(tx, {
        projectKey,
        projectName: customerName,
        projectNum: "26148",
        customerName,
        notes: "UTF-8 helyreállítás: ellenőrzött legacy preview alapján.",
        positions: positions.map((position) => ({
          code: position.code!, name: position.name!, quantity: position.quantity!,
          productType: position.productType, openingDirection: position.openingDirection,
          openingWidthMm: position.openingWidthMm, openingHeightMm: position.openingHeightMm,
          openingDepthMm: position.openingDepthMm, doorWidthMm: position.doorWidthMm,
          doorHeightMm: position.doorHeightMm, doorThicknessMm: position.doorThicknessMm,
          surface: position.surface, wallTreatment: position.wallTreatment, glazing: position.glazing,
        })),
      }, {
        importRunId: run.id,
        documents: [{
          source: "LEGACY_FOLDER",
          kind: document.documentKind ?? "SALES_ORDER",
          displayName: basename(documentRelativePath),
          relativePath: documentRelativePath,
          contentSha256: documentContentSha256,
        }],
      });

      await tx.orderRevision.update({ where: { id: revision.id }, data: {
        intakeStage: "SURVEY_PENDING",
        salesDocumentsReceivedAt: new Date(),
      } });
      await tx.orderFeedback.createMany({ data: preview.feedbackCandidates.map((feedback) => ({
        orderRevisionId: revision.id,
        category: feedback.category,
        message: feedback.message,
        createdByRole: "administrator",
      })) });
      await tx.orderDeadlineObservation.createMany({ data: deadlines.map((deadline) => {
        const source = candidateSource(deadline);
        return {
          importRunId: run.id,
          orderRevisionId: revision.id,
          workNumber: "26148",
          sourceRoot: deadline.evidence?.sourceKind ?? "legacy-preview",
          relativePath: source.relativePath,
          page: source.page,
          kind: deadline.normalisedValue ? "CONTRACTUAL" : "NOTE",
          rawValue: deadline.observedValue ?? "unknown",
          normalizedDate: deadline.normalisedValue ? new Date(`${deadline.normalisedValue}T00:00:00.000Z`) : null,
          confidence: 0.8,
          reviewState: "REVIEW",
        };
      }) });
      await tx.importCandidate.createMany({ data: preview.records.map((record) => {
        const source = candidateSource(record);
        return {
          importRunId: run.id,
          recordType: record.recordType,
          workNumber: "26148",
          sourceRoot: record.evidence?.sourceKind ?? "legacy-preview",
          relativePath: source.relativePath,
          page: source.page,
          normalizedPayload: record as Prisma.InputJsonValue,
          errors: record.errors ?? [],
          status: record.action === "QUARANTINE" ? "BLOCKED" : "REVIEW",
        };
      }) });
      await tx.importRun.update({ where: { id: run.id }, data: { status: "APPLIED", appliedAt: new Date() } });

      return { importRunId: run.id, orderRevisionId: revision.id, customerName: project.customerName, positionCount: positions.length, feedbackCount: preview.feedbackCandidates.length };
    });
    console.info(JSON.stringify({ recovery: "completed", projectKey, ...result }));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
