CREATE TYPE "OperationPlanSnapshotState" AS ENUM ('REVIEW', 'VERIFIED', 'REJECTED');

CREATE TABLE "OperationPlanSnapshot" (
  "id" TEXT NOT NULL,
  "orderRevisionId" TEXT NOT NULL,
  "componentSnapshotId" TEXT NOT NULL,
  "state" "OperationPlanSnapshotState" NOT NULL DEFAULT 'REVIEW',
  "schemaVersion" TEXT NOT NULL,
  "generatorProfileVersion" TEXT NOT NULL,
  "generatorProfileFingerprint" TEXT NOT NULL,
  "standardCatalogVersion" TEXT NOT NULL,
  "standardCatalogFingerprint" TEXT NOT NULL,
  "resourceMappingVersion" TEXT NOT NULL,
  "resourceMappingFingerprint" TEXT NOT NULL,
  "orderContentHash" TEXT NOT NULL,
  "componentOutputHash" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "outputHash" TEXT NOT NULL,
  "materializationKey" TEXT NOT NULL,
  "reviewNote" TEXT NOT NULL,
  "createdByRole" TEXT NOT NULL,
  "createdByPrincipal" TEXT NOT NULL,
  "reviewResolution" TEXT,
  "reviewedByRole" TEXT,
  "reviewedByPrincipal" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "operations" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationPlanSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationPlanSnapshot_materializationKey_key"
  ON "OperationPlanSnapshot"("materializationKey");
CREATE UNIQUE INDEX "OperationPlanSnapshot_componentSnapshotId_generatorProfileVersion_key"
  ON "OperationPlanSnapshot"("componentSnapshotId", "generatorProfileVersion");
CREATE INDEX "OperationPlanSnapshot_orderRevisionId_createdAt_idx"
  ON "OperationPlanSnapshot"("orderRevisionId", "createdAt");
CREATE INDEX "OperationPlanSnapshot_componentSnapshotId_createdAt_idx"
  ON "OperationPlanSnapshot"("componentSnapshotId", "createdAt");

ALTER TABLE "OperationPlanSnapshot"
  ADD CONSTRAINT "OperationPlanSnapshot_orderRevisionId_fkey"
  FOREIGN KEY ("orderRevisionId") REFERENCES "OrderRevision"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationPlanSnapshot"
  ADD CONSTRAINT "OperationPlanSnapshot_componentSnapshotId_fkey"
  FOREIGN KEY ("componentSnapshotId") REFERENCES "ComponentSnapshot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
