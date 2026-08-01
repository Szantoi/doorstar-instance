import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { attachSurveySource } from "./support/surveySource.js";

const app = createApp();

describe("approved-order component snapshots", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("pins explicit adapter output, replays idempotently and requires a separate review", async () => {
    const projectKey = `COMPONENT-SNAPSHOT-${Date.now()}`;
    try {
      const profiles = await request(app).get("/api/production/component-calculator-profiles").expect(200);
      expect(profiles.body.profiles).toEqual([expect.objectContaining({
        version: "doorstar-explicit-component-adapter/v1",
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        inputMode: "EXPLICIT_REVIEWED_OUTPUT",
        allowsFormulaExecution: false,
        allowsImplicitDefaults: false,
      })]);
      expect(profiles.body.configurationFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(profiles.body.technicalCatalogVersion).toBe("doorstar-technical-catalog/v1");
      expect(profiles.body.technicalCatalogFingerprint).toMatch(/^[a-f0-9]{64}$/);

      const draft = await request(app)
        .post("/api/production/production-orders/sales-intake")
        .set("X-Role", "sales")
        .send({
          projectKey,
          projectName: "Alkatrészsnapshot teszt",
          customerName: "Teszt ügyfél",
          positions: [{ code: "01", name: "Beltéri ajtó", quantity: 1 }],
        })
        .expect(201);
      const positionId = draft.body.positions[0].id as string;
      await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/documents`)
        .set("X-Role", "sales")
        .send({ source: "LEGACY_FOLDER", kind: "SALES_ORDER", displayName: "Megrendelés.pdf", relativePath: "Teszt/Megrendeles.pdf" })
        .expect(201);
      await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`).set("X-Role", "sales").send({ stage: "SALES_DOCUMENTS_RECEIVED" }).expect(200);
      await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`).set("X-Role", "sales").send({ stage: "SURVEY_PENDING" }).expect(200);
      await request(app)
        .put(`/api/production/production-orders/${projectKey}/revisions/1`)
        .set("X-Role", "technical_preparation")
        .send({
          customerName: "Teszt ügyfél",
          positions: [{
            id: positionId,
            code: "01",
            name: "Beltéri ajtó",
            quantity: 1,
            openingDirection: "Bal be",
            openingWidthMm: 900,
            openingHeightMm: 2100,
            openingDepthMm: 150,
            doorThicknessMm: 40,
            doorTypeKey: "interior-rebated",
            finishKey: "painted-ral",
            glassKey: "none",
            wallSolutionKey: "none",
            materialKey: "mdf-standard",
            hardwareKeys: ["handle-standard"],
            machiningKeys: ["none"],
          }],
        })
        .expect(200);
      await attachSurveySource(app, projectKey, [positionId]);
      await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`).set("X-Role", "technical_preparation").send({ stage: "SURVEY_COMPLETED" }).expect(200);
      await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`).set("X-Role", "technical_preparation").send({ stage: "TECHNICAL_PREPARATION" }).expect(200);

      const verifiedExtra = await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items`)
        .set("X-Role", "sales")
        .send({ entryMode: "MANUAL", category: "HARDWARE", name: "Standard kilincs", quantity: 1, unit: "db", manualReason: "Megrendelői választás." })
        .expect(201);
      const rejectedExtra = await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items`)
        .set("X-Role", "sales")
        .send({ entryMode: "MANUAL", category: "OTHER", name: "Nem kért tartozék", quantity: 1, unit: "db", manualReason: "Ellenőrzési jelölt." })
        .expect(201);
      await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${verifiedExtra.body.id}/review`)
        .set("X-Role", "technical_preparation")
        .send({ state: "VERIFIED", resolution: "A rendelés része." })
        .expect(200);
      await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${rejectedExtra.body.id}/review`)
        .set("X-Role", "technical_preparation")
        .send({ state: "REJECTED", resolution: "Nem része a rendelésnek." })
        .expect(200);

      const draftPayload = {
        calculatorProfileVersion: "doorstar-explicit-component-adapter/v1",
        expectedOrderContentHash: "0".repeat(64),
        reviewNote: "Explicit adapterkimenet ellenőrzésre.",
        confirmation: "CREATE_COMPONENT_SNAPSHOT",
        requirements: [{
          source: { kind: "ORDER_POSITION", id: positionId },
          requirementKind: "CUT_PART",
          sourceComponentKey: "position-01:door-leaf-1",
          componentKey: "door-leaf",
          name: "Ajtólap",
          quantity: 1,
          quantityUnit: "db",
          materialKey: "mdf-standard",
          finishKey: "painted-ral",
          finishedDimensionsMm: { width: 820, height: 2040, thickness: 40 },
          cuttingDimensionsMm: { width: 830, height: 2050, thickness: 42 },
        }],
      };
      await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
        .set("X-Role", "technical_preparation")
        .send(draftPayload)
        .expect(409)
        .expect({ error: "component_snapshot_requires_approved_revision" });

      const review = await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/review`)
        .set("X-Role", "technical_preparation")
        .send({ note: "Műszaki adatlap teljes." })
        .expect(201);
      const approval = await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/approve`)
        .set("X-Role", "order_approver")
        .send({ note: "A jóváhagyott rendelési tartalom megfelelő." })
        .expect(201);
      expect(approval.body.contentHash).toBe(review.body.contentHash);

      const requirements = [
        draftPayload.requirements[0],
        {
          source: { kind: "SUPPLEMENTARY_ITEM", id: verifiedExtra.body.id },
          requirementKind: "PURCHASED_PART",
          sourceComponentKey: "position-01:handle-1",
          componentKey: "handle-standard",
          name: "Standard kilincs",
          quantity: 1,
          quantityUnit: "db",
        },
      ];
      const snapshotPayload = {
        ...draftPayload,
        expectedOrderContentHash: approval.body.contentHash,
        requirements,
      };

      await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
        .set("X-Role", "technical_preparation")
        .send({ ...snapshotPayload, expectedOrderContentHash: "f".repeat(64) })
        .expect(409)
        .expect({ error: "approved_order_hash_mismatch" });
      await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
        .set("X-Role", "technical_preparation")
        .send({
          ...snapshotPayload,
          requirements: [{
            ...requirements[1],
            source: { kind: "SUPPLEMENTARY_ITEM", id: rejectedExtra.body.id },
            sourceComponentKey: "rejected-extra",
          }],
        })
        .expect(409)
        .expect(({ body }) => expect(body.error).toBe("component_source_not_verified"));
      await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
        .set("X-Role", "technical_preparation")
        .send({
          ...snapshotPayload,
          requirements: [{ ...requirements[0], materialKey: "unknown-material" }],
        })
        .expect(400)
        .expect(({ body }) => expect(body.error).toBe("component_catalog_value_invalid"));

      const created = await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
        .set("X-Role", "technical_preparation")
        .send(snapshotPayload)
        .expect(201);
      expect(created.body.created).toBe(true);
      expect(created.body.snapshot).toMatchObject({
        state: "REVIEW",
        sourceWorkOrderKey: projectKey,
        calculatorProfileVersion: "doorstar-explicit-component-adapter/v1",
        orderContentHash: approval.body.contentHash,
      });
      expect(created.body.snapshot.inputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(created.body.snapshot.outputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(created.body.snapshot.requirements).toHaveLength(2);
      expect(created.body.snapshot.requirements.every((item: { lineHash: string }) => /^[a-f0-9]{64}$/.test(item.lineHash))).toBe(true);

      const replay = await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
        .set("X-Role", "production_planner")
        .send({ ...snapshotPayload, reviewNote: "Idempotens ismétlés más megjegyzéssel." })
        .expect(200);
      expect(replay.body).toMatchObject({ created: false, snapshot: { id: created.body.snapshot.id } });
      await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
        .set("X-Role", "technical_preparation")
        .send({
          ...snapshotPayload,
          requirements: [{
            ...requirements[0],
            cuttingDimensionsMm: { width: 831, height: 2050, thickness: 42 },
          }, requirements[1]],
        })
        .expect(409)
        .expect(({ body }) => expect(body.error).toBe("component_snapshot_profile_conflict"));

      const cutPart = created.body.snapshot.requirements.find((item: { requirementKind: string }) => item.requirementKind === "CUT_PART");
      await prisma.componentRequirement.update({ where: { id: cutPart.id }, data: { cuttingWidthMm: 999 } });
      await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots/${created.body.snapshot.id}/review`)
        .set("X-Role", "order_approver")
        .send({ state: "VERIFIED", resolution: "A módosított tartalom nem fogadható el." })
        .expect(409)
        .expect({ error: "component_snapshot_content_changed" });
      await prisma.componentRequirement.update({ where: { id: cutPart.id }, data: { cuttingWidthMm: 830 } });

      await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots/${created.body.snapshot.id}/review`)
        .set("X-Role", "technical_preparation")
        .send({ state: "VERIFIED", resolution: "Ellenőrizve." })
        .expect(403);
      const verified = await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots/${created.body.snapshot.id}/review`)
        .set("X-Role", "order_approver")
        .send({ state: "VERIFIED", resolution: "Az explicit alkatrész- és szabászati méretek ellenőrizve." })
        .expect(200);
      expect(verified.body).toMatchObject({ state: "VERIFIED", reviewedByRole: "order_approver" });
      await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots/${created.body.snapshot.id}/review`)
        .set("X-Role", "order_approver")
        .send({ state: "REJECTED", resolution: "Utólagos átírás nem megengedett." })
        .expect(409)
        .expect(({ body }) => expect(body.error).toBe("component_snapshot_review_final"));

      const list = await request(app)
        .get(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
        .expect(200);
      expect(list.body).toEqual([expect.objectContaining({ id: created.body.snapshot.id, state: "VERIFIED" })]);

      await request(app)
        .post("/api/production/production-orders/revisions")
        .set("X-Role", "technical_preparation")
        .send({ projectKey, customerName: "Teszt ügyfél", positions: [{ code: "01", name: "Módosított ajtó", quantity: 1 }] })
        .expect(201);
      const supersededOrder = await request(app).get(`/api/production/production-orders/${projectKey}`).expect(200);
      const originalRevision = supersededOrder.body.revisions.find((revision: { revision: number }) => revision.revision === 1);
      expect(originalRevision.status).toBe("SUPERSEDED");
      expect(originalRevision.audit.map((entry: { action: string }) => entry.action)).toContain("SUPERSEDED");
      expect(originalRevision.audit.find((entry: { action: string }) =>
        entry.action === "SUPERSEDED").contentHashSchemaVersion).toBe(3);
      await request(app)
        .post("/api/production/production-orders/revisions")
        .set("X-Role", "technical_preparation")
        .send({ projectKey, customerName: "Teszt ügyfél", positions: [{ code: "01", name: "Harmadik piszkozat", quantity: 1 }] })
        .expect(409)
        .expect({ error: "active_order_revision_exists" });
      await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
        .set("X-Role", "production_planner")
        .send(snapshotPayload)
        .expect(409)
        .expect({ error: "component_snapshot_requires_latest_revision" });
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });
});
