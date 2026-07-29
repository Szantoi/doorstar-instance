-- Sales and field-survey readiness is independent from approval status.
CREATE TYPE "OrderIntakeStage" AS ENUM ('SALES_DRAFT', 'SALES_DOCUMENTS_RECEIVED', 'SURVEY_PENDING', 'SURVEY_COMPLETED', 'SURVEY_EXCEPTION_REVIEW', 'TECHNICAL_PREPARATION');

ALTER TABLE "OrderRevision"
  ADD COLUMN "intakeStage" "OrderIntakeStage" NOT NULL DEFAULT 'SALES_DRAFT',
  ADD COLUMN "salesDocumentsReceivedAt" TIMESTAMP(3),
  ADD COLUMN "surveyCompletedAt" TIMESTAMP(3),
  ADD COLUMN "surveyExceptionReason" TEXT;

CREATE INDEX "OrderRevision_intakeStage_idx" ON "OrderRevision"("intakeStage");

CREATE TYPE "WallTreatment" AS ENUM ('NONE', 'WALL_PANEL', 'BLENDE');
CREATE TYPE "Glazing" AS ENUM ('NONE', 'GLAZED');

ALTER TABLE "OrderPosition"
  ADD COLUMN "surface" TEXT,
  ADD COLUMN "wallTreatment" "WallTreatment",
  ADD COLUMN "glazing" "Glazing",
  ADD COLUMN "glazingSpecification" TEXT;

CREATE TYPE "OrderDocumentSource" AS ENUM ('LEGACY_FOLDER', 'SHAREPOINT');
CREATE TYPE "OrderDocumentKind" AS ENUM ('SALES_ORDER', 'SURVEY', 'DRAWING', 'OTHER');

CREATE TABLE "OrderDocument" (
  "id" TEXT NOT NULL,
  "orderRevisionId" TEXT NOT NULL,
  "source" "OrderDocumentSource" NOT NULL,
  "kind" "OrderDocumentKind" NOT NULL,
  "displayName" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "driveId" TEXT,
  "itemId" TEXT,
  "versionId" TEXT,
  "contentSha256" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderDocument_orderRevisionId_fkey" FOREIGN KEY ("orderRevisionId") REFERENCES "OrderRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrderDocument_orderRevisionId_idx" ON "OrderDocument"("orderRevisionId");
CREATE INDEX "OrderDocument_source_kind_idx" ON "OrderDocument"("source", "kind");
