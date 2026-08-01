import type { OrderPositionEvidence, OrderPositionEvidenceField } from "../services/production/types";

export const orderPositionEvidenceFieldLabel: Record<OrderPositionEvidenceField, string> = {
  CODE: "Pozíciókód",
  NAME: "Megnevezés",
  QUANTITY: "Mennyiség",
  PRODUCT_TYPE: "Ajtótípus",
  OPENING_DIRECTION: "Örökölt nyitásmegadás",
  OPENING_WIDTH_MM: "Falnyílás szélesség",
  OPENING_HEIGHT_MM: "Falnyílás magasság",
  OPENING_DEPTH_MM: "Kész falvastagság · örökölt mérés",
  DOOR_WIDTH_MM: "Ajtólap szélesség",
  DOOR_HEIGHT_MM: "Ajtólap magasság",
  DOOR_THICKNESS_MM: "Ajtólap vastagság",
  SURFACE: "Örökölt felületi forrás",
  WALL_TREATMENT: "Falmegoldás",
  GLAZING: "Üvegezés",
  GLAZING_SPECIFICATION: "Üvegspecifikáció",
  NOTES: "Megjegyzés",
};

export const orderPositionEvidenceStateLabel: Record<OrderPositionEvidence["reviewState"], string> = {
  UNVERIFIED: "Ellenőrizetlen",
  REVIEW: "Ellenőrzendő",
  RESOLVED: "Elfogadva",
  REJECTED: "Elutasítva",
};

export function formatEvidenceValue(value: OrderPositionEvidence["normalizedValue"]) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Igen" : "Nem";
  return String(value);
}

export function formatEvidenceConfidence(confidence: number | null) {
  if (confidence == null) return null;
  return `${Math.round(confidence * 100)}% bizalom`;
}
