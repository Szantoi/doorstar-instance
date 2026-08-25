import { describe, expect, it } from "vitest";
import {
  assertIdentityAuthorityMigrationProofTarget,
  createIdentityAuthorityMigrationSchemaUrl,
  IDENTITY_AUTHORITY_MIGRATION_PROOF_APPROVAL,
  IDENTITY_AUTHORITY_MIGRATION_PROOF_DATABASE,
} from "../scripts/identityAuthorityMigrationProofTarget.js";

const approvedInput = {
  approval: IDENTITY_AUTHORITY_MIGRATION_PROOF_APPROVAL,
  databaseUrl: `postgresql://migration@127.0.0.1:5544/${IDENTITY_AUTHORITY_MIGRATION_PROOF_DATABASE}`,
};

describe("identity-authority M1B migration proof target", () => {
  it("accepts only the explicitly approved, dedicated loopback database", () => {
    const target = assertIdentityAuthorityMigrationProofTarget(approvedInput);

    expect(target.databaseName).toBe(IDENTITY_AUTHORITY_MIGRATION_PROOF_DATABASE);
    expect(createIdentityAuthorityMigrationSchemaUrl(target, "doorstar_m1b_migration_42_abcdef")).toContain(
      "schema=doorstar_m1b_migration_42_abcdef",
    );
  });

  it.each([
    ["missing approval", { ...approvedInput, approval: undefined }, "Explicit disposable PostgreSQL approval"],
    ["wrong database", { ...approvedInput, databaseUrl: "postgresql://migration@localhost:5544/doorstar_production" }, "only 'doorstar_m1b_migration_test'"],
    ["remote host", { ...approvedInput, databaseUrl: `postgresql://migration@db.example.test:5544/${IDENTITY_AUTHORITY_MIGRATION_PROOF_DATABASE}` }, "loopback"],
    ["persistent Docker port", { ...approvedInput, databaseUrl: `postgresql://migration@localhost:5462/${IDENTITY_AUTHORITY_MIGRATION_PROOF_DATABASE}` }, "port 5462"],
    ["preselected schema", { ...approvedInput, databaseUrl: `postgresql://migration@localhost:5544/${IDENTITY_AUTHORITY_MIGRATION_PROOF_DATABASE}?schema=public` }, "must not select a schema"],
    ["non-PostgreSQL URL", { ...approvedInput, databaseUrl: `mysql://migration@localhost:5544/${IDENTITY_AUTHORITY_MIGRATION_PROOF_DATABASE}` }, "PostgreSQL"],
  ])("rejects %s", (_name, input, message) => {
    expect(() => assertIdentityAuthorityMigrationProofTarget(input)).toThrow(message);
  });

  it("refuses a caller-selected cleanup schema", () => {
    const target = assertIdentityAuthorityMigrationProofTarget(approvedInput);
    expect(() => createIdentityAuthorityMigrationSchemaUrl(target, "public")).toThrow("non-generated");
  });
});
