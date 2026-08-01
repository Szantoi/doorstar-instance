ALTER TABLE "ImportRun"
  ADD COLUMN "registrationKey" TEXT,
  ADD COLUMN "registrationVersion" TEXT,
  ADD COLUMN "artifactFingerprint" TEXT,
  ADD COLUMN "reviewNote" TEXT;

CREATE UNIQUE INDEX "ImportRun_registrationKey_key" ON "ImportRun"("registrationKey");

ALTER TABLE "ImportCandidate" ADD COLUMN "sourceRecordKey" TEXT;

CREATE UNIQUE INDEX "ImportCandidate_importRunId_sourceRecordKey_key"
  ON "ImportCandidate"("importRunId", "sourceRecordKey");
