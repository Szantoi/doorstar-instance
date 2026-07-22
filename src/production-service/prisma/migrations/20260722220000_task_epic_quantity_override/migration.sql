-- A board-created task can be linked to an Epic without impersonating an
-- EpicStep. Quantity and unitHours are task-level capacity inputs/snapshots.
ALTER TABLE "Task" ADD COLUMN "epicId" TEXT;
ALTER TABLE "Task" ADD COLUMN "quantity" DOUBLE PRECISION;
ALTER TABLE "Task" ADD COLUMN "unitHours" DOUBLE PRECISION;

-- Keep existing issued cards structurally linked and preserve their current
-- capacity values as a snapshot before task-level editing becomes available.
UPDATE "Task" AS task
SET
  "epicId" = step."epicId",
  "quantity" = step."quantity",
  "unitHours" = step."unitHours"
FROM "EpicStep" AS step
WHERE task."epicStepId" = step."id";

CREATE INDEX "Task_epicId_idx" ON "Task"("epicId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_epicId_fkey"
  FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
