import type { OrderRevisionInput, ProductionOrderPosition, ProductionOrderRevision } from "@/services/production/types";

/** Draft updates are full replacement payloads. Preserve every header field so
 * editing survey or technical details cannot silently erase Sales data. */
export function toOrderRevisionInput(
  revision: ProductionOrderRevision,
  positions: Array<Omit<ProductionOrderPosition, "evidence">>,
): OrderRevisionInput {
  // `finishKey` currently drives a server-side legacy `surface` projection.
  // Omitting it is intentional: a survey/technical save must preserve an
  // imported `fix: …; mozgó: …` value until the structured contract exists.
  const safePositions = positions.map(({ finishKey: _legacyFinishKey, ...position }) => position);
  return {
    customerName: revision.customerName,
    customerAddress: revision.customerAddress,
    contactName: revision.contactName,
    contactPhone: revision.contactPhone,
    contactEmail: revision.contactEmail,
    deliveryAddress: revision.deliveryAddress,
    expectedDelivery: revision.expectedDelivery,
    plannedStart: revision.plannedStart,
    priority: revision.priority,
    notes: revision.notes,
    positions: safePositions,
  };
}
