ALTER TABLE "OrderPositionEvidence"
  ADD COLUMN "reviewedByPrincipal" TEXT,
  ADD COLUMN "reviewedByRole" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- A historical final state predates attributable review. REVIEW revisions are
-- reopened so the normal DRAFT command can remediate them. APPROVED revisions
-- stay immutable and are quarantined by the downstream readiness predicate;
-- they require a new revision instead of rewriting approved history.
UPDATE "OrderRevision" AS revision
SET "status" = 'DRAFT',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE revision."status" = 'REVIEW'
  AND EXISTS (
    SELECT 1
    FROM "OrderPosition" AS position
    INNER JOIN "OrderPositionEvidence" AS evidence
      ON evidence."orderPositionId" = position."id"
    WHERE position."orderRevisionId" = revision."id"
      AND evidence."reviewState" IN ('RESOLVED', 'REJECTED')
  );

-- Preserve the captured source and legacy explanation, but never invent a
-- reviewer principal, role or timestamp. The REVIEW state is deliberately
-- fail-closed until a new one-way review command records a complete audit.
UPDATE "OrderPositionEvidence" AS evidence
SET "reviewState" = 'REVIEW',
    "reviewedByPrincipal" = NULL,
    "reviewedByRole" = NULL,
    "reviewedAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "OrderPosition" AS position
INNER JOIN "OrderRevision" AS revision
  ON revision."id" = position."orderRevisionId"
WHERE evidence."orderPositionId" = position."id"
  AND revision."status" IN ('DRAFT', 'REVIEW', 'APPROVED')
  AND evidence."reviewState" IN ('RESOLVED', 'REJECTED');

COMMENT ON COLUMN "OrderRevisionAudit"."contentHashSchemaVersion" IS
  '1 = legacy compatibility hash; 2 = source-evidence audit hash; 3 = position-evidence and document-position lineage hash';
