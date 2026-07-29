CREATE TYPE "OrderRevisionAuditAction" AS ENUM ('REVIEW_REQUESTED', 'APPROVED');

CREATE TABLE "OrderRevisionAudit" (
  "id" TEXT NOT NULL,
  "orderRevisionId" TEXT NOT NULL,
  "action" "OrderRevisionAuditAction" NOT NULL,
  "actorRole" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderRevisionAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderRevisionAudit_orderRevisionId_fkey" FOREIGN KEY ("orderRevisionId") REFERENCES "OrderRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrderRevisionAudit_orderRevisionId_createdAt_idx" ON "OrderRevisionAudit"("orderRevisionId", "createdAt");
