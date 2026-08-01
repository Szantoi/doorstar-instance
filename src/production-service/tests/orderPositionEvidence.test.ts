import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { attachSurveySource } from "./support/surveySource.js";

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

    await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/positions/${positionId}/evidence`)
      .set("X-Role", "technical_preparation")
      .send({
        sourceRoot: "sales",
        relativePath: "DSMR Test/Megrendelés.pdf",
        field: "OPENING_WIDTH_MM",
        rawValue: "900 mm",
        normalizedValue: 900,
        reviewState: "RESOLVED",
        resolution: "Creation must not finalize evidence.",
      })
      .expect(400);

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
      .set("X-Principal", "doorstar-user:test-preparer")
      .send({ reviewState: "RESOLVED", resolution: "A helyszíni felmérés 910 mm-t igazolt." })
      .expect(200);
    expect(reviewed.body).toMatchObject({
      reviewState: "RESOLVED",
      reviewedByPrincipal: "doorstar-user:test-preparer",
      reviewedByRole: "technical_preparation",
    });
    expect(reviewed.body.reviewedAt).toEqual(expect.any(String));

    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/positions/${positionId}/evidence/${created.body.id}`)
      .set("X-Role", "order_approver")
      .set("X-Principal", "doorstar-user:test-approver")
      .send({ reviewState: "REJECTED", resolution: "A korábbi döntés nem írható felül." })
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          error: "position_evidence_review_final",
          reviewState: "RESOLVED",
        });
      });

    detail = await request(app).get(`/api/production/production-orders/${projectKey}`).expect(200);
    expect(detail.body.revisions[0].positions[0]).toMatchObject({
      id: positionId,
      openingWidthMm: 910,
      evidence: [{ id: created.body.id, reviewState: "RESOLVED" }],
    });

    await request(app)
      .put(`/api/production/production-orders/${projectKey}/revisions/1`)
      .set("X-Role", "technical_preparation")
      .send({
        customerName: "Minta Kft.",
        positions: [{ code: "02", name: "Csereajtó", quantity: 1 }],
      })
      .expect(409)
      .expect({
        error: "position_evidence_must_be_retained",
        positionId,
      });
  });

  it("blocks review, approval-derived materialization and release until every position evidence row is completely audited", async () => {
    const revision = await request(app)
      .post("/api/production/production-orders/sales-intake")
      .set("X-Role", "sales")
      .send({
        projectKey,
        projectName: "Position evidence approval gate",
        customerName: "Minta Kft.",
        positions: [{ code: "01", name: "Beltéri ajtó", quantity: 1 }],
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
        relativePath: "DSMR Test/Megrendeles.pdf",
        contentSha256: "a".repeat(64),
      })
      .expect(201);
    await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/documents/${document.body.id}/positions`)
      .set("X-Role", "technical_preparation")
      .send({ orderPositionId: positionId })
      .expect(201);
    await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`).set("X-Role", "sales").send({ stage: "SALES_DOCUMENTS_RECEIVED" }).expect(200);
    await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`).set("X-Role", "sales").send({ stage: "SURVEY_PENDING" }).expect(200);
    await request(app)
      .put(`/api/production/production-orders/${projectKey}/revisions/1`)
      .set("X-Role", "technical_preparation")
      .send({
        customerName: "Minta Kft.",
        positions: [{
          id: positionId,
          code: "01",
          name: "Beltéri ajtó",
          quantity: 1,
          productType: "Tokba nyíló",
          openingDirection: "Bal be",
          openingWidthMm: 900,
          openingHeightMm: 2100,
          openingDepthMm: 150,
          doorThicknessMm: 40,
          surface: "Festett",
          wallTreatment: "NONE",
          glazing: "NONE",
          doorTypeKey: "interior-rebated",
          wallSolutionKey: "none",
          glassKey: "none",
        }],
      })
      .expect(200);
    await attachSurveySource(app, projectKey, [positionId]);
    await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`).set("X-Role", "technical_preparation").send({ stage: "SURVEY_COMPLETED" }).expect(200);
    await request(app).patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`).set("X-Role", "technical_preparation").send({ stage: "TECHNICAL_PREPARATION" }).expect(200);

    const evidence = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/positions/${positionId}/evidence`)
      .set("X-Role", "technical_preparation")
      .send({
        orderDocumentId: document.body.id,
        sourceRoot: "sales",
        relativePath: "DSMR Test/Megrendeles.pdf",
        page: 1,
        field: "OPENING_WIDTH_MM",
        rawValue: "900 mm",
        normalizedValue: 900,
        reviewState: "REVIEW",
      })
      .expect(201);

    await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/review`)
      .set("X-Role", "technical_preparation")
      .send({ note: "Nyitott evidence mellett tilos." })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error).toBe("position_evidence_unresolved");
        expect(body.details).toMatchObject({
          totalEvidence: 1,
          resolvedEvidence: 0,
          blockerEvidenceIds: [evidence.body.id],
        });
      });

    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/positions/${positionId}/evidence/${evidence.body.id}`)
      .set("X-Role", "technical_preparation")
      .set("X-Principal", "doorstar-user:survey-reviewer")
      .send({ reviewState: "RESOLVED", resolution: "A helyszíni felmérési lap egyezik." })
      .expect(200);
    const review = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/review`)
      .set("X-Role", "technical_preparation")
      .send({ note: "A position evidence lezárva." })
      .expect(201);
    expect(review.body.contentHashSchemaVersion).toBe(3);
    const approval = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/approve`)
      .set("X-Role", "order_approver")
      .send({ note: "A hash-v3 tartalom jóváhagyva." })
      .expect(201);
    expect(approval.body).toMatchObject({
      contentHashSchemaVersion: 3,
      contentHash: review.body.contentHash,
    });
    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/positions/${positionId}/evidence/${evidence.body.id}`)
      .set("X-Role", "order_approver")
      .set("X-Principal", "doorstar-user:approved-revision-reviewer")
      .send({ reviewState: "REJECTED", resolution: "APPROVED revízió nem módosítható." })
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          error: "revision_version_conflict",
          details: { currentStatus: "APPROVED", requiredStatus: "DRAFT" },
        });
      });

    // Adversarial legacy/tamper fixture: downstream guards must fail before
    // trusting the otherwise valid historical approval audit.
    await prisma.orderPositionEvidence.update({
      where: { id: evidence.body.id },
      data: {
        reviewState: "REVIEW",
        reviewedByPrincipal: null,
        reviewedByRole: null,
        reviewedAt: null,
      },
    });
    await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
      .set("X-Role", "technical_preparation")
      .send({
        calculatorProfileVersion: "doorstar-explicit-component-adapter/v1",
        expectedOrderContentHash: approval.body.contentHash,
        reviewNote: "Karanténos evidence mellett tilos.",
        confirmation: "CREATE_COMPONENT_SNAPSHOT",
        requirements: [{
          source: { kind: "ORDER_POSITION", id: positionId },
          requirementKind: "CUT_PART",
          sourceComponentKey: "position-01:door-leaf",
          componentKey: "door-leaf",
          name: "Ajtólap",
          quantity: 1,
          quantityUnit: "db",
          materialKey: "mdf-standard",
          finishedDimensionsMm: { width: 820, height: 2040, thickness: 40 },
          cuttingDimensionsMm: { width: 830, height: 2050, thickness: 42 },
        }],
      })
      .expect(409)
      .expect(({ body }) => expect(body.error).toBe("component_position_evidence_unresolved"));
    await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/document-releases`)
      .set("X-Role", "technical_preparation")
      .send({
        issuedWorkPackageKey: "WP-POSITION-EVIDENCE",
        documentIds: [document.body.id],
        releaseNote: "Karanténos evidence mellett tilos.",
        confirmation: "ISSUE_DOCUMENT_VERSIONS",
      })
      .expect(409)
      .expect(({ body }) => expect(body.error).toBe("position_evidence_unresolved"));
  });
});
