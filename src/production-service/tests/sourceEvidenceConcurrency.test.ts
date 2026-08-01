import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Response } from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import {
  deleteSupplementaryItem,
  reviewSupplementaryItem,
  reviewSupplementaryItemEvidence,
  SupplementaryReviewError,
  updateSupplementaryItem,
} from "../src/services/supplementaryItemReview.js";

const app = createApp();
let fixtureSequence = 0;
let lockClient: PrismaClient;
let observerClient: PrismaClient;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type Settled<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

type SourceReviewFixture = {
  projectKey: string;
  revisionId: string;
  itemId: string;
  evidenceId: string;
};

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

async function createSourceReviewFixture(
  suffix: string,
  reviewReadyRevision = false,
): Promise<SourceReviewFixture> {
  const projectKey =
    `SOURCE-EVIDENCE-LOCK-${suffix}-${Date.now()}-${++fixtureSequence}`;
  const project = await prisma.project.create({
    data: {
      key: projectKey,
      name: "Forrásbizonyíték konkurenciateszt",
    },
  });
  const order = await prisma.productionOrder.create({
    data: { projectId: project.id },
  });
  const revision = await prisma.orderRevision.create({
    data: {
      orderId: order.id,
      revision: 1,
      customerName: "Teszt ügyfél",
      ...(reviewReadyRevision
        ? {
            intakeStage: "TECHNICAL_PREPARATION" as const,
            positions: {
              create: {
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
                wallTreatment: "NONE" as const,
                glazing: "NONE" as const,
                doorTypeKey: "interior-rebated",
                wallSolutionKey: "none",
                glassKey: "none",
              },
            },
            documents: {
              create: {
                source: "LEGACY_FOLDER" as const,
                kind: "SALES_ORDER" as const,
                displayName: "Gyártásmegrendelő.xlsx",
                relativePath: "Teszt/Gyartasmegrendelo.xlsx",
              },
            },
          }
        : {}),
    },
    include: { positions: true },
  });
  if (reviewReadyRevision) {
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
  }
  const item = await prisma.orderSupplementaryItem.create({
    data: {
      orderRevisionId: revision.id,
      entryMode: "SOURCE_REVIEW",
      category: "OTHER",
      code: "LOCK-TEST",
      name: "Forrásból érkező általános tétel",
      quantity: 1,
      unit: "db",
      createdByRole: "import_worker",
      evidence: {
        create: {
          sourceRoot: "LEGACY_2026",
          relativePath: "Teszt/Gyartasmegrendelo.xlsx",
          row: 4,
          field: "QUANTITY",
          rawValue: "1",
          normalizedValue: 1,
          reviewState: "REVIEW",
          createdByRole: "import_worker",
        },
      },
    },
    include: { evidence: true },
  });
  return {
    projectKey,
    revisionId: revision.id,
    itemId: item.id,
    evidenceId: item.evidence[0]!.id,
  };
}

