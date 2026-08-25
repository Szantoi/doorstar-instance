import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertIdentityAuthorityOidcTransactionMigrationProofTarget,
  createIdentityAuthorityOidcTransactionMigrationSchemaUrl,
} from "../../scripts/identityAuthorityOidcTransactionMigrationProofTarget.js";

const migrationName = "20260825160000_identity_authority_oidc_login_transaction";
const generatedSchemaPattern = /^doorstar_m2b_oidc_transaction_[a-z0-9_]+$/;
const target = assertIdentityAuthorityOidcTransactionMigrationProofTarget({
  approval: process.env.DOORSTAR_M2B_OIDC_TRANSACTION_MIGRATION_PROOF,
  databaseUrl: process.env.DOORSTAR_M2B_OIDC_TRANSACTION_MIGRATION_TEST_URL,
});

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
    throw new Error("Refusing to clean a non-generated M2B OIDC transaction migration proof schema");
  }
}

async function execute(
  prisma: PrismaClient | Prisma.TransactionClient,
  statement: string,
  ...values: unknown[]
): Promise<void> {
  await prisma.$executeRawUnsafe(statement, ...values);
}

async function expectDatabaseFailure(operation: () => Promise<unknown>, marker?: string): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (marker) expect(String(error)).toContain(marker);
    return;
  }
  throw new Error(`Expected database operation to fail${marker ? ` with ${marker}` : ""}`);
}

function selector(byte: number): string {
  return Buffer.alloc(32, byte).toString("base64url");
}

async function insertTransaction(
  prisma: PrismaClient | Prisma.TransactionClient,
  id: string,
  byte: number,
  overrides: Partial<{
    selector: string;
    stateMacHex: string;
    profileDigest: string;
    issuedAtWire: string;
    issuedAtEpochSeconds: bigint;
    issuedAtNanoseconds: number;
    expiresAtWire: string;
    expiresAtEpochSeconds: bigint;
    expiresAtNanoseconds: number;
    consumedAt: string | null;
  }> = {},
): Promise<void> {
  await execute(
    prisma,
    `INSERT INTO "DoorstarOidcLoginTransaction" (
      "id", "selector", "keyVersion", "stateMacKeyVersion", "stateMac",
      "issuer", "clientId", "redirectUri", "profileDigest",
      "issuedAtWire", "issuedAtEpochSeconds", "issuedAtNanoseconds",
      "expiresAtWire", "expiresAtEpochSeconds", "expiresAtNanoseconds", "consumedAt", "createdAt"
    ) VALUES (
      $1, $2, 1, 1, decode($3, 'hex'),
      'https://identity.example.test/realms/doorstar', 'doorstar-bff', 'https://doorstar.example.test/auth/callback',
      $4,
      $5, $6, $7, $8, $9, $10, $11::timestamptz,
      TIMESTAMPTZ '1970-01-01T00:00:00.000000Z'
    )`,
    id,
    overrides.selector ?? selector(byte),
    overrides.stateMacHex ?? "aa".repeat(32),
    overrides.profileDigest ?? "BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ",
    overrides.issuedAtWire ?? "1970-01-01T00:01:40.000000000Z",
    overrides.issuedAtEpochSeconds ?? 100n,
    overrides.issuedAtNanoseconds ?? 0,
    overrides.expiresAtWire ?? "1970-01-01T00:06:40.000000000Z",
    overrides.expiresAtEpochSeconds ?? 400n,
    overrides.expiresAtNanoseconds ?? 0,
    overrides.consumedAt ?? null,
  );
}

