import type { SalesIntakeInput } from "@/services/production/types";

export type SalesGlazingDraft = "" | "NONE" | "GLAZED";
export type DeliveryExpectationPrecision = "DAY" | "MONTH" | "UNRESOLVED";

export interface SalesPositionDraft {
  draftId: string;
  code: string;
  name: string;
  quantity: number;
  productType: string;
  openingDirection: string;
  openingWidthCm: string;
  openingHeightCm: string;
  openingDepthCm: string;
  surface: string;
  hasStructuredAppearanceDifferences: boolean;
  glazing: SalesGlazingDraft;
  glazingSpecification: string;
  notes: string;
}

export interface SalesIntakeDraft {
  projectKey: string;
  projectName: string;
  projectNum: string;
  customerName: string;
  customerAddress: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  deliveryAddress: string;
  priority: number;
  deliveryExpectationPrecision: DeliveryExpectationPrecision;
  expectedDelivery: string;
  expectedDeliveryMonth: string;
  notes: string;
  positions: SalesPositionDraft[];
}

export type SalesIntakeErrors = Record<string, string>;

export type SalesIntakeResult =
  | { success: true; input: SalesIntakeInput; errors: SalesIntakeErrors }
  | { success: false; input: null; errors: SalesIntakeErrors };

export type CentimetreConversion =
  | { success: true; millimetres: number | null }
  | { success: false; millimetres: null; error: string };

const centimetrePattern = /^\d+(?:[.,]\d)?$/;

export function normalizeSalesPositionCode(value: string) {
  return value.trim().normalize("NFKC").toLocaleUpperCase("hu-HU");
}

/** Returns the lowest unused code in the explicit 01–99 Sales range. */
export function smallestAvailableSalesPositionCode(positions: SalesPositionDraft[]) {
  const occupied = new Set(positions.map((position) => normalizeSalesPositionCode(position.code)));
  for (let value = 1; value <= 99; value += 1) {
    const candidate = String(value).padStart(2, "0");
    if (!occupied.has(candidate)) return candidate;
  }
  return null;
}

/** Converts the source document's centimetres to the backend millimetre unit.
 * A single decimal digit is accepted because it maps exactly to whole mm;
 * values are never rounded silently. */
export function centimetresToMillimetres(value: string): CentimetreConversion {
  const normalized = value.trim();
  if (!normalized) return { success: true, millimetres: null };
  if (!centimetrePattern.test(normalized)) {
    return {
      success: false,
      millimetres: null,
      error: "Adj meg pozitív cm értéket, legfeljebb egy tizedessel (például 81,5).",
    };
  }

  const [whole, decimal = "0"] = normalized.replace(",", ".").split(".");
  const millimetres = Number(whole) * 10 + Number(decimal);
  if (!Number.isSafeInteger(millimetres) || millimetres <= 0) {
    return { success: false, millimetres: null, error: "A méretnek nullánál nagyobbnak kell lennie." };
  }
  return { success: true, millimetres };
}

export function blankSalesPosition(draftId: string, code: number | string): SalesPositionDraft {
  return {
    draftId,
    code: typeof code === "number" ? String(code).padStart(2, "0") : code,
    name: "",
    quantity: 1,
    productType: "",
    openingDirection: "",
    openingWidthCm: "",
    openingHeightCm: "",
    openingDepthCm: "",
    surface: "",
    hasStructuredAppearanceDifferences: false,
    glazing: "",
    glazingSpecification: "",
    notes: "",
  };
}

const trimmedOrNull = (value: string) => value.trim() || null;

function validDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Builds the exact Sales command and returns field-addressable errors for
 * accessible form feedback. It does not create supplementary or technical
 * records and never derives manufacturing choices. */
