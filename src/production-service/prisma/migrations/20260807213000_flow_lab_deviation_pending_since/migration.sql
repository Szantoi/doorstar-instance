-- Health must measure one enqueue episode, not the newest board mutation.
-- Existing PENDING rows have no historical first-pending timestamp, so their
-- pre-migration updatedAt is the deterministic, auditable lower-fidelity
-- backfill anchor. PUBLISHED/FAILED remain null until a later explicit state
-- transition creates a new pending episode.
ALTER TABLE "FlowLabDeviationOutbox"
  ADD COLUMN "pendingSince" TIMESTAMP(3);

UPDATE "FlowLabDeviationOutbox"
SET "pendingSince" = "updatedAt"
WHERE "state" = 'PENDING';

CREATE INDEX "FlowLabDeviationOutbox_state_pendingSince_idx"
  ON "FlowLabDeviationOutbox"("state", "pendingSince");
