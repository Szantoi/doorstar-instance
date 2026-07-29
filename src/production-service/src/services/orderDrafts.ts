import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { createSalesIntakeSchema } from "../domain/schemas.js";

type SalesIntake = z.infer<typeof createSalesIntakeSchema>;

/** Creates a new Project and its mutable first revision atomically. Re-orders
 * therefore get their own Project even when their customer is the same. */
export async function createSalesDraft(
  tx: Prisma.TransactionClient,
  body: SalesIntake,
  options: {
    importRunId?: string;
    documents?: Array<{ source: "LEGACY_FOLDER" | "SHAREPOINT"; kind: "SALES_ORDER" | "SURVEY" | "DRAWING" | "OTHER"; displayName: string; relativePath: string; driveId?: string; itemId?: string; versionId?: string; contentSha256?: string }>;
  } = {},
) {
  const project = await tx.project.create({ data: { key: body.projectKey, name: body.projectName, num: body.projectNum } });
  const order = await tx.productionOrder.create({ data: { projectId: project.id } });
  return tx.orderRevision.create({
    data: {
      orderId: order.id,
      revision: 1,
      customerName: body.customerName,
      customerAddress: body.customerAddress ?? null,
      contactName: body.contactName ?? null,
      contactPhone: body.contactPhone ?? null,
      contactEmail: body.contactEmail ?? null,
      deliveryAddress: body.deliveryAddress ?? null,
      expectedDelivery: body.expectedDelivery ? new Date(body.expectedDelivery) : null,
      plannedStart: body.plannedStart ? new Date(body.plannedStart) : null,
      priority: body.priority ?? 0,
      notes: body.notes ?? "",
      importRunId: options.importRunId,
      positions: { create: body.positions.map((position, index) => ({ ...position, position: index, notes: position.notes ?? "" })) },
      documents: options.documents ? { create: options.documents } : undefined,
    },
    include: { positions: { orderBy: { position: "asc" } }, documents: { orderBy: { createdAt: "asc" } } },
  });
}
