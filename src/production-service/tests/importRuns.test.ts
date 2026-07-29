import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";

const app = createApp();
const fingerprint = "a".repeat(64);

describe("legacy import preview provenance", () => {
  beforeAll(async () => { await prisma.$connect(); });
  beforeEach(async () => {
    await prisma.project.deleteMany({ where: { key: "DSMR-TEST-IMPORT-24181" } });
    await prisma.importRun.deleteMany();
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("accepts only an administrator-owned preview targeting doorstar_test", async () => {
    await request(app).post("/api/production/import-runs").set("X-Role", "reader").send({ profileVersion: "legacy-v1", sourceFingerprint: fingerprint, previewArtifact: "tmp/preview.json", targetSchema: "doorstar_test", candidateCount: 1 }).expect(403);
    await request(app).post("/api/production/import-runs").set("X-Role", "administrator").send({ profileVersion: "legacy-v1", sourceFingerprint: fingerprint, previewArtifact: "tmp/preview.json", targetSchema: "public", candidateCount: 1 }).expect(400);
    const created = await request(app).post("/api/production/import-runs").set("X-Role", "administrator").send({ profileVersion: "legacy-v1", sourceFingerprint: fingerprint, previewArtifact: "tmp/preview.json", targetSchema: "doorstar_test", candidateCount: 58 }).expect(201);
    expect(created.body.status).toBe("PREVIEWED");
    const listed = await request(app).get("/api/production/import-runs").expect(200);
    expect(listed.body).toHaveLength(1);
  });

  it("refuses to register a preview when the runtime connection is not the test schema", async () => {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://user:password@localhost:5462/doorstar?schema=public";
    try {
      await request(app).post("/api/production/import-runs").set("X-Role", "administrator").send({ profileVersion: "legacy-v1", sourceFingerprint: fingerprint, previewArtifact: "tmp/preview.json", targetSchema: "doorstar_test", candidateCount: 1 }).expect(409);
    } finally {
      process.env.DATABASE_URL = previousUrl;
    }
  });

  it("applies a reviewed preview exactly once as a fresh draft with its document references", async () => {
    const run = await request(app).post("/api/production/import-runs").set("X-Role", "administrator").send({ profileVersion: "legacy-v1", sourceFingerprint: fingerprint, previewArtifact: "tmp/24181-preview.json", targetSchema: "doorstar_test", candidateCount: 2 }).expect(201);
    const payload = {
      projectKey: "DSMR-TEST-IMPORT-24181",
      projectName: "Teszt import projekt",
      projectNum: "24181",
      customerName: "Minta Kft.",
      expectedDelivery: "2026-08-31T00:00:00.000Z",
      notes: "Imported as a survey-pending draft.",
      positions: [{ code: "01", name: "Minta ajtó", quantity: 1, productType: "Tokba", openingDirection: "Bal be", openingWidthMm: 890, openingHeightMm: 2120, openingDepthMm: 135, doorThicknessMm: null, surface: "Fóliás", wallTreatment: null, glazing: null }],
      documents: [{ source: "LEGACY_FOLDER", kind: "SALES_ORDER", displayName: "DSMR 24181.pdf", relativePath: "DSMR 24181/DSMR 24181.pdf", contentSha256: fingerprint }],
    };
    const applied = await request(app).post(`/api/production/import-runs/${run.body.id}/apply-draft`).set("X-Role", "administrator").send(payload).expect(201);
    expect(applied.body.importRunId).toBe(run.body.id);
    expect(applied.body.documents).toHaveLength(1);
    await request(app).post(`/api/production/import-runs/${run.body.id}/candidates`).set("X-Role", "administrator").send({ recordType: "OrderPosition", workNumber: "24181", sourceRoot: "sales", relativePath: "DSMR 24181/order.pdf", page: 1, normalizedPayload: { code: "01", openingWidthMm: 890 }, status: "READY" }).expect(201);
    await request(app).post(`/api/production/import-runs/${run.body.id}/deadline-observations`).set("X-Role", "administrator").send({ orderRevisionId: applied.body.id, workNumber: "24181", sourceRoot: "deadlines", relativePath: "utemterv.xlsx", sheet: "ADAT", row: 198, kind: "CONTRACTUAL", rawValue: "2025-01-01", normalizedDate: "2025-01-01T00:00:00.000Z", confidence: 0.8, reviewState: "REVIEW" }).expect(201);
    const evidence = await request(app).get(`/api/production/import-runs/${run.body.id}/evidence`).expect(200);
    expect(evidence.body.importRun).toMatchObject({ id: run.body.id, profileVersion: "legacy-v1", targetSchema: "doorstar_test" });
    expect(evidence.body.candidates).toHaveLength(1);
    expect(evidence.body.deadlineObservations[0]).toMatchObject({ workNumber: "24181", reviewState: "REVIEW", rawValue: "2025-01-01" });
    const order = await request(app).get("/api/production/production-orders/DSMR-TEST-IMPORT-24181").expect(200);
    expect(order.body.revisions[0].intakeStage).toBe("SALES_DRAFT");
    expect(order.body.revisions[0].expectedDelivery).toBe("2026-08-31T00:00:00.000Z");
    const appliedRun = await prisma.importRun.findUniqueOrThrow({ where: { id: run.body.id } });
    expect(appliedRun.status).toBe("APPLIED");
    const inbox = await request(app).get("/api/production/import-runs").expect(200);
    expect(inbox.body[0]).toMatchObject({ _count: { candidates: 1, deadlineObservations: 1 } });
    expect(inbox.body[0].revisions[0]).toMatchObject({ revision: 1, _count: { positions: 1, documents: 1, feedback: 0 }, order: { project: { key: "DSMR-TEST-IMPORT-24181" } } });
    await request(app).post(`/api/production/import-runs/${run.body.id}/apply-draft`).set("X-Role", "administrator").send(payload).expect(409);
  });

  it("idempotently applies only explicitly selected READY manufactured-item candidates to its test draft", async () => {
    const run = await request(app)
      .post("/api/production/import-runs")
      .set("X-Role", "administrator")
      .send({
        profileVersion: "manufactured-item-v1",
        sourceFingerprint: fingerprint,
        previewArtifact: "tmp/front-preview.json",
        targetSchema: "doorstar_test",
        candidateCount: 1,
      })
      .expect(201);
    const draft = await request(app)
      .post(`/api/production/import-runs/${run.body.id}/apply-draft`)
      .set("X-Role", "administrator")
      .send({
        projectKey: "DSMR-TEST-IMPORT-24181",
        projectName: "Importált bútorfront",
        projectNum: "24181",
        customerName: "Minta Kft.",
        positions: [{
          code: "01",
          name: "Minta ajtó",
          quantity: 1,
          productType: "Tokba",
          openingDirection: "Bal be",
          openingWidthMm: 890,
          openingHeightMm: 2120,
          openingDepthMm: 135,
          doorThicknessMm: null,
          surface: "Fóliás",
          wallTreatment: null,
          glazing: null,
        }],
        documents: [{
          source: "LEGACY_FOLDER",
          kind: "SALES_ORDER",
          displayName: "Gyártásmegrendelő.xlsm",
          relativePath: "DSMR 24181/Gyártásmegrendelő.xlsm",
          contentSha256: fingerprint,
        }],
      })
      .expect(201);
    const candidate = await request(app)
      .post(`/api/production/import-runs/${run.body.id}/candidates`)
      .set("X-Role", "administrator")
      .send({
        recordType: "ManufacturedItemImportPreview",
        workNumber: "24181",
        sourceRoot: "archive",
        relativePath: "DSMR 24181/Gyártásmegrendelő.xlsm",
        sheet: "Készméret - Bútorfront",
        row: 4,
        status: "READY",
        normalizedPayload: {
          kind: "FURNITURE_FRONT",
          code: "BF-01",
          name: "Előszobai bútorfront",
          itemType: "Egyedi bútorfront",
          quantity: 1,
          widthMm: 390,
          heightMm: 775,
          thicknessMm: 18,
          material: "MDF",
          surface: "Fóliás",
          colour: "Magnólia",
          pattern: "Rajz szerint",
          workKind: "STANDARD",
          state: "REVIEW",
          evidence: [{
            sourceRoot: "archive",
            relativePath: "DSMR 24181/Gyártásmegrendelő.xlsm",
            sheet: "Készméret - Bútorfront",
            row: 4,
            field: "WIDTH_MM",
            rawValue: "39 cm",
            normalizedValue: 390,
            confidence: 0.8,
            reviewState: "REVIEW",
          }],
        },
      })
      .expect(201);
    const applyPayload = {
      orderRevisionId: draft.body.id,
      sourceFingerprint: fingerprint,
      candidateIds: [candidate.body.id],
      confirmation: "APPLY_READY_MANUFACTURED_ITEMS",
    };

    await request(app)
      .post(`/api/production/import-runs/${run.body.id}/apply-manufactured-items`)
      .set("X-Role", "reader")
      .send(applyPayload)
      .expect(403);
    await request(app)
      .post(`/api/production/import-runs/${run.body.id}/apply-manufactured-items`)
      .set("X-Role", "technical_preparation")
      .send({ ...applyPayload, sourceFingerprint: "b".repeat(64) })
      .expect(409, { error: "import_source_fingerprint_changed" });

    const applied = await request(app)
      .post(`/api/production/import-runs/${run.body.id}/apply-manufactured-items`)
      .set("X-Role", "technical_preparation")
      .send(applyPayload)
      .expect(200);
    expect(applied.body).toMatchObject({
      projectKey: "DSMR-TEST-IMPORT-24181",
      revision: 1,
      createdCount: 1,
      existingCount: 0,
      items: [{ code: "BF-01", state: "REVIEW", importCandidateId: candidate.body.id }],
    });

    const repeated = await request(app)
      .post(`/api/production/import-runs/${run.body.id}/apply-manufactured-items`)
      .set("X-Role", "technical_preparation")
      .send(applyPayload)
      .expect(200);
    expect(repeated.body).toMatchObject({ createdCount: 0, existingCount: 1 });

    const evidence = await request(app).get(`/api/production/import-runs/${run.body.id}/evidence`).expect(200);
    expect(evidence.body.targetRevisions[0]).toMatchObject({ id: draft.body.id, status: "DRAFT" });
    expect(evidence.body.candidates[0]).toMatchObject({
      id: candidate.body.id,
      status: "APPLIED",
      manufacturedItem: { code: "BF-01", state: "REVIEW" },
    });
    expect(await prisma.manufacturedItem.count({ where: { importCandidateId: candidate.body.id } })).toBe(1);
  });
});