async function holdSupplementaryItemLock(itemId: string) {
  const acquired = deferred<void>();
  const release = deferred<void>();
  const done = lockClient.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "OrderSupplementaryItem"
      WHERE "id" = ${itemId}
      FOR UPDATE
    `;
    acquired.resolve();
    await release.promise;
  });
  void done.catch((error) => acquired.reject(error));
  await acquired.promise;

  let released = false;
  return {
    done,
    release() {
      if (!released) {
        released = true;
        release.resolve();
      }
    },
  };
}

/**
 * Poll PostgreSQL's lock wait state instead of relying on timing sleeps.
 * Every test first proves that the command reached the expected row lock,
 * then releases the controlled blocker and observes the serialized outcome.
 */
async function waitForBlockedForUpdate(
  tableName: "OrderRevision" | "OrderSupplementaryItem",
  minimumCount = 1,
) {
  const deadline = Date.now() + 5_000;
  const queryPattern = `%FROM "${tableName}"%`;
  let lastRows: Array<{ pid: number; query: string }> = [];

  while (Date.now() < deadline) {
    lastRows = await observerClient.$queryRaw<Array<{ pid: number; query: string }>>`
      SELECT pid, query
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state = 'active'
        AND wait_event_type = 'Lock'
        AND query LIKE ${queryPattern}
        AND query LIKE '%FOR UPDATE%'
    `;
    if (lastRows.length >= minimumCount) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(
    `Expected ${minimumCount} blocked FOR UPDATE query on ${tableName}; observed ${lastRows.length}.`,
  );
}

function expectFinalItemError(result: Settled<unknown>) {
  if (result.ok) {
    throw new Error("Expected the concurrent supplementary-item mutation to fail.");
  }
  expect(result.error).toBeInstanceOf(SupplementaryReviewError);
  expect((result.error as SupplementaryReviewError).code)
    .toBe("supplementary_item_review_final");
  expect((result.error as SupplementaryReviewError).responseFields)
    .toEqual({ state: "VERIFIED" });
}

describe("source-evidence aggregate transaction locks", () => {
  beforeAll(async () => {
    lockClient = new PrismaClient();
    observerClient = new PrismaClient();
    await Promise.all([
      prisma.$connect(),
      lockClient.$connect(),
      observerClient.$connect(),
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      prisma.$disconnect(),
      lockClient.$disconnect(),
      observerClient.$disconnect(),
    ]);
  });

  it("serializes evidence review before parent verification", async () => {
    const fixture = await createSourceReviewFixture("EVIDENCE-PARENT");
    const heldLock = await holdSupplementaryItemLock(fixture.itemId);
    const pending: Array<Promise<Settled<unknown>>> = [];

    try {
      const evidenceTask = settle(reviewSupplementaryItemEvidence(
        fixture.revisionId,
        fixture.itemId,
        fixture.evidenceId,
        {
          reviewState: "RESOLVED",
          resolution: "A forrássor emberileg ellenőrizve.",
        },
        "technical_preparation",
      ));
      pending.push(evidenceTask);
      await waitForBlockedForUpdate("OrderSupplementaryItem");

      const parentTask = settle(reviewSupplementaryItem(
        fixture.revisionId,
        fixture.itemId,
        {
          state: "VERIFIED",
          resolution: "A tétel forrásbizonyítéka ellenőrizve.",
        },
        "order_approver",
      ));
      pending.push(parentTask);
      await waitForBlockedForUpdate("OrderRevision");

      heldLock.release();
      await heldLock.done;

      const [evidenceResult, parentResult] = await Promise.all([
        evidenceTask,
        parentTask,
      ]);
      if (!evidenceResult.ok) throw evidenceResult.error;
      if (!parentResult.ok) throw parentResult.error;

      expect(evidenceResult.value).toMatchObject({
        reviewState: "RESOLVED",
        reviewedByRole: "technical_preparation",
      });
      expect(parentResult.value).toMatchObject({
        state: "VERIFIED",
        reviewedByRole: "order_approver",
        evidence: [
          expect.objectContaining({
            reviewState: "RESOLVED",
            reviewedByRole: "technical_preparation",
          }),
        ],
      });
    } finally {
      heldLock.release();
      await Promise.allSettled([heldLock.done, ...pending]);
      await prisma.project.deleteMany({
        where: { key: fixture.projectKey },
      });
    }
  });

  it("makes concurrent update and delete observe the final parent decision", async () => {
    const fixture = await createSourceReviewFixture("PARENT-MUTATIONS");
    await reviewSupplementaryItemEvidence(
      fixture.revisionId,
      fixture.itemId,
      fixture.evidenceId,
      {
        reviewState: "RESOLVED",
        resolution: "A forrássor emberileg ellenőrizve.",
      },
      "technical_preparation",
    );

    const heldLock = await holdSupplementaryItemLock(fixture.itemId);
    const pending: Array<Promise<Settled<unknown>>> = [];

    try {
      const parentTask = settle(reviewSupplementaryItem(
        fixture.revisionId,
        fixture.itemId,
        {
          state: "VERIFIED",
          resolution: "A tétel véglegesen elfogadva.",
        },
        "order_approver",
      ));
      pending.push(parentTask);
      await waitForBlockedForUpdate("OrderSupplementaryItem");

      const updateTask = settle(updateSupplementaryItem(
        fixture.revisionId,
        fixture.itemId,
        { quantity: 2 },
      ));
      const deleteTask = settle(deleteSupplementaryItem(
        fixture.revisionId,
        fixture.itemId,
      ));
      pending.push(updateTask, deleteTask);
      await waitForBlockedForUpdate("OrderRevision", 2);

      heldLock.release();
      await heldLock.done;

      const [parentResult, updateResult, deleteResult] = await Promise.all([
        parentTask,
        updateTask,
        deleteTask,
      ]);
      if (!parentResult.ok) throw parentResult.error;
      expect(parentResult.value).toMatchObject({ state: "VERIFIED" });
      expectFinalItemError(updateResult);
      expectFinalItemError(deleteResult);

      const stored = await prisma.orderSupplementaryItem.findUniqueOrThrow({
        where: { id: fixture.itemId },
      });
      expect(stored).toMatchObject({
        state: "VERIFIED",
        quantity: 1,
        reviewedByRole: "order_approver",
      });
    } finally {
      heldLock.release();
      await Promise.allSettled([heldLock.done, ...pending]);
      await prisma.project.deleteMany({
        where: { key: fixture.projectKey },
      });
    }
  });

  it("finishes parent verification before the revision is frozen for review", async () => {
    const fixture = await createSourceReviewFixture("PARENT-FREEZE", true);
    await reviewSupplementaryItemEvidence(
      fixture.revisionId,
      fixture.itemId,
      fixture.evidenceId,
      {
        reviewState: "RESOLVED",
        resolution: "A forrássor emberileg ellenőrizve.",
      },
      "technical_preparation",
    );

    const heldLock = await holdSupplementaryItemLock(fixture.itemId);
    const pending: Array<Promise<Settled<unknown>>> = [];

    try {
      const parentTask = settle(reviewSupplementaryItem(
        fixture.revisionId,
        fixture.itemId,
        {
          state: "VERIFIED",
          resolution: "A revíziófagyasztás előtt elfogadva.",
        },
        "order_approver",
      ));
      pending.push(parentTask);
      await waitForBlockedForUpdate("OrderSupplementaryItem");

      const freezeTask = settle<Response>(
        request(app)
          .post(
            `/api/production/production-orders/${fixture.projectKey}/revisions/1/review`,
          )
          .set("X-Role", "technical_preparation")
          .send({ note: "A lezárt forrásadatokkal review-ba küldve." }),
      );
      pending.push(freezeTask);
      await waitForBlockedForUpdate("OrderRevision");

      heldLock.release();
      await heldLock.done;

      const [parentResult, freezeResult] = await Promise.all([
        parentTask,
        freezeTask,
      ]);
      if (!parentResult.ok) throw parentResult.error;
      if (!freezeResult.ok) throw freezeResult.error;

      expect(parentResult.value).toMatchObject({ state: "VERIFIED" });
      expect(freezeResult.value.status).toBe(201);
      expect(freezeResult.value.body).toMatchObject({
        action: "REVIEW_REQUESTED",
        contentHashSchemaVersion: 3,
      });
      expect(freezeResult.value.body.contentHash).toMatch(/^[a-f0-9]{64}$/);

      const stored = await prisma.orderRevision.findUniqueOrThrow({
        where: { id: fixture.revisionId },
        include: {
          supplementaryItems: {
            include: { evidence: true },
          },
        },
      });
      expect(stored.status).toBe("REVIEW");
      expect(stored.supplementaryItems[0]).toMatchObject({
        state: "VERIFIED",
        evidence: [
          expect.objectContaining({ reviewState: "RESOLVED" }),
        ],
      });
    } finally {
      heldLock.release();
      await Promise.allSettled([heldLock.done, ...pending]);
      await prisma.project.deleteMany({
        where: { key: fixture.projectKey },
      });
    }
  });
});
