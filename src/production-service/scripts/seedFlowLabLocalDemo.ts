import "dotenv/config";
import { seedUxReferenceProject } from "./uxReferenceProjectFixture.js";
import { assertUxReferenceTarget, UX_REFERENCE_PROJECT_KEY } from "./uxReferenceProjectTarget.js";
import {
  createFlowLabLocalDemoArtifact,
  requireFlowLabLocalDemoSeedConfirmation,
} from "./flowLabLocalDemoFixture.js";

const arguments_ = process.argv.slice(2);
requireFlowLabLocalDemoSeedConfirmation(arguments_);
const target = assertUxReferenceTarget({
  databaseUrl: process.env.DATABASE_URL,
  arguments: arguments_,
  nodeEnv: process.env.NODE_ENV,
});

// Rebuilds only the reserved local UX reference project before adding the
// synthetic Flow Lab evidence. The target guard runs before Prisma is loaded.
await seedUxReferenceProject({
  databaseUrl: target.databaseUrl,
  arguments: ["--confirm-ux-reference-seed"],
  nodeEnv: process.env.NODE_ENV,
});

process.env.DATABASE_URL = target.databaseUrl;
process.env.LOG_LEVEL = "silent";

const [
  { prisma },
  { importFlowLabPlanSnapshot },
  { reviewFlowLabPlanSnapshot },
  { materializeFlowLabPlanSnapshot },
  { flowLabStationMappingFingerprint, flowLabStationMappingVersion },
] = await Promise.all([
  import("../src/db/client.js"),
  import("../src/services/flowLabPlanImport.js"),
  import("../src/services/flowLabPlanReview.js"),
  import("../src/services/flowLabMaterialization.js"),
  import("../src/config/flowLabStations.js"),
]);

try {
  await prisma.$connect();
  const revision = await prisma.orderRevision.findFirst({
    where: { order: { project: { key: UX_REFERENCE_PROJECT_KEY } }, revision: 2 },
    select: {
      id: true,
      order: { select: { projectId: true } },
      audit: {
        where: { action: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { contentHash: true },
      },
      componentSnapshots: {
        where: { state: "VERIFIED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, outputHash: true },
      },
    },
  });
  const approval = revision?.audit[0];
  const component = revision?.componentSnapshots[0];
  if (!revision || !approval || !component) {
    throw new Error("UX reference project did not provide an approved revision and verified component snapshot");
  }

  const artifact = createFlowLabLocalDemoArtifact();
  const imported = await importFlowLabPlanSnapshot({
    projectKey: UX_REFERENCE_PROJECT_KEY,
    revision: 2,
    componentSnapshotId: component.id,
    expectedOrderContentHash: approval.contentHash,
    expectedComponentOutputHash: component.outputHash,
    stationMappingVersion: flowLabStationMappingVersion,
    stationMappingFingerprint: flowLabStationMappingFingerprint,
    reviewNote: "Kizárólag helyi, szintetikus Flow Lab UX-demó; nem golden fixture és nem gyártási terv.",
    actorRole: "technical_preparation",
    actorPrincipal: "doorstar:ux-reference:flow-lab-importer",
  }, artifact);

  const reviewed = await reviewFlowLabPlanSnapshot({
    projectId: revision.order.projectId,
    snapshotId: imported.snapshot.id,
    actorRole: "production_planner",
    actorPrincipal: "doorstar:ux-reference:flow-lab-reviewer",
    decision: {
      state: "VERIFIED",
      expectedContentHash: imported.snapshot.contentHash,
      resolution: "A kizárólag helyi, szintetikus UX-folyamatot külön demó principal ellenőrizte.",
    },
  });
  const materialized = await materializeFlowLabPlanSnapshot({
    projectId: revision.order.projectId,
    snapshotId: reviewed.id,
    actorRole: "production_planner",
    actorPrincipal: "doorstar:ux-reference:flow-lab-materializer",
  });

  console.info(JSON.stringify({
    event: "flow_lab_local_demo_seed_completed",
    schema: target.schema,
    projectKey: UX_REFERENCE_PROJECT_KEY,
    snapshotId: reviewed.id,
    snapshotState: reviewed.state,
    materializationId: materialized.materializationId,
    epicCount: materialized.epicCount,
    stepCount: materialized.stepCount,
    workSessionPath: `/projects/${UX_REFERENCE_PROJECT_KEY}/work-session`,
    syntheticOnly: true,
  }));
} finally {
  await prisma.$disconnect();
}
