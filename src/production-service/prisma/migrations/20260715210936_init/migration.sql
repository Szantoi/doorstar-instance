-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('SZABASZAT_ELOGYARTAS', 'MEGMUNKALAS', 'FELULETKEZELES', 'OSSZESZERELES', 'CSOMAGOLAS', 'KISZALLITASRA_MEGJELOLES');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'SHIPPING_READY');

-- CreateEnum
CREATE TYPE "SheetKind" AS ENUM ('QUANTITIES', 'CUTTING', 'HARDWARE');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "num" TEXT,
    "kezdes" TEXT,
    "beepites" TEXT,
    "szinTok" TEXT,
    "szinLap" TEXT,
    "status" "ProductionStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Epic" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantityLabel" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "disabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Epic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpicStep" (
    "id" TEXT NOT NULL,
    "epicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "station" TEXT,
    "quantity" DOUBLE PRECISION,
    "unitHours" DOUBLE PRECISION,
    "planDate" TIMESTAMP(3),
    "planLocked" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EpicStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "epicStepId" TEXT,
    "epicName" TEXT,
    "title" TEXT NOT NULL,
    "station" TEXT,
    "week" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "problem" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "dependsOnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskImage" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAuditEntry" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationWorkflow" (
    "station" TEXT NOT NULL,
    "steps" JSONB NOT NULL,

    CONSTRAINT "StationWorkflow_pkey" PRIMARY KEY ("station")
);

-- CreateTable
CREATE TABLE "OrderChecklistItem" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekNote" (
    "week" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "WeekNote_pkey" PRIMARY KEY ("week")
);

-- CreateTable
CREATE TABLE "SheetTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "epics" JSONB NOT NULL,

    CONSTRAINT "SheetTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpikTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "epic" JSONB NOT NULL,

    CONSTRAINT "EpikTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapacitySetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "hoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,

    CONSTRAINT "CapacitySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSheet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "SheetKind" NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_key_key" ON "Project"("key");

-- CreateIndex
CREATE INDEX "Epic_projectId_idx" ON "Epic"("projectId");

-- CreateIndex
CREATE INDEX "EpicStep_epicId_idx" ON "EpicStep"("epicId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_dependsOnId_key" ON "Task"("dependsOnId");

-- CreateIndex
CREATE INDEX "Task_week_day_idx" ON "Task"("week", "day");

-- CreateIndex
CREATE INDEX "Task_station_idx" ON "Task"("station");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SheetTemplate_name_key" ON "SheetTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EpikTemplate_name_key" ON "EpikTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSheet_projectId_kind_key" ON "ProjectSheet"("projectId", "kind");

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpicStep" ADD CONSTRAINT "EpicStep_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_epicStepId_fkey" FOREIGN KEY ("epicStepId") REFERENCES "EpicStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskImage" ADD CONSTRAINT "TaskImage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAuditEntry" ADD CONSTRAINT "TaskAuditEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSheet" ADD CONSTRAINT "ProjectSheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
