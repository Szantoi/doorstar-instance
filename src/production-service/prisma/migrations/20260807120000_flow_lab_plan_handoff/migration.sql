CREATE TYPE "FlowLabPlanSnapshotState" AS ENUM ('REVIEW', 'VERIFIED', 'REJECTED');
CREATE TYPE "FlowLabDeviationKind" AS ENUM (
  'QUANTITY_CHANGED', 'UNIT_HOURS_CHANGED', 'STEP_DISABLED', 'STEP_ENABLED',
  'STEP_REORDERED', 'STATION_CHANGED', 'PLAN_LOCKED', 'PLAN_UNLOCKED',
  'STEP_ADDED_BY_HAND', 'TASK_PROBLEM_FLAGGED'
);
CREATE TYPE "FlowLabDeviationOutboxState" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

CREATE TABLE "FlowLabPlanSnapshot" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "orderRevisionId" TEXT NOT NULL,
  "componentSnapshotId" TEXT NOT NULL,
  "state" "FlowLabPlanSnapshotState" NOT NULL DEFAULT 'REVIEW',
  "schemaVersion" TEXT NOT NULL,
  "sourceSetKey" TEXT NOT NULL,
  "materializationKey" TEXT NOT NULL,
  "contentHash" CHAR(64) NOT NULL,
  "fileSha256" CHAR(64) NOT NULL,
  "fileName" TEXT NOT NULL,
  "catalogRevision" TEXT NOT NULL,
  "catalogHash" CHAR(64) NOT NULL,
  "planHash" CHAR(64) NOT NULL,
  "engineIdentity" TEXT NOT NULL,
  "resourceMappingVersion" TEXT NOT NULL,
  "resourceMappingFingerprint" CHAR(64) NOT NULL,
  "boundOrderContentHash" CHAR(64) NOT NULL,
  "boundComponentOutputHash" CHAR(64) NOT NULL,
  "operations" JSONB NOT NULL,
  "dependencies" JSONB NOT NULL,
  "relativeSchedule" JSONB NOT NULL,
  "unresolved" JSONB NOT NULL,
  "absentMembers" JSONB NOT NULL,
  "findings" JSONB NOT NULL,
  "productionAuthority" BOOLEAN NOT NULL DEFAULT false,
  "reviewNote" TEXT NOT NULL,
  "createdByRole" TEXT NOT NULL,
  "createdByPrincipal" TEXT NOT NULL,
  "reviewResolution" TEXT,
  "reviewedByRole" TEXT,
  "reviewedByPrincipal" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FlowLabPlanSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FlowLabPlanSnapshot_productionAuthority_false" CHECK ("productionAuthority" = false)
);

CREATE UNIQUE INDEX "FlowLabPlanSnapshot_projectId_materializationKey_key"
  ON "FlowLabPlanSnapshot"("projectId", "materializationKey");
CREATE INDEX "FlowLabPlanSnapshot_orderRevisionId_createdAt_idx"
  ON "FlowLabPlanSnapshot"("orderRevisionId", "createdAt");
CREATE INDEX "FlowLabPlanSnapshot_componentSnapshotId_createdAt_idx"
  ON "FlowLabPlanSnapshot"("componentSnapshotId", "createdAt");
CREATE INDEX "FlowLabPlanSnapshot_sourceSetKey_planHash_idx"
  ON "FlowLabPlanSnapshot"("sourceSetKey", "planHash");

