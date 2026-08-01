import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

const firstSourceEvidenceMigration = "20260730203000_supplementary_evidence_review";
const sourceEvidenceMigrations = [
  firstSourceEvidenceMigration,
  "20260730210000_source_evidence_hash_v2",
] as const;
const migrationSchemaPattern = /^doorstar_test_migration_[a-z0-9_]+$/;

type RevisionRow = {
  id: string;
  status: string;
};

type SupplementaryItemRow = {
  id: string;
  state: string;
  reviewedByRole: string | null;
  reviewedAt: Date | null;
  reviewResolution: string | null;
};

type SupplementaryEvidenceRow = {
  id: string;
  reviewState: string;
  resolution: string | null;
  createdByRole: string;
  reviewedByRole: string | null;
  reviewedAt: Date | null;
};

type ManufacturedItemRow = {
  id: string;
  state: string;
  resolution: string | null;
  reviewedByRole: string | null;
  reviewedAt: Date | null;
};

type ManufacturedEvidenceRow = {
  id: string;
  reviewState: string;
  resolution: string | null;
  createdByRole: string;
  reviewedByRole: string | null;
  reviewedAt: Date | null;
};

function createMigrationDatabaseUrl(schema: string): string {
  if (!migrationSchemaPattern.test(schema)) {
    throw new Error("Refusing to use a non-generated migration-test schema");
  }
  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error("DATABASE_URL is required for migration tests");

  const databaseUrl = new URL(sourceUrl);
  databaseUrl.searchParams.set("schema", schema);
  return databaseUrl.toString();
}

function copyMigration(
  migrationsSource: string,
  migrationsTarget: string,
  migrationName: string,
): void {
  cpSync(
    join(migrationsSource, migrationName),
    join(migrationsTarget, migrationName),
    { recursive: true },
  );
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

async function insertLegacyRevision(
  prisma: PrismaClient,
  id: string,
  status: "REVIEW" | "APPROVED",
): Promise<void> {
  const projectId = `project-${id}`;
  const orderId = `order-${id}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Project" ("id", "key", "name", "updatedAt")
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    projectId,
    `MIGRATION-${id}`,
    `Migration fixture ${id}`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ProductionOrder" ("id", "projectId", "updatedAt")
     VALUES ($1, $2, CURRENT_TIMESTAMP)`,
    orderId,
    projectId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrderRevision"
       ("id", "orderId", "revision", "status", "customerName", "updatedAt")
     VALUES ($1, $2, 1, $3::"OrderRevisionStatus", $4, CURRENT_TIMESTAMP)`,
    id,
    orderId,
    status,
    `Legacy customer ${id}`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrderRevisionAudit"
       ("id", "orderRevisionId", "action", "actorRole", "contentHash", "note")
     VALUES ($1, $2, $3::"OrderRevisionAuditAction", $4, $5, $6)`,
    `audit-${id}`,
    id,
    status === "APPROVED" ? "APPROVED" : "REVIEW_REQUESTED",
    status === "APPROVED" ? "order_approver" : "technical_preparation",
    `legacy-hash-${id}`,
    "Legacy hash envelope",
  );
}

