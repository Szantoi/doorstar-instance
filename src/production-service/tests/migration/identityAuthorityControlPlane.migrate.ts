import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertIdentityAuthorityMigrationProofTarget,
  createIdentityAuthorityMigrationSchemaUrl,
} from "../../scripts/identityAuthorityMigrationProofTarget.js";

const migrationName = "20260825150000_identity_authority_control_plane";
const generatedSchemaPattern = /^doorstar_m1b_migration_[a-z0-9_]+$/;
const target = assertIdentityAuthorityMigrationProofTarget({
  approval: process.env.DOORSTAR_M1B_MIGRATION_PROOF,
  databaseUrl: process.env.DOORSTAR_M1B_MIGRATION_TEST_URL,
});

function copyMigration(source: string, destination: string, name: string): void {
  cpSync(join(source, name), join(destination, name), { recursive: true });
}

function deployMigrations(schemaPath: string, databaseUrl: string): void {
  execFileSync(
    process.execPath,
    [
      resolve(process.cwd(), "node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
      "--schema",
      schemaPath,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    },
  );
}

function expectGeneratedSchema(schema: string): void {
  if (!generatedSchemaPattern.test(schema)) {
    throw new Error("Refusing to clean a non-generated M1B migration proof schema");
  }
}

async function execute(
  prisma: PrismaClient | Prisma.TransactionClient,
  statement: string,
  ...values: unknown[]
): Promise<void> {
  await prisma.$executeRawUnsafe(statement, ...values);
}

async function expectDatabaseFailure(
  operation: () => Promise<unknown>,
  marker?: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (marker) expect(String(error)).toContain(marker);
    return;
  }
  throw new Error(`Expected database operation to fail${marker ? ` with ${marker}` : ""}`);
}

async function insertBinding(prisma: PrismaClient): Promise<void> {
  await execute(
    prisma,
    `INSERT INTO "DoorstarInstanceTenantBinding" ("id", "tenantId", "createdAt")
     VALUES ($1, $2::uuid, TIMESTAMPTZ '1970-01-01T00:00:00.000000Z')`,
    "binding-m1b",
    "40000000-0000-0000-0000-000000000004",
  );
}

async function insertEvidence(
  prisma: PrismaClient | Prisma.TransactionClient,
  id: string,
  overrides: Partial<{
    tokenExpiresAtWire: string;
    tokenExpiresAtNanoseconds: number;
    tokenExpiresAtEpochSeconds: bigint;
    tenantId: string;
    bindingVersion: bigint;
  }> = {},
): Promise<void> {
  await execute(
    prisma,
    `INSERT INTO "IdentityAuthorityEvidence" (
      "id", "tenantBindingId", "tenantId", "bindingVersion", "subject", "schemaVersion",
      "membershipVersion", "projectionVersion", "enabledModules", "permissions",
      "acceptTokensIssuedAtOrAfterWire", "acceptTokensIssuedAtOrAfterEpochSeconds", "acceptTokensIssuedAtOrAfterNanoseconds",
      "tokenIssuedAtWire", "tokenIssuedAtEpochSeconds", "tokenIssuedAtNanoseconds",
      "tokenExpiresAtWire", "tokenExpiresAtEpochSeconds", "tokenExpiresAtNanoseconds",
      "stateMacKeyVersion", "stateMac", "correlationId", "createdAt"
    ) VALUES (
      $1, 'binding-m1b', $2::uuid, $3, 'oidc|doorstar-worker-001', 'spaceos.online-identity-authority/v1',
      3, 4, '["joinerytech.door"]'::jsonb, '["joinerytech.door.edit"]'::jsonb,
      '1970-01-01T00:01:40.000000000Z', 100, 0,
      '1970-01-01T00:01:41.000000001Z', 101, 1,
      $4, $5, $6,
      1, decode(repeat('aa', 32), 'hex'), '10000000-0000-0000-0000-000000000001'::uuid,
      TIMESTAMPTZ '1970-01-01T00:00:00.000000Z'
    )`,
    id,
    overrides.tenantId ?? "40000000-0000-0000-0000-000000000004",
    overrides.bindingVersion ?? 1n,
    overrides.tokenExpiresAtWire ?? "1970-01-01T00:03:20.000000000Z",
    overrides.tokenExpiresAtEpochSeconds ?? 200n,
    overrides.tokenExpiresAtNanoseconds ?? 0,
  );
}

