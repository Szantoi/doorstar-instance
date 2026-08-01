import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { attachSurveySource } from "./support/surveySource.js";

const app = createApp();
const createdProjectKeys = new Set<string>();
let sequence = 0;

function completePosition(openingDepthMm: number | null) {
  return {
    code: "01",
    name: "Beltéri ajtó",
    quantity: 1,
    productType: "Tokba nyíló",
    openingDirection: "Bal be",
    openingWidthMm: 900,
    openingHeightMm: 2100,
    openingDepthMm,
    doorThicknessMm: 40,
    surface: "Festett",
    wallTreatment: "NONE",
    glazing: "NONE",
    doorTypeKey: "interior-rebated",
    wallSolutionKey: "none",
    glassKey: "none",
  };
}

async function createSurveyPendingDraft(openingDepthMm: number | null) {
  const projectKey = `SURVEY-GATE-${Date.now()}-${++sequence}`;
  createdProjectKeys.add(projectKey);
  const draft = await request(app)
    .post("/api/production/production-orders/sales-intake")
    .set("X-Role", "sales")
    .send({
      projectKey,
      projectName: "Felméréslezárási kapu teszt",
      customerName: "Teszt ügyfél",
      positions: [completePosition(openingDepthMm)],
    })
    .expect(201);
  await request(app)
    .post(`/api/production/production-orders/${projectKey}/revisions/1/documents`)
    .set("X-Role", "sales")
    .send({
      source: "LEGACY_FOLDER",
      kind: "SALES_ORDER",
      displayName: "Megrendelés.pdf",
      relativePath: `${projectKey}/Megrendeles.pdf`,
    })
    .expect(201);
  const intakePath = `/api/production/production-orders/${projectKey}/revisions/1/intake-stage`;
  await request(app).patch(intakePath).set("X-Role", "sales").send({ stage: "SALES_DOCUMENTS_RECEIVED" }).expect(200);
  await request(app).patch(intakePath).set("X-Role", "sales").send({ stage: "SURVEY_PENDING" }).expect(200);
  return {
    projectKey,
    positionId: draft.body.positions[0].id as string,
    intakePath,
  };
}

describe("fail-closed survey completion gate", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterEach(async () => {
    const keys = [...createdProjectKeys];
    createdProjectKeys.clear();
    if (keys.length) await prisma.project.deleteMany({ where: { key: { in: keys } } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("accepts a complete manual survey with an exact SURVEY document link and no field evidence", async () => {
    const fixture = await createSurveyPendingDraft(150);
    await attachSurveySource(app, fixture.projectKey, [fixture.positionId]);

    const completed = await request(app)
      .patch(fixture.intakePath)
      .set("X-Role", "technical_preparation")
      .send({ stage: "SURVEY_COMPLETED" })
      .expect(200);

    expect(completed.body).toMatchObject({
      intakeStage: "SURVEY_COMPLETED",
      surveyCompletedAt: expect.any(String),
    });
  });

  it("reports missing wall depth, SURVEY lineage and unresolved evidence without advancing", async () => {
    const fixture = await createSurveyPendingDraft(null);
    const firstAttempt = await request(app)
      .patch(fixture.intakePath)
      .set("X-Role", "technical_preparation")
      .send({ stage: "SURVEY_COMPLETED" })
      .expect(409);
    expect(firstAttempt.body).toEqual({
      error: "survey_data_incomplete",
      details: {
        positionCount: 1,
        surveyDocumentRequired: true,
        positionsMissingFields: [{
          orderPositionId: fixture.positionId,
          fields: ["openingDepthMm"],
        }],
        positionIdsMissingSurveyDocumentLink: [fixture.positionId],
        positionEvidence: {
          totalEvidence: 0,
          resolvedEvidence: 0,
          unresolvedEvidence: 0,
          rejectedEvidence: 0,
          blockerEvidenceIds: [],
        },
      },
    });

    const surveyDocument = await attachSurveySource(app, fixture.projectKey, [fixture.positionId]);
    const evidence = await request(app)
      .post(`/api/production/production-orders/${fixture.projectKey}/revisions/1/positions/${fixture.positionId}/evidence`)
      .set("X-Role", "technical_preparation")
      .send({
        orderDocumentId: surveyDocument.id,
        sourceRoot: "survey",
        relativePath: `${fixture.projectKey}/Felmeresi-lap.pdf`,
        page: 1,
        field: "OPENING_WIDTH_MM",
        rawValue: "900 mm",
        normalizedValue: 900,
        reviewState: "REVIEW",
      })
      .expect(201);

    const unresolvedAttempt = await request(app)
      .patch(fixture.intakePath)
      .set("X-Role", "technical_preparation")
      .send({ stage: "SURVEY_COMPLETED" })
      .expect(409);
    expect(unresolvedAttempt.body.details).toMatchObject({
      surveyDocumentRequired: false,
      positionsMissingFields: [{
        orderPositionId: fixture.positionId,
        fields: ["openingDepthMm"],
      }],
      positionIdsMissingSurveyDocumentLink: [],
      positionEvidence: {
        totalEvidence: 1,
        resolvedEvidence: 0,
        unresolvedEvidence: 1,
        blockerEvidenceIds: [evidence.body.id],
      },
    });

    await request(app)
      .patch(`/api/production/production-orders/${fixture.projectKey}/revisions/1/positions/${fixture.positionId}/evidence/${evidence.body.id}`)
      .set("X-Role", "technical_preparation")
      .set("X-Principal", "doorstar-user:survey-reviewer")
      .send({ reviewState: "RESOLVED", resolution: "A felmérési lap értéke ellenőrizve." })
      .expect(200);
    await request(app)
      .put(`/api/production/production-orders/${fixture.projectKey}/revisions/1`)
      .set("X-Role", "technical_preparation")
      .send({
        customerName: "Teszt ügyfél",
        positions: [{ id: fixture.positionId, ...completePosition(150) }],
      })
      .expect(200);

    await request(app)
      .patch(fixture.intakePath)
      .set("X-Role", "technical_preparation")
      .send({ stage: "SURVEY_COMPLETED" })
      .expect(200);
  });
});