async function insertLegacySupplementaryItem(
  prisma: PrismaClient,
  input: {
    id: string;
    revisionId: string;
    entryMode: "MANUAL" | "SOURCE_REVIEW";
    state: "REVIEW" | "VERIFIED";
    evidenceReviewState?: "RESOLVED" | "REJECTED";
  },
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrderSupplementaryItem"
       ("id", "orderRevisionId", "entryMode", "state", "category", "name",
        "createdByRole", "reviewedByRole", "reviewedAt", "reviewResolution", "updatedAt")
     VALUES
       ($1, $2, $3::"SupplementaryItemEntryMode", $4::"SupplementaryItemState",
        'OTHER', $5, 'legacy_import',
        CASE WHEN $4 = 'VERIFIED' THEN 'legacy_reviewer' ELSE NULL END,
        CASE WHEN $4 = 'VERIFIED' THEN CURRENT_TIMESTAMP ELSE NULL END,
        CASE WHEN $4 = 'VERIFIED' THEN 'Legacy parent decision' ELSE NULL END,
        CURRENT_TIMESTAMP)`,
    input.id,
    input.revisionId,
    input.entryMode,
    input.state,
    `Legacy supplementary ${input.id}`,
  );

  if (!input.evidenceReviewState) return;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrderSupplementaryItemEvidence"
       ("id", "supplementaryItemId", "sourceRoot", "relativePath", "field",
        "rawValue", "normalizedValue", "reviewState")
     VALUES
       ($1, $2, 'LEGACY_2026', 'legacy/source.xlsx', 'NAME',
        'Legacy supplementary value', '"Legacy supplementary value"'::jsonb,
        $3::"EvidenceReviewState")`,
    `evidence-${input.id}`,
    input.id,
    input.evidenceReviewState,
  );
}

async function insertLegacyManufacturedItem(
  prisma: PrismaClient,
  input: {
    id: string;
    revisionId: string;
    state: "CANDIDATE" | "REVIEW" | "VERIFIED";
    evidenceReviewState: "RESOLVED" | "REJECTED";
  },
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ManufacturedItem"
       ("id", "orderRevisionId", "kind", "code", "name", "quantity", "state",
        "resolution", "reviewedByRole", "reviewedAt", "updatedAt")
     VALUES
       ($1, $2, 'WALL_PANEL', $3, $4, 1, $5::"ManufacturedItemState",
        CASE WHEN $5 = 'VERIFIED' THEN 'Legacy parent decision' ELSE NULL END,
        CASE WHEN $5 = 'VERIFIED' THEN 'legacy_reviewer' ELSE NULL END,
        CASE WHEN $5 = 'VERIFIED' THEN CURRENT_TIMESTAMP ELSE NULL END,
        CURRENT_TIMESTAMP)`,
    input.id,
    input.revisionId,
    input.id,
    `Legacy manufactured ${input.id}`,
    input.state,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ManufacturedItemEvidence"
       ("id", "manufacturedItemId", "sourceRoot", "relativePath", "field",
        "rawValue", "normalizedValue", "reviewState", "resolution",
        "createdByRole", "updatedAt")
     VALUES
       ($1, $2, 'LEGACY_2026', 'legacy/source.xlsx', 'NAME',
        'Legacy manufactured value', '"Legacy manufactured value"'::jsonb,
        $3::"EvidenceReviewState", 'Legacy evidence decision',
        'legacy_import', CURRENT_TIMESTAMP)`,
    `evidence-${input.id}`,
    input.id,
    input.evidenceReviewState,
  );
}

