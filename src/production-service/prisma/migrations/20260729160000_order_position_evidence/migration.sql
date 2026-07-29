CREATE TYPE "OrderPositionEvidenceField" AS ENUM (
  'CODE',
  'NAME',
  'QUANTITY',
  'PRODUCT_TYPE',
  'OPENING_DIRECTION',
  'OPENING_WIDTH_MM',
  'OPENING_HEIGHT_MM',
  'OPENING_DEPTH_MM',
  'DOOR_WIDTH_MM',
  'DOOR_HEIGHT_MM',
  'DOOR_THICKNESS_MM',
  'SURFACE',
  'WALL_TREATMENT',
  'GLAZING',
  'GLAZING_SPECIFICATION',
  'NOTES'
);

CREATE TABLE "OrderPositionEvidence" (
  "id" TEXT NOT NULL,
  "orderPositionId" TEXT NOT NULL,
  "orderDocumentId" TEXT,
  "sourceRoot" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "sheet" TEXT,
  "page" INTEGER,
  "row" INTEGER,
  "field" "OrderPositionEvidenceField" NOT NULL,
  "rawValue" TEXT NOT NULL,
  "normalizedValue" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION,
  "reviewState" "EvidenceReviewState" NOT NULL DEFAULT 'UNVERIFIED',
  "resolution" TEXT,
  "createdByRole" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderPositionEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderPositionEvidence_orderPositionId_fkey" FOREIGN KEY ("orderPositionId") REFERENCES "OrderPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderPositionEvidence_orderDocumentId_fkey" FOREIGN KEY ("orderDocumentId") REFERENCES "OrderDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "OrderPositionEvidence_orderPositionId_field_reviewState_idx"
  ON "OrderPositionEvidence"("orderPositionId", "field", "reviewState");
CREATE INDEX "OrderPositionEvidence_orderDocumentId_idx"
  ON "OrderPositionEvidence"("orderDocumentId");
