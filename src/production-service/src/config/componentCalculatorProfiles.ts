import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(directory, "componentCalculatorProfiles.json"));

const componentCalculatorProfilesSchema = z.object({
  configurationVersion: z.string().trim().min(1).max(160),
  profiles: z.array(z.object({
    version: z.string().trim().min(1).max(160),
    label: z.string().trim().min(1).max(240),
    inputMode: z.literal("EXPLICIT_REVIEWED_OUTPUT"),
    active: z.boolean(),
    allowsFormulaExecution: z.literal(false),
    allowsImplicitDefaults: z.literal(false),
    cutPartDimensions: z.literal("FINISHED_AND_CUTTING_REQUIRED"),
  })).min(1).refine(
    (profiles) => new Set(profiles.map((profile) => profile.version)).size === profiles.length,
    "calculator profile versions must be unique",
  ),
});

export const componentCalculatorProfiles = componentCalculatorProfilesSchema.parse(JSON.parse(source.toString("utf8")));
export const componentCalculatorProfilesFingerprint = createHash("sha256").update(source).digest("hex");
export const componentSnapshotSchemaVersion = "doorstar-component-snapshot/v1";

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

export function componentCalculatorProfileFingerprint(profile: typeof componentCalculatorProfiles.profiles[number]) {
  return createHash("sha256").update(JSON.stringify(canonicalize(profile))).digest("hex");
}

export function findActiveComponentCalculatorProfile(version: string) {
  return componentCalculatorProfiles.profiles.find((profile) => profile.version === version && profile.active);
}
