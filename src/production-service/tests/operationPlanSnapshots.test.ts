import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { attachSurveySource } from "./support/surveySource.js";

const app = createApp();
const documentHash = "a".repeat(64);

async function createVerifiedComponentInput(projectKey: string) {
  const draft = await request(app)
    .post("/api/production/production-orders/sales-intake")
    .set("X-Role", "sales")
    .send({
      projectKey,
      projectName: "Műveletterv teszt",
      customerName: "Teszt ügyfél",
      positions: [{ code: "01", name: "Beltéri ajtó", quantity: 1 }],
    })
    .expect(201);
  const positionId = draft.body.positions[0].id as string;
  const document = await request(app)
    .post(`/api/production/production-orders/${projectKey}/revisions/1/documents`)
    .set("X-Role", "sales")
    .send({
      source: "SHAREPOINT",
      kind: "DRAWING",
      displayName: "Ellenőrzött műveleti dokumentum.pdf",
      relativePath: "Teszt/Muveleti-dokumentum.pdf",
      driveId: "drive-test",
      itemId: "item-test",
      versionId: "version-test-v1",
      contentSha256: documentHash,
    })
    .expect(201);
  const path = `/api/production/production-orders/${projectKey}/revisions/1`;
  await request(app).patch(`${path}/intake-stage`).set("X-Role", "sales").send({ stage: "SALES_DOCUMENTS_RECEIVED" }).expect(200);
  await request(app).patch(`${path}/intake-stage`).set("X-Role", "sales").send({ stage: "SURVEY_PENDING" }).expect(200);
  await request(app)
    .put(path)
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
  await request(app).patch(`${path}/intake-stage`).set("X-Role", "technical_preparation").send({ stage: "SURVEY_COMPLETED" }).expect(200);
  await request(app).patch(`${path}/intake-stage`).set("X-Role", "technical_preparation").send({ stage: "TECHNICAL_PREPARATION" }).expect(200);
  const review = await request(app).post(`${path}/review`).set("X-Role", "technical_preparation").send({ note: "Műszaki adatok ellenőrizve." }).expect(201);
  const approval = await request(app).post(`${path}/approve`).set("X-Role", "order_approver").send({ note: "Rendelési revízió jóváhagyva." }).expect(201);
  expect(approval.body.contentHash).toBe(review.body.contentHash);

  const component = await request(app)
    .post(`${path}/component-snapshots`)
    .set("X-Role", "technical_preparation")
    .send({
      calculatorProfileVersion: "doorstar-explicit-component-adapter/v1",
      expectedOrderContentHash: approval.body.contentHash,
      reviewNote: "Explicit alkatrészadat ellenőrzésre.",
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
    })
    .expect(201);
  const verified = await request(app)
    .patch(`${path}/component-snapshots/${component.body.snapshot.id}/review`)
    .set("X-Role", "order_approver")
    .send({ state: "VERIFIED", resolution: "Az alkatrészsnapshot ellenőrizve." })
    .expect(200);
  return {
    path,
    documentId: document.body.id as string,
    approvalHash: approval.body.contentHash as string,
    component: verified.body as {
      id: string;
      outputHash: string;
      requirements: Array<{ id: string; lineHash: string }>;
    },
  };
}

