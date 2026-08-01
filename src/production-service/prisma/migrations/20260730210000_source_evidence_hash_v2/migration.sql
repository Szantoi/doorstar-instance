ALTER TABLE "ManufacturedItemEvidence"
  ADD COLUMN "reviewedByRole" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

ALTER TABLE "OrderRevisionAudit"
  ADD COLUMN "contentHashSchemaVersion" INTEGER NOT NULL DEFAULT 1;

-- Old final evidence states were accepted without reviewer provenance. Reopen
-- all still-actionable rows and quarantine previously VERIFIED parents.
-- CANDIDATE/REVIEW can exist on a legacy REVIEW revision after the historical
-- draft-freeze race or a direct import, and must be remediable as well.
UPDATE "OrderRevision" AS revision
SET "status" = 'DRAFT',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE revision."status" = 'REVIEW'
  AND EXISTS (
    SELECT 1
    FROM "ManufacturedItem" AS item
    WHERE item."orderRevisionId" = revision."id"
      AND item."state" IN ('CANDIDATE', 'REVIEW', 'VERIFIED')
  );

UPDATE "ManufacturedItemEvidence" AS evidence
SET "reviewState" = 'REVIEW',
    "resolution" = NULL,
    "reviewedByRole" = NULL,
    "reviewedAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "ManufacturedItem" AS item
INNER JOIN "OrderRevision" AS revision
  ON revision."id" = item."orderRevisionId"
WHERE evidence."manufacturedItemId" = item."id"
  AND revision."status" IN ('DRAFT', 'REVIEW', 'APPROVED')
  AND item."state" IN ('CANDIDATE', 'REVIEW', 'VERIFIED')
  AND evidence."reviewState" IN ('RESOLVED', 'REJECTED');

UPDATE "ManufacturedItem" AS item
SET "state" = 'REVIEW',
    "resolution" = NULL,
    "reviewedByRole" = NULL,
    "reviewedAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "OrderRevision" AS revision
WHERE revision."id" = item."orderRevisionId"
  AND revision."status" IN ('DRAFT', 'REVIEW', 'APPROVED')
  AND item."state" = 'VERIFIED';

COMMENT ON COLUMN "OrderRevisionAudit"."contentHashSchemaVersion" IS
  '1 = legacy compatibility hash; 2 = auditable source-evidence hash';
