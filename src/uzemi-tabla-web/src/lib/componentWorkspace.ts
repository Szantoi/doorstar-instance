import type {
  ComponentCalculatorProfile,
  ComponentRequirementInput,
  ComponentRequirementKind,
  ComponentRequirementSourceKind,
  ComponentSnapshot,
  ProductionOrderRevision,
} from "@/services/production/types";
import type { Role } from "@/store/uiStore";
import { canCreateComponentSnapshot } from "./roles";
import { buildRevisionSourceReadiness, sourceEvidenceSetReady } from "./sourceEvidence";

export interface ComponentSourceOption {
  kind: ComponentRequirementSourceKind;
  id: string;
  label: string;
  detail: string;
  available: boolean;
  unavailableReason: string | null;
}

export interface ComponentDimensionDraft {
  width: string;
  height: string;
  thickness: string;
}

export interface ComponentRequirementDraft {
  clientId: string;
  sourceKind: ComponentRequirementSourceKind;
  sourceId: string;
  requirementKind: ComponentRequirementKind | "";
  sourceComponentKey: string;
  componentKey: string;
  name: string;
  quantity: string;
  quantityUnit: string;
  materialKey: string;
  finishKey: string;
  finishedDimensionsMm: ComponentDimensionDraft;
  cuttingDimensionsMm: ComponentDimensionDraft;
  grainDirection: string;
  notes: string;
}

export interface ComponentDraftValidation {
  valid: boolean;
  globalErrors: string[];
  rowErrors: Record<string, string[]>;
}

const STABLE_COMPONENT_KEY = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

export function buildComponentSourceOptions(revision: ProductionOrderRevision): ComponentSourceOption[] {
  const positions: ComponentSourceOption[] = revision.positions.map((position) => ({
    kind: "ORDER_POSITION",
    id: position.id,
    label: `${position.code || "Pozíció"} · ${position.name || "Névtelen ajtópozíció"}`,
    detail: `${position.quantity} db${position.productType ? ` · ${position.productType}` : ""}`,
    available: true,
    unavailableReason: null,
  }));
  const manufactured: ComponentSourceOption[] = revision.manufacturedItems.map((item) => ({
    kind: "MANUFACTURED_ITEM",
    id: item.id,
    label: `${item.code} · ${item.name}`,
    detail: `${item.quantity} db · ${item.kind === "WALL_PANEL" ? "Falpanel" : "Bútorfront"}`,
    available: item.state === "VERIFIED" && sourceEvidenceSetReady(item.evidence),
    unavailableReason: item.state !== "VERIFIED"
      ? `A gyártott tétel állapota ${item.state}; csak ellenőrzött forrás használható.`
      : !sourceEvidenceSetReady(item.evidence)
        ? "A külön gyártott tétel minden evidence-sorához teljes, auditált RESOLVED döntés szükséges."
        : null,
  }));
  const supplementary: ComponentSourceOption[] = revision.supplementaryItems.map((item) => ({
    kind: "SUPPLEMENTARY_ITEM",
    id: item.id,
    label: `${item.code ? `${item.code} · ` : ""}${item.name}`,
    detail: `${item.quantity ?? item.calculatedQuantity ?? "—"} ${item.unit ?? item.calculatedUnit ?? ""} · ${item.category}`.trim(),
    available: item.state === "VERIFIED"
      && (item.entryMode !== "SOURCE_REVIEW" || sourceEvidenceSetReady(item.evidence)),
    unavailableReason: item.state !== "VERIFIED"
      ? `A tartozék állapota ${item.state}; csak ellenőrzött forrás használható.`
      : item.entryMode === "SOURCE_REVIEW"
        && !sourceEvidenceSetReady(item.evidence)
        ? "A forrásból származó tartozék minden evidence-sorához teljes, auditált RESOLVED döntés szükséges."
        : null,
  }));
  return [...positions, ...manufactured, ...supplementary];
}

