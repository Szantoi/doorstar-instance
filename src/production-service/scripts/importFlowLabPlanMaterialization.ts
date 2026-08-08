import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { requireFlowLabPlanInboxDirectory } from "../src/config/flowLabExchange.js";
import { parseFlowLabBoardBinding } from "../src/services/flowLabArtifact.js";
import { importFlowLabPlanSnapshotFromInbox } from "../src/services/flowLabPlanImport.js";

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing required ${name} value.`);
  return value;
}

function positiveInteger(name: string): number {
  const parsed = Number(option(name));
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

if (!process.argv.includes("--confirm-flow-lab-plan-import")) {
  throw new Error("Explicit confirmation required: --confirm-flow-lab-plan-import");
}

const binding = parseFlowLabBoardBinding({
  projectKey: option("--project-key"),
  revision: positiveInteger("--revision"),
  componentSnapshotId: option("--component-snapshot-id"),
  expectedOrderContentHash: option("--expected-order-content-hash"),
  expectedComponentOutputHash: option("--expected-component-output-hash"),
  stationMappingVersion: option("--station-mapping-version"),
  stationMappingFingerprint: option("--station-mapping-fingerprint"),
  reviewNote: option("--review-note"),
  actorRole: option("--actor-role"),
  actorPrincipal: option("--actor-principal"),
});
const inboxDirectory = requireFlowLabPlanInboxDirectory();
const fileName = option("--file-name");
const client = new PrismaClient();

try {
  const result = await importFlowLabPlanSnapshotFromInbox(binding, { inboxDirectory, fileName }, client);
  console.info(JSON.stringify({ event: "flow_lab_plan_import_completed", ...result }));
} finally {
  await client.$disconnect();
}
