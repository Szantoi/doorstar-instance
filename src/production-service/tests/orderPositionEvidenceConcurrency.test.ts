import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Response } from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import {
  OrderPositionEvidenceReviewError,
  reviewOrderPositionEvidence,
} from "../src/services/orderPositionEvidenceReview.js";

const app = createApp();
let lockClient: PrismaClient;
let observerClient: PrismaClient;
let sequence = 0;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function settle<T>(promise: PromiseLike<T>): Promise<Settled<T>> {
  return Promise.resolve(promise).then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}

async function createFixture(status: "DRAFT" | "REVIEW") {
  const projectKey = `POSITION-EVIDENCE-RACE-${Date.now()}-${++sequence}`;
  const project = await prisma.project.create({ data: { key: projectKey, name: "Position evidence race" } });
  const order = await prisma.productionOrder.create({ data: { projectId: project.id } });
  const revision = await prisma.orderRevision.create({
    data: {
      orderId: order.id,
      revision: 1,
      status,
      customerName: "Teszt ügyfél",
      intakeStage: "TECHNICAL_PREPARATION",
      positions: { create: {
        position: 0,
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
      } },
      documents: { create: {
        source: "LEGACY_FOLDER",
        kind: "SALES_ORDER",
        displayName: "Megrendelés.pdf",
        relativePath: "Teszt/Megrendeles.pdf",
      } },
    },
    include: { positions: true },
  });
  const surveyDocument = await prisma.orderDocument.create({
    data: {
      orderRevisionId: revision.id,
      source: "LEGACY_FOLDER",
      kind: "SURVEY",
      displayName: "Felmérési lap.pdf",
      relativePath: "Teszt/Felmeresi-lap.pdf",
    },
  });
  await prisma.orderDocumentPositionLink.create({
    data: {
      orderDocumentId: surveyDocument.id,
      orderPositionId: revision.positions[0]!.id,
    },
  });
  const evidence = await prisma.orderPositionEvidence.create({
    data: {
      orderPositionId: revision.positions[0]!.id,
      sourceRoot: "sales",
      relativePath: "Teszt/Megrendeles.pdf",
      field: "OPENING_WIDTH_MM",
      rawValue: "900 mm",
      normalizedValue: 900,
      reviewState: "REVIEW",
      createdByRole: "technical_preparation",
    },
  });
  return { projectKey, revisionId: revision.id, positionId: revision.positions[0]!.id, evidenceId: evidence.id };
}

async function holdRow(table: "OrderRevision" | "OrderPositionEvidence", id: string) {
  const acquired = deferred<void>();
  const release = deferred<void>();
  const done = lockClient.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT "id" FROM "${table}" WHERE "id" = $1 FOR UPDATE`, id);
    acquired.resolve();
    await release.promise;
  });
  void done.catch((error) => acquired.reject(error));
  await acquired.promise;
  return { done, release: () => release.resolve() };
}

async function waitForBlocked(table: "OrderRevision" | "OrderPositionEvidence", count = 1) {
  const deadline = Date.now() + 5_000;
  let rows: Array<{ pid: number }> = [];
  while (Date.now() < deadline) {
    rows = await observerClient.$queryRaw<Array<{ pid: number }>>`
      SELECT pid
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state = 'active'
        AND wait_event_type = 'Lock'
        AND query LIKE ${`%FROM "${table}"%`}
        AND query LIKE '%FOR UPDATE%'
    `;
    if (rows.length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${count} blocked FOR UPDATE query on ${table}; observed ${rows.length}.`);
}

describe("order-position evidence concurrency", () => {
  beforeAll(async () => {
    lockClient = new PrismaClient();
    observerClient = new PrismaClient();
    await Promise.all([prisma.$connect(), lockClient.$connect(), observerClient.$connect()]);
  });
  afterAll(async () => {
    await Promise.all([prisma.$disconnect(), lockClient.$disconnect(), observerClient.$disconnect()]);
  });

  it("serializes final evidence review before order review freezes the revision", async () => {
    const fixture = await createFixture("DRAFT");
    const held = await holdRow("OrderPositionEvidence", fixture.evidenceId);
    const pending: Array<Promise<Settled<unknown>>> = [];
    try {
      const evidenceTask = settle(reviewOrderPositionEvidence(
        fixture.revisionId,
        fixture.positionId,
        fixture.evidenceId,
        { reviewState: "RESOLVED", resolution: "A helyszíni lap egyezik." },
        { role: "technical_preparation", principal: "doorstar-user:race-reviewer" },
      ));
      pending.push(evidenceTask);
      await waitForBlocked("OrderPositionEvidence");

      const reviewTask = settle<Response>(request(app)
        .post(`/api/production/production-orders/${fixture.projectKey}/revisions/1/review`)
        .set("X-Role", "technical_preparation")
        .send({ note: "Evidence döntés után fagyasztva." }));
      pending.push(reviewTask);
      await waitForBlocked("OrderRevision");

      held.release();
      await held.done;
      const [evidenceResult, reviewResult] = await Promise.all([evidenceTask, reviewTask]);
      if (!evidenceResult.ok) throw evidenceResult.error;
      if (!reviewResult.ok) throw reviewResult.error;
      expect(evidenceResult.value).toMatchObject({
        reviewState: "RESOLVED",
        reviewedByPrincipal: "doorstar-user:race-reviewer",
      });
      expect(reviewResult.value.status).toBe(201);
      expect(reviewResult.value.body.contentHashSchemaVersion).toBe(3);
    } finally {
      held.release();
      await Promise.allSettled([held.done, ...pending]);
      await prisma.project.deleteMany({ where: { key: fixture.projectKey } });
    }
  });

  it("makes concurrent evidence review and approval both fail closed on a legacy REVIEW quarantine", async () => {
    const fixture = await createFixture("REVIEW");
    const held = await holdRow("OrderRevision", fixture.revisionId);
    const pending: Array<Promise<Settled<unknown>>> = [];
    try {
      const evidenceTask = settle(reviewOrderPositionEvidence(
        fixture.revisionId,
        fixture.positionId,
        fixture.evidenceId,
        { reviewState: "RESOLVED", resolution: "REVIEW állapotban nem írható." },
        { role: "technical_preparation", principal: "doorstar-user:race-reviewer" },
      ));
      const approvalTask = settle<Response>(request(app)
        .post(`/api/production/production-orders/${fixture.projectKey}/revisions/1/approve`)
        .set("X-Role", "order_approver")
        .send({ note: "Nyitott evidence mellett tilos." }));
      pending.push(evidenceTask, approvalTask);
      await waitForBlocked("OrderRevision", 2);

      held.release();
      await held.done;
      const [evidenceResult, approvalResult] = await Promise.all([evidenceTask, approvalTask]);
      expect(evidenceResult.ok).toBe(false);
      if (!evidenceResult.ok) {
        expect(evidenceResult.error).toBeInstanceOf(OrderPositionEvidenceReviewError);
        expect((evidenceResult.error as OrderPositionEvidenceReviewError).code).toBe("revision_version_conflict");
      }
      if (!approvalResult.ok) throw approvalResult.error;
      expect(approvalResult.value.status).toBe(409);
      expect(approvalResult.value.body.error).toBe("position_evidence_unresolved");

      const stored = await prisma.orderPositionEvidence.findUniqueOrThrow({ where: { id: fixture.evidenceId } });
      expect(stored).toMatchObject({ reviewState: "REVIEW", reviewedAt: null });
    } finally {
      held.release();
      await Promise.allSettled([held.done, ...pending]);
      await prisma.project.deleteMany({ where: { key: fixture.projectKey } });
    }
  });
});
