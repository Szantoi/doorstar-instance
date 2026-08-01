import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { STATIONS } from "./stations.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(directory, "operationAuthority.json"));
const processKindSchema = z.enum(["TECHNOLOGICAL", "NON_TECHNOLOGICAL", "NATURAL"]);

const operationAuthoritySchema = z.object({
  schemaVersion: z.string().trim().min(1).max(160),
  generatorProfiles: z.array(z.object({
    version: z.string().trim().min(1).max(160),
    label: z.string().trim().min(1).max(240),
    inputMode: z.literal("EXPLICIT_REVIEWED_OUTPUT"),
    active: z.boolean(),
    allowsAutomaticStandardSelection: z.literal(false),
    allowsAutomaticResourceSelection: z.literal(false),
    allowsImplicitDurations: z.literal(false),
  })).min(1),
  standardCatalog: z.object({
    version: z.string().trim().min(1).max(160),
    standards: z.array(z.object({
      key: z.string().trim().min(1).max(160),
      version: z.string().trim().min(1).max(160),
      processKind: processKindSchema,
      requiresTimeStandardSource: z.boolean(),
      requiresWorkInstruction: z.boolean(),
      requiresQualityCheckpoint: z.boolean(),
      allowsPurchasedPart: z.boolean(),
    })).min(1),
  }),
  resourceMapping: z.object({
    version: z.string().trim().min(1).max(160),
    resources: z.array(z.object({
      key: z.string().trim().min(1).max(160),
      stationKey: z.string().trim().min(1).max(160),
      processKinds: z.array(processKindSchema).min(1),
      machineKeys: z.array(z.string().trim().min(1).max(160)),
      toolKeys: z.array(z.string().trim().min(1).max(160)),
    })).min(1),
  }),
}).superRefine((value, ctx) => {
  const profileKeys = value.generatorProfiles.map((profile) => profile.version);
  if (new Set(profileKeys).size !== profileKeys.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["generatorProfiles"], message: "generator profile versions must be unique" });
  }
  const standards = value.standardCatalog.standards.map((standard) => `${standard.key}:${standard.version}`);
  if (new Set(standards).size !== standards.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["standardCatalog", "standards"], message: "standard key/version pairs must be unique" });
  }
  const resources = value.resourceMapping.resources.map((resource) => resource.key);
  if (new Set(resources).size !== resources.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["resourceMapping", "resources"], message: "resource keys must be unique" });
  }
});

export const operationAuthority = operationAuthoritySchema.parse(JSON.parse(source.toString("utf8")));
const knownStations = new Set(STATIONS.map((station) => station.key));
for (const resource of operationAuthority.resourceMapping.resources) {
  if (!knownStations.has(resource.stationKey)) {
    throw new Error(`Operation resource ${resource.key} maps to unknown station ${resource.stationKey}`);
  }
}
export const operationPlanSnapshotSchemaVersion = operationAuthority.schemaVersion;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export const standardCatalogFingerprint = fingerprint(operationAuthority.standardCatalog);
export const resourceMappingFingerprint = fingerprint(operationAuthority.resourceMapping);

export function operationGeneratorProfileFingerprint(
  profile: typeof operationAuthority.generatorProfiles[number],
) {
  return fingerprint(profile);
}

export function findActiveOperationGeneratorProfile(version: string) {
  return operationAuthority.generatorProfiles.find((profile) => profile.version === version && profile.active);
}

export function findOperationStandard(key: string, version: string) {
  return operationAuthority.standardCatalog.standards.filter((standard) => (
    standard.key === key && standard.version === version
  ));
}

export function findOperationResource(key: string) {
  return operationAuthority.resourceMapping.resources.filter((resource) => resource.key === key);
}
