import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";

const app = createApp();

describe("technical catalog", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("publishes the versioned set of technical choices", async () => {
    const response = await request(app).get("/api/production/technical-catalog").expect(200);

    expect(response.body.version).toBe("doorstar-technical-catalog/v1");
    expect(response.body.doorTypes).toContainEqual({ key: "tapeta-tut", label: "Tapéta (Falsíkban záródó) TUT" });
    expect(response.body.glass).toContainEqual({ key: "frosted-4mm", label: "Savmart 4 mm", glazing: "GLAZED" });
    expect(response.body.wallSolutions).toContainEqual({ key: "blende", label: "Blendés", wallTreatment: "BLENDE" });
    expect(response.body.finishes).toContainEqual({ key: "foil-renolit-magnolia-supermatt-classic", label: "Fóliás · Renolit Magnolia Supermatt Classic" });
    expect(response.body.finishes).toContainEqual({ key: "foil-stone-grey-suedette-matt", label: "Fóliás · Stone Grey Suedette Matt" });
    expect(response.body.finishes).toContainEqual({ key: "foil-supermatt-kashmir", label: "Fóliás · Supermatt Kashmir" });
  });

  it("persists catalog keys and derives the compatible technical fields", async () => {
    const projectKey = `TECHNICAL-CATALOG-${Date.now()}`;
    try {
      const created = await request(app)
        .post("/api/production/production-orders/sales-intake")
        .set("X-Role", "sales")
        .send({ projectKey, projectName: "Műszaki katalógus teszt", customerName: "Teszt ügyfél", positions: [{ code: "01", name: "Ajtó", quantity: 1 }] })
        .expect(201);

      const saved = await request(app)
        .put(`/api/production/production-orders/${projectKey}/revisions/1`)
        .set("X-Role", "technical_preparation")
        .send({
          customerName: "Teszt ügyfél",
          positions: [{
            id: created.body.positions[0].id,
            code: "01",
            name: "Ajtó",
            quantity: 1,
            doorTypeKey: "tapeta-tut",
            finishKey: "painted-ral",
            glassKey: "frosted-4mm",
            hardwareKeys: ["hinge-3d", "lock-magnetic"],
            wallSolutionKey: "blende",
            materialKey: "mdf-deep",
            machiningKeys: ["cnc-groove"],
            technicalNotes: "Ékezetes műszaki megjegyzés.",
          }],
        })
        .expect(200);

      expect(saved.body.positions[0]).toMatchObject({
        doorTypeKey: "tapeta-tut",
        finishKey: "painted-ral",
        glassKey: "frosted-4mm",
        hardwareKeys: ["hinge-3d", "lock-magnetic"],
        wallSolutionKey: "blende",
        materialKey: "mdf-deep",
        machiningKeys: ["cnc-groove"],
        technicalNotes: "Ékezetes műszaki megjegyzés.",
        productType: "Tapéta (Falsíkban záródó) TUT",
        surface: "Festett RAL/NCS",
        glazing: "GLAZED",
        glazingSpecification: "Savmart 4 mm",
        wallTreatment: "BLENDE",
      });
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });

  it("rejects unknown and duplicated configuration keys before writing", async () => {
    const projectKey = `TECHNICAL-CATALOG-INVALID-${Date.now()}`;
    try {
      await request(app)
        .post("/api/production/production-orders/sales-intake")
        .set("X-Role", "sales")
        .send({
          projectKey,
          projectName: "Hibás katalógus teszt",
          customerName: "Teszt ügyfél",
          positions: [{ code: "01", name: "Ajtó", quantity: 1, doorTypeKey: "does-not-exist", hardwareKeys: ["hinge-3d", "hinge-3d"] }],
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body.error).toBe("technical_catalog_value_invalid");
          expect(body.details).toContain("positions.0.doorTypeKey:unknown_catalog_key");
          expect(body.details).toContain("positions.0.hardwareKeys:duplicate_catalog_key");
        });

      expect(await prisma.project.findUnique({ where: { key: projectKey } })).toBeNull();
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });
});
