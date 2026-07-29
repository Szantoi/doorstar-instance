import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";

const app = createApp();
const projectKey = "DSMR-POSITION-EVIDENCE-TEST";

describe("order position field-level evidence", () => {
  beforeAll(async () => { await prisma.$connect(); });
  beforeEach(async () => { await prisma.project.deleteMany({ where: { key: projectKey } }); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("keeps evidence attached across a survey update and never applies its candidate automatically", async () => {
    const revision = await request(app)
      .post("/api/production/production-orders/sales-intake")
      .set("X-Role", "sales")
      .send({
        projectKey,
        projectName: "Position evidence test",
        customerName: "Minta Kft.",
        positions: [{ code: "01", name: "Ajtó", quantity: 1, openingWidthMm: 890 }],
      })
      .expect(201);
    const positionId = revision.body.positions[0].id as string;

    const document = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/documents`)
      .set("X-Role", "sales")
      .send({
        source: "LEGACY_FOLDER",
        kind: "SALES_ORDER",
        displayName: "Megrendelés.pdf",
        relativePath: "DSMR Test/Megrendelés.pdf",
      })
      .expect(201);

    await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/positions/${positionId}/evidence`)
      .set("X-Role", "reader")
      .send({
        sourceRoot: "sales",
        relativePath: "DSMR Test/Megrendelés.pdf",
        field: "OPENING_WIDTH_MM",
        rawValue: "900",
        normalizedValue: 900,
      })
      .expect(403);

    const created = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/positions/${positionId}/evidence`)
      .set("X-Role", "technical_preparation")
      .send({
        orderDocumentId: document.body.id,
        sourceRoot: "sales",
        relativePath: "DSMR Test/Megrendelés.pdf",
        page: 1,
        field: "OPENING_WIDTH_MM",
        rawValue: "900 mm",
        normalizedValue: 900,
        confidence: 0.8,
        reviewState: "REVIEW",
      })
      .expect(201);

    let detail = await request(app).get(`/api/production/production-orders/${projectKey}`).expect(200);
    expect(detail.body.revisions[0].positions[0]).toMatchObject({
      id: positionId,
      openingWidthMm: 890,
      evidence: [{
        id: created.body.id,
        rawValue: "900 mm",
        normalizedValue: 900,
        orderDocument: { displayName: "Megrendelés.pdf" },
      }],
    });

    await request(app)
      .put(`/api/production/production-orders/${projectKey}/revisions/1`)
      .set("X-Role", "technical_preparation")
      .send({
        customerName: "Minta Kft.",
        positions: [{ id: positionId, code: "01", name: "Ajtó", quantity: 1, openingWidthMm: 910 }],
      })
      .expect(200);

    const reviewed = await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/positions/${positionId}/evidence/${created.body.id}`)
      .set("X-Role", "technical_preparation")
      .send({ reviewState: "RESOLVED", resolution: "A helyszíni felmérés 910 mm-t igazolt." })
      .expect(200);
    expect(reviewed.body.reviewState).toBe("RESOLVED");

    detail = await request(app).get(`/api/production/production-orders/${projectKey}`).expect(200);
    expect(detail.body.revisions[0].positions[0]).toMatchObject({
      id: positionId,
      openingWidthMm: 910,
      evidence: [{ id: created.body.id, reviewState: "RESOLVED" }],
    });
  });
});
