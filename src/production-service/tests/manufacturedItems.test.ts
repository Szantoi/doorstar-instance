import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";

const app = createApp();
const projectKey = "DSMR-MANUFACTURED-ITEM-TEST";

describe("standalone wall-panel and furniture-front workflow", () => {
  beforeAll(async () => { await prisma.$connect(); });
  beforeEach(async () => { await prisma.project.deleteMany({ where: { key: projectKey } }); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("keeps a front separate from door positions and blocks review until human verification", async () => {
    await request(app)
      .post("/api/production/production-orders/sales-intake")
      .set("X-Role", "sales")
      .send({
        projectKey,
        projectName: "Manufactured item test",
        customerName: "Minta Kft.",
        positions: [{
          code: "A-01",
          name: "Bejárati ajtó",
          quantity: 1,
          productType: "Tokba nyíló",
          openingDirection: "Bal be",
          openingWidthMm: 900,
          openingHeightMm: 2100,
          doorThicknessMm: 68,
          surface: "Festett",
          wallTreatment: "NONE",
          glazing: "NONE",
        }],
      })
      .expect(201);

    const document = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/documents`)
      .set("X-Role", "sales")
      .send({
        source: "LEGACY_FOLDER",
        kind: "SALES_ORDER",
        displayName: "Gyártásmegrendelő.xlsm",
        relativePath: "DSMR Test/Gyártásmegrendelő.xlsm",
      })
      .expect(201);

    const itemPayload = {
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
        orderDocumentId: document.body.id,
        sourceRoot: "archive",
        relativePath: "DSMR Test/Gyártásmegrendelő.xlsm",
        sheet: "Készméret - Bútorfront",
        row: 4,
        field: "WIDTH_MM",
        rawValue: "39 cm",
        normalizedValue: 390,
        confidence: 0.8,
        reviewState: "REVIEW",
      }],
    };
    await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items`)
      .set("X-Role", "reader")
      .send(itemPayload)
      .expect(403);
    const created = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items`)
      .set("X-Role", "technical_preparation")
      .send(itemPayload)
      .expect(201);
    expect(created.body).toMatchObject({ kind: "FURNITURE_FRONT", widthMm: 390, state: "REVIEW" });

    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`)
      .set("X-Role", "sales")
      .send({ stage: "SALES_DOCUMENTS_RECEIVED" })
      .expect(200);
    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`)
      .set("X-Role", "sales")
      .send({ stage: "SURVEY_PENDING" })
      .expect(200);
    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`)
      .set("X-Role", "technical_preparation")
      .send({ stage: "SURVEY_COMPLETED" })
      .expect(200);
    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`)
      .set("X-Role", "technical_preparation")
      .send({ stage: "TECHNICAL_PREPARATION" })
      .expect(200);

    await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/review`)
      .set("X-Role", "technical_preparation")
      .send({ note: "Műszaki ellenőrzés." })
      .expect(409);

    const verified = await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items/${created.body.id}/review`)
      .set("X-Role", "technical_preparation")
      .send({ state: "VERIFIED", resolution: "A méretet és az anyagot a rajz alapján ellenőriztük." })
      .expect(200);
    expect(verified.body).toMatchObject({ state: "VERIFIED", reviewedByRole: "technical_preparation" });

    const audit = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/review`)
      .set("X-Role", "technical_preparation")
      .send({ note: "Műszaki ellenőrzés kész." })
      .expect(201);
    expect(audit.body.contentHash).toMatch(/^[a-f0-9]{64}$/);

    const detail = await request(app)
      .get(`/api/production/production-orders/${projectKey}`)
      .expect(200);
    expect(detail.body.revisions[0].positions).toHaveLength(1);
    expect(detail.body.revisions[0].manufacturedItems[0]).toMatchObject({
      code: "BF-01",
      state: "VERIFIED",
      evidence: [{ rawValue: "39 cm", orderDocument: { displayName: "Gyártásmegrendelő.xlsm" } }],
    });
  });
});