function operationPayload(input: Awaited<ReturnType<typeof createVerifiedComponentInput>>) {
  const requirement = input.component.requirements[0]!;
  const exactDocument = {
    documentVersionId: input.documentId,
    versionHash: documentHash,
    locator: "1. oldal",
  };
  return {
    componentSnapshotId: input.component.id,
    expectedOrderContentHash: input.approvalHash,
    expectedComponentOutputHash: input.component.outputHash,
    generatorProfileVersion: "doorstar-explicit-operation-adapter/v1",
    reviewNote: "Exact műveletterv ellenőrzésre.",
    confirmation: "CREATE_OPERATION_PLAN_SNAPSHOT",
    operations: [{
      id: "operation:door-leaf:cnc-1",
      sourceOperationKey: "explicit:door-leaf:cnc-1",
      sourceComponentRequirementIds: [requirement.id],
      sourceComponentLineHashes: [requirement.lineHash],
      outputAssemblyKey: null,
      sequence: 10,
      workflowGroup: "door-leaf",
      processKind: "TECHNOLOGICAL",
      operationType: "Explicit CNC megmunkálás",
      standardKey: "doorstar-explicit-technological-operation",
      standardVersion: "v1",
      qualifiers: { component: "door-leaf" },
      resourceKey: "cnc",
      machineKey: "cnc",
      toolKeys: [],
      quantity: 1,
      quantityUnit: "db",
      setupMinutesPerBatch: 5,
      cycleMinutesPerUnit: 10,
      nonTechnologicalMinutes: null,
      plannedNaturalHoldMinutes: null,
      timeStandardSource: {
        ...exactDocument,
        standardKey: "doorstar-explicit-technological-operation",
        standardVersion: "v1",
        unit: "db",
      },
      workforce: 1,
      dependencies: [],
      documentReferences: [{ ...exactDocument, purpose: "TECHNOLOGY" }],
      workInstruction: {
        ...exactDocument,
        contentCoverage: ["PREREQUISITES", "SETUP", "SAFETY", "EXECUTION", "IN_PROCESS_CONTROL", "OUTPUT_HANDLING"],
      },
      qualityCheckpoints: [{
        key: "qc:door-leaf:dimensions",
        label: "Készméret ellenőrzése",
        acceptanceRule: "A jóváhagyott rajzi méret és tűrés teljesül.",
        measurementMethod: "Mérés",
        measurementToolKey: null,
        evidenceRequirement: "Mérési jegyzőkönyv végrehajtáskor",
        required: true,
      }],
      sourceEvidence: [{
        sourceKind: "DOCUMENT",
        documentVersionId: input.documentId,
        versionHash: documentHash,
        locator: "1. oldal",
        rawValue: "Explicit CNC művelet",
        normalizedValue: "Explicit CNC megmunkálás",
        confidence: 1,
        reviewState: "RESOLVED",
      }],
    }],
  };
}

