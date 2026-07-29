CREATE TYPE "ManufacturedItemKind" AS ENUM ('WALL_PANEL', 'FURNITURE_FRONT');
CREATE TYPE "ManufacturedItemWorkKind" AS ENUM ('STANDARD', 'REWORK', 'REMANUFACTURE', 'REPLACEMENT');
CREATE TYPE "ManufacturedItemState" AS ENUM ('CANDIDATE', 'REVIEW', 'VERIFIED', 'REJECTED');
CREATE TYPE "ManufacturedItemEvidenceField" AS ENUM (
  'CODE',
  'NAME',
  'ITEM_TYPE',
  'COMPONENT_NAME',
  'QUANTITY',
  'WIDTH_MM',
  'HEIGHT_MM',
  'THICKNESS_MM',
  'MATERIAL',
  'SURFACE',
  'COLOUR',
  'PATTERN',
  'WORK_KIND',
  'NOTES'
);

CREATE TABLE "ManufacturedItem" (
  "id" TEXT NOT NULL,
  "orderRevisionId" TEXT NOT NULL,
  "relatedOrderPositionId" TEXT,
  "importCandidateId" TEXT,
  "kind" "ManufacturedItemKind" NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "itemType" TEXT,
  "componentName" TEXT,
  "quantity" INTEGER NOT NULL,
  "widthMm" DOUBLE PRECISION,
  "heightMm" DOUBLE PRECISION,
  "thicknessMm" DOUBLE PRECISION,
  "material" TEXT,
  "surface" TEXT,
  "colour" TEXT,
  "pattern" TEXT,
  "workKind" "ManufacturedItemWorkKind" NOT NULL DEFAULT 'STANDARD',
  "state" "ManufacturedItemState" NOT NULL DEFAULT 'CANDIDATE',
  "notes" TEXT NOT NULL DEFAULT '',
  "resolution" TEXT,
  "reviewedByRole" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManufacturedItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturedItem_orderRevisionId_fkey" FOREIGN KEY ("orderRevisionId") REFERENCES "OrderRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturedItem_relatedOrderPositionId_fkey" FOREIGN KEY ("relatedOrderPositionId") REFERENCES "OrderPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ManufacturedItem_importCandidateId_fkey" FOREIGN KEY ("importCandidateId") REFERENCES "ImportCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ManufacturedItemEvidence" (
  "id" TEXT NOT NULL,
  "manufacturedItemId" TEXT NOT NULL,
  "orderDocumentId" TEXT,
  "sourceRoot" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "sheet" TEXT,
  "page" INTEGER,
  "row" INTEGER,
  "field" "ManufacturedItemEvidenceField" NOT NULL,
  "rawValue" TEXT NOT NULL,
  "normalizedValue" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION,
  "reviewState" "EvidenceReviewState" NOT NULL DEFAULT 'UNVERIFIED',
  "resolution" TEXT,
  "createdByRole" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManufacturedItemEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturedItemEvidence_manufacturedItemId_fkey" FOREIGN KEY ("manufacturedItemId") REFERENCES "ManufacturedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturedItemEvidence_orderDocumentId_fkey" FOREIGN KEY ("orderDocumentId") REFERENCES "OrderDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ManufacturedItem_importCandidateId_key" ON "ManufacturedItem"("importCandidateId");
CREATE UNIQUE INDEX "ManufacturedItem_orderRevisionId_kind_code_key" ON "ManufacturedItem"("orderRevisionId", "kind", "code");
CREATE INDEX "ManufacturedItem_orderRevisionId_kind_state_idx" ON "ManufacturedItem"("orderRevisionId", "kind", "state");
CREATE INDEX "ManufacturedItem_relatedOrderPositionId_idx" ON "ManufacturedItem"("relatedOrderPositionId");
CREATE INDEX "ManufacturedItemEvidence_manufacturedItemId_field_reviewState_idx" ON "ManufacturedItemEvidence"("manufacturedItemId", "field", "reviewState");
CREATE INDEX "ManufacturedItemEvidence_orderDocumentId_idx" ON "ManufacturedItemEvidence"("orderDocumentId");
