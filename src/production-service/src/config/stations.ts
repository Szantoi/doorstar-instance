import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type Stage =
  | "SZABASZAT_ELOGYARTAS"
  | "MEGMUNKALAS"
  | "FELULETKEZELES"
  | "OSSZESZERELES"
  | "CSOMAGOLAS"
  | "KISZALLITASRA_MEGJELOLES";

export interface StationConfig {
  key: string;
  stage: Stage;
  defaultWorkflow: string[];
}

interface StationsFile {
  stations: StationConfig[];
}

const raw = readFileSync(path.join(__dirname, "stations.json"), "utf-8");
const parsed: StationsFile = JSON.parse(raw);

export const STATIONS: readonly StationConfig[] = parsed.stations;

const byKey = new Map(STATIONS.map((s) => [s.key, s]));

export function getStation(key: string): StationConfig | undefined {
  return byKey.get(key);
}

export function stationNames(): string[] {
  return STATIONS.map((s) => s.key);
}

export function stageOf(stationKey: string | null | undefined): Stage | null {
  if (!stationKey) return null;
  return byKey.get(stationKey)?.stage ?? null;
}

export const DEFAULT_WORKFLOW = ["Felvett", "Folyamatban", "Kész"];

export function defaultWorkflowFor(stationKey: string | null | undefined): string[] {
  if (!stationKey) return DEFAULT_WORKFLOW;
  return byKey.get(stationKey)?.defaultWorkflow ?? DEFAULT_WORKFLOW;
}

/** Stable ordering of the 6 macro stages, matching WorkflowStepName 1..6. */
export const STAGE_ORDER: readonly Stage[] = [
  "SZABASZAT_ELOGYARTAS",
  "MEGMUNKALAS",
  "FELULETKEZELES",
  "OSSZESZERELES",
  "CSOMAGOLAS",
  "KISZALLITASRA_MEGJELOLES",
];
