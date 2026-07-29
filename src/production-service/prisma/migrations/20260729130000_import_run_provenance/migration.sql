CREATE TYPE "ImportRunStatus" AS ENUM ('PREVIEWED', 'APPLIED', 'REJECTED');

CREATE TABLE "ImportRun" (
  "id" TEXT NOT NULL,
  "profileVersion" TEXT NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "previewArtifact" TEXT NOT NULL,
  "targetSchema" TEXT NOT NULL,
  "status" "ImportRunStatus" NOT NULL DEFAULT 'PREVIEWED',
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "createdByRole" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImportRun_status_createdAt_idx" ON "ImportRun"("status", "createdAt");

ALTER TABLE "OrderRevision" ADD COLUMN "importRunId" TEXT;
ALTER TABLE "OrderRevision" ADD CONSTRAINT "OrderRevision_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "OrderRevision_importRunId_idx" ON "OrderRevision"("importRunId");
