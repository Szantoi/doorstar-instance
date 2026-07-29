import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";

const app = createApp();

describe("order review and approval", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("freezes a complete technical revision and records an approval hash", async () => {
    const projectKey = `APPROVAL-${Date.now()}`;
    const sales = request(app).post("/api/production/production-orders/sales-intake").set("X-Role", "sales");
    await sales.send({ projectKey, projectName: "Jóváhagyás teszt", customerName: "Teszt ügyfél", positions: [{ code: "01", name: "Ajtó", quantity: 1 }] }).expect(201);
    await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/documents`).set("X-Role", "sales").send({ source: "LEGACY_FOLDER", kind: "SALES_ORDER", displayName: "Megrendelés.pdf", relativePath: "Teszt/Megrendeles.pdf" }).expect(201);
    await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`).set("X-Role", "sales").send({ stage: "SALES_DOCUMENTS_RECEIVED" }).expect(200);
    await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`).set("X-Role", "sales").send({ stage: "SURVEY_PENDING" }).expect(200);
    await request(app).put(`/api/production/production-orders/${projectKey}/revisions/1`).set("X-Role", "technical_preparation").send({
      customerName: "Teszt ügyfél", positions: [{ code: "01", name: "Ajtó", quantity: 1, productType: "Beltéri", openingDirection: "Bal be", openingWidthMm: 900, openingHeightMm: 2100, doorThicknessMm: 40, surface: "RAL 9016", wallTreatment: "NONE", glazing: "NONE" }],
    }).expect(200);
    await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`).set("X-Role", "technical_preparation").send({ stage: "SURVEY_COMPLETED" }).expect(200);
    await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`).set("X-Role", "technical_preparation").send({ stage: "TECHNICAL_PREPARATION" }).expect(200);

    const review = await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/review`).set("X-Role", "technical_preparation").send({ note: "Műszakilag teljes" }).expect(201);
    expect(review.body.action).toBe("REVIEW_REQUESTED");
    await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/approve`).set("X-Role", "sales").send({ note: "Rendben" }).expect(403);
    const approval = await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/approve`).set("X-Role", "order_approver").send({ note: "Műszaki és dokumentum ellenőrzés rendben." }).expect(201);
    expect(approval.body.action).toBe("APPROVED");
    expect(approval.body.contentHash).toBe(review.body.contentHash);

    const detail = await request(app).get(`/api/production/production-orders/${projectKey}`).expect(200);
    expect(detail.body.revisions[0].status).toBe("APPROVED");
    expect(detail.body.revisions[0].audit).toHaveLength(2);
    await prisma.project.delete({ where: { key: projectKey } });
  });
});
