import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

const migrationName = "20260731120000_order_position_evidence_audit_hash_v3";
const migrationSchemaPattern = /^doorstar_test_migration_[a-z0-9_]+$/;

function migrationDatabaseUrl(schema: string) {
  if (!migrationSchemaPattern.test(schema)) {
    throw new Error("Refusing to use a non-generated migration-test schema");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function copyMigration(source: string, target: string, name: string) {
  cpSync(join(source, name), join(target, name), { recursive: true });
}

function deploy(schemaPath: string, databaseUrl: string) {
  execFileSync(
    process.execPath,
    [resolve(process.cwd(), "node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", schemaPath],
    { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" },
  );
}

async function insertLegacyFixture(
  prisma: PrismaClient,
  key: string,
  revisionStatus: "DRAFT" | "REVIEW" | "APPROVED",
  evidenceState: "UNVERIFIED" | "REVIEW" | "RESOLVED" | "REJECTED",
  resolution: string | null,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Project" ("id", "key", "name", "updatedAt")
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    `project-${key}`, `POSITION-MIGRATION-${key}`, `Fixture ${key}`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ProductionOrder" ("id", "projectId", "updatedAt")
     VALUES ($1, $2, CURRENT_TIMESTAMP)`,
    `order-${key}`, `project-${key}`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrderRevision"
       ("id", "orderId", "revision", "status", "customerName", "updatedAt")
     VALUES ($1, $2, 1, $3::"OrderRevisionStatus", $4, CURRENT_TIMESTAMP)`,
    `revision-${key}`, `order-${key}`, revisionStatus, `Customer ${key}`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrderPosition"
       ("id", "orderRevisionId", "position", "code", "name", "quantity")
     VALUES ($1, $2, 0, '01', 'Ajtó', 1)`,
    `position-${key}`, `revision-${key}`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrderPositionEvidence"
       ("id", "orderPositionId", "sourceRoot", "relativePath", "field",
        "rawValue", "normalizedValue", "reviewState", "resolution", "createdByRole", "updatedAt")
     VALUES ($1, $2, 'LEGACY_2026', 'legacy/order.pdf', 'OPENING_WIDTH_MM',
       '900 mm', '900'::jsonb, $3::"EvidenceReviewState", $4,
       'legacy_import', CURRENT_TIMESTAMP)`,
    `evidence-${key}`, `position-${key}`, evidenceState, resolution,
  );
}

describe("order-position evidence audit migration", () => {
  it("quarantines every unaudited legacy final row without rewriting approved history or losing source data", async () => {
    const schema = `doorstar_test_migration_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const databaseUrl = migrationDatabaseUrl(schema);
    const tempDir = mkdtempSync(join(tmpdir(), "doorstar-position-evidence-migration-"));
    const migrationsSource = resolve(process.cwd(), "prisma/migrations");
    const migrationsTarget = join(tempDir, "migrations");
    const schemaPath = join(tempDir, "schema.prisma");
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    try {
      mkdirSync(migrationsTarget);
      cpSync(resolve(process.cwd(), "prisma/schema.prisma"), schemaPath);
      cpSync(join(migrationsSource, "migration_lock.toml"), join(migrationsTarget, "migration_lock.toml"));
      const legacyMigrations = readdirSync(migrationsSource, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name < migrationName)
        .map((entry) => entry.name)
        .sort();
      for (const name of legacyMigrations) copyMigration(migrationsSource, migrationsTarget, name);
      deploy(schemaPath, databaseUrl);

      const prematureColumns = await prisma.$queryRawUnsafe<Array<{ columnName: string }>>(
        `SELECT column_name AS "columnName"
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'OrderPositionEvidence'
           AND column_name IN ('reviewedByPrincipal', 'reviewedByRole', 'reviewedAt')`,
      );
      expect(prematureColumns).toEqual([]);

      await insertLegacyFixture(prisma, "draft-resolved", "DRAFT", "RESOLVED", "Legacy resolved note");
      await insertLegacyFixture(prisma, "review-rejected", "REVIEW", "REJECTED", "Legacy rejected note");
      await insertLegacyFixture(prisma, "approved-resolved", "APPROVED", "RESOLVED", "Approved legacy note");
      await insertLegacyFixture(prisma, "draft-open", "DRAFT", "REVIEW", null);

      copyMigration(migrationsSource, migrationsTarget, migrationName);
      deploy(schemaPath, databaseUrl);

      const revisions = Object.fromEntries((await prisma.$queryRawUnsafe<Array<{ id: string; status: string }>>(
        `SELECT "id", "status"::text AS "status" FROM "OrderRevision" ORDER BY "id"`,
      )).map((row) => [row.id, row.status]));
      expect(revisions).toMatchObject({
        "revision-draft-resolved": "DRAFT",
        "revision-review-rejected": "DRAFT",
        "revision-approved-resolved": "APPROVED",
        "revision-draft-open": "DRAFT",
      });

      const evidence = Object.fromEntries((await prisma.$queryRawUnsafe<Array<{
        id: string;
        reviewState: string;
        resolution: string | null;
        rawValue: string;
        reviewedByPrincipal: string | null;
        reviewedByRole: string | null;
        reviewedAt: Date | null;
      }>>(
        `SELECT "id", "reviewState"::text AS "reviewState", "resolution", "rawValue",
                "reviewedByPrincipal", "reviewedByRole", "reviewedAt"
         FROM "OrderPositionEvidence" ORDER BY "id"`,
      )).map((row) => [row.id, row]));
      expect(evidence["evidence-draft-resolved"]).toMatchObject({
        reviewState: "REVIEW",
        resolution: "Legacy resolved note",
        rawValue: "900 mm",
        reviewedByPrincipal: null,
        reviewedByRole: null,
        reviewedAt: null,
      });
      expect(evidence["evidence-review-rejected"]).toMatchObject({
        reviewState: "REVIEW",
        resolution: "Legacy rejected note",
      });
      expect(evidence["evidence-approved-resolved"]).toMatchObject({
        reviewState: "REVIEW",
        resolution: "Approved legacy note",
      });
      expect(evidence["evidence-draft-open"]).toMatchObject({
        reviewState: "REVIEW",
        resolution: null,
      });

      const deployed = await prisma.$queryRawUnsafe<Array<{ migrationName: string }>>(
        `SELECT migration_name AS "migrationName"
         FROM "_prisma_migrations"
         WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
        migrationName,
      );
      expect(deployed).toEqual([{ migrationName }]);
    } finally {
      try {
        await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await prisma.$disconnect();
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }, 60_000);
});