export function toSalesIntakeInput(draft: SalesIntakeDraft): SalesIntakeResult {
  const errors: SalesIntakeErrors = {};
  if (!draft.projectKey.trim()) errors.projectKey = "A projektazonosító kötelező.";
  if (!draft.projectName.trim()) errors.projectName = "A projekt neve kötelező.";
  if (!draft.customerName.trim()) errors.customerName = "A megrendelő neve kötelező.";
  if (draft.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail.trim())) {
    errors.contactEmail = "Adj meg érvényes e-mail-címet.";
  }
  let expectedDelivery: string | null = null;
  if (draft.deliveryExpectationPrecision === "DAY") {
    if (!validDateOnly(draft.expectedDelivery)) errors.expectedDelivery = "Adj meg teljes, valós várható szállítási dátumot.";
    else expectedDelivery = `${draft.expectedDelivery}T00:00:00.000Z`;
  } else if (draft.deliveryExpectationPrecision === "MONTH") {
    errors.expectedDeliveryMonth = "DELIVERY_EXPECTATION_CONTRACT_REQUIRED: a hónap-pontosság union backend-contractot igényel.";
  }
  if (!Number.isInteger(draft.priority) || draft.priority < 0 || draft.priority > 9) {
    errors.priority = "A prioritás 0 és 9 közötti egész szám lehet.";
  }
  if (draft.positions.length === 0) errors.positions = "Legalább egy ajtópozíció szükséges.";

  const positionCodeCounts = new Map<string, number>();
  for (const position of draft.positions) {
    const normalizedCode = normalizeSalesPositionCode(position.code);
    if (normalizedCode) positionCodeCounts.set(normalizedCode, (positionCodeCounts.get(normalizedCode) ?? 0) + 1);
  }

  const positions = draft.positions.map((position) => {
    const prefix = `positions.${position.draftId}`;
    const normalizedCode = normalizeSalesPositionCode(position.code);
    if (!normalizedCode) errors[`${prefix}.code`] = "A pozíciókód kötelező.";
    else if ((positionCodeCounts.get(normalizedCode) ?? 0) > 1) {
      errors[`${prefix}.code`] = "A pozíciókódnak a revízión belül egyedinek kell lennie.";
    }
    if (!position.name.trim()) errors[`${prefix}.name`] = "A pozíció megnevezése kötelező.";
    if (!Number.isInteger(position.quantity) || position.quantity <= 0) {
      errors[`${prefix}.quantity`] = "A darabszám pozitív egész szám legyen.";
    }
    if (position.hasStructuredAppearanceDifferences) {
      errors[`${prefix}.hasStructuredAppearanceDifferences`] = "STRUCTURED_APPEARANCE_CONTRACT_REQUIRED: az eltérő komponensfelületek külön contractot igényelnek.";
    }

    const dimensions = {
      openingWidthMm: centimetresToMillimetres(position.openingWidthCm),
      openingHeightMm: centimetresToMillimetres(position.openingHeightCm),
      openingDepthMm: centimetresToMillimetres(position.openingDepthCm),
    };
    const dimensionDraftKeys = {
      openingWidthMm: "openingWidthCm",
      openingHeightMm: "openingHeightCm",
      openingDepthMm: "openingDepthCm",
    } as const;
    for (const [payloadKey, conversion] of Object.entries(dimensions)) {
      if (!conversion.success) errors[`${prefix}.${dimensionDraftKeys[payloadKey as keyof typeof dimensions]}`] = conversion.error;
    }

    return {
      code: normalizedCode,
      name: position.name.trim(),
      quantity: position.quantity,
      productType: trimmedOrNull(position.productType),
      openingDirection: trimmedOrNull(position.openingDirection),
      openingWidthMm: dimensions.openingWidthMm.millimetres,
      openingHeightMm: dimensions.openingHeightMm.millimetres,
      openingDepthMm: dimensions.openingDepthMm.millimetres,
      surface: trimmedOrNull(position.surface),
      glazing: position.glazing || null,
      glazingSpecification: position.glazing === "GLAZED" ? trimmedOrNull(position.glazingSpecification) : null,
      notes: position.notes.trim(),
    };
  });

  if (Object.keys(errors).length > 0) return { success: false, input: null, errors };
  return {
    success: true,
    errors,
    input: {
      projectKey: draft.projectKey.trim(),
      projectName: draft.projectName.trim(),
      ...(draft.projectNum.trim() ? { projectNum: draft.projectNum.trim() } : {}),
      customerName: draft.customerName.trim(),
      customerAddress: trimmedOrNull(draft.customerAddress),
      contactName: trimmedOrNull(draft.contactName),
      contactPhone: trimmedOrNull(draft.contactPhone),
      contactEmail: trimmedOrNull(draft.contactEmail),
      deliveryAddress: trimmedOrNull(draft.deliveryAddress),
      expectedDelivery,
      priority: draft.priority,
      notes: draft.notes.trim(),
      positions,
    },
  };
}
