import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
type Choice = { key: string; label: string };
type GlassChoice = Choice & { glazing: "NONE" | "GLAZED" };
type WallChoice = Choice & { wallTreatment: "NONE" | "WALL_PANEL" | "BLENDE" };

export type TechnicalCatalog = {
  version: string; doorTypes: Choice[]; finishes: Choice[]; glass: GlassChoice[];
  hardware: Choice[]; wallSolutions: WallChoice[]; materials: Choice[]; machinings: Choice[];
};

const technicalCatalogSource = readFileSync(path.join(directory, "technicalCatalog.json"));
export const technicalCatalog = JSON.parse(technicalCatalogSource.toString("utf8")) as TechnicalCatalog;
export const technicalCatalogFingerprint = createHash("sha256").update(technicalCatalogSource).digest("hex");

function lookup<T extends Choice>(choices: T[], key: string | null | undefined): T | undefined {
  return key ? choices.find((choice) => choice.key === key) : undefined;
}

export function validateTechnicalSelection(input: { doorTypeKey?: string | null; finishKey?: string | null; glassKey?: string | null; wallSolutionKey?: string | null; materialKey?: string | null; hardwareKeys?: string[]; machiningKeys?: string[] }) {
  const fields: Array<[string, Choice[] | undefined, string | null | undefined]> = [
    ["doorTypeKey", technicalCatalog.doorTypes, input.doorTypeKey], ["finishKey", technicalCatalog.finishes, input.finishKey],
    ["glassKey", technicalCatalog.glass, input.glassKey], ["wallSolutionKey", technicalCatalog.wallSolutions, input.wallSolutionKey],
    ["materialKey", technicalCatalog.materials, input.materialKey],
  ];
  const errors = fields.flatMap(([field, choices, key]) => key && !lookup(choices!, key) ? [`${field}:unknown_catalog_key`] : []);
  for (const [field, keys, choices] of [["hardwareKeys", input.hardwareKeys ?? [], technicalCatalog.hardware], ["machiningKeys", input.machiningKeys ?? [], technicalCatalog.machinings]] as const) {
    if (new Set(keys).size !== keys.length) errors.push(`${field}:duplicate_catalog_key`);
    for (const key of keys) if (!lookup(choices, key)) errors.push(`${field}:unknown_catalog_key:${key}`);
  }
  return errors;
}

export function catalogDerivedFields(input: { doorTypeKey?: string | null; finishKey?: string | null; glassKey?: string | null; wallSolutionKey?: string | null }) {
  const doorType = lookup(technicalCatalog.doorTypes, input.doorTypeKey);
  const finish = lookup(technicalCatalog.finishes, input.finishKey);
  const glass = lookup(technicalCatalog.glass, input.glassKey);
  const wall = lookup(technicalCatalog.wallSolutions, input.wallSolutionKey);
  // Legacy and import drafts can still use their existing free-text values.
  // Only a supplied catalog choice is authoritative, so an absent optional
  // key never silently clears data that predates the catalog.
  return {
    ...(doorType ? { productType: doorType.label } : {}),
    ...(finish ? { surface: finish.label } : {}),
    ...(glass ? {
      glazing: glass.glazing,
      glazingSpecification: glass.glazing === "GLAZED" ? glass.label : null,
    } : {}),
    ...(wall ? { wallTreatment: wall.wallTreatment } : {}),
  };
}
