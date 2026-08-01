import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../db/client.js";
import type {
  createOrderPositionEvidenceSchema,
  resolveOrderPositionEvidenceSchema,
} from "../domain/schemas.js";
import { positionEvidenceIsFinal } from "./positionEvidenceGate.js";
import {
  lockDraftRevisionForWrite,
  RevisionWriteLockError,
} from "./revisionWriteLock.js";

type CreatePositionEvidenceInput = z.infer<typeof createOrderPositionEvidenceSchema>;
type PositionEvidenceDecision = z.infer<typeof resolveOrderPositionEvidenceSchema>;

export class OrderPositionEvidenceReviewError extends Error {
  constructor(
    public readonly status: 404 | 409,
    public readonly code: string,
    public readonly responseFields: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "OrderPositionEvidenceReviewError";
  }
}

async function lockDraftRevision(tx: Prisma.TransactionClient, orderRevisionId: string) {
  try {
    await lockDraftRevisionForWrite(tx, orderRevisionId);
  } catch (error) {
    if (!(error instanceof RevisionWriteLockError)) throw error;
    throw new OrderPositionEvidenceReviewError(
      error.status,
      error.code,
      error.details ? { details: error.details } : {},
    );
  }
}

async function lockPosition(
  tx: Prisma.TransactionClient,
  orderRevisionId: string,
  orderPositionId: string,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "OrderPosition"
    WHERE "id" = ${orderPositionId}
      AND "orderRevisionId" = ${orderRevisionId}
    FOR UPDATE
  `;
  if (locked.length === 0) {
    throw new OrderPositionEvidenceReviewError(404, "order_position_not_found");
  }
}

async function lockEvidence(
  tx: Prisma.TransactionClient,
  orderRevisionId: string,
  orderPositionId: string,
  evidenceId: string,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT evidence."id"
    FROM "OrderPositionEvidence" AS evidence
    INNER JOIN "OrderPosition" AS position
      ON position."id" = evidence."orderPositionId"
    WHERE evidence."id" = ${evidenceId}
      AND position."id" = ${orderPositionId}
      AND position."orderRevisionId" = ${orderRevisionId}
    FOR UPDATE OF evidence
  `;
  if (locked.length === 0) {
    throw new OrderPositionEvidenceReviewError(
      404,
      "order_position_evidence_not_found",
    );
  }
  return tx.orderPositionEvidence.findUniqueOrThrow({ where: { id: evidenceId } });
}

/** Every position-evidence writer locks revision then child rows. Order review
 * and approval use the same order, so a stale DRAFT authorization cannot
 * commit after the revision has been frozen. */
export function createOrderPositionEvidence(
  orderRevisionId: string,
  orderPositionId: string,
  input: CreatePositionEvidenceInput,
  actorRole: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockDraftRevision(tx, orderRevisionId);
    await lockPosition(tx, orderRevisionId, orderPositionId);
    if (input.orderDocumentId) {
      const document = await tx.orderDocument.findFirst({
        where: { id: input.orderDocumentId, orderRevisionId },
        select: { id: true },
      });
      if (!document) {
        throw new OrderPositionEvidenceReviewError(
          409,
          "evidence_document_not_from_revision",
        );
      }
    }
    return tx.orderPositionEvidence.create({
      data: {
        ...input,
        normalizedValue: input.normalizedValue === null
          ? Prisma.JsonNull
          : input.normalizedValue,
        orderPositionId,
        createdByRole: actorRole,
      },
    });
  });
}

export function reviewOrderPositionEvidence(
  orderRevisionId: string,
  orderPositionId: string,
  evidenceId: string,
  decision: PositionEvidenceDecision,
  reviewer: { principal: string; role: string },
) {
  return prisma.$transaction(async (tx) => {
    await lockDraftRevision(tx, orderRevisionId);
    const evidence = await lockEvidence(
      tx,
      orderRevisionId,
      orderPositionId,
      evidenceId,
    );
    if (positionEvidenceIsFinal(evidence)) {
      throw new OrderPositionEvidenceReviewError(
        409,
        "position_evidence_review_final",
        { reviewState: evidence.reviewState },
      );
    }
    return tx.orderPositionEvidence.update({
      where: { id: evidence.id },
      data: {
        reviewState: decision.reviewState,
        resolution: decision.resolution,
        reviewedByPrincipal: reviewer.principal,
        reviewedByRole: reviewer.role,
        reviewedAt: new Date(),
      },
    });
  });
}
