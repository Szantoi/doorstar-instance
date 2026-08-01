/**
 * Builds and contract-validates one read-only Sales-PDF import candidate.
 *
 * It never creates an ImportRun or connects to a database. The output lets a
 * reviewer see the exact API-shaped DRAFT payload and its remaining review
 * gates before any doorstar_test apply route is considered.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyImportRunDraftSchema, createOrderPositionEvidenceSchema } from "../src/domain/schemas.js";

type JsonObject = Record<string, unknown>;

function argument(name: string): string {
  const value = process.argv[process.argv.indexOf(name) + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}

function optionalArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isoDate(value: unknown): string | undefined {
  const raw = text(value);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : undefined;
}

function workNumberCandidate(preview: JsonObject): string | undefined {
  const resolution = preview.workNumberResolution;
  if (resolution && typeof resolution === "object" && !Array.isArray(resolution)) {
    return text(object(resolution, "work-number resolution").candidate);
  }
  const salesOrder = object(preview.salesOrder, "sales order");
  return text(salesOrder.workNumber) ?? text(object(preview.document, "document").relativePath)?.match(/(?<!\d)([12]\d{4})(?!\d)/)?.[1];
}

async function main() {
  const inputPath = resolve(argument("--input-json"));
  const workNumber = argument("--work-number");
  const requestedDocumentSha256 = optionalArgument("--document-sha256")?.toLowerCase();
  const outputPath = resolve(argument("--output-json"));
  const raw = await readFile(inputPath);
  const preview = object(JSON.parse(raw.toString("utf8")), "preview");
  if (preview.mode !== "preview" || preview.databaseWrite !== false || preview.macroExecution !== false) {
    throw new Error("input must be a macro-free, database-write-free preview");
  }
  const previews = preview.salesOrderPdfPreviews;
  if (!Array.isArray(previews)) throw new Error("salesOrderPdfPreviews must be an array");
  const matches = previews.filter((candidate) => workNumberCandidate(object(candidate, "sales preview")) === workNumber);
  const hashes = [...new Set(matches.map((candidate) => text(object(object(candidate, "sales preview").document, "document").contentSha256)?.toLowerCase()))];
  if (hashes.length !== 1 && !requestedDocumentSha256) {
    throw new Error(`multiple content revisions found for ${workNumber}; --document-sha256 is required`);
  }
  if (requestedDocumentSha256 && !/^[a-f0-9]{64}$/.test(requestedDocumentSha256)) {
    throw new Error("--document-sha256 must be a SHA-256 value");
  }
  const selectedMatches = matches.filter((candidate) => !requestedDocumentSha256 || text(object(object(candidate, "sales preview").document, "document").contentSha256)?.toLowerCase() === requestedDocumentSha256);
  if (selectedMatches.length === 0) throw new Error(`no Sales PDF for ${workNumber} has the requested content hash`);
  selectedMatches.sort((left, right) => {
    const leftSource = object(left, "sales preview").sourceRoot === "SALES_FOLDER" ? 0 : 1;
    const rightSource = object(right, "sales preview").sourceRoot === "SALES_FOLDER" ? 0 : 1;
    const leftPath = String(object(object(left, "sales preview").document, "document").relativePath);
    const rightPath = String(object(object(right, "sales preview").document, "document").relativePath);
    return leftSource - rightSource || leftPath.localeCompare(rightPath);
  });

  const sourcePreview = object(selectedMatches[0], "sales preview");
  const salesOrder = object(sourcePreview.salesOrder, "sales order");
  const document = object(sourcePreview.document, "document");
  const positionCandidates = sourcePreview.positionCandidates;
  if (!Array.isArray(positionCandidates) || positionCandidates.length === 0) throw new Error("at least one position candidate is required");

  const positions = positionCandidates.map((candidate, index) => {
    const target = object(object(candidate, `position ${index + 1}`).target, `position ${index + 1} target`);
    return {
      code: text(target.code), name: text(target.name), quantity: target.quantity,
      productType: text(target.productType) ?? null,
      openingDirection: text(target.openingDirection) ?? null,
      openingWidthMm: target.openingWidthMm ?? null,
      openingHeightMm: target.openingHeightMm ?? null,
      openingDepthMm: target.openingDepthMm ?? null,
      doorWidthMm: target.doorWidthMm ?? null,
      doorHeightMm: target.doorHeightMm ?? null,
      doorThicknessMm: target.doorThicknessMm ?? null,
      surface: text(target.surface) ?? null,
      wallTreatment: target.wallTreatment ?? null,
      glazing: target.glazing ?? null,
      glazingSpecification: text(target.glazingSpecification) ?? null,
      notes: text(target.notes) ?? "",
    };
  });
  const projectKey = `DSMR-${workNumber}`;
  const customerName = text(salesOrder.customerName);
  const payload = {
    projectKey,
    projectName: `${projectKey} — ${customerName ?? "REVIEW REQUIRED"}`,
    projectNum: workNumber,
    customerName,
    contactName: text(salesOrder.contactName) ?? null,
    contactPhone: text(salesOrder.contactPhone) ?? null,
    deliveryAddress: text(salesOrder.deliveryAddress) ?? null,
    expectedDelivery: isoDate(salesOrder.expectedDelivery) ?? null,
    notes: `Sales-PDF preflight only. Source expected-delivery text: ${text(salesOrder.expectedDeliveryText) ?? "(missing)"}`,
    positions,
    documents: [{
      source: document.source, kind: document.kind, displayName: document.displayName,
      relativePath: document.relativePath, contentSha256: document.contentSha256,
    }],
  };
  const contract = applyImportRunDraftSchema.safeParse(payload);
  const evidenceContractIssues = positionCandidates.flatMap((candidate, positionIndex) => {
    const sourceEvidence = object(candidate, `position ${positionIndex + 1}`).evidence;
    if (!Array.isArray(sourceEvidence)) return [{ positionIndex: positionIndex + 1, evidenceIndex: 0, path: "evidence", message: "source evidence array is required" }];
    return sourceEvidence.flatMap((item, evidenceIndex) => {
      const evidenceContract = createOrderPositionEvidenceSchema.safeParse(item);
      return evidenceContract.success ? [] : evidenceContract.error.issues.map((issue) => ({
        positionIndex: positionIndex + 1, evidenceIndex: evidenceIndex + 1,
        path: issue.path.join("."), message: issue.message,
      }));
    });
  });
  const reviewReasons = [
    "Sales technical fields remain unverified until survey/technical review.",
    document.reviewRequired === true ? "Sales document reference requires review." : undefined,
    sourcePreview.workNumberResolution && object(sourcePreview.workNumberResolution, "work-number resolution").state !== "SALES_HEADER" ? "Work number came from a path fallback or conflicts with the Sales header." : undefined,
    !isoDate(salesOrder.expectedDelivery) && text(salesOrder.expectedDeliveryText) ? "Expected delivery is free text, not an importable ISO date." : undefined,
    ...positionCandidates.flatMap((candidate, index) => Array.isArray(object(candidate, `position ${index + 1}`).errors) ? object(candidate, `position ${index + 1}`).errors.map((error) => `Position ${index + 1}: ${String(error)}`) : []),
  ].filter((reason): reason is string => Boolean(reason));
  const result = {
    mode: "preview", databaseWrite: false, macroExecution: false,
    profile: "sales-pdf-draft-preflight-v1",
    source: {
      previewArtifact: "docs/projects/doorstar-order-data-chain/IMPORT_PREVIEW_SALES_PDF_BATCH.json",
      previewSha256: createHash("sha256").update(raw).digest("hex"),
      workNumber, documentRelativePath: document.relativePath, documentSha256: document.contentSha256,
      sameContentReferenceCount: selectedMatches.length,
    },
    contractValid: contract.success,
    contractIssues: contract.success ? [] : contract.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    evidenceContractValid: evidenceContractIssues.length === 0,
    evidenceContractIssues,
    databaseApplyAllowed: false,
    reviewReasons,
    draftPayload: payload,
    positionEvidence: positionCandidates.map((candidate, index) => ({ positionIndex: index + 1, source: object(candidate, `position ${index + 1}`).source, evidence: object(candidate, `position ${index + 1}`).evidence })),
  };
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ workNumber, contractValid: result.contractValid, evidenceContractValid: result.evidenceContractValid, positionCount: positions.length, reviewReasonCount: reviewReasons.length }));
  if (!contract.success || !result.evidenceContractValid) process.exitCode = 2;
}

void main();
