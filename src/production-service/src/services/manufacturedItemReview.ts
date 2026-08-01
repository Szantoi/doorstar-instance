import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../db/client.js";
import type {
  createManufacturedItemSchema,
  reviewManufacturedItemEvidenceSchema,
  reviewManufacturedItemSchema,
} from "../domain/schemas.js";
import {
  sourceEvidenceIsFinal,
  sourceEvidenceIsReady,
  summarizeSourceEvidence,
} from "./sourceEvidenceGate.js";

type CreateManufacturedItemInput = z.infer<typeof createManufacturedItemSchema>;
type ManufacturedItemDecision = z.infer<typeof reviewManufacturedItemSchema>;
type ManufacturedEvidenceDecision = z.infer<typeof reviewManufacturedItemEvidenceSchema>;

export class ManufacturedItemReviewError extends Error {
  constructor(
    public readonly status: 404 | 409,
    public readonly code: string,
    public readonly responseFields: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "ManufacturedItemReviewError";
  }
}

async function lockDraftRevision(
  tx: Prisma.TransactionClient,
  orderRevisionId: string,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "OrderRevision"
    WHERE "id" = ${orderRevisionId}
    FOR UPDATE
  `;
  if (locked.length === 0) {
    throw new ManufacturedItemReviewError(404, "order_revision_not_found");
  }
  const revision = await tx.orderRevision.findUnique({
    where: { id: orderRevisionId },
    select: { status: true, importRunId: true },
  });
  if (revision?.status !== "DRAFT") {
    throw new ManufacturedItemReviewError(409, "manufactured_item_requires_draft");
  }
  return revision;
}

async function lockActiveItem(
  tx: Prisma.TransactionClient,
  orderRevisionId: string,
  itemId: string,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "ManufacturedItem"
    WHERE "id" = ${itemId}
      AND "orderRevisionId" = ${orderRevisionId}
    FOR UPDATE
  `;
  if (locked.length === 0) {
    throw new ManufacturedItemReviewError(404, "manufactured_item_not_found");
  }
  const item = await tx.manufacturedItem.findUnique({
    where: { id: itemId },
    include: {
      evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
  if (!item) {
    throw new ManufacturedItemReviewError(404, "manufactured_item_not_found");
  }
  if (item.state === "VERIFIED" || item.state === "REJECTED") {
    throw new ManufacturedItemReviewError(409, "manufactured_item_review_final", {
      state: item.state,
    });
  }
  return item;
}

export function createManufacturedItem(
  orderRevisionId: string,
  input: CreateManufacturedItemInput,
  actorRole: string,
) {
  return prisma.$transaction(async (tx) => {
    const revision = await lockDraftRevision(tx, orderRevisionId);
    if (input.relatedOrderPositionId) {
      const relatedPosition = await tx.orderPosition.findFirst({
        where: {
          id: input.relatedOrderPositionId,
          orderRevisionId,
        },
        select: { id: true },
      });
      if (!relatedPosition) {
        throw new ManufacturedItemReviewError(409, "related_position_not_from_revision");
      }
    }
    if (input.importCandidateId) {
      if (!revision.importRunId) {
        throw new ManufacturedItemReviewError(409, "revision_has_no_import_run");
      }
      const candidate = await tx.importCandidate.findFirst({
        where: {
          id: input.importCandidateId,
          importRunId: revision.importRunId,
        },
        select: { id: true },
      });
      if (!candidate) {
        throw new ManufacturedItemReviewError(
          409,
          "manufactured_item_candidate_not_from_import_run",
        );
      }
    }
    const documentIds = [...new Set(
      input.evidence.flatMap((evidence) =>
        evidence.orderDocumentId ? [evidence.orderDocumentId] : []),
    )];
    if (
      documentIds.length > 0
      && await tx.orderDocument.count({
        where: { id: { in: documentIds }, orderRevisionId },
      }) !== documentIds.length
    ) {
      throw new ManufacturedItemReviewError(
        409,
        "manufactured_item_document_not_from_revision",
      );
    }

    const { evidence, ...item } = input;
    return tx.manufacturedItem.create({
      data: {
        ...item,
        orderRevisionId,
        notes: item.notes ?? "",
        evidence: {
          create: evidence.map((source) => ({
            ...source,
            normalizedValue: source.normalizedValue === null
              ? Prisma.JsonNull
              : source.normalizedValue,
            createdByRole: actorRole,
          })),
        },
      },
      include: {
        evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });
  });
}

export function reviewManufacturedItemEvidence(
  orderRevisionId: string,
  itemId: string,
  evidenceId: string,
  decision: ManufacturedEvidenceDecision,
  reviewerRole: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockDraftRevision(tx, orderRevisionId);
    const item = await lockActiveItem(tx, orderRevisionId, itemId);
    const evidence = item.evidence.find((candidate) => candidate.id === evidenceId);
    if (!evidence) {
      throw new ManufacturedItemReviewError(
        404,
        "manufactured_item_evidence_not_found",
      );
    }
    if (sourceEvidenceIsFinal(evidence)) {
      throw new ManufacturedItemReviewError(
        409,
        "manufactured_evidence_review_final",
        { reviewState: evidence.reviewState },
      );
    }
    return tx.manufacturedItemEvidence.update({
      where: { id: evidence.id },
      data: {
        reviewState: decision.reviewState,
        resolution: decision.resolution,
        reviewedByRole: reviewerRole,
        reviewedAt: new Date(),
      },
    });
  });
}

export function reviewManufacturedItem(
  orderRevisionId: string,
  itemId: string,
  decision: ManufacturedItemDecision,
  reviewerRole: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockDraftRevision(tx, orderRevisionId);
    const item = await lockActiveItem(tx, orderRevisionId, itemId);
    if (decision.state === "VERIFIED") {
      if (item.evidence.length === 0) {
        throw new ManufacturedItemReviewError(
          409,
          "manufactured_item_evidence_required",
        );
      }
      if (!sourceEvidenceIsReady(item.evidence)) {
        throw new ManufacturedItemReviewError(
          409,
          "manufactured_item_evidence_unresolved",
          { details: summarizeSourceEvidence(item.evidence) },
        );
      }
    }
    return tx.manufacturedItem.update({
      where: { id: item.id },
      data: {
        state: decision.state,
        resolution: decision.resolution,
        reviewedByRole: reviewerRole,
        reviewedAt: new Date(),
      },
      include: {
        evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });
  });
}
