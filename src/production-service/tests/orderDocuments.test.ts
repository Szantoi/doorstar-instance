import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";

const app = createApp();

describe("order document gate", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("requires a document reference before Sales can hand the order to survey", async () => {
    const projectKey = `DOC-GATE-${Date.now()}`;
    await request(app).post("/api/production/production-orders/sales-intake").send({
      projectKey, projectName: "Dokumentumkapu teszt", customerName: "Teszt ügyfél",
      positions: [{ code: "01", name: "Ajtó", quantity: 1 }],
    }).expect(201);

    await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`)
      .send({ stage: "SALES_DOCUMENTS_RECEIVED" }).expect(409);

    const document = await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/documents`).send({
      source: "LEGACY_FOLDER", kind: "SALES_ORDER", displayName: "Megrendelés.pdf", relativePath: "DSMR 99999/Megrendeles.pdf",
    }).expect(201);
    expect(document.body.relativePath).toBe("DSMR 99999/Megrendeles.pdf");

    await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`)
      .send({ stage: "SALES_DOCUMENTS_RECEIVED" }).expect(200);
    const detail = await request(app).get(`/api/production/production-orders/${projectKey}`).expect(200);
    expect(detail.body.revisions[0].documents).toHaveLength(1);

    await prisma.project.delete({ where: { key: projectKey } });
  });

  it("permits Sales intake but rejects a reader role", async () => {
    await request(app).post("/api/production/production-orders/sales-intake").set("X-Role", "reader").send({
      projectKey: `READER-${Date.now()}`, projectName: "Tiltott", customerName: "Olvasó", positions: [{ code: "01", name: "Ajtó", quantity: 1 }],
    }).expect(403);
    const projectKey = `SALES-${Date.now()}`;
    await request(app).post("/api/production/production-orders/sales-intake").set("X-Role", "sales").send({
      projectKey, projectName: "Sales jogosultság", customerName: "Sales", positions: [{ code: "01", name: "Ajtó", quantity: 1 }],
    }).expect(201);
    await prisma.project.delete({ where: { key: projectKey } });
  });
});
