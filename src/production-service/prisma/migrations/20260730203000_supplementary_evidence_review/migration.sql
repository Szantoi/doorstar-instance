ALTER TABLE "OrderSupplementaryItemEvidence"
  ADD COLUMN "resolution" TEXT,
  ADD COLUMN "createdByRole" TEXT,
  ADD COLUMN "reviewedByRole" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- Historical rows predate actor capture. Keep that uncertainty explicit
-- instead of inventing a business user or silently losing provenance.
UPDATE "OrderSupplementaryItemEvidence"
SET "createdByRole" = 'legacy_migration'
WHERE "createdByRole" IS NULL;

ALTER TABLE "OrderSupplementaryItemEvidence"
  ALTER COLUMN "createdByRole" SET NOT NULL;

-- A legacy final state has no trustworthy reviewer, time or reason. Reopen
-- evidence on every still-actionable source item and quarantine parent
-- VERIFIED rows so neither approval nor component materialization can trust
-- an unaudited historical decision. Legacy order-review readiness did not
-- inspect supplementary items at all, so an already-REVIEW item (including a
-- MANUAL one) must also reopen its revision or there is no legal command that
-- can finish it.
UPDATE "OrderRevision" AS revision
SET "status" = 'DRAFT',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE revision."status" = 'REVIEW'
  AND EXISTS (
    SELECT 1
    FROM "OrderSupplementaryItem" AS item
    WHERE item."orderRevisionId" = revision."id"
      AND (
        item."state" = 'REVIEW'
        OR (
          item."entryMode" = 'SOURCE_REVIEW'
          AND item."state" = 'VERIFIED'
        )
      )
  );

UPDATE "OrderSupplementaryItemEvidence" AS evidence
SET "reviewState" = 'REVIEW',
    "resolution" = NULL,
    "reviewedByRole" = NULL,
    "reviewedAt" = NULL
FROM "OrderSupplementaryItem" AS item
INNER JOIN "OrderRevision" AS revision
  ON revision."id" = item."orderRevisionId"
WHERE evidence."supplementaryItemId" = item."id"
  AND revision."status" IN ('DRAFT', 'REVIEW', 'APPROVED')
  AND item."entryMode" = 'SOURCE_REVIEW'
  AND item."state" IN ('REVIEW', 'VERIFIED')
  AND evidence."reviewState" IN ('RESOLVED', 'REJECTED');

UPDATE "OrderSupplementaryItem" AS item
SET "state" = 'REVIEW',
    "reviewedByRole" = NULL,
    "reviewedAt" = NULL,
    "reviewResolution" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "OrderRevision" AS revision
WHERE revision."id" = item."orderRevisionId"
  AND revision."status" IN ('DRAFT', 'REVIEW', 'APPROVED')
  AND item."entryMode" = 'SOURCE_REVIEW'
  AND item."state" = 'VERIFIED';
