import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../db/client.js";
import type {
  createOrderSupplementaryItemSchema,
  updateOrderSupplementaryItemSchema,
} from "../domain/schemas.js";
import {
  sourceEvidenceIsFinal,
  sourceEvidenceIsReady,
  summarizeSourceEvidence,
} from "./sourceEvidenceGate.js";

type CreateItemInput = z.infer<typeof createOrderSupplementaryItemSchema>;
type UpdateItemInput = z.infer<typeof updateOrderSupplementaryItemSchema>;

type ItemDecision = {
  state: "VERIFIED" | "REJECTED";
  resolution: string;
};

type EvidenceDecision = {
  reviewState: "RESOLVED" | "REJECTED";
  resolution: string;
};

/** Stable domain error translated by the HTTP adapter. */
export class SupplementaryReviewError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    public readonly code: string,
    public readonly responseFields: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "SupplementaryReviewError";
  }
}

async function lockDraftRevision(tx: Prisma.TransactionClient, orderRevisionId: string) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "OrderRevision"
    WHERE "id" = ${orderRevisionId}
    FOR UPDATE
  `;
  if (locked.length === 0) {
    throw new SupplementaryReviewError(404, "order_revision_not_found");
  }
  const revision = await tx.orderRevision.findUnique({
    where: { id: orderRevisionId },
    select: { status: true },
  });
  if (revision?.status !== "DRAFT") {
    throw new SupplementaryReviewError(409, "supplementary_item_requires_draft");
  }
}

async function lockItem(
  tx: Prisma.TransactionClient,
  orderRevisionId: string,
  itemId: string,
) {
  // Evidence review and parent review lock the same aggregate root. This makes
  // their one-way decisions deterministic under concurrent requests.
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "OrderSupplementaryItem"
    WHERE "id" = ${itemId}
      AND "orderRevisionId" = ${orderRevisionId}
    FOR UPDATE
  `;
  if (locked.length === 0) {
    throw new SupplementaryReviewError(404, "supplementary_item_not_found");
  }
  const item = await tx.orderSupplementaryItem.findUnique({
    where: { id: itemId },
    include: { evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  if (!item) {
    throw new SupplementaryReviewError(404, "supplementary_item_not_found");
  }
  if (item.state !== "REVIEW") {
    throw new SupplementaryReviewError(409, "supplementary_item_review_final", {
      state: item.state,
    });
  }
  return item;
}

/** All mutable supplementary-item commands share the same revision/item row
 * locks as review. A review transition can therefore never be followed by a
 * stale create, update or delete that was authorized against DRAFT/REVIEW. */
export function createSupplementaryItem(
  orderRevisionId: string,
  input: CreateItemInput,
  actorRole: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockDraftRevision(tx, orderRevisionId);
    const documentIds = [...new Set(
      input.evidence?.flatMap((evidence) =>
        evidence.orderDocumentId ? [evidence.orderDocumentId] : []) ?? [],
    )];
    if (
      documentIds.length > 0
      && await tx.orderDocument.count({
        where: { id: { in: documentIds }, orderRevisionId },
      }) !== documentIds.length
    ) {
      throw new SupplementaryReviewError(
        409,
        "supplementary_item_document_not_from_revision",
      );
    }

    const { evidence = [], ...item } = input;
    return tx.orderSupplementaryItem.create({
      data: {
        ...item,
        orderRevisionId,
        notes: item.notes ?? "",
        createdByRole: actorRole,
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

export function updateSupplementaryItem(
  orderRevisionId: string,
  itemId: string,
  input: UpdateItemInput,
) {
  return prisma.$transaction(async (tx) => {
    await lockDraftRevision(tx, orderRevisionId);
    const item = await lockItem(tx, orderRevisionId, itemId);
    if (item.entryMode === "MANUAL") {
      const nextQuantity = input.quantity === undefined ? item.quantity : input.quantity;
      const nextUnit = input.unit === undefined ? item.unit : input.unit;
      const nextManualReason = input.manualReason === undefined
        ? item.manualReason
        : input.manualReason;
      if (nextQuantity === null || nextUnit === null || nextManualReason === null) {
        throw new SupplementaryReviewError(
          400,
          "manual_supplementary_item_fields_required",
        );
      }
    }
    return tx.orderSupplementaryItem.update({
      where: { id: item.id },
      data: input,
      include: {
        evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });
  });
}

export function deleteSupplementaryItem(
  orderRevisionId: string,
  itemId: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockDraftRevision(tx, orderRevisionId);
    const item = await lockItem(tx, orderRevisionId, itemId);
    if (item.entryMode !== "MANUAL") {
      throw new SupplementaryReviewError(409, "source_review_item_must_be_rejected");
    }
    await tx.orderSupplementaryItem.delete({ where: { id: item.id } });
  });
}

/** Finalize one source evidence row without mutating its captured source data. */
export function reviewSupplementaryItemEvidence(
  orderRevisionId: string,
  itemId: string,
  evidenceId: string,
  decision: EvidenceDecision,
  reviewerRole: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockDraftRevision(tx, orderRevisionId);
    const item = await lockItem(tx, orderRevisionId, itemId);
    if (item.entryMode !== "SOURCE_REVIEW") {
      throw new SupplementaryReviewError(409, "supplementary_evidence_requires_source_review");
    }
    const evidence = item.evidence.find((candidate) => candidate.id === evidenceId);
    if (!evidence) {
      throw new SupplementaryReviewError(404, "supplementary_item_evidence_not_found");
    }
    if (sourceEvidenceIsFinal(evidence)) {
      throw new SupplementaryReviewError(409, "supplementary_evidence_review_final", {
        reviewState: evidence.reviewState,
      });
    }
    return tx.orderSupplementaryItemEvidence.update({
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

/** Finalize the aggregate root. SOURCE_REVIEW verification is fail-closed
 * until every evidence row has a complete, auditable RESOLVED decision. */
export function reviewSupplementaryItem(
  orderRevisionId: string,
  itemId: string,
  decision: ItemDecision,
  reviewerRole: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockDraftRevision(tx, orderRevisionId);
    const item = await lockItem(tx, orderRevisionId, itemId);

    if (item.entryMode === "SOURCE_REVIEW" && decision.state === "VERIFIED") {
      if (item.evidence.length === 0) {
        throw new SupplementaryReviewError(409, "source_review_item_evidence_required");
      }
      if (!sourceEvidenceIsReady(item.evidence)) {
        throw new SupplementaryReviewError(409, "source_review_item_evidence_unresolved", {
          details: summarizeSourceEvidence(item.evidence),
        });
      }
    }

    return tx.orderSupplementaryItem.update({
      where: { id: item.id },
      data: {
        state: decision.state,
        reviewResolution: decision.resolution,
        reviewedByRole: reviewerRole,
        reviewedAt: new Date(),
      },
      include: {
        evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });
  });
}
