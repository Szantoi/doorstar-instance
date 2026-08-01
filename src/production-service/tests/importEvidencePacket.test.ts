import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";

const app = createApp();

describe("import work-number evidence packet", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });
  it("returns locators and review facts without deriving a delivery outcome", async () => {
    const run = await prisma.importRun.create({ data: { profileVersion: "test", sourceFingerprint: "a".repeat(64), previewArtifact: "preview.json", targetSchema: "doorstar_test", candidateCount: 1, createdByRole: "administrator" } });
    try {
      await prisma.importCandidate.create({ data: { importRunId: run.id, recordType: "SalesPdf", workNumber: "26145", sourceRoot: "LEGACY_2026", relativePath: "26145.pdf", page: 1, row: 2, normalizedPayload: { evidence: "review" }, errors: ["requires_human_review"], status: "REVIEW" } });
      await prisma.orderDeadlineObservation.create({ data: { importRunId: run.id, workNumber: "26145", sourceRoot: "LEGACY_2026", relativePath: "26145.pdf", page: 1, row: 2, kind: "NOTE", rawValue: "Szállítás nélkül", reviewState: "REVIEW" } });
      const response = await request(app).get(`/api/production/import-inbox/${run.id}/26145/evidence`).expect(200);
      expect(response.body).toMatchObject({ workNumber: "26145", candidates: [{ sourceRoot: "LEGACY_2026", relativePath: "26145.pdf", page: 1, row: 2 }], deadlineObservations: [{ reviewState: "REVIEW", rawValue: "Szállítás nélkül" }] });
      expect(response.body).not.toHaveProperty("deliveryStatus");
    } finally { await prisma.importRun.delete({ where: { id: run.id } }); }
  });
});
