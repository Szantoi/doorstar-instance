import { createHash } from "node:crypto";
import {
  A03ProofError,
  createDisposableProofPlan,
  redactedRunIdHash,
  requireDisposableAcknowledgement,
} from "./a03Config.js";
import type { CommandRunner } from "./commandRunner.js";
import { NodeCommandRunner } from "./commandRunner.js";
import {
  applyRenderedTwoScopeFixture,
  assertFixtureChangedExactlyThreeDefinitions,
  capturePolicyFunctionManifest,
  closePools,
  configureDisposableProofDatabase,
  createDisposableDatabaseAndRoles,
  deployImmutablePilotMigrationsThroughPrisma,
  openProofPools,
  readAndVerifyPrismaMigrationLedger,
  verifyDisposableRoleAttributes,
  verifyOwnershipAndPublicBoundary,
  waitForDisposablePostgres,
  type PolicyFunctionManifest,
  type ProofPools,
  type SourceMigrationEvidence,
} from "./databaseSetup.js";
import { executeDatabaseProofs } from "./databaseProofs.js";
import { DisposablePostgresContainer, type VerifiedPostgresImage } from "./dockerPostgres.js";
import { requireCleanCandidateGitState, type CandidateGitState } from "./candidateGitState.js";
import { verifyHarnessBoundary } from "./harnessBoundary.js";
import { ProofLedger } from "./proofLedger.js";
import { writeRedactedEvidence } from "./redactedEvidence.js";
import { loadTwoScopeFixtureTemplate, renderTwoScopeFixture } from "../fixture/twoScopeFixture.js";
import { verifyTwoScopeFixtureSources } from "../fixture/fixtureVerifier.js";

export type DisposableProofRunOptions = Readonly<{
  environment?: NodeJS.ProcessEnv;
  commandRunner?: CommandRunner;
  onPass?: (marker: string) => void;
}>;

export type DisposableProofRunResult = Readonly<{
  evidencePath: string;
  passMarkers: readonly string[];
}>;

/**
 * Executes only after the caller has supplied the exact acknowledgement. This
 * function is deliberately not invoked by tests, build, lint or fixture
 * verification. It never receives a production connection string.
 */