ALTER TABLE "FlowLabPlanSnapshot"
  ADD CONSTRAINT "FlowLabPlanSnapshot_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowLabPlanSnapshot"
  ADD CONSTRAINT "FlowLabPlanSnapshot_orderRevisionId_fkey"
  FOREIGN KEY ("orderRevisionId") REFERENCES "OrderRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FlowLabPlanSnapshot"
  ADD CONSTRAINT "FlowLabPlanSnapshot_componentSnapshotId_fkey"
  FOREIGN KEY ("componentSnapshotId") REFERENCES "ComponentSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FlowLabPlanMaterialization" (
  "id" TEXT NOT NULL,
  "flowLabPlanSnapshotId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "resourceMappingVersion" TEXT NOT NULL,
  "resourceMappingFingerprint" CHAR(64) NOT NULL,
  "createdByRole" TEXT NOT NULL,
  "createdByPrincipal" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FlowLabPlanMaterialization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlowLabPlanMaterialization_flowLabPlanSnapshotId_key"
  ON "FlowLabPlanMaterialization"("flowLabPlanSnapshotId");
CREATE INDEX "FlowLabPlanMaterialization_projectId_createdAt_idx"
  ON "FlowLabPlanMaterialization"("projectId", "createdAt");
ALTER TABLE "FlowLabPlanMaterialization"
  ADD CONSTRAINT "FlowLabPlanMaterialization_flowLabPlanSnapshotId_fkey"
  FOREIGN KEY ("flowLabPlanSnapshotId") REFERENCES "FlowLabPlanSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FlowLabPlanMaterialization"
  ADD CONSTRAINT "FlowLabPlanMaterialization_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FlowLabEpicProvenance" (
  "id" TEXT NOT NULL,
  "materializationId" TEXT NOT NULL,
  "epicId" TEXT NOT NULL,
  "familyKey" TEXT NOT NULL,
  CONSTRAINT "FlowLabEpicProvenance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FlowLabEpicProvenance_epicId_key" ON "FlowLabEpicProvenance"("epicId");
CREATE UNIQUE INDEX "FlowLabEpicProvenance_materializationId_familyKey_key"
  ON "FlowLabEpicProvenance"("materializationId", "familyKey");
ALTER TABLE "FlowLabEpicProvenance"
  ADD CONSTRAINT "FlowLabEpicProvenance_materializationId_fkey"
  FOREIGN KEY ("materializationId") REFERENCES "FlowLabPlanMaterialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowLabEpicProvenance"
  ADD CONSTRAINT "FlowLabEpicProvenance_epicId_fkey"
  FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FlowLabEpicStepProvenance" (
  "id" TEXT NOT NULL,
  "materializationId" TEXT NOT NULL,
  "epicStepId" TEXT NOT NULL,
  "correlationKey" TEXT NOT NULL,
  "baseline" JSONB NOT NULL,
  CONSTRAINT "FlowLabEpicStepProvenance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FlowLabEpicStepProvenance_epicStepId_key" ON "FlowLabEpicStepProvenance"("epicStepId");
CREATE UNIQUE INDEX "FlowLabEpicStepProvenance_materializationId_correlationKey_key"
  ON "FlowLabEpicStepProvenance"("materializationId", "correlationKey");
CREATE INDEX "FlowLabEpicStepProvenance_correlationKey_idx" ON "FlowLabEpicStepProvenance"("correlationKey");
ALTER TABLE "FlowLabEpicStepProvenance"
  ADD CONSTRAINT "FlowLabEpicStepProvenance_materializationId_fkey"
  FOREIGN KEY ("materializationId") REFERENCES "FlowLabPlanMaterialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowLabEpicStepProvenance"
  ADD CONSTRAINT "FlowLabEpicStepProvenance_epicStepId_fkey"
  FOREIGN KEY ("epicStepId") REFERENCES "EpicStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FlowLabDeviationRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" TEXT NOT NULL,
  "flowLabPlanSnapshotId" TEXT NOT NULL,
  "materializationId" TEXT NOT NULL,
  "correlationKey" TEXT,
  "kind" "FlowLabDeviationKind" NOT NULL,
  "actorRole" TEXT NOT NULL,
  "actorPrincipal" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FlowLabDeviationRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FlowLabDeviationRecord_hand_added_correlation"
    CHECK (("kind" = 'STEP_ADDED_BY_HAND') = ("correlationKey" IS NULL))
);
CREATE INDEX "FlowLabDeviationRecord_projectId_occurredAt_id_idx"
  ON "FlowLabDeviationRecord"("projectId", "occurredAt", "id");
CREATE INDEX "FlowLabDeviationRecord_materializationId_occurredAt_id_idx"
  ON "FlowLabDeviationRecord"("materializationId", "occurredAt", "id");
ALTER TABLE "FlowLabDeviationRecord"
  ADD CONSTRAINT "FlowLabDeviationRecord_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowLabDeviationRecord"
  ADD CONSTRAINT "FlowLabDeviationRecord_flowLabPlanSnapshotId_fkey"
  FOREIGN KEY ("flowLabPlanSnapshotId") REFERENCES "FlowLabPlanSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FlowLabDeviationRecord"
  ADD CONSTRAINT "FlowLabDeviationRecord_materializationId_fkey"
  FOREIGN KEY ("materializationId") REFERENCES "FlowLabPlanMaterialization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FlowLabDeviationOutbox" (
  "id" TEXT NOT NULL,
  "materializationId" TEXT NOT NULL,
  "state" "FlowLabDeviationOutboxState" NOT NULL DEFAULT 'PENDING',
  "generation" INTEGER NOT NULL DEFAULT 1,
  "lastPublishedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FlowLabDeviationOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FlowLabDeviationOutbox_materializationId_key"
  ON "FlowLabDeviationOutbox"("materializationId");
ALTER TABLE "FlowLabDeviationOutbox"
  ADD CONSTRAINT "FlowLabDeviationOutbox_materializationId_fkey"
  FOREIGN KEY ("materializationId") REFERENCES "FlowLabPlanMaterialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
