-- CreateEnum
CREATE TYPE "OrderRevisionStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRevision" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "OrderRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "deliveryAddress" TEXT,
    "expectedDelivery" TIMESTAMP(3),
    "plannedStart" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPosition" (
    "id" TEXT NOT NULL,
    "orderRevisionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "productType" TEXT,
    "openingDirection" TEXT,
    "openingWidthMm" DOUBLE PRECISION,
    "openingHeightMm" DOUBLE PRECISION,
    "openingDepthMm" DOUBLE PRECISION,
    "doorWidthMm" DOUBLE PRECISION,
    "doorHeightMm" DOUBLE PRECISION,
    "doorThicknessMm" DOUBLE PRECISION,
    "notes" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "OrderPosition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionOrder_projectId_key" ON "ProductionOrder"("projectId");
CREATE UNIQUE INDEX "OrderRevision_orderId_revision_key" ON "OrderRevision"("orderId", "revision");
CREATE INDEX "OrderRevision_status_idx" ON "OrderRevision"("status");
CREATE UNIQUE INDEX "OrderPosition_orderRevisionId_position_key" ON "OrderPosition"("orderRevisionId", "position");
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderRevision" ADD CONSTRAINT "OrderRevision_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderPosition" ADD CONSTRAINT "OrderPosition_orderRevisionId_fkey" FOREIGN KEY ("orderRevisionId") REFERENCES "OrderRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
