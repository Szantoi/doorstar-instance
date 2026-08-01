import { Prisma } from "@prisma/client";

export class RevisionWriteLockError extends Error {
  constructor(
    public readonly status: 404 | 409,
    public readonly code: "order_revision_not_found" | "revision_version_conflict",
    public readonly details?: { currentStatus?: string; requiredStatus: "DRAFT" },
  ) {
    super(code);
    this.name = "RevisionWriteLockError";
  }
}

/** Shared aggregate-root lock for every DRAFT writer added to the approval
 * hash. Callers lock the revision first and child rows second. */
export async function lockDraftRevisionForWrite(
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
    throw new RevisionWriteLockError(404, "order_revision_not_found");
  }
  const revision = await tx.orderRevision.findUnique({
    where: { id: orderRevisionId },
    select: { status: true },
  });
  if (revision?.status !== "DRAFT") {
    throw new RevisionWriteLockError(409, "revision_version_conflict", {
      currentStatus: revision?.status,
      requiredStatus: "DRAFT",
    });
  }
}
