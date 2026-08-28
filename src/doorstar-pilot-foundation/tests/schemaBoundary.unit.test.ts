import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const schemaPath = fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url));
const migrationPath = fileURLToPath(new URL("../prisma/migrations/20260827000000_pilot_foundation/migration.sql", import.meta.url));
const boundaryVerifierPath = fileURLToPath(new URL("../scripts/verifyFoundationBoundary.ts", import.meta.url));

describe("isolated pilot foundation schema", () => {
  it("contains only the F-phase identity/session/audit models", async () => {
    const schema = await readFile(schemaPath, "utf8");
    for (const model of ["PilotScope", "AuthorizationTransaction", "PrincipalBinding", "OpaqueSession", "BindingAudit"]) {
      expect(schema).toContain(`model ${model}`);
    }
    expect(schema).toContain("actorKey");
    for (const forbiddenModel of ["Project", "Order", "Task", "Station", "Plant", "Flow", "Calculation"]) {
      expect(schema).not.toContain(`model ${forbiddenModel}`);
    }
  });

  it("keeps raw external identity and browser authority out of the initial lineage", async () => {
    const migration = (await readFile(migrationPath, "utf8")).toLowerCase();
    expect(migration).not.toContain("email");
    expect(migration).not.toContain("password");
    expect(migration).not.toContain("x-role");
    expect(migration).not.toContain("x-station");
    expect(migration).toContain("pilotscope_immutable");
    expect(migration).toContain("bindingaudit_append_only");
  });

  it("locks the full F-package executable boundary", async () => {
    const verifier = await readFile(boundaryVerifierPath, "utf8");
    expect(verifier).toContain("allowedPackageFiles");
    expect(verifier).toContain("expectedBuiltFiles");
    expect(verifier).toContain("expectedInitialMigrationSha256");
    expect(verifier).toContain("expectedAPolicyMigrationSha256");
    expect(verifier).toContain("expectedAdminRosterMigrationSha256");
    expect(verifier).toContain("20260828140000_pilot_admin_roster");
    expect(verifier).toContain("listPackageFiles");
    expect(verifier).toContain("forbiddenExecutablePatterns");
    expect(verifier).toContain("verifyStaticImports");
    expect(verifier).toContain("assertBoundaryRejectsRepresentativeBypasses");
    expect(verifier).toContain("scripts/validatePrismaSchema.mjs");
    expect(verifier).toContain("packageManifest.bin !== undefined");
    expect(verifier).toContain("packageManifest.exports !== undefined");
  });

  it("adds the direct-admin initial audit action without adding a new data model", async () => {
    const schema = await readFile(schemaPath, "utf8");
    expect(schema).toContain("DIRECT_ADMIN_PROVISION");
    expect(schema).not.toContain("email");
    expect(schema).not.toContain("password");
  });
});