describe("Doorstar M2B OIDC login transaction migration", () => {
  it("proves one-time, immutable PKCE transaction storage on an approved disposable schema", async () => {
    const schema = `doorstar_m2b_oidc_transaction_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    expectGeneratedSchema(schema);
    const databaseUrl = createIdentityAuthorityOidcTransactionMigrationSchemaUrl(target, schema);
    const tempPrismaDir = mkdtempSync(join(tmpdir(), "doorstar-m2b-oidc-migration-"));
    const migrationsSource = resolve(process.cwd(), "prisma/migrations");
    const migrationsTarget = join(tempPrismaDir, "migrations");
    const schemaPath = join(tempPrismaDir, "schema.prisma");
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    try {
      mkdirSync(migrationsTarget);
      cpSync(resolve(process.cwd(), "prisma/schema.prisma"), schemaPath);
      cpSync(join(migrationsSource, "migration_lock.toml"), join(migrationsTarget, "migration_lock.toml"));
      for (const entry of readdirSync(migrationsSource, { withFileTypes: true })) {
        if (entry.isDirectory()) cpSync(join(migrationsSource, entry.name), join(migrationsTarget, entry.name), { recursive: true });
      }
      deployMigrations(schemaPath, databaseUrl);
      const deployed = await prisma.$queryRawUnsafe<Array<{ migrationName: string }>>(
        `SELECT migration_name AS "migrationName" FROM "_prisma_migrations"
         WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
        migrationName,
      );
      expect(deployed).toEqual([{ migrationName }]);

      await insertTransaction(prisma, "oidc-active", 7);
      const createdAudit = await prisma.$queryRawUnsafe<Array<{ wasDatabaseOwned: boolean }>>(
        `SELECT "createdAt" <> TIMESTAMPTZ '1970-01-01T00:00:00.000000Z' AS "wasDatabaseOwned"
           FROM "DoorstarOidcLoginTransaction" WHERE "id" = 'oidc-active'`,
      );
      expect(createdAudit).toEqual([{ wasDatabaseOwned: true }]);
      await expectDatabaseFailure(
        () => insertTransaction(prisma, "oidc-too-short", 8, {
          expiresAtWire: "1970-01-01T00:01:40.500000000Z",
          expiresAtEpochSeconds: 100n,
          expiresAtNanoseconds: 500_000_000,
        }),
      );
      await expectDatabaseFailure(
        () => insertTransaction(prisma, "oidc-too-long", 9, {
          expiresAtWire: "1970-01-01T00:11:41.000000000Z",
          expiresAtEpochSeconds: 701n,
        }),
      );
      await expectDatabaseFailure(
        () => insertTransaction(prisma, "oidc-short-mac", 10, { stateMacHex: "aa".repeat(31) }),
      );
      await expectDatabaseFailure(
        () => insertTransaction(prisma, "oidc-noncanonical-selector", 11, {
          selector: "A".repeat(42) + "B",
        }),
      );
      await expectDatabaseFailure(
        () => insertTransaction(prisma, "oidc-noncanonical-profile", 12, {
          profileDigest: "A".repeat(42) + "B",
        }),
      );
      await expectDatabaseFailure(
        () => insertTransaction(prisma, "oidc-consumed-on-insert", 13, {
          consumedAt: "1970-01-01T00:00:00.000000Z",
        }),
        "DS_M2B_OIDC_TRANSACTION_CONSUMED_ON_INSERT",
      );
      await expectDatabaseFailure(
        () => execute(prisma, `UPDATE "DoorstarOidcLoginTransaction"
          SET "profileDigest" = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'
          WHERE "id" = 'oidc-active'`),
        "DS_M2B_OIDC_TRANSACTION_IMMUTABLE",
      );
      await execute(prisma, `UPDATE "DoorstarOidcLoginTransaction"
        SET "consumedAt" = TIMESTAMPTZ '1970-01-01T00:00:00.000000Z'
        WHERE "id" = 'oidc-active'`);
      const consumedAudit = await prisma.$queryRawUnsafe<Array<{ wasDatabaseOwned: boolean }>>(
        `SELECT "consumedAt" <> TIMESTAMPTZ '1970-01-01T00:00:00.000000Z' AS "wasDatabaseOwned"
           FROM "DoorstarOidcLoginTransaction" WHERE "id" = 'oidc-active'`,
      );
      expect(consumedAudit).toEqual([{ wasDatabaseOwned: true }]);
      await expectDatabaseFailure(
        () => execute(prisma, `UPDATE "DoorstarOidcLoginTransaction"
          SET "consumedAt" = clock_timestamp() WHERE "id" = 'oidc-active'`),
        "DS_M2B_OIDC_TRANSACTION_CONSUMED_IMMUTABLE",
      );
      await expectDatabaseFailure(
        () => execute(prisma, `DELETE FROM "DoorstarOidcLoginTransaction" WHERE "id" = 'oidc-active'`),
        "DS_M2B_OIDC_TRANSACTION_DELETE_FORBIDDEN",
      );

      await insertTransaction(prisma, "oidc-cas", 14);
      const firstClaim = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `UPDATE "DoorstarOidcLoginTransaction"
           SET "consumedAt" = clock_timestamp()
         WHERE "selector" = $1
           AND "stateMacKeyVersion" = 1
           AND "stateMac" = decode(repeat('aa', 32), 'hex')
           AND "profileDigest" = 'BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ'
           AND "consumedAt" IS NULL
           AND ("expiresAtEpochSeconds" > 101 OR ("expiresAtEpochSeconds" = 101 AND "expiresAtNanoseconds" > 0))
         RETURNING "id"`,
        selector(14),
      );
      const secondClaim = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `UPDATE "DoorstarOidcLoginTransaction"
           SET "consumedAt" = clock_timestamp()
         WHERE "selector" = $1
           AND "stateMacKeyVersion" = 1
           AND "stateMac" = decode(repeat('aa', 32), 'hex')
           AND "profileDigest" = 'BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ'
           AND "consumedAt" IS NULL
           AND ("expiresAtEpochSeconds" > 101 OR ("expiresAtEpochSeconds" = 101 AND "expiresAtNanoseconds" > 0))
         RETURNING "id"`,
        selector(14),
      );
      expect(firstClaim).toEqual([{ id: "oidc-cas" }]);
      expect(secondClaim).toEqual([]);
      await expectDatabaseFailure(
        () => execute(prisma, `TRUNCATE "DoorstarOidcLoginTransaction"`),
        "DS_M1B_CONTROL_PLANE_TRUNCATE_FORBIDDEN",
      );

      const triggers = await prisma.$queryRawUnsafe<Array<{ triggerName: string; enabled: string }>>(
        `SELECT trigger.tgname AS "triggerName", trigger.tgenabled AS "enabled"
           FROM pg_trigger AS trigger
           INNER JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
           INNER JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = pg_catalog.current_schema()
            AND relation.relname = 'DoorstarOidcLoginTransaction'
            AND trigger.tgname IN ('DoorstarOidcLoginTransaction_lifecycle_guard', 'DoorstarOidcLoginTransaction_truncate_guard')
          ORDER BY trigger.tgname`,
      );
      expect(triggers).toEqual([
        { triggerName: "DoorstarOidcLoginTransaction_lifecycle_guard", enabled: "A" },
        { triggerName: "DoorstarOidcLoginTransaction_truncate_guard", enabled: "A" },
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
