ALTER TABLE "OrderPosition"
  ADD COLUMN "doorTypeKey" TEXT,
  ADD COLUMN "finishKey" TEXT,
  ADD COLUMN "glassKey" TEXT,
  ADD COLUMN "hardwareKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "wallSolutionKey" TEXT,
  ADD COLUMN "materialKey" TEXT,
  ADD COLUMN "machiningKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "technicalNotes" TEXT NOT NULL DEFAULT '';
