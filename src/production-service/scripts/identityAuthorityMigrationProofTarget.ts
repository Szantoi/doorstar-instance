export const IDENTITY_AUTHORITY_MIGRATION_PROOF_APPROVAL = "approved-disposable-postgres";
export const IDENTITY_AUTHORITY_MIGRATION_PROOF_DATABASE = "doorstar_m1b_migration_test";

const generatedSchemaPattern = /^doorstar_m1b_migration_[a-z0-9_]+$/;
const postgresProtocols = new Set(["postgres:", "postgresql:"]);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export interface IdentityAuthorityMigrationProofTarget {
  readonly databaseUrl: string;
  readonly databaseName: string;
}

/**
 * Refuses every normal application/test database target. The migration proof
 * has its own explicit environment contract and never reads DATABASE_URL or
 * TEST_DATABASE_URL, preventing an accidental db push/deploy against them.
 */
export function assertIdentityAuthorityMigrationProofTarget(input: {
  readonly approval?: string;
  readonly databaseUrl?: string;
}): IdentityAuthorityMigrationProofTarget {
  if (input.approval !== IDENTITY_AUTHORITY_MIGRATION_PROOF_APPROVAL) {
    throw new Error("Explicit disposable PostgreSQL approval is required for the M1B migration proof");
  }
  if (!input.databaseUrl) {
    throw new Error("DOORSTAR_M1B_MIGRATION_TEST_URL is required for the M1B migration proof");
  }

  let parsed: URL;
  try {
    parsed = new URL(input.databaseUrl);
  } catch {
    throw new Error("DOORSTAR_M1B_MIGRATION_TEST_URL must be a valid PostgreSQL URL");
  }
  if (!postgresProtocols.has(parsed.protocol)) {
    throw new Error("The M1B migration proof requires a PostgreSQL URL");
  }
  if (!loopbackHosts.has(parsed.hostname)) {
    throw new Error("The M1B migration proof is allowed only on a loopback database host");
  }
  if (parsed.port === "5462") {
    throw new Error("The M1B migration proof refuses persistent Docker port 5462");
  }
  if (parsed.searchParams.has("schema")) {
    throw new Error("DOORSTAR_M1B_MIGRATION_TEST_URL must not select a schema; the proof creates its own generated schema");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (databaseName !== IDENTITY_AUTHORITY_MIGRATION_PROOF_DATABASE) {
    throw new Error(
      `The M1B migration proof refuses database '${databaseName || "(missing)"}'; only '${IDENTITY_AUTHORITY_MIGRATION_PROOF_DATABASE}' is allowed`,
    );
  }
  return { databaseUrl: parsed.toString(), databaseName };
}

/** Appends only a generated, schema-scoped target after the base URL is guarded. */
export function createIdentityAuthorityMigrationSchemaUrl(
  target: IdentityAuthorityMigrationProofTarget,
  schema: string,
): string {
  if (!generatedSchemaPattern.test(schema)) {
    throw new Error("Refusing a non-generated M1B migration proof schema");
  }
  const databaseUrl = new URL(target.databaseUrl);
  databaseUrl.searchParams.set("schema", schema);
  return databaseUrl.toString();
}
