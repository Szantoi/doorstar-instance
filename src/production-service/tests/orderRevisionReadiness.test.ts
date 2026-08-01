import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { getOrderRevisionReadiness } from "../src/services/orderRevisionReadiness.js";
import { attachSurveySource } from "./support/surveySource.js";

const app = createApp();

async function createTechnicalDraft(projectKey: string) {
  const draft = await request(app)
    .post("/api/production/production-orders/sales-intake")
    .set("X-Role", "sales")
    .send({
      projectKey,
      projectName: "Readiness integration",
      customerName: "Readiness customer",
      positions: [{ code: "01", name: "Interior door", quantity: 1 }],
    })
    .expect(201);
  const positionId = draft.body.positions[0].id as string;
  const path = `/api/production/production-orders/${projectKey}/revisions/1`;
  await request(app)
    .post(`${path}/documents`)
    .set("X-Role", "sales")
    .send({ source: "LEGACY_FOLDER", kind: "SALES_ORDER", displayName: "Order.pdf", relativePath: `${projectKey}/Order.pdf` })
    .expect(201);
  await request(app).patch(`${path}/intake-stage`).set("X-Role", "sales").send({ stage: "SALES_DOCUMENTS_RECEIVED" }).expect(200);
  await request(app).patch(`${path}/intake-stage`).set("X-Role", "sales").send({ stage: "SURVEY_PENDING" }).expect(200);
  await request(app)
    .put(path)
    .set("X-Role", "technical_preparation")
    .send({
      customerName: "Readiness customer",
      positions: [{
        id: positionId,
        code: "01",
        name: "Interior door",
        quantity: 1,
        openingDirection: "Left inward",
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
  const surveyDocument = await attachSurveySource(app, projectKey, [positionId]);
  return { path, positionId, surveyDocumentId: surveyDocument.id };
}

async function approveAndVerifyComponent(projectKey: string) {
  const { input, approvalContentHash } = await approveRevision(projectKey);
  const component = await request(app)
    .post(`${input.path}/component-snapshots`)
    .set("X-Role", "technical_preparation")
    .send({
      calculatorProfileVersion: "doorstar-explicit-component-adapter/v1",
      expectedOrderContentHash: approvalContentHash,
      reviewNote: "Explicit component output for review.",
      confirmation: "CREATE_COMPONENT_SNAPSHOT",
      requirements: [{
        source: { kind: "ORDER_POSITION", id: input.positionId },
        requirementKind: "CUT_PART",
        sourceComponentKey: "position-01:door-leaf",
        componentKey: "door-leaf",
        name: "Door leaf",
        quantity: 1,
        quantityUnit: "db",
        materialKey: "mdf-standard",
        finishKey: "painted-ral",
        finishedDimensionsMm: { width: 820, height: 2040, thickness: 40 },
        cuttingDimensionsMm: { width: 830, height: 2050, thickness: 42 },
      }],
    })
    .expect(201);
  await request(app)
    .patch(`${input.path}/component-snapshots/${component.body.snapshot.id}/review`)
    .set("X-Role", "order_approver")
    .send({ state: "VERIFIED", resolution: "Exact component snapshot verified." })
    .expect(200);
  return { ...input, componentId: component.body.snapshot.id as string };
}

async function approveRevision(projectKey: string) {
  const input = await createTechnicalDraft(projectKey);
  await request(app).patch(`${input.path}/intake-stage`).set("X-Role", "technical_preparation").send({ stage: "SURVEY_COMPLETED" }).expect(200);
  await request(app).patch(`${input.path}/intake-stage`).set("X-Role", "technical_preparation").send({ stage: "TECHNICAL_PREPARATION" }).expect(200);
  const review = await request(app).post(`${input.path}/review`).set("X-Role", "technical_preparation").send({ note: "Ready for independent approval." }).expect(201);
  const approval = await request(app).post(`${input.path}/approve`).set("X-Role", "order_approver").send({ note: "Exact revision approved." }).expect(201);
  expect(approval.body.contentHash).toBe(review.body.contentHash);
  return { input, approvalContentHash: approval.body.contentHash as string };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("authoritative exact-revision readiness", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("reports unresolved exact evidence as a structured blocker and exposes no inferred action", async () => {
    const projectKey = `READINESS-EVIDENCE-${Date.now()}`;
    try {
      const input = await createTechnicalDraft(projectKey);
      const evidence = await request(app)
        .post(`${input.path}/positions/${input.positionId}/evidence`)
        .set("X-Role", "technical_preparation")
        .send({
          orderDocumentId: input.surveyDocumentId,
          sourceRoot: "legacy",
          relativePath: `${projectKey}/Survey.pdf`,
          page: 1,
          field: "OPENING_WIDTH_MM",
          rawValue: "900",
          normalizedValue: 900,
          reviewState: "REVIEW",
        })
        .expect(201);

      const response = await request(app)
        .get(`${input.path}/readiness`)
        .set("X-Role", "reader")
        .expect(200);

      expect(response.body.gates.map((gate: { key: string }) => gate.key)).toEqual([
        "SURVEY", "POSITION_EVIDENCE", "DOCUMENTS", "MANUFACTURED_ITEMS",
        "SUPPLEMENTARY_ITEMS", "ORDER_REVIEW", "COMPONENT_SNAPSHOT",
        "OPERATION_PLAN", "PRODUCTION_RELEASE",
      ]);
      expect(response.body.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "position_evidence_unresolved",
          ownerRole: "technical_preparation",
          entity: expect.objectContaining({ kind: "ORDER_POSITION_EVIDENCE", id: evidence.body.id }),
        }),
      ]));
      expect(response.body.allowedActions).toEqual([]);
      expect(response.body.nextAction).toMatchObject({ kind: "BLOCKED" });
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });

  it("projects approved and current VERIFIED component progression, while release stays fail-closed", async () => {
    const projectKey = `READINESS-PROGRESSION-${Date.now()}`;
    try {
      const input = await approveAndVerifyComponent(projectKey);
      const response = await request(app)
        .get(`${input.path}/readiness`)
        .set("X-Role", "production_planner")
        .expect(200);

      expect(response.body.revision).toMatchObject({
        number: 1,
        isLatest: true,
        status: "APPROVED",
        intakeStage: "TECHNICAL_PREPARATION",
        contentHash: { verification: "VERIFIED" },
      });
      const componentGate = response.body.gates.find((gate: { key: string }) => gate.key === "COMPONENT_SNAPSHOT");
      expect(componentGate).toMatchObject({
        state: "READY",
        details: { kind: "COMPONENT_SNAPSHOT", currentVerifiedSnapshotId: input.componentId, current: true, verified: true },
      });
      expect(response.body.allowedActions).toEqual([
        expect.objectContaining({ code: "CREATE_OPERATION_PLAN_SNAPSHOT", method: "POST" }),
      ]);
      expect(response.body.nextAction).toMatchObject({ kind: "ACTION", action: { code: "CREATE_OPERATION_PLAN_SNAPSHOT" } });
      const release = response.body.gates.find((gate: { key: string }) => gate.key === "PRODUCTION_RELEASE");
      expect(release).toMatchObject({
        state: "NOT_AVAILABLE",
        ready: false,
        allowedActions: [],
        details: { authority: "NOT_AVAILABLE", planningProposalAvailable: false, issuedWorkPackageAvailable: false },
      });
      expect(release.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "planning_proposal_authority_not_available" }),
        expect.objectContaining({ code: "issued_work_package_authority_not_available" }),
      ]));

      const reader = await request(app).get(`${input.path}/readiness`).set("X-Role", "reader").expect(200);
      expect(reader.body.allowedActions).toEqual([]);
      expect(reader.body.nextAction).toMatchObject({ kind: "BLOCKED", blockerCode: "operation_plan_snapshot_required" });
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });

  it("keeps a coherent pre-write snapshot when a component snapshot is created concurrently", async () => {
    const projectKey = `READINESS-COMPONENT-RACE-${Date.now()}`;
    const enteredProjection = deferred();
    const releaseProjection = deferred();
    try {
      const { input, approvalContentHash } = await approveRevision(projectKey);
      const projectionPromise = getOrderRevisionReadiness(projectKey, 1, "production_planner", {
        afterExactRevisionRead: async () => {
          enteredProjection.resolve();
          await releaseProjection.promise;
        },
      });
      await enteredProjection.promise;

      const component = await request(app)
        .post(`${input.path}/component-snapshots`)
        .set("X-Role", "technical_preparation")
        .send({
          calculatorProfileVersion: "doorstar-explicit-component-adapter/v1",
          expectedOrderContentHash: approvalContentHash,
          reviewNote: "Concurrent component snapshot.",
          confirmation: "CREATE_COMPONENT_SNAPSHOT",
          requirements: [{
            source: { kind: "ORDER_POSITION", id: input.positionId },
            requirementKind: "CUT_PART",
            sourceComponentKey: "position-01:door-leaf",
            componentKey: "door-leaf",
            name: "Door leaf",
            quantity: 1,
            quantityUnit: "db",
            materialKey: "mdf-standard",
            finishKey: "painted-ral",
            finishedDimensionsMm: { width: 820, height: 2040, thickness: 40 },
            cuttingDimensionsMm: { width: 830, height: 2050, thickness: 42 },
          }],
        })
        .expect(201);
      await request(app)
        .patch(`${input.path}/component-snapshots/${component.body.snapshot.id}/review`)
        .set("X-Role", "order_approver")
        .send({ state: "VERIFIED", resolution: "Concurrent snapshot verified." })
        .expect(200);
      releaseProjection.resolve();

      const duringRace = await projectionPromise;
      expect(duringRace.gates.find((gate) => gate.key === "COMPONENT_SNAPSHOT")).toMatchObject({
        state: "BLOCKED",
        details: { snapshotCount: 0, currentVerifiedSnapshotId: null },
      });
      expect(duringRace.gates.find((gate) => gate.key === "OPERATION_PLAN")).toMatchObject({
        state: "BLOCKED",
        details: { snapshotCount: 0 },
      });

      const afterRace = await getOrderRevisionReadiness(projectKey, 1, "production_planner");
      expect(afterRace.gates.find((gate) => gate.key === "COMPONENT_SNAPSHOT")).toMatchObject({
        state: "READY",
        details: { snapshotCount: 1, currentVerifiedSnapshotId: component.body.snapshot.id },
      });
      expect(afterRace.allowedActions).toEqual([
        expect.objectContaining({ code: "CREATE_OPERATION_PLAN_SNAPSHOT" }),
      ]);
    } finally {
      releaseProjection.resolve();
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  }, 20_000);

  it("keeps revision status and latest identity from one snapshot during concurrent revision creation", async () => {
    const projectKey = `READINESS-REVISION-RACE-${Date.now()}`;
    const enteredProjection = deferred();
    const releaseProjection = deferred();
    try {
      const input = await approveAndVerifyComponent(projectKey);
      const projectionPromise = getOrderRevisionReadiness(projectKey, 1, "production_planner", {
        afterExactRevisionRead: async () => {
          enteredProjection.resolve();
          await releaseProjection.promise;
        },
      });
      await enteredProjection.promise;

      await request(app)
        .post("/api/production/production-orders/revisions")
        .set("X-Role", "technical_preparation")
        .send({ projectKey, customerName: "Concurrent revision", positions: [{ code: "01", name: "Changed door", quantity: 1 }] })
        .expect(201);
      releaseProjection.resolve();

      const duringRace = await projectionPromise;
      expect(duringRace.revision).toMatchObject({ number: 1, isLatest: true, latestRevisionNumber: 1, status: "APPROVED" });
      expect(duringRace.gates.find((gate) => gate.key === "COMPONENT_SNAPSHOT")).toMatchObject({ state: "READY" });

      const afterRace = await getOrderRevisionReadiness(projectKey, 1, "production_planner");
      expect(afterRace.revision).toMatchObject({ number: 1, isLatest: false, latestRevisionNumber: 2, status: "SUPERSEDED" });
      expect(afterRace.gates.find((gate) => gate.key === "COMPONENT_SNAPSHOT")).toMatchObject({ state: "BLOCKED", allowedActions: [] });
    } finally {
      releaseProjection.resolve();
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  }, 20_000);

  it("keeps a stale exact revision readable and blocks every downstream current-state claim", async () => {
    const projectKey = `READINESS-STALE-${Date.now()}`;
    try {
      const input = await approveAndVerifyComponent(projectKey);
      await request(app)
        .post("/api/production/production-orders/revisions")
        .set("X-Role", "technical_preparation")
        .send({ projectKey, customerName: "Changed customer", positions: [{ code: "01", name: "Changed door", quantity: 1 }] })
        .expect(201);

      const stale = await request(app).get(`${input.path}/readiness`).set("X-Role", "production_planner").expect(200);
      expect(stale.body.revision).toMatchObject({ number: 1, isLatest: false, latestRevisionNumber: 2, status: "SUPERSEDED" });
      for (const key of ["ORDER_REVIEW", "COMPONENT_SNAPSHOT", "OPERATION_PLAN"]) {
        const downstream = stale.body.gates.find((gate: { key: string }) => gate.key === key);
        expect(downstream).toMatchObject({ state: "BLOCKED", ready: false, allowedActions: [] });
        expect(downstream.blockers).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: "latest_revision_required" }),
        ]));
      }
      const release = stale.body.gates.find((gate: { key: string }) => gate.key === "PRODUCTION_RELEASE");
      expect(release).toMatchObject({ state: "NOT_AVAILABLE", ready: false, allowedActions: [] });
      expect(release.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "latest_revision_required" }),
      ]));
      expect(stale.body.gates.find((gate: { key: string }) => gate.key === "COMPONENT_SNAPSHOT")).toMatchObject({ state: "BLOCKED", ready: false });
      expect(stale.body.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "operation_revision_stale" }),
      ]));
      expect(stale.body.allowedActions).toEqual([]);
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });

  it("blocks a superseded linked document version in both the projection and shared review command", async () => {
    const projectKey = `READINESS-DOCUMENT-${Date.now()}`;
    try {
      const input = await createTechnicalDraft(projectKey);
      await request(app)
        .post(`${input.path}/documents`)
        .set("X-Role", "technical_preparation")
        .send({
          source: "LEGACY_FOLDER",
          kind: "SURVEY",
          displayName: "Survey revision 2.pdf",
          relativePath: `${projectKey}/Survey-v2.pdf`,
          supersedesDocumentId: input.surveyDocumentId,
        })
        .expect(201);
      await request(app).patch(`${input.path}/intake-stage`).set("X-Role", "technical_preparation").send({ stage: "SURVEY_COMPLETED" }).expect(200);
      await request(app).patch(`${input.path}/intake-stage`).set("X-Role", "technical_preparation").send({ stage: "TECHNICAL_PREPARATION" }).expect(200);

      const readiness = await request(app).get(`${input.path}/readiness`).set("X-Role", "technical_preparation").expect(200);
      const documents = readiness.body.gates.find((gate: { key: string }) => gate.key === "DOCUMENTS");
      expect(documents).toMatchObject({ state: "BLOCKED", ready: false, allowedActions: [] });
      expect(documents.details.staleLinkedDocumentVersionIds).toEqual([input.surveyDocumentId]);
      expect(documents.blockers).toEqual([
        expect.objectContaining({ code: "stale_document_version_linked", detail: { documentVersionIds: [input.surveyDocumentId] } }),
      ]);
      expect(readiness.body.gates.find((gate: { key: string }) => gate.key === "ORDER_REVIEW")).toMatchObject({
        state: "BLOCKED",
        ready: false,
        allowedActions: [],
      });
      await request(app)
        .post(`${input.path}/review`)
        .set("X-Role", "technical_preparation")
        .send({ note: "A stale link must not pass the shared predicate." })
        .expect(409)
        .expect({ error: "review_readiness_incomplete" });
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });

  it("serves the project workflow without promoting missing contracts and uses stable error envelopes", async () => {
    const invalid = await request(app)
      .get("/api/production/production-orders/NOPE/revisions/not-a-number/readiness")
      .expect(400);
    expect(invalid.body).toEqual({
      error: {
        code: "invalid_revision",
        message: "Revision must be a positive integer.",
        details: { revision: "not-a-number" },
        requestId: expect.any(String),
      },
    });
    const forbidden = await request(app)
      .get("/api/production/production-orders/NOPE/revisions/1/readiness")
      .set("X-Role", "invented-role")
      .expect(403);
    expect(forbidden.body.error).toMatchObject({ code: "role_not_authorized", details: { role: "invented-role" } });

    const projectKey = `READINESS-WORKFLOW-${Date.now()}`;
    try {
      await createTechnicalDraft(projectKey);
      const workflow = await request(app)
        .get(`/api/production/projects/${projectKey}/workflow`)
        .set("X-Role", "reader")
        .expect(200);
      expect(workflow.body.gates.map((gate: { key: string }) => gate.key)).toEqual([
        "ORDER", "COMPONENTS", "OPERATIONS", "PLANNING", "WORK_PACKAGE", "PRODUCTION_6_STAGE", "HANDOVER",
      ]);
      expect(workflow.body.gates.slice(3).map((gate: { state: string }) => gate.state)).toEqual([
        "CONTRACT_REQUIRED", "CONTRACT_REQUIRED", "CONTRACT_REQUIRED", "CONTRACT_REQUIRED",
      ]);
      expect(workflow.body.allowedActions).toEqual([]);
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });
});
