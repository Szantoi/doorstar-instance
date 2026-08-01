ALTER TABLE "OrderDocument"
  ADD COLUMN "documentFamilyKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "supersedesDocumentId" TEXT;

UPDATE "OrderDocument" SET "documentFamilyKey" = "id" WHERE "documentFamilyKey" = '';

CREATE UNIQUE INDEX "OrderDocument_supersedesDocumentId_key" ON "OrderDocument"("supersedesDocumentId");
CREATE INDEX "OrderDocument_orderRevisionId_documentFamilyKey_idx" ON "OrderDocument"("orderRevisionId", "documentFamilyKey");

ALTER TABLE "OrderDocument"
  ADD CONSTRAINT "OrderDocument_supersedesDocumentId_fkey"
  FOREIGN KEY ("supersedesDocumentId") REFERENCES "OrderDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OrderDocumentPositionLink" (
  "id" TEXT NOT NULL,
  "orderDocumentId" TEXT NOT NULL,
  "orderPositionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderDocumentPositionLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrderDocumentPositionLink_orderDocumentId_orderPositionId_key" ON "OrderDocumentPositionLink"("orderDocumentId", "orderPositionId");
CREATE INDEX "OrderDocumentPositionLink_orderPositionId_idx" ON "OrderDocumentPositionLink"("orderPositionId");
ALTER TABLE "OrderDocumentPositionLink" ADD CONSTRAINT "OrderDocumentPositionLink_orderDocumentId_fkey" FOREIGN KEY ("orderDocumentId") REFERENCES "OrderDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderDocumentPositionLink" ADD CONSTRAINT "OrderDocumentPositionLink_orderPositionId_fkey" FOREIGN KEY ("orderPositionId") REFERENCES "OrderPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrderDocumentReleaseReference" (
  "id" TEXT NOT NULL,
  "orderRevisionId" TEXT NOT NULL,
  "orderDocumentId" TEXT NOT NULL,
  "issuedWorkPackageKey" TEXT NOT NULL,
  "documentVersionId" TEXT,
  "documentContentSha256" TEXT NOT NULL,
  "releasedByRole" TEXT NOT NULL,
  "releaseNote" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderDocumentReleaseReference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrderDocumentReleaseReference_issuedWorkPackageKey_orderDocumentId_key" ON "OrderDocumentReleaseReference"("issuedWorkPackageKey", "orderDocumentId");
CREATE INDEX "OrderDocumentReleaseReference_orderRevisionId_issuedWorkPackageKey_idx" ON "OrderDocumentReleaseReference"("orderRevisionId", "issuedWorkPackageKey");
ALTER TABLE "OrderDocumentReleaseReference" ADD CONSTRAINT "OrderDocumentReleaseReference_orderRevisionId_fkey" FOREIGN KEY ("orderRevisionId") REFERENCES "OrderRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderDocumentReleaseReference" ADD CONSTRAINT "OrderDocumentReleaseReference_orderDocumentId_fkey" FOREIGN KEY ("orderDocumentId") REFERENCES "OrderDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