describe("exact-revision operation plan snapshots", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("materializes idempotently, reports blockers and enforces one-way separated review", async () => {
    const projectKey = `OPERATION-PLAN-${Date.now()}`;
    try {
      const input = await createVerifiedComponentInput(projectKey);
      const endpoint = `${input.path}/operation-plan-snapshots`;
      const readiness = await request(app).get(endpoint).expect(200);
      expect(readiness.body).toMatchObject({
        readiness: { ready: true, blockers: [], allowedActions: ["CREATE_OPERATION_PLAN_SNAPSHOT"] },
        snapshots: [],
      });

      const payload = operationPayload(input);
      await request(app)
        .post(endpoint)
        .set("X-Role", "technical_preparation")
        .set("X-Principal", "doorstar:user:creator")
        .send({
          ...payload,
          operations: [{ ...payload.operations[0], standardKey: "unknown-standard" }],
        })
        .expect(409)
        .expect(({ body }) => {
          expect(body.error).toBe("operation_standard_missing");
          expect(body.details.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: "operation_standard_missing", entityId: "operation:door-leaf:cnc-1" }),
          ]));
        });
      await request(app)
        .post(endpoint)
        .set("X-Role", "technical_preparation")
        .set("X-Principal", "doorstar:user:creator")
        .send({
          ...payload,
          operations: [{ ...payload.operations[0], sourceEvidence: [{ ...payload.operations[0].sourceEvidence[0], reviewState: "OPEN" }] }],
        })
        .expect(409)
        .expect(({ body }) => expect(body.error).toBe("operation_evidence_unresolved"));

      const concurrentCreates = await Promise.all(["first", "second"].map(() => request(app)
        .post(endpoint)
        .set("X-Role", "technical_preparation")
        .set("X-Principal", "doorstar:user:creator")
        .send(payload)));
      expect(concurrentCreates.map((response) => response.status).sort()).toEqual([200, 201]);
      const created = concurrentCreates.find((response) => response.status === 201)!;
      expect(created.body).toMatchObject({
        created: true,
        snapshot: {
          state: "REVIEW",
          orderContentHash: input.approvalHash,
          componentSnapshotId: input.component.id,
          readiness: {
            ready: true,
            blockers: [],
            allowedActions: ["VERIFY_OPERATION_PLAN", "REJECT_OPERATION_PLAN"],
          },
          operations: [{ id: "operation:door-leaf:cnc-1", state: "READY", quarantineReasons: [] }],
        },
      });
      expect(created.body.snapshot.inputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(created.body.snapshot.outputHash).toMatch(/^[a-f0-9]{64}$/);

      const replay = await request(app)
        .post(endpoint)
        .set("X-Role", "technical_preparation")
        .set("X-Principal", "doorstar:user:creator")
        .send({ ...payload, reviewNote: "Idempotens replay." })
        .expect(200);
      expect(replay.body).toMatchObject({ created: false, snapshot: { id: created.body.snapshot.id } });
      await request(app)
        .post(endpoint)
        .set("X-Role", "technical_preparation")
        .set("X-Principal", "doorstar:user:creator")
        .send({ ...payload, operations: [{ ...payload.operations[0], sequence: 11 }] })
        .expect(409)
        .expect(({ body }) => expect(body.error).toBe("operation_snapshot_profile_conflict"));

      const reviewEndpoint = `${endpoint}/${created.body.snapshot.id}/review`;
      await request(app)
        .patch(reviewEndpoint)
        .set("X-Role", "order_approver")
        .set("X-Principal", "doorstar:user:creator")
        .send({ state: "VERIFIED", resolution: "Saját terv nem hitelesíthető.", expectedOutputHash: created.body.snapshot.outputHash })
        .expect(409)
        .expect(({ body }) => expect(body.error).toBe("operation_review_separation_required"));
      await request(app)
        .patch(reviewEndpoint)
        .set("X-Role", "order_approver")
        .set("X-Principal", "doorstar:user:reviewer")
        .send({ state: "VERIFIED", resolution: "Stale token.", expectedOutputHash: "f".repeat(64) })
        .expect(409)
        .expect(({ body }) => expect(body.error).toBe("operation_concurrency_conflict"));
      const concurrentReviews = await Promise.all(["reviewer-a", "reviewer-b"].map((reviewer) => request(app)
        .patch(reviewEndpoint)
        .set("X-Role", "order_approver")
        .set("X-Principal", `doorstar:user:${reviewer}`)
        .send({ state: "VERIFIED", resolution: "A lineage, standard, erőforrás és kontrollterv ellenőrizve.", expectedOutputHash: created.body.snapshot.outputHash })));
      expect(
        concurrentReviews.map((response) => response.status).sort(),
        JSON.stringify(concurrentReviews.map((response) => ({ status: response.status, body: response.body }))),
      ).toEqual([200, 409]);
      const verified = concurrentReviews.find((response) => response.status === 200)!;
      expect(verified.body).toMatchObject({
        state: "VERIFIED",
        reviewedByRole: "order_approver",
        reviewedByPrincipal: expect.stringMatching(/^doorstar:user:reviewer-[ab]$/),
        readiness: { ready: true, allowedActions: [] },
      });
      await request(app)
        .patch(reviewEndpoint)
        .set("X-Role", "production_planner")
        .set("X-Principal", "doorstar:user:third")
        .send({ state: "REJECTED", resolution: "Final state cannot change.", expectedOutputHash: created.body.snapshot.outputHash })
        .expect(409)
        .expect(({ body }) => expect(body.error).toBe("operation_snapshot_state_conflict"));

      const listed = await request(app).get(endpoint).expect(200);
      expect(listed.body.snapshots).toEqual([
        expect.objectContaining({ id: created.body.snapshot.id, state: "VERIFIED" }),
      ]);

      await request(app)
        .post("/api/production/production-orders/revisions")
        .set("X-Role", "technical_preparation")
        .send({ projectKey, customerName: "Teszt ügyfél", positions: [{ code: "01", name: "Módosított ajtó", quantity: 1 }] })
        .expect(201);
      const historical = await request(app).get(endpoint).expect(200);
      expect(historical.body.readiness.ready).toBe(false);
      expect(historical.body.snapshots[0].readiness.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "operation_revision_stale" }),
      ]));
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });
});
