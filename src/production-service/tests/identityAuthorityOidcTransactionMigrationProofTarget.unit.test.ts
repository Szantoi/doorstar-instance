import { describe, expect, it } from "vitest";
import {
  assertIdentityAuthorityOidcTransactionMigrationProofTarget,
  createIdentityAuthorityOidcTransactionMigrationSchemaUrl,
  IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_APPROVAL,
  IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_DATABASE,
} from "../scripts/identityAuthorityOidcTransactionMigrationProofTarget.js";

const approvedInput = {
  approval: IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_APPROVAL,
  databaseUrl: `postgresql://migration@127.0.0.1:5544/${IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_DATABASE}`,
};

describe("identity-authority M2B OIDC transaction migration proof target", () => {
  it("accepts only the separately approved, dedicated loopback database", () => {
    const target = assertIdentityAuthorityOidcTransactionMigrationProofTarget(approvedInput);
    expect(target.databaseName).toBe(IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_DATABASE);
    expect(createIdentityAuthorityOidcTransactionMigrationSchemaUrl(target, "doorstar_m2b_oidc_transaction_42_abcdef"))
      .toContain("schema=doorstar_m2b_oidc_transaction_42_abcdef");
  });

  it.each([
    ["missing approval", { ...approvedInput, approval: undefined }, "Explicit disposable PostgreSQL approval"],
    ["M1B approval cannot authorize it", { ...approvedInput, approval: "approved-disposable-postgres" }, "Explicit disposable PostgreSQL approval"],
    ["wrong database", { ...approvedInput, databaseUrl: "postgresql://migration@localhost:5544/doorstar_m1b_migration_test" }, "only 'doorstar_m2b_oidc_transaction_migration_test'"],
    ["remote host", { ...approvedInput, databaseUrl: `postgresql://migration@db.example.test:5544/${IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_DATABASE}` }, "loopback"],
    ["persistent Docker port", { ...approvedInput, databaseUrl: `postgresql://migration@localhost:5462/${IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_DATABASE}` }, "port 5462"],
    ["preselected schema", { ...approvedInput, databaseUrl: `postgresql://migration@localhost:5544/${IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_DATABASE}?schema=public` }, "must not select a schema"],
    ["non-PostgreSQL URL", { ...approvedInput, databaseUrl: `mysql://migration@localhost:5544/${IDENTITY_AUTHORITY_OIDC_TRANSACTION_MIGRATION_PROOF_DATABASE}` }, "PostgreSQL"],
  ])("rejects %s", (_name, input, message) => {
    expect(() => assertIdentityAuthorityOidcTransactionMigrationProofTarget(input)).toThrow(message);
  });

  it("refuses a caller-selected cleanup schema", () => {
    const target = assertIdentityAuthorityOidcTransactionMigrationProofTarget(approvedInput);
    expect(() => createIdentityAuthorityOidcTransactionMigrationSchemaUrl(target, "public"))
      .toThrow("non-generated");
  });
});
