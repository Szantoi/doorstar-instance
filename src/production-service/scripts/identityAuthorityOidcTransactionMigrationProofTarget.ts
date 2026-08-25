export const IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_APPROVAL = "approved-disposable-postgres-m2b-oidc-transaction";
export const IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_DATABASE = "doorstar_m2b_oidc_transaction_migration_test";

const generatedSchemaPattern = /^doorstar_m2b_oidc_transaction_[a-z0-9_]+$/;
const postgresProtocols = new Set(["postgres:", "postgresql:"]);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export interface IdentityAuthorityOidcTransactionMigrationProofTarget {
  readonly databaseUrl: string;
  readonly databaseName: string;
}

/**
 * Keeps the new M2B migration proof separate from the earlier M1B approval.
 * It never reads normal application/test database variables and refuses the
 * persistent local Docker port before a schema can be selected.
 */
export function assertIdentityAuthorityOidcTransactionMigrationProofTarget(input: {
  readonly approval?: string;
  readonly databaseUrl?: string;
}): IdentityAuthorityOidcTransactionMigrationProofTarget {
  if (input.approval !== IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_APPROVAL) {
    throw new Error("Explicit disposable PostgreSQL approval is required for the M2B OIDC transaction migration proof");
  }
  if (!input.databaseUrl) {
    throw new Error("DOORSTAR_M2B_OIDC_TRANSACTION_MIGRATION_TEST_URL is required for the M2B migration proof");
  }

  let parsed: URL;
  try {
    parsed = new URL(input.databaseUrl);
  } catch {
    throw new Error("DOORSTAR_M2B_OIDC_TRANSACTION_MIGRATION_TEST_URL must be a valid PostgreSQL URL");
  }
  if (!postgresProtocols.has(parsed.protocol)) {
    throw new Error("The M2B migration proof requires a PostgreSQL URL");
  }
  if (!loopbackHosts.has(parsed.hostname)) {
    throw new Error("The M2B migration proof is allowed only on a loopback database host");
  }
  if (parsed.port === "5462") {
    throw new Error("The M2B migration proof refuses persistent Docker port 5462");
  }
  if (parsed.searchParams.has("schema")) {
    throw new Error("DOORSTAR_M2B_OIDC_TRANSACTION_MIGRATION_TEST_URL must not select a schema; the proof creates its own generated schema");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (databaseName !== IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_DATABASE) {
    throw new Error(
      `The M2B migration proof refuses database '${databaseName || "(missing)"}'; only '${IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_DATABASE}' is allowed`,
    );
  }
  return Object.freeze({ databaseUrl: parsed.toString(), databaseName });
}

/** Appends only a generated, isolated schema after the base target is guarded. */
export function createIdentityAuthorityOidcTransactionMigrationSchemaUrl(
  target: IdentityAuthorityOidcTransactionMigrationProofTarget,
  schema: string,
): string {
  if (!generatedSchemaPattern.test(schema)) {
    throw new Error("Refusing a non-generated M2B OIDC transaction migration proof schema");
  }
  const databaseUrl = new URL(target.databaseUrl);
  databaseUrl.searchParams.set("schema", schema);
  return databaseUrl.toString();
}
