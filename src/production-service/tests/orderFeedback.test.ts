import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";

const app = createApp();
const projectKey = "DSMR-FEEDBACK-TEST";

describe("order feedback during Excel transition", () => {
  beforeAll(async () => { await prisma.$connect(); });
  beforeEach(async () => { await prisma.project.deleteMany({ where: { key: projectKey } }); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("lets an installer report a source-data problem and technical preparation resolve it", async () => {
    await request(app).post("/api/production/production-orders/sales-intake").set("X-Role", "sales").send({
      projectKey, projectName: "Feedback test", customerName: "Minta Kft.",
      positions: [{ code: "01", name: "Ajtó", quantity: 1 }],
    }).expect(201);
    await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/feedback`).set("X-Role", "reader").send({ category: "DATA_QUALITY", message: "A vastagság hiányzik." }).expect(403);
    const reported = await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/feedback`).set("X-Role", "installer").send({ category: "DATA_QUALITY", message: "A vastagság hiányzik." }).expect(201);
    expect(reported.body.status).toBe("OPEN");
    const listed = await request(app).get(`/api/production/production-orders/${projectKey}/revisions/1/feedback`).expect(200);
    expect(listed.body).toHaveLength(1);
    const resolved = await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/feedback/${reported.body.id}`).set("X-Role", "technical_preparation").send({ status: "RESOLVED", resolution: "A felmérési adatot pótoltuk." }).expect(200);
    expect(resolved.body.resolvedByRole).toBe("technical_preparation");
    expect(resolved.body.resolvedAt).not.toBeNull();
  });
});
