CREATE TYPE "SupplementaryItemEntryMode" AS ENUM ('MANUAL', 'SOURCE_REVIEW');
CREATE TYPE "SupplementaryItemState" AS ENUM ('REVIEW', 'VERIFIED', 'REJECTED');
CREATE TABLE "OrderSupplementaryItem" (
  "id" TEXT NOT NULL, "orderRevisionId" TEXT NOT NULL, "entryMode" "SupplementaryItemEntryMode" NOT NULL,
  "state" "SupplementaryItemState" NOT NULL DEFAULT 'REVIEW', "category" TEXT NOT NULL, "code" TEXT,
  "name" TEXT NOT NULL, "quantity" DOUBLE PRECISION, "unit" TEXT, "calculatedQuantity" DOUBLE PRECISION,
  "calculatedUnit" TEXT, "notes" TEXT NOT NULL DEFAULT '', "manualReason" TEXT, "createdByRole" TEXT NOT NULL,
  "reviewedByRole" TEXT, "reviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "OrderSupplementaryItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderSupplementaryItem_orderRevisionId_state_idx" ON "OrderSupplementaryItem"("orderRevisionId", "state");
ALTER TABLE "OrderSupplementaryItem" ADD CONSTRAINT "OrderSupplementaryItem_orderRevisionId_fkey" FOREIGN KEY ("orderRevisionId") REFERENCES "OrderRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "OrderSupplementaryItemEvidence" (
  "id" TEXT NOT NULL, "supplementaryItemId" TEXT NOT NULL, "orderDocumentId" TEXT, "sourceRoot" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL, "page" INTEGER, "row" INTEGER, "field" TEXT NOT NULL, "rawValue" TEXT NOT NULL,
  "normalizedValue" JSONB NOT NULL, "confidence" DOUBLE PRECISION, "reviewState" "EvidenceReviewState" NOT NULL DEFAULT 'UNVERIFIED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OrderSupplementaryItemEvidence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderSupplementaryItemEvidence_supplementaryItemId_field_reviewState_idx" ON "OrderSupplementaryItemEvidence"("supplementaryItemId", "field", "reviewState");
CREATE INDEX "OrderSupplementaryItemEvidence_orderDocumentId_idx" ON "OrderSupplementaryItemEvidence"("orderDocumentId");
ALTER TABLE "OrderSupplementaryItemEvidence" ADD CONSTRAINT "OrderSupplementaryItemEvidence_supplementaryItemId_fkey" FOREIGN KEY ("supplementaryItemId") REFERENCES "OrderSupplementaryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderSupplementaryItemEvidence" ADD CONSTRAINT "OrderSupplementaryItemEvidence_orderDocumentId_fkey" FOREIGN KEY ("orderDocumentId") REFERENCES "OrderDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
