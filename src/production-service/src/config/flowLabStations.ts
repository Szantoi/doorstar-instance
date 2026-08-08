import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getStation } from "./stations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface FlowLabFamily {
  key: string;
  name: string;
  position: number;
}

export interface FlowLabStationMapping {
  source: string;
  board: string;
}

interface FlowLabStationsFile {
  version: string;
  families: FlowLabFamily[];
  stations: FlowLabStationMapping[];
}

function canonicalMappingPayload(mapping: FlowLabStationsFile): string {
  return JSON.stringify({
    version: mapping.version,
    families: [...mapping.families]
      .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key))
      .map(({ key, name, position }) => ({ key, name, position })),
    stations: [...mapping.stations]
      .sort((left, right) => left.source.localeCompare(right.source))
      .map(({ source, board }) => ({ source, board })),
  });
}

function loadMapping(): FlowLabStationsFile {
  const raw = readFileSync(path.join(__dirname, "flowLabStations.json"), "utf-8");
  const parsed = JSON.parse(raw) as FlowLabStationsFile;
  if (!parsed.version?.trim() || !Array.isArray(parsed.families) || !Array.isArray(parsed.stations)) {
    throw new Error("flow_lab_station_mapping_invalid");
  }

  const familyKeys = new Set<string>();
  for (const family of parsed.families) {
    if (!family.key?.trim() || !family.name?.trim() || !Number.isInteger(family.position) || familyKeys.has(family.key)) {
      throw new Error("flow_lab_family_mapping_invalid");
    }
    familyKeys.add(family.key);
  }

  const sourceStations = new Set<string>();
  for (const station of parsed.stations) {
    if (!station.source?.trim() || !station.board?.trim() || sourceStations.has(station.source)) {
      throw new Error("flow_lab_station_mapping_invalid");
    }
    if (!getStation(station.board)) {
      throw new Error(`flow_lab_station_mapping_targets_unknown_board_station:${station.board}`);
    }
    sourceStations.add(station.source);
  }
  return parsed;
}

const mapping = loadMapping();

/** Version pin persisted with imported Flow Lab snapshots. */
export const flowLabStationMappingVersion = mapping.version;

/** Deterministic identity of the board-owned, explicit mapping configuration. */
export const flowLabStationMappingFingerprint = createHash("sha256")
  .update(canonicalMappingPayload(mapping), "utf8")
  .digest("hex");

export const flowLabFamilies: readonly FlowLabFamily[] = [...mapping.families]
  .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key));

const familyByKey = new Map(flowLabFamilies.map((family) => [family.key, family]));
const stationBySource = new Map(mapping.stations.map((station) => [station.source, station.board]));

/** Returns no value for an unknown label; callers must surface the failed mapping. */
export function resolveFlowLabStation(sourceStation: string): string | undefined {
  return stationBySource.get(sourceStation);
}

export function getFlowLabFamily(key: string): FlowLabFamily | undefined {
  return familyByKey.get(key);
}