/** A newly linked source carries no calculated component defaults. Every
 * business field remains blank until a human supplies the reviewed output. */
export function createEmptyComponentDraft(
  clientId: string,
  source: Pick<ComponentSourceOption, "kind" | "id">,
): ComponentRequirementDraft {
  const emptyDimensions = (): ComponentDimensionDraft => ({ width: "", height: "", thickness: "" });
  return {
    clientId,
    sourceKind: source.kind,
    sourceId: source.id,
    requirementKind: "",
    sourceComponentKey: "",
    componentKey: "",
    name: "",
    quantity: "",
    quantityUnit: "",
    materialKey: "",
    finishKey: "",
    finishedDimensionsMm: emptyDimensions(),
    cuttingDimensionsMm: emptyDimensions(),
    grainDirection: "",
    notes: "",
  };
}

function isPositiveNumber(value: string) {
  if (!value.trim()) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function dimensionIssues(label: string, dimensions: ComponentDimensionDraft, required: boolean) {
  const values = [dimensions.width, dimensions.height, dimensions.thickness];
  const hasAny = values.some((value) => value.trim() !== "");
  if (!required && !hasAny) return [];
  return values.every(isPositiveNumber) ? [] : [`${label}: mindhárom pozitív méret kötelező.`];
}

export function validateComponentDraft(
  rows: ComponentRequirementDraft[],
  sources: ComponentSourceOption[],
): ComponentDraftValidation {
  const globalErrors: string[] = [];
  const rowErrors: Record<string, string[]> = {};
  if (rows.length === 0) globalErrors.push("Legalább egy explicit alkatrészsort adj meg.");
  const sourceByKey = new Map(sources.map((source) => [`${source.kind}:${source.id}`, source]));

  const sourceKeys = rows.map((row) => row.sourceComponentKey.trim()).filter(Boolean);
  const duplicates = new Set(sourceKeys.filter((key, index) => sourceKeys.indexOf(key) !== index));
  if (duplicates.size) globalErrors.push(`A forráskomponens-kulcs nem lehet ismétlődő: ${[...duplicates].join(", ")}.`);

  rows.forEach((row) => {
    const errors: string[] = [];
    const source = sourceByKey.get(`${row.sourceKind}:${row.sourceId}`);
    if (!source) {
      errors.push("A kapcsolt forrásrekord már nem érhető el ezen a revízión.");
    } else if (!source.available) {
      errors.push(source.unavailableReason ?? "A kapcsolt forrásrekord már nem ellenőrzött.");
    }
    if (!row.requirementKind) errors.push("Válaszd ki az alkatrész jellegét.");
    if (!row.sourceComponentKey.trim() || row.sourceComponentKey.trim().length > 160 || !STABLE_COMPONENT_KEY.test(row.sourceComponentKey.trim())) {
      errors.push("A forráskomponens-kulcs stabil ASCII kulcs legyen.");
    }
    if (!row.componentKey.trim() || row.componentKey.trim().length > 160 || !STABLE_COMPONENT_KEY.test(row.componentKey.trim())) {
      errors.push("A komponenskulcs stabil ASCII kulcs legyen.");
    }
    if (!row.name.trim() || row.name.trim().length > 240) errors.push("Az alkatrész neve 1–240 karakter legyen.");
    if (!isPositiveNumber(row.quantity)) errors.push("A mennyiség pozitív szám legyen.");
    if (!row.quantityUnit.trim() || row.quantityUnit.trim().length > 32) errors.push("A mennyiségi egység 1–32 karakter legyen.");

    const isCutPart = row.requirementKind === "CUT_PART";
    if (isCutPart && !row.materialKey) errors.push("Gyártott alkatrészhez katalógusbeli anyag szükséges.");
    errors.push(...dimensionIssues("Készméret", row.finishedDimensionsMm, isCutPart));
    errors.push(...dimensionIssues("Szabászati méret", row.cuttingDimensionsMm, isCutPart));
    if (errors.length) rowErrors[row.clientId] = errors;
  });

  return { valid: globalErrors.length === 0 && Object.keys(rowErrors).length === 0, globalErrors, rowErrors };
}

function toDimensionInput(dimensions: ComponentDimensionDraft) {
  if (![dimensions.width, dimensions.height, dimensions.thickness].every(isPositiveNumber)) return undefined;
  return {
    width: Number(dimensions.width),
    height: Number(dimensions.height),
    thickness: Number(dimensions.thickness),
  };
}

export function toComponentRequirementInput(row: ComponentRequirementDraft): ComponentRequirementInput {
  if (!row.requirementKind) throw new Error("component_requirement_kind_missing");
  const finishedDimensionsMm = toDimensionInput(row.finishedDimensionsMm);
  const cuttingDimensionsMm = toDimensionInput(row.cuttingDimensionsMm);
  return {
    source: { kind: row.sourceKind, id: row.sourceId },
    requirementKind: row.requirementKind,
    sourceComponentKey: row.sourceComponentKey.trim(),
    componentKey: row.componentKey.trim(),
    name: row.name.trim(),
    quantity: Number(row.quantity),
    quantityUnit: row.quantityUnit.trim(),
    ...(row.materialKey ? { materialKey: row.materialKey } : {}),
    ...(row.finishKey ? { finishKey: row.finishKey } : {}),
    ...(finishedDimensionsMm ? { finishedDimensionsMm } : {}),
    ...(cuttingDimensionsMm ? { cuttingDimensionsMm } : {}),
    ...(row.grainDirection.trim() ? { grainDirection: row.grainDirection.trim() } : {}),
    ...(row.notes.trim() ? { notes: row.notes.trim() } : {}),
  };
}

export interface ComponentWorkspaceGateInput {
  revision: ProductionOrderRevision;
  latestRevisionId: string;
  approvalHash: string | null;
  profile: ComponentCalculatorProfile | null;
  snapshots: ComponentSnapshot[];
  role: Role;
  dependenciesReady: boolean;
}

export function componentWorkspaceBlockers(input: ComponentWorkspaceGateInput) {
  const blockers: string[] = [];
  const sourceReadiness = buildRevisionSourceReadiness(input.revision);
  if (!input.dependenciesReady) blockers.push("A profil-, katalógus- vagy snapshotadat még nem igazolt.");
  if (input.revision.id !== input.latestRevisionId) blockers.push("Csak a legfrissebb rendelési revízió materializálható.");
  if (input.revision.status !== "APPROVED") blockers.push("A rendelési revízió még nincs jóváhagyva.");
  if (!input.approvalHash || !/^[a-f0-9]{64}$/i.test(input.approvalHash)) blockers.push("A jóváhagyási tartalom-hash nem érhető el.");
  if (!sourceReadiness.ready) {
    const unresolved = [
      sourceReadiness.manufacturedItems.unresolved > 0
        ? `${sourceReadiness.manufacturedItems.unresolved} külön gyártott tétel`
        : null,
      sourceReadiness.supplementaryItems.unresolved > 0
        ? `${sourceReadiness.supplementaryItems.unresolved} tartozék`
        : null,
    ].filter((part): part is string => part !== null);
    blockers.push(`A teljes revízió forrásauditja hiányos: ${unresolved.join(", ")}.`);
  }
  if (!input.profile?.active) blockers.push("Nincs kiválasztott aktív kalkulátorprofil.");
  if (!canCreateComponentSnapshot(input.role)) blockers.push("A kiválasztott szerepkör nem hozhat létre alkatrészsnapshotot.");
  if (input.profile && input.snapshots.some((snapshot) => snapshot.calculatorProfileVersion === input.profile?.version)) {
    blockers.push("Ehhez a profilverzióhoz már létezik megváltoztathatatlan snapshot.");
  }
  return blockers;
}
