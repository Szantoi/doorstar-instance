import { Prisma, type PrismaClient } from "@prisma/client";
import { createManufacturedItemSchema } from "../domain/schemas.js";

export class ManufacturedItemImportError extends Error {
  constructor(
    public readonly code: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "ManufacturedItemImportError";
  }
}

export interface ApplyManufacturedItemCandidatesInput {
  importRunId: string;
  orderRevisionId: string;
  sourceFingerprint: string;
  candidateIds: string[];
  actorRole: string;
}

/** Applies only the explicitly selected READY candidates from the stored
 * preview. The unique candidate relation and status compare-and-set make
 * repeated requests deterministic without trusting client-supplied payloads. */
export async function applyManufacturedItemCandidates(
  client: PrismaClient,
  input: ApplyManufacturedItemCandidatesInput,
) {
  return client.$transaction(async (tx) => {
    const run = await tx.importRun.findUnique({
      where: { id: input.importRunId },
      select: { id: true, status: true, targetSchema: true, sourceFingerprint: true },
    });
    if (!run) throw new ManufacturedItemImportError("import_run_not_found");
    if (run.targetSchema !== "doorstar_test") {
      throw new ManufacturedItemImportError("import_run_target_not_test");
    }
    if (run.status !== "APPLIED") {
      throw new ManufacturedItemImportError("import_run_draft_required", { status: run.status });
    }
    if (run.sourceFingerprint.toLowerCase() !== input.sourceFingerprint.toLowerCase()) {
      throw new ManufacturedItemImportError("import_source_fingerprint_changed");
    }

    const revision = await tx.orderRevision.findFirst({
      where: { id: input.orderRevisionId, importRunId: run.id },
      select: {
        id: true,
        revision: true,
        status: true,
        order: { select: { project: { select: { key: true } } } },
      },
    });
    if (!revision) throw new ManufacturedItemImportError("import_revision_not_from_run");
    if (revision.status !== "DRAFT") {
      throw new ManufacturedItemImportError("import_revision_requires_draft", { status: revision.status });
    }

    const candidates = await tx.importCandidate.findMany({
      where: { importRunId: run.id, id: { in: input.candidateIds } },
      include: { manufacturedItem: { include: { evidence: { orderBy: { createdAt: "asc" } } } } },
    });
    if (candidates.length !== input.candidateIds.length) {
      throw new ManufacturedItemImportError("import_candidate_not_found");
    }
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const orderedCandidates = input.candidateIds.map((id) => byId.get(id)!);

    const items = [];
    let createdCount = 0;
    let existingCount = 0;

    for (const candidate of orderedCandidates) {
      if (candidate.status === "APPLIED" && candidate.manufacturedItem) {
        if (candidate.manufacturedItem.orderRevisionId !== revision.id) {
          throw new ManufacturedItemImportError("candidate_applied_to_other_revision", { candidateId: candidate.id });
        }
        items.push(candidate.manufacturedItem);
        existingCount += 1;
        continue;
      }
      if (candidate.status !== "READY") {
        throw new ManufacturedItemImportError("import_candidate_not_ready", {
          candidateId: candidate.id,
          status: candidate.status,
        });
      }
      if (candidate.recordType !== "ManufacturedItemImportPreview") {
        throw new ManufacturedItemImportError("import_candidate_wrong_record_type", {
          candidateId: candidate.id,
          recordType: candidate.recordType,
        });
      }
      if (candidate.errors.length > 0) {
        throw new ManufacturedItemImportError("import_candidate_has_errors", {
          candidateId: candidate.id,
          errors: candidate.errors,
        });
      }
      if (!candidate.normalizedPayload || Array.isArray(candidate.normalizedPayload) || typeof candidate.normalizedPayload !== "object") {
        throw new ManufacturedItemImportError("import_candidate_payload_invalid", { candidateId: candidate.id });
      }

      const parsed = createManufacturedItemSchema.safeParse({
        ...(candidate.normalizedPayload as Record<string, unknown>),
        importCandidateId: candidate.id,
      });
      if (!parsed.success) {
        throw new ManufacturedItemImportError("import_candidate_payload_invalid", {
          candidateId: candidate.id,
          issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        });
      }
      const { evidence, ...item } = parsed.data;

      if (item.relatedOrderPositionId) {
        const relatedPosition = await tx.orderPosition.findFirst({
          where: { id: item.relatedOrderPositionId, orderRevisionId: revision.id },
          select: { id: true },
        });
        if (!relatedPosition) {
          throw new ManufacturedItemImportError("related_position_not_from_revision", { candidateId: candidate.id });
        }
      }
      const documentIds = [...new Set(evidence.flatMap((source) => source.orderDocumentId ? [source.orderDocumentId] : []))];
      if (documentIds.length) {
        const documentCount = await tx.orderDocument.count({
          where: { id: { in: documentIds }, orderRevisionId: revision.id },
        });
        if (documentCount !== documentIds.length) {
          throw new ManufacturedItemImportError("manufactured_item_document_not_from_revision", { candidateId: candidate.id });
        }
      }

      const claimed = await tx.importCandidate.updateMany({
        where: { id: candidate.id, status: "READY" },
        data: { status: "APPLIED" },
      });
      if (claimed.count !== 1) {
        throw new ManufacturedItemImportError("import_candidate_state_changed", { candidateId: candidate.id });
      }

      const created = await tx.manufacturedItem.create({
        data: {
          ...item,
          state: "REVIEW",
          orderRevisionId: revision.id,
          notes: item.notes ?? "",
          evidence: {
            create: evidence.map((source) => ({
              ...source,
              normalizedValue: source.normalizedValue === null ? Prisma.JsonNull : source.normalizedValue,
              createdByRole: input.actorRole,
            })),
          },
        },
        include: { evidence: { orderBy: { createdAt: "asc" } } },
      });
      items.push(created);
      createdCount += 1;
    }

    return {
      importRunId: run.id,
      orderRevisionId: revision.id,
      projectKey: revision.order.project.key,
      revision: revision.revision,
      createdCount,
      existingCount,
      items,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
