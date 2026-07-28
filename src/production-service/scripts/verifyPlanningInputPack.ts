/** Read-only verification entrypoint for the versioned Doorstar Planning pack. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  preflightDoorstarPlanningInputPack,
  type DoorstarPlanningInputPack,
} from "../src/services/planning/inputPackPreflight.js";

const fixturesPath = resolve(
  process.cwd(),
  "..",
  "..",
  "docs",
  "projects",
  "doorstar-production-planning",
  "fixtures"
);

interface PackPin {
  fileName: string;
  packSchemaVersion: string;
  sha256: string;
  immutable: boolean;
}

interface InputPackManifest {
  schemaVersion: string;
  packs: PackPin[];
}

const manifestPath = resolve(fixturesPath, "doorstar-planning-input-pack.manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as InputPackManifest;
const reports = await Promise.all(manifest.packs.map(async (pin) => {
  const inputPackPath = resolve(fixturesPath, pin.fileName);
  const contents = await readFile(inputPackPath);
  const pack = JSON.parse(contents.toString("utf8")) as DoorstarPlanningInputPack;
  const report = preflightDoorstarPlanningInputPack(pack);
  const actualHash = createHash("sha256").update(contents).digest("hex").toUpperCase();
  return {
    fileName: pin.fileName,
    expectedSchemaVersion: pin.packSchemaVersion,
    actualSchemaVersion: pack.schemaVersion,
    immutable: pin.immutable,
    expectedSha256: pin.sha256,
    actualSha256: actualHash,
    hashMatches: actualHash === pin.sha256,
    ...report,
  };
}));

console.log(JSON.stringify({ manifestPath, manifestSchemaVersion: manifest.schemaVersion, reports }, null, 2));
if (reports.some((report) => (
  !report.hashMatches
  || report.actualSchemaVersion !== report.expectedSchemaVersion
  || !report.readyForPlatformContractReview
))) process.exitCode = 1;
