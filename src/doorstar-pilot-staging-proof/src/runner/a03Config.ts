import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DisposableScope, TwoScopeFixtureInput } from "../fixture/twoScopeFixture.js";

/**
 * Docker execution is intentionally impossible unless this exact value is set
 * for the single invocation. A truthy flag, a normal database URL, or a CLI
 * argument alone is never sufficient.
 */
export const disposableAcknowledgement = "I_CONFIRM_A03_DISPOSABLE_POSTGRES_16_PROOF";
export const disposableAcknowledgementEnvironment = "DOORSTAR_A03_ACKNOWLEDGEMENT";

const generatedIdentifierPattern = /^[a-z][a-z0-9_]{0,62}$/;

export type DisposableDatabaseIdentity = Readonly<{
  username: string;
  password: string;
}>;

export type DisposableProofPlan = Readonly<{
  runId: string;
  containerName: string;
  databaseName: string;
  administrator: DisposableDatabaseIdentity;
  migrator: DisposableDatabaseIdentity;
  runtime: DisposableDatabaseIdentity;
  bootstrap: DisposableDatabaseIdentity;
  fixture: TwoScopeFixtureInput;
}>;

export function requireDisposableAcknowledgement(environment: NodeJS.ProcessEnv = process.env): void {
  if (environment[disposableAcknowledgementEnvironment] !== disposableAcknowledgement) {
    throw new A03ProofError("a03_disposable_acknowledgement_required");
  }
}

/** Creates only in-memory names and secrets; it does not start Docker or open a DB connection. */
export function createDisposableProofPlan(): DisposableProofPlan {
  const runId = randomUUID();
  const suffix = runId.replaceAll("-", "");
  const fixture = {
    scopeA: createScope("alpha"),
    scopeB: createScope("beta"),
  } satisfies TwoScopeFixtureInput;
  const plan: DisposableProofPlan = {
    runId,
    containerName: `doorstar-a03-${suffix.slice(0, 20)}`,
    databaseName: `a03_proof_${suffix.slice(0, 20)}`,
    administrator: createIdentity("a03_admin", suffix),
    migrator: createIdentity("a03_migrator", suffix),
    runtime: createIdentity("a03_runtime", suffix),
    bootstrap: createIdentity("a03_bootstrap", suffix),
    fixture,
  };
  assertPlanSafety(plan);
  return plan;
}

export function redactedRunIdHash(runId: string): string {
  return createHash("sha256").update(runId, "utf8").digest("hex");
}

export class A03ProofError extends Error {
  public constructor(public readonly publicCode: string) {
    super(publicCode);
    this.name = "A03ProofError";
  }
}

function createScope(label: "alpha" | "beta"): DisposableScope {
  const id = randomUUID();
  return {
    id,
    scopeKey: `a03-${label}-${id.replaceAll("-", "")}`,
  };
}

function createIdentity(prefix: string, suffix: string): DisposableDatabaseIdentity {
  const username = `${prefix}_${suffix.slice(0, 16)}`;
  if (!generatedIdentifierPattern.test(username)) {
    throw new A03ProofError("a03_generated_identity_invalid");
  }
  return {
    username,
    password: randomBytes(32).toString("base64url"),
  };
}

function assertPlanSafety(plan: DisposableProofPlan): void {
  const identifiers = [
    plan.databaseName,
    plan.administrator.username,
    plan.migrator.username,
    plan.runtime.username,
    plan.bootstrap.username,
  ];
  if (!identifiers.every((identifier) => generatedIdentifierPattern.test(identifier))) {
    throw new A03ProofError("a03_generated_identifier_invalid");
  }
  if (new Set(identifiers).size !== identifiers.length) {
    throw new A03ProofError("a03_generated_identifier_collision");
  }
}
