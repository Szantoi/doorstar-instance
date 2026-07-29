CREATE TYPE "ImportCandidateStatus" AS ENUM ('READY', 'REVIEW', 'BLOCKED', 'APPLIED', 'SKIPPED');
CREATE TYPE "DeadlineObservationKind" AS ENUM ('CONTRACTUAL', 'PLANNED_INSTALL', 'PRODUCTION_END', 'NOTE');
CREATE TYPE "EvidenceReviewState" AS ENUM ('UNVERIFIED', 'REVIEW', 'RESOLVED', 'REJECTED');

CREATE TABLE "ImportCandidate" (
  "id" TEXT NOT NULL,
  "importRunId" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "workNumber" TEXT,
  "sourceRoot" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "sheet" TEXT,
  "page" INTEGER,
  "row" INTEGER,
  "normalizedPayload" JSONB NOT NULL,
  "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "ImportCandidateStatus" NOT NULL DEFAULT 'REVIEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportCandidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ImportCandidate_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OrderDeadlineObservation" (
  "id" TEXT NOT NULL,
  "importRunId" TEXT NOT NULL,
  "orderRevisionId" TEXT,
  "workNumber" TEXT NOT NULL,
  "sourceRoot" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "sheet" TEXT,
  "page" INTEGER,
  "row" INTEGER,
  "kind" "DeadlineObservationKind" NOT NULL,
  "rawValue" TEXT NOT NULL,
  "normalizedDate" TIMESTAMP(3),
  "confidence" DOUBLE PRECISION,
  "reviewState" "EvidenceReviewState" NOT NULL DEFAULT 'UNVERIFIED',
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderDeadlineObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderDeadlineObservation_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderDeadlineObservation_orderRevisionId_fkey" FOREIGN KEY ("orderRevisionId") REFERENCES "OrderRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ImportCandidate_importRunId_status_idx" ON "ImportCandidate"("importRunId", "status");
CREATE INDEX "ImportCandidate_workNumber_idx" ON "ImportCandidate"("workNumber");
CREATE INDEX "OrderDeadlineObservation_importRunId_reviewState_idx" ON "OrderDeadlineObservation"("importRunId", "reviewState");
CREATE INDEX "OrderDeadlineObservation_orderRevisionId_kind_idx" ON "OrderDeadlineObservation"("orderRevisionId", "kind");
CREATE INDEX "OrderDeadlineObservation_workNumber_idx" ON "OrderDeadlineObservation"("workNumber");