export async function runDisposableA03Proof(
  options: DisposableProofRunOptions = {},
): Promise<DisposableProofRunResult> {
  requireDisposableAcknowledgement(options.environment ?? process.env);
  const plan = createDisposableProofPlan();
  const commandRunner = options.commandRunner ?? new NodeCommandRunner();
  const ledger = new ProofLedger(options.onPass);
  const startedAt = new Date().toISOString();
  const templateReport = await verifyTwoScopeFixtureSources();
  const renderedFixture = renderTwoScopeFixture(await loadTwoScopeFixtureTemplate(), plan.fixture);
  const fixtureSha256 = sha256(renderedFixture);

  let pools: Partial<ProofPools> = {};
  let migrations: SourceMigrationEvidence | null = null;
  let beforeFixtureManifest: PolicyFunctionManifest | null = null;
  let afterFixtureManifest: PolicyFunctionManifest | null = null;
  let finalFunctionManifest: PolicyFunctionManifest | null = null;
  let primaryFailure: unknown;
  let candidateGitState: CandidateGitState | null = null;
  let verifiedImage: VerifiedPostgresImage | null = null;
  let cleanup: "container_destroyed" | "container_not_started" | "container_cleanup_failed" = "container_not_started";
  let evidencePath = "";
  const container = new DisposablePostgresContainer(commandRunner, {
    containerName: plan.containerName,
    administrator: plan.administrator,
  });

  try {
    if (templateReport.renderedFixtureSha256.length !== 64) {
      throw new A03ProofError("a03_fixture_source_verification_invalid");
    }
    ledger.pass("FIXTURE_SOURCE_VERIFIED");
    await verifyHarnessBoundary();
    ledger.pass("HARNESS_BOUNDARY_VERIFIED");
    candidateGitState = await requireCleanCandidateGitState(commandRunner);
    ledger.pass("CANDIDATE_GIT_COMMIT_CLEAN");
    verifiedImage = await container.assertDockerReadyAndImageAvailable();
    ledger.pass("DOCKER_READY_AND_POSTGRES16_IMAGE_VERIFIED");
    await container.startContainer();
    ledger.pass("DISPOSABLE_LOOPBACK_TMPFS_CONTAINER_STARTED");
    const port = await container.loopbackPort();
    const activePools = await openProofPools(plan, port);
    pools = activePools;
    // The cluster is reachable before identities are created. The explicit
    // readiness query is intentionally run through the generated admin only.
    await waitForDisposablePostgres(activePools.administrator);
    await createDisposableDatabaseAndRoles(activePools.administrator, plan);
    await verifyDisposableRoleAttributes(activePools.administrator, plan);
    ledger.pass("DISPOSABLE_NONSUPERUSER_IDENTITIES_CREATED");

    migrations = await deployImmutablePilotMigrationsThroughPrisma(commandRunner, plan, port);
    await readAndVerifyPrismaMigrationLedger(activePools.migrator, migrations.prismaMigrationChecksums);
    ledger.pass("PRISMA_MIGRATIONS_DEPLOYED_AND_LEDGER_VERIFIED");

    beforeFixtureManifest = await capturePolicyFunctionManifest(activePools.migrator);
    await applyRenderedTwoScopeFixture(activePools.migrator, renderedFixture);
    afterFixtureManifest = await capturePolicyFunctionManifest(activePools.migrator);
    assertFixtureChangedExactlyThreeDefinitions(beforeFixtureManifest, afterFixtureManifest);
    ledger.pass("EXACTLY_THREE_FUNCTION_FIXTURE_APPLIED");

    await configureDisposableProofDatabase(activePools.migrator, plan);
    finalFunctionManifest = await capturePolicyFunctionManifest(activePools.migrator);
    await verifyOwnershipAndPublicBoundary(activePools.migrator, plan);
    ledger.pass("SOURCE_BOUND_WRITER_MAP_AND_NARROW_ACL_CONFIGURED");
    await executeDatabaseProofs(plan, activePools, ledger);
  } catch (error) {
    primaryFailure = error;
  } finally {
    await closePools(pools);
    try {
      cleanup = await container.destroy();
    } catch {
      cleanup = "container_cleanup_failed";
      if (primaryFailure === undefined) primaryFailure = new A03ProofError("a03_container_cleanup_failed");
    }
    const status = primaryFailure === undefined && cleanup !== "container_cleanup_failed" ? "PASS" : "FAIL";
    const failureCode = primaryFailure === undefined ? null : publicFailureCode(primaryFailure);
    evidencePath = await writeRedactedEvidence({
      schemaVersion: 1,
      status,
      startedAt,
      completedAt: new Date().toISOString(),
      runIdSha256: redactedRunIdHash(plan.runId),
      candidateCommitSha: candidateGitState?.commitSha ?? null,
      candidateWorkingTreeClean: candidateGitState?.clean ?? null,
      image: "postgres:16",
      imageId: verifiedImage?.imageId ?? null,
      imageImmutableReference: verifiedImage?.immutableReference ?? null,
      fixtureSha256,
      migrationEvidence: migrations,
      beforeFixtureManifest,
      afterFixtureManifest,
      finalFunctionManifest,
      passMarkers: ledger.markers(),
      cleanup,
      failureCode,
    });
  }

  if (primaryFailure !== undefined) throw primaryFailure;
  return { evidencePath, passMarkers: ledger.markers() };
}

export function publicFailureCode(error: unknown): string {
  return error instanceof A03ProofError ? error.publicCode : "a03_unexpected_failure";
}

function sha256(value: string): string {
  return createHash("sha256").update(value.replaceAll("\r\n", "\n"), "utf8").digest("hex");
}
