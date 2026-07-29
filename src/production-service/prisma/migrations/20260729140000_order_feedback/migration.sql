CREATE TYPE "OrderFeedbackCategory" AS ENUM ('DATA_QUALITY', 'IMPORT_MAPPING', 'DOCUMENT_REFERENCE', 'WORKFLOW');
CREATE TYPE "OrderFeedbackStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "OrderFeedback" (
  "id" TEXT NOT NULL,
  "orderRevisionId" TEXT NOT NULL,
  "category" "OrderFeedbackCategory" NOT NULL,
  "status" "OrderFeedbackStatus" NOT NULL DEFAULT 'OPEN',
  "message" TEXT NOT NULL,
  "createdByRole" TEXT NOT NULL,
  "resolution" TEXT,
  "resolvedByRole" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderFeedback_orderRevisionId_fkey" FOREIGN KEY ("orderRevisionId") REFERENCES "OrderRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OrderFeedback_orderRevisionId_status_createdAt_idx" ON "OrderFeedback"("orderRevisionId", "status", "createdAt");
