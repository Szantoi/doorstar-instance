CREATE TYPE "ComponentRequirementKind" AS ENUM ('CUT_PART', 'PURCHASED_PART');
CREATE TYPE "ComponentRequirementSourceKind" AS ENUM ('ORDER_POSITION', 'MANUFACTURED_ITEM', 'SUPPLEMENTARY_ITEM');
CREATE TYPE "ComponentSnapshotState" AS ENUM ('REVIEW', 'VERIFIED', 'REJECTED');

CREATE TABLE "ComponentSnapshot" (
  "id" TEXT NOT NULL,
  "orderRevisionId" TEXT NOT NULL,
  "approvalAuditId" TEXT NOT NULL,
  "state" "ComponentSnapshotState" NOT NULL DEFAULT 'REVIEW',
  "snapshotSchemaVersion" TEXT NOT NULL,
  "calculatorProfileVersion" TEXT NOT NULL,
  "calculatorProfileFingerprint" TEXT NOT NULL,
  "technicalCatalogVersion" TEXT NOT NULL,
  "technicalCatalogFingerprint" TEXT NOT NULL,
  "sourceWorkOrderKey" TEXT NOT NULL,
  "sourceOrderRevision" TEXT NOT NULL,
  "sourceCalculatorRevision" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "outputHash" TEXT NOT NULL,
  "materializationKey" TEXT NOT NULL,
  "orderContentHash" TEXT NOT NULL,
  "reviewNote" TEXT NOT NULL,
  "createdByRole" TEXT NOT NULL,
  "reviewResolution" TEXT,
  "reviewedByRole" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComponentSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComponentSnapshot_materializationKey_key"
  ON "ComponentSnapshot"("materializationKey");
CREATE UNIQUE INDEX "ComponentSnapshot_orderRevisionId_calculatorProfileVersion_key"
  ON "ComponentSnapshot"("orderRevisionId", "calculatorProfileVersion");
CREATE INDEX "ComponentSnapshot_orderRevisionId_createdAt_idx"
  ON "ComponentSnapshot"("orderRevisionId", "createdAt");
ALTER TABLE "ComponentSnapshot"
  ADD CONSTRAINT "ComponentSnapshot_orderRevisionId_fkey"
  FOREIGN KEY ("orderRevisionId") REFERENCES "OrderRevision"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentSnapshot"
  ADD CONSTRAINT "ComponentSnapshot_approvalAuditId_fkey"
  FOREIGN KEY ("approvalAuditId") REFERENCES "OrderRevisionAudit"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ComponentRequirement" (
  "id" TEXT NOT NULL,
  "componentSnapshotId" TEXT NOT NULL,
  "sourceKind" "ComponentRequirementSourceKind" NOT NULL,
  "sourceRecordId" TEXT NOT NULL,
  "requirementKind" "ComponentRequirementKind" NOT NULL,
  "sourceComponentKey" TEXT NOT NULL,
  "componentKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "quantityUnit" TEXT NOT NULL,
  "materialKey" TEXT,
  "finishKey" TEXT,
  "finishedWidthMm" DOUBLE PRECISION,
  "finishedHeightMm" DOUBLE PRECISION,
  "finishedThicknessMm" DOUBLE PRECISION,
  "cuttingWidthMm" DOUBLE PRECISION,
  "cuttingHeightMm" DOUBLE PRECISION,
  "cuttingThicknessMm" DOUBLE PRECISION,
  "grainDirection" TEXT,
  "lineHash" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComponentRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComponentRequirement_componentSnapshotId_sourceComponentKey_key"
  ON "ComponentRequirement"("componentSnapshotId", "sourceComponentKey");
CREATE INDEX "ComponentRequirement_sourceKind_sourceRecordId_idx"
  ON "ComponentRequirement"("sourceKind", "sourceRecordId");

ALTER TABLE "ComponentRequirement"
  ADD CONSTRAINT "ComponentRequirement_componentSnapshotId_fkey"
  FOREIGN KEY ("componentSnapshotId") REFERENCES "ComponentSnapshot"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
