import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";

const app = createApp();
const hash = (letter: string) => letter.repeat(64);

describe("import inbox projection", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });
  it("groups review states by work number without using source dates", async () => {
    const run = await prisma.importRun.create({ data: { profileVersion: "test", sourceFingerprint: hash("a"), previewArtifact: "preview.json", targetSchema: "doorstar_test", candidateCount: 3, createdByRole: "administrator" } });
    try {
      await prisma.importCandidate.createMany({ data: [
        { importRunId: run.id, recordType: "Sales", workNumber: "26145", sourceRoot: "preview", relativePath: "26145.pdf", normalizedPayload: {}, errors: ["deadline conflict"], status: "REVIEW" },
        { importRunId: run.id, recordType: "Sales", workNumber: "26145", sourceRoot: "preview", relativePath: "26145.pdf", normalizedPayload: {}, errors: [], status: "READY" },
        { importRunId: run.id, recordType: "Sales", workNumber: "26146", sourceRoot: "preview", relativePath: "26146.pdf", normalizedPayload: {}, errors: ["PDF revision selection required"], status: "REVIEW" },
      ] });
      const response = await request(app).get("/api/production/import-inbox?page=1&pageSize=1").expect(200);
      expect(response.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
      const all = await request(app).get("/api/production/import-inbox?pageSize=25").expect(200);
      expect(all.body.items.find((item: { workNumber: string }) => item.workNumber === "26145")).toMatchObject({ states: ["DEADLINE_CONFLICT", "READY_FOR_TEST_DRAFT"], candidateCount: 2, readyCount: 1 });
      expect(all.body.items.find((item: { workNumber: string }) => item.workNumber === "26146").states).toEqual(["PDF_REVISION_SELECTION_REQUIRED"]);
    } finally { await prisma.importRun.delete({ where: { id: run.id } }); }
  });
});
