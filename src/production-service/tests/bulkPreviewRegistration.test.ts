import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db/client.js";
import { registerBulkPreview } from "../src/services/bulkPreviewRegistration.js";

const artifactHash = "d".repeat(64);

describe("resumable bulk preview registration", () => {
  beforeAll(async () => { await prisma.$connect(); });
  beforeEach(async () => { await prisma.importRun.deleteMany(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("creates queryable rows once and resumes the same manifest without duplicates", async () => {
    const input = {
      profileVersion: "legacy-evidence/v1",
      manifestRelativePath: "tests/fixtures/bulk-preview-manifest.json",
      manifestSha256: "e".repeat(64),
      reviewedByRole: "administrator",
      reviewNote: "A preview sorait és karanténjait ellenőriztem.",
      artifacts: [{
        relativePath: "tests/fixtures/preview.json",
        contentSha256: artifactHash,
        sourceFingerprint: "f".repeat(64),
        records: [
          {
            recordType: "OrderPosition", action: "READY", projectKey: "DSMR-TEST-BULK",
            evidence: { sourceRoot: "sales", relativePath: "DSMR Test/order.pdf", locator: "PDF page 1", row: 3 },
          },
          {
            recordType: "SourceLinkObservation", action: "QUARANTINE", projectKey: "DSMR-TEST-BULK",
            errors: ["customer_mismatch"], evidence: { sourceRoot: "deadlines", relativePath: "Ütemterv.xlsx", sheet: "ADAT", row: 7 },
          },
          {
            recordType: "OrderPosition", action: "REVIEW", projectKey: "DSMR-TEST-BULK",
            evidence: { sourceRoot: "sales" },
          },
        ],
      }],
    };

    const first = await registerBulkPreview(prisma, input);
    expect(first.resumed).toBe(false);
    expect(first.summary).toMatchObject({ total: 3, created: 3, existing: 0, ready: 1, review: 0, blocked: 2 });
    expect(first.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 1, status: "READY", outcome: "created" }),
      expect.objectContaining({ row: 2, status: "BLOCKED", errors: ["customer_mismatch"], outcome: "created" }),
      expect.objectContaining({ row: 3, status: "BLOCKED", errors: ["source_locator_missing"], outcome: "created" }),
    ]));

    const resumed = await registerBulkPreview(prisma, input);
    expect(resumed).toMatchObject({ importRunId: first.importRunId, resumed: true, summary: { total: 3, created: 0, existing: 3 } });
    expect(await prisma.importCandidate.count({ where: { importRunId: first.importRunId } })).toBe(3);
    const run = await prisma.importRun.findUniqueOrThrow({ where: { id: first.importRunId } });
    expect(run).toMatchObject({ registrationVersion: "doorstar-bulk-preview-registration/v1", artifactFingerprint: "e".repeat(64), candidateCount: 3 });
  });

  it("rejects public-schema, non-administrator and unreviewed registration attempts", async () => {
    const input = {
      profileVersion: "legacy-evidence/v1", manifestRelativePath: "tests/fixtures/manifest.json", manifestSha256: "a".repeat(64),
      reviewedByRole: "administrator", reviewNote: "Átnézett teszt-preview sorok.",
      artifacts: [{ relativePath: "tests/fixtures/preview.json", contentSha256: "b".repeat(64), records: [] }],
    };
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://user:password@localhost:5462/doorstar?schema=public";
    await expect(registerBulkPreview(prisma, input)).rejects.toThrow("bulk_preview_registration_requires_test_schema");
    process.env.DATABASE_URL = originalUrl;
    await expect(registerBulkPreview(prisma, { ...input, reviewedByRole: "sales" })).rejects.toThrow("bulk_preview_registration_requires_administrator");
    await expect(registerBulkPreview(prisma, { ...input, reviewNote: "rövid" })).rejects.toThrow("bulk_preview_registration_requires_review_note");
  });
});