function asRecord<T extends { id: string }>(rows: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

describe("source-evidence data migrations", () => {
  it("quarantines unaudited legacy evidence without mutating the approved revision status", async () => {
    const schema = `doorstar_test_migration_${process.pid}_${randomUUID()
      .replaceAll("-", "")
      .slice(0, 16)}`;
    const databaseUrl = createMigrationDatabaseUrl(schema);
    const tempPrismaDir = mkdtempSync(
      join(tmpdir(), "doorstar-source-evidence-migrations-"),
    );
    const migrationsSource = resolve(process.cwd(), "prisma/migrations");
    const migrationsTarget = join(tempPrismaDir, "migrations");
    const schemaPath = join(tempPrismaDir, "schema.prisma");
    const prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });

    try {
      mkdirSync(migrationsTarget);
      cpSync(resolve(process.cwd(), "prisma/schema.prisma"), schemaPath);
      cpSync(
        join(migrationsSource, "migration_lock.toml"),
        join(migrationsTarget, "migration_lock.toml"),
      );

      const legacyMigrationNames = readdirSync(migrationsSource, {
        withFileTypes: true,
      })
        .filter(
          (entry) =>
            entry.isDirectory() && entry.name < firstSourceEvidenceMigration,
        )
        .map((entry) => entry.name)
        .sort();
      for (const migrationName of legacyMigrationNames) {
        copyMigration(migrationsSource, migrationsTarget, migrationName);
      }
      deployMigrations(schemaPath, databaseUrl);

      const prematureColumns = await prisma.$queryRawUnsafe<
        Array<{ columnName: string }>
      >(
        `SELECT column_name AS "columnName"
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND (
             (table_name = 'OrderSupplementaryItemEvidence'
               AND column_name IN ('resolution', 'createdByRole', 'reviewedByRole', 'reviewedAt'))
             OR (table_name = 'ManufacturedItemEvidence'
               AND column_name IN ('reviewedByRole', 'reviewedAt'))
             OR (table_name = 'OrderRevisionAudit'
               AND column_name = 'contentHashSchemaVersion')
           )`,
      );
      expect(prematureColumns).toEqual([]);

      await insertLegacyRevision(prisma, "revision-supp-review", "REVIEW");
      await insertLegacySupplementaryItem(prisma, {
        id: "supp-review",
        revisionId: "revision-supp-review",
        entryMode: "MANUAL",
        state: "REVIEW",
      });

      await insertLegacyRevision(prisma, "revision-supp-verified", "REVIEW");
      await insertLegacySupplementaryItem(prisma, {
        id: "supp-verified",
        revisionId: "revision-supp-verified",
        entryMode: "SOURCE_REVIEW",
        state: "VERIFIED",
        evidenceReviewState: "RESOLVED",
      });

      for (const state of ["CANDIDATE", "REVIEW", "VERIFIED"] as const) {
        const key = state.toLowerCase();
        await insertLegacyRevision(
          prisma,
          `revision-manufactured-${key}`,
          "REVIEW",
        );
        await insertLegacyManufacturedItem(prisma, {
          id: `manufactured-${key}`,
          revisionId: `revision-manufactured-${key}`,
          state,
          evidenceReviewState: state === "REVIEW" ? "REJECTED" : "RESOLVED",
        });
      }

      await insertLegacyRevision(prisma, "revision-approved", "APPROVED");
      await insertLegacySupplementaryItem(prisma, {
        id: "supp-approved",
        revisionId: "revision-approved",
        entryMode: "SOURCE_REVIEW",
        state: "VERIFIED",
        evidenceReviewState: "RESOLVED",
      });
      await insertLegacyManufacturedItem(prisma, {
        id: "manufactured-approved",
        revisionId: "revision-approved",
        state: "VERIFIED",
        evidenceReviewState: "RESOLVED",
      });

      for (const migrationName of sourceEvidenceMigrations) {
        copyMigration(migrationsSource, migrationsTarget, migrationName);
      }
      deployMigrations(schemaPath, databaseUrl);

      const revisions = asRecord(
        await prisma.$queryRawUnsafe<RevisionRow[]>(
          `SELECT "id", "status"::text AS "status"
           FROM "OrderRevision"
           ORDER BY "id"`,
        ),
      );
      expect(revisions["revision-supp-review"].status).toBe("DRAFT");
      expect(revisions["revision-supp-verified"].status).toBe("DRAFT");
      expect(revisions["revision-manufactured-candidate"].status).toBe("DRAFT");
      expect(revisions["revision-manufactured-review"].status).toBe("DRAFT");
      expect(revisions["revision-manufactured-verified"].status).toBe("DRAFT");
      expect(revisions["revision-approved"].status).toBe("APPROVED");

      const supplementaryItems = asRecord(
        await prisma.$queryRawUnsafe<SupplementaryItemRow[]>(
          `SELECT "id", "state"::text AS "state", "reviewedByRole",
                  "reviewedAt", "reviewResolution"
           FROM "OrderSupplementaryItem"
           ORDER BY "id"`,
        ),
      );
      expect(supplementaryItems["supp-review"]).toMatchObject({
        state: "REVIEW",
        reviewedByRole: null,
        reviewedAt: null,
        reviewResolution: null,
      });
      for (const id of ["supp-verified", "supp-approved"]) {
        expect(supplementaryItems[id]).toMatchObject({
          state: "REVIEW",
          reviewedByRole: null,
          reviewedAt: null,
          reviewResolution: null,
        });
      }

      const supplementaryEvidence =
        await prisma.$queryRawUnsafe<SupplementaryEvidenceRow[]>(
          `SELECT "id", "reviewState"::text AS "reviewState", "resolution",
                  "createdByRole", "reviewedByRole", "reviewedAt"
           FROM "OrderSupplementaryItemEvidence"
           ORDER BY "id"`,
        );
      expect(supplementaryEvidence).toHaveLength(2);
      for (const evidence of supplementaryEvidence) {
        expect(evidence).toMatchObject({
          reviewState: "REVIEW",
          resolution: null,
          createdByRole: "legacy_migration",
          reviewedByRole: null,
          reviewedAt: null,
        });
      }

      const manufacturedItems = asRecord(
        await prisma.$queryRawUnsafe<ManufacturedItemRow[]>(
          `SELECT "id", "state"::text AS "state", "resolution",
                  "reviewedByRole", "reviewedAt"
           FROM "ManufacturedItem"
           ORDER BY "id"`,
        ),
      );
      expect(manufacturedItems["manufactured-candidate"].state).toBe(
        "CANDIDATE",
      );
      expect(manufacturedItems["manufactured-review"].state).toBe("REVIEW");
      for (const id of ["manufactured-verified", "manufactured-approved"]) {
        expect(manufacturedItems[id]).toMatchObject({
          state: "REVIEW",
          resolution: null,
          reviewedByRole: null,
          reviewedAt: null,
        });
      }

      const manufacturedEvidence =
        await prisma.$queryRawUnsafe<ManufacturedEvidenceRow[]>(
          `SELECT "id", "reviewState"::text AS "reviewState", "resolution",
                  "createdByRole", "reviewedByRole", "reviewedAt"
           FROM "ManufacturedItemEvidence"
           ORDER BY "id"`,
        );
      expect(manufacturedEvidence).toHaveLength(4);
      for (const evidence of manufacturedEvidence) {
        expect(evidence).toMatchObject({
          reviewState: "REVIEW",
          resolution: null,
          createdByRole: "legacy_import",
          reviewedByRole: null,
          reviewedAt: null,
        });
      }

      const auditVersions = await prisma.$queryRawUnsafe<
        Array<{ contentHashSchemaVersion: number }>
      >(
        `SELECT "contentHashSchemaVersion"
         FROM "OrderRevisionAudit"
         ORDER BY "id"`,
      );
      expect(auditVersions).toHaveLength(6);
      expect(
        auditVersions.every(
          (audit) => audit.contentHashSchemaVersion === 1,
        ),
      ).toBe(true);

      const deployedSourceMigrations = await prisma.$queryRawUnsafe<
        Array<{ migrationName: string }>
      >(
        `SELECT migration_name AS "migrationName"
         FROM "_prisma_migrations"
         WHERE migration_name = ANY($1::text[])
           AND finished_at IS NOT NULL
           AND rolled_back_at IS NULL
         ORDER BY migration_name`,
        [...sourceEvidenceMigrations],
      );
      expect(deployedSourceMigrations.map((row) => row.migrationName)).toEqual([
        ...sourceEvidenceMigrations,
      ]);
    } finally {
      try {
        await prisma.$executeRawUnsafe(
          `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
        );
      } finally {
        await prisma.$disconnect();
        rmSync(tempPrismaDir, { recursive: true, force: true });
      }
    }
  }, 60_000);
});