async function insertSession(
  prisma: PrismaClient | Prisma.TransactionClient,
  id: string,
  overrides: Partial<{
    selector: string;
    verifierHex: string;
    csrfHex: string;
    stateHex: string;
    capability: "view" | "edit" | "admin";
    subject: string;
    bindingVersion: bigint;
    issuedAtWire: string;
    issuedAtEpochSeconds: bigint;
    issuedAtNanoseconds: number;
    expiresAtWire: string;
    expiresAtEpochSeconds: bigint;
    expiresAtNanoseconds: number;
  }> = {},
): Promise<void> {
  await execute(
    prisma,
    `INSERT INTO "DoorstarSession" (
      "id", "sessionSelector", "verifierMacKeyVersion", "verifierMac",
      "csrfMacKeyVersion", "csrfMac", "stateMacKeyVersion", "stateMac",
      "tenantBindingId", "evidenceId", "subject", "capability", "bindingVersion",
      "issuedAtWire", "issuedAtEpochSeconds", "issuedAtNanoseconds",
      "expiresAtWire", "expiresAtEpochSeconds", "expiresAtNanoseconds", "createdAt"
    ) VALUES (
      $1, $2, 1, decode($3, 'hex'), 1, decode($4, 'hex'), 1, decode($5, 'hex'),
      'binding-m1b', 'evidence-m1b', $6, $7::"DoorstarSessionCapability", $8,
      $9, $10, $11,
      $12, $13, $14, TIMESTAMPTZ '1970-01-01T00:00:00.000000Z'
    )`,
    id,
    overrides.selector ?? `selector-${id.padEnd(12, "0")}`,
    overrides.verifierHex ?? "bb".repeat(32),
    overrides.csrfHex ?? "cc".repeat(32),
    overrides.stateHex ?? "dd".repeat(32),
    overrides.subject ?? "oidc|doorstar-worker-001",
    overrides.capability ?? "edit",
    overrides.bindingVersion ?? 1n,
    overrides.issuedAtWire ?? "1970-01-01T00:01:42.000000000Z",
    overrides.issuedAtEpochSeconds ?? 102n,
    overrides.issuedAtNanoseconds ?? 0,
    overrides.expiresAtWire ?? "1970-01-01T00:02:30.000000000Z",
    overrides.expiresAtEpochSeconds ?? 150n,
    overrides.expiresAtNanoseconds ?? 0,
  );
}

describe("Doorstar M1B identity-authority control-plane migration", () => {
  it("proves the forward-only control-plane constraints on an approved disposable schema", async () => {
    const schema = `doorstar_m1b_migration_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    expectGeneratedSchema(schema);
    const databaseUrl = createIdentityAuthorityMigrationSchemaUrl(target, schema);
    const tempPrismaDir = mkdtempSync(join(tmpdir(), "doorstar-m1b-migration-"));
    const migrationsSource = resolve(process.cwd(), "prisma/migrations");
    const migrationsTarget = join(tempPrismaDir, "migrations");
    const schemaPath = join(tempPrismaDir, "schema.prisma");
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    try {
      mkdirSync(migrationsTarget);
      cpSync(resolve(process.cwd(), "prisma/schema.prisma"), schemaPath);
      cpSync(join(migrationsSource, "migration_lock.toml"), join(migrationsTarget, "migration_lock.toml"));
      const legacyMigrationNames = readdirSync(migrationsSource, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name < migrationName)
        .map((entry) => entry.name)
        .sort();
      for (const name of legacyMigrationNames) copyMigration(migrationsSource, migrationsTarget, name);

      deployMigrations(schemaPath, databaseUrl);
      const beforeTables = await prisma.$queryRawUnsafe<Array<{ tableName: string }>>(
        `SELECT table_name AS "tableName"
         FROM information_schema.tables
         WHERE table_schema = current_schema()
           AND table_name IN ('DoorstarInstanceTenantBinding', 'IdentityAuthorityEvidence', 'DoorstarSession')`,
      );
      expect(beforeTables).toEqual([]);

      copyMigration(migrationsSource, migrationsTarget, migrationName);
      deployMigrations(schemaPath, databaseUrl);
      const deployed = await prisma.$queryRawUnsafe<Array<{ migrationName: string }>>(
        `SELECT migration_name AS "migrationName"
         FROM "_prisma_migrations"
         WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
        migrationName,
      );
      expect(deployed).toEqual([{ migrationName }]);

      // A CREATE-capable schema principal must not shadow pg_catalog builtins
      // used by the lifecycle functions. The trigger-owned audit values below
      // must remain database time, not this deliberately hostile local function.
      await execute(
        prisma,
        `CREATE FUNCTION "${schema}".clock_timestamp()
         RETURNS TIMESTAMPTZ
         LANGUAGE sql
         IMMUTABLE
         AS $$ SELECT TIMESTAMPTZ '1970-01-01T00:00:00.000000Z' $$`,
      );
      await insertBinding(prisma);
      await expectDatabaseFailure(
        () => execute(prisma, `INSERT INTO "DoorstarInstanceTenantBinding" ("id", "tenantId") VALUES ('binding-second', '50000000-0000-0000-0000-000000000005'::uuid)`),
      );
      await expectDatabaseFailure(
        () => execute(prisma, `UPDATE "DoorstarInstanceTenantBinding" SET "tenantId" = '50000000-0000-0000-0000-000000000005'::uuid WHERE "id" = 'binding-m1b'`),
        "DS_M1B_BINDING_IDENTITY_IMMUTABLE",
      );
      await expectDatabaseFailure(
        () => execute(prisma, `UPDATE "DoorstarInstanceTenantBinding" SET "id" = 'binding-forged' WHERE "id" = 'binding-m1b'`),
        "DS_M1B_BINDING_IDENTITY_IMMUTABLE",
      );
      await expectDatabaseFailure(
        () => execute(prisma, `UPDATE "DoorstarInstanceTenantBinding" SET "bindingVersion" = 2 WHERE "id" = 'binding-m1b'`),
        "DS_M1B_BINDING_TRANSITION_INVALID",
      );

      await insertEvidence(prisma, "evidence-m1b");
      await expectDatabaseFailure(
        () => insertEvidence(prisma, "evidence-invalid-nanos", { tokenExpiresAtNanoseconds: 1_000_000_000 }),
      );
      await expectDatabaseFailure(
        () => insertEvidence(prisma, "evidence-invalid-wire", {
          tokenExpiresAtWire: "1970-01-01T00:03:20.000000001Z",
        }),
      );
      await expectDatabaseFailure(
        () => execute(prisma, `UPDATE "IdentityAuthorityEvidence" SET "subject" = 'oidc|forged' WHERE "id" = 'evidence-m1b'`),
        "DS_M1B_EVIDENCE_APPEND_ONLY",
      );
      await expectDatabaseFailure(
        () => execute(prisma, `DELETE FROM "IdentityAuthorityEvidence" WHERE "id" = 'evidence-m1b'`),
        "DS_M1B_EVIDENCE_APPEND_ONLY",
      );

      await insertSession(prisma, "session-active");
      const databaseOwnedAuditTimes = await prisma.$queryRawUnsafe<Array<{
        source: string;
        wasOverwritten: boolean;
      }>>(
        `SELECT 'binding'::text AS "source", "createdAt" <> TIMESTAMPTZ '1970-01-01T00:00:00.000000Z' AS "wasOverwritten"
           FROM "DoorstarInstanceTenantBinding"
         UNION ALL
         SELECT 'evidence'::text AS "source", "createdAt" <> TIMESTAMPTZ '1970-01-01T00:00:00.000000Z' AS "wasOverwritten"
           FROM "IdentityAuthorityEvidence"
         UNION ALL
         SELECT 'session'::text AS "source", "createdAt" <> TIMESTAMPTZ '1970-01-01T00:00:00.000000Z' AS "wasOverwritten"
           FROM "DoorstarSession"
         ORDER BY "source"`,
      );
      expect(databaseOwnedAuditTimes).toEqual([
        { source: "binding", wasOverwritten: true },
        { source: "evidence", wasOverwritten: true },
        { source: "session", wasOverwritten: true },
      ]);
      await execute(prisma, `DROP FUNCTION "${schema}".clock_timestamp()`);
      await expectDatabaseFailure(
        () => insertSession(prisma, "session-invalid-expiry", {
          verifierHex: "ee".repeat(32),
          expiresAtWire: "1970-01-01T00:01:42.000000000Z",
          expiresAtEpochSeconds: 102n,
        }),
      );
      await expectDatabaseFailure(
        () => insertSession(prisma, "session-duplicate-verifier", { selector: "selector-duplicate-000", csrfHex: "ef".repeat(32), stateHex: "f0".repeat(32) }),
      );
      await expectDatabaseFailure(
        () => insertSession(prisma, "session-forged-capability", { selector: "selector-forged-cap-00", verifierHex: "f1".repeat(32), csrfHex: "f2".repeat(32), stateHex: "f3".repeat(32), capability: "admin" }),
        "DS_M1B_SESSION_EVIDENCE_INVALID",
      );

      await execute(prisma, `UPDATE "DoorstarSession" SET "lastValidatedAt" = clock_timestamp() WHERE "id" = 'session-active'`);
      await expectDatabaseFailure(
        () => execute(prisma, `UPDATE "DoorstarSession" SET "lastValidatedAt" = "lastValidatedAt" - interval '1 microsecond' WHERE "id" = 'session-active'`),
        "DS_M1B_SESSION_VALIDATION_NOT_MONOTONIC",
      );
      await expectDatabaseFailure(
        () => execute(prisma, `UPDATE "DoorstarSession" SET "capability" = 'view'::"DoorstarSessionCapability" WHERE "id" = 'session-active'`),
        "DS_M1B_SESSION_IMMUTABLE",
      );
      await expectDatabaseFailure(
        () => execute(prisma, `UPDATE "DoorstarSession"
          SET "revokedAt" = "createdAt" - interval '1 microsecond', "revokeReason" = 'invalid_audit_time'
          WHERE "id" = 'session-active'`),
      );

      await execute(prisma, `UPDATE "DoorstarSession" SET "revokedAt" = clock_timestamp(), "revokeReason" = 'manual_revoke' WHERE "id" = 'session-active'`);
      await expectDatabaseFailure(
        () => execute(prisma, `UPDATE "DoorstarSession" SET "revokedAt" = NULL, "revokeReason" = NULL WHERE "id" = 'session-active'`),
        "DS_M1B_SESSION_REVOKED_IMMUTABLE",
      );
      await expectDatabaseFailure(
        () => execute(prisma, `UPDATE "DoorstarSession" SET "revokeReason" = 'rewritten' WHERE "id" = 'session-active'`),
        "DS_M1B_SESSION_REVOKED_IMMUTABLE",
      );

      // The lifecycle function must use its migration schema before pg_temp.
      // An empty same-named temp table would make this insert fail if a
      // caller-controlled search_path could shadow the permanent binding.
      await prisma.$transaction(async (transaction) => {
        await execute(
          transaction,
          `CREATE TEMPORARY TABLE "DoorstarInstanceTenantBinding" (
            "id" TEXT NOT NULL,
            "tenantId" UUID NOT NULL,
            "status" "DoorstarTenantBindingStatus" NOT NULL,
            "bindingVersion" BIGINT NOT NULL
          ) ON COMMIT DROP`,
        );
        await insertSession(transaction, "session-search-path", {
          selector: "selector-search-path-0",
          verifierHex: "f7".repeat(32),
          csrfHex: "f8".repeat(32),
          stateHex: "f9".repeat(32),
        });
        await execute(
          transaction,
          `UPDATE "DoorstarSession"
             SET "revokedAt" = clock_timestamp(), "revokeReason" = 'search_path_probe'
           WHERE "id" = 'session-search-path'`,
        );
      });

      await insertSession(prisma, "session-to-disable", {
        selector: "selector-to-disable-0",
        verifierHex: "f4".repeat(32),
        csrfHex: "f5".repeat(32),
        stateHex: "f6".repeat(32),
      });
      const rollbackSentinel = new Error("m1b-binding-disable-rollback");
      try {
        await prisma.$transaction(async (transaction) => {
          await execute(transaction, `UPDATE "DoorstarInstanceTenantBinding"
            SET "status" = 'DISABLED', "bindingVersion" = 2,
                "disabledAt" = clock_timestamp(), "disabledReason" = 'trial disabled'
            WHERE "id" = 'binding-m1b'`);
          const revokedInsideTransaction = await transaction.$queryRawUnsafe<Array<{ count: bigint }>>(
            `SELECT count(*)::bigint AS "count" FROM "DoorstarSession" WHERE "revokedAt" IS NOT NULL`,
          );
          expect(revokedInsideTransaction[0]?.count).toBe(3n);
          throw rollbackSentinel;
        });
        throw new Error("Expected the binding-disable rollback sentinel");
      } catch (error) {
        if (error !== rollbackSentinel) throw error;
      }
      const activeAfterRollback = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*)::bigint AS "count" FROM "DoorstarSession" WHERE "revokedAt" IS NULL`,
      );
      expect(activeAfterRollback[0]?.count).toBe(1n);

      await execute(prisma, `UPDATE "DoorstarInstanceTenantBinding"
        SET "status" = 'DISABLED', "bindingVersion" = 2,
            "disabledAt" = clock_timestamp(), "disabledReason" = 'trial disabled'
        WHERE "id" = 'binding-m1b'`);
      const binding = await prisma.$queryRawUnsafe<Array<{ status: string; bindingVersion: bigint; disabledAt: Date | null }>>(
        `SELECT "status"::text AS "status", "bindingVersion", "disabledAt"
         FROM "DoorstarInstanceTenantBinding" WHERE "id" = 'binding-m1b'`,
      );
      expect(binding).toEqual([expect.objectContaining({ status: "DISABLED", bindingVersion: 2n, disabledAt: expect.any(Date) })]);
      const disabledSessions = await prisma.$queryRawUnsafe<Array<{ id: string; revokeReason: string | null }>>(
        `SELECT "id", "revokeReason" FROM "DoorstarSession" ORDER BY "id"`,
      );
      expect(disabledSessions).toContainEqual({ id: "session-to-disable", revokeReason: "binding_disabled" });
      expect(disabledSessions).toContainEqual({ id: "session-active", revokeReason: "manual_revoke" });
      expect(disabledSessions).toContainEqual({ id: "session-search-path", revokeReason: "search_path_probe" });
      expect(disabledSessions).toHaveLength(3);
      await expectDatabaseFailure(
        () => execute(prisma, `UPDATE "DoorstarInstanceTenantBinding" SET "status" = 'ACTIVE' WHERE "id" = 'binding-m1b'`),
        "DS_M1B_BINDING_TRANSITION_INVALID",
      );
      await expectDatabaseFailure(
        () => execute(prisma, `DELETE FROM "DoorstarInstanceTenantBinding" WHERE "id" = 'binding-m1b'`),
        "DS_M1B_BINDING_DELETE_FORBIDDEN",
      );
      await expectDatabaseFailure(
        () => execute(prisma, `INSERT INTO "DoorstarInstanceTenantBinding" ("id", "tenantId") VALUES ('binding-after-disable', '50000000-0000-0000-0000-000000000005'::uuid)`),
      );
      await expectDatabaseFailure(
        () => execute(prisma, `TRUNCATE "DoorstarSession"`),
        "DS_M1B_CONTROL_PLANE_TRUNCATE_FORBIDDEN",
      );
      await expectDatabaseFailure(
        () => execute(prisma, `TRUNCATE "DoorstarInstanceTenantBinding" CASCADE`),
        "DS_M1B_CONTROL_PLANE_TRUNCATE_FORBIDDEN",
      );

      const constraints = await prisma.$queryRawUnsafe<Array<{ definition: string }>>(
        `SELECT pg_get_constraintdef(constraint.oid) AS "definition"
         FROM pg_constraint AS constraint
         INNER JOIN pg_class AS relation ON relation.oid = constraint.conrelid
         INNER JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
         WHERE relation.relname = 'DoorstarSession'
           AND namespace.nspname = pg_catalog.current_schema()
           AND constraint.conname = 'DoorstarSession_evidenceId_tenantBindingId_fkey'`,
      );
      expect(constraints[0]?.definition).toContain('FOREIGN KEY ("evidenceId", "tenantBindingId")');
      expect(constraints[0]?.definition).toContain('ON DELETE RESTRICT');
      const singletonIndexes = await prisma.$queryRawUnsafe<Array<{ definition: string }>>(
        `SELECT pg_get_indexdef(index_relation.oid) AS "definition"
         FROM pg_class AS table_relation
         INNER JOIN pg_index AS index_data ON index_data.indrelid = table_relation.oid
         INNER JOIN pg_class AS index_relation ON index_relation.oid = index_data.indexrelid
         INNER JOIN pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
         WHERE table_relation.relname = 'DoorstarInstanceTenantBinding'
           AND namespace.nspname = pg_catalog.current_schema()
           AND index_relation.relnamespace = namespace.oid
           AND index_relation.relname = 'DoorstarInstanceTenantBinding_instance_singleton_key'`,
      );
      expect(singletonIndexes[0]?.definition).toContain('((1))');
      const controlPlaneTriggers = await prisma.$queryRawUnsafe<Array<{
        tableName: string;
        triggerName: string;
        enabled: string;
      }>>(
        `SELECT relation.relname AS "tableName", trigger.tgname AS "triggerName", trigger.tgenabled AS "enabled"
         FROM pg_trigger AS trigger
         INNER JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
         INNER JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = pg_catalog.current_schema()
           AND trigger.tgname IN (
             'DoorstarBinding_lifecycle_guard',
             'DoorstarBinding_truncate_guard',
             'DoorstarEvidence_lifecycle_guard',
             'DoorstarEvidence_truncate_guard',
             'DoorstarSession_lifecycle_guard',
             'DoorstarSession_truncate_guard'
           )
         ORDER BY trigger.tgname`,
      );
      expect(controlPlaneTriggers).toEqual([
        { tableName: "DoorstarInstanceTenantBinding", triggerName: "DoorstarBinding_lifecycle_guard", enabled: "A" },
        { tableName: "DoorstarInstanceTenantBinding", triggerName: "DoorstarBinding_truncate_guard", enabled: "A" },
        { tableName: "IdentityAuthorityEvidence", triggerName: "DoorstarEvidence_lifecycle_guard", enabled: "A" },
        { tableName: "IdentityAuthorityEvidence", triggerName: "DoorstarEvidence_truncate_guard", enabled: "A" },
        { tableName: "DoorstarSession", triggerName: "DoorstarSession_lifecycle_guard", enabled: "A" },
        { tableName: "DoorstarSession", triggerName: "DoorstarSession_truncate_guard", enabled: "A" },
      ]);
    } finally {
      try {
        expectGeneratedSchema(schema);
        await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await prisma.$disconnect();
        rmSync(tempPrismaDir, { recursive: true, force: true });
      }
    }
  });
});
