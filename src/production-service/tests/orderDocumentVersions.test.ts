import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { revisionContentHash } from "../src/services/orderRevisionHash.js";

const app = createApp();
const sha = (letter: string) => letter.repeat(64);

async function approveDirectFixture(orderRevisionId: string) {
  const revision = await prisma.orderRevision.findUniqueOrThrow({
    where: { id: orderRevisionId },
    include: {
      positions: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { orderDocument: true } },
          documentLinks: { orderBy: [{ orderDocumentId: "asc" }, { id: "asc" }], include: { orderDocument: true } },
        },
      },
      documents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      manufacturedItems: { orderBy: [{ kind: "asc" }, { code: "asc" }], include: { evidence: true } },
      supplementaryItems: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { evidence: true } },
    },
  });
  const contentHash = revisionContentHash(revision, 3);
  await prisma.$transaction([
    prisma.orderRevision.update({ where: { id: orderRevisionId }, data: { status: "APPROVED" } }),
    prisma.orderRevisionAudit.create({
      data: {
        orderRevisionId,
        action: "APPROVED",
        actorRole: "order_approver",
        contentHash,
        contentHashSchemaVersion: 3,
        note: "Direct integration fixture with a valid approval hash.",
      },
    }),
  ]);
}

describe("order document versions and releases", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("chains replacement versions, links the exact version to a position, and releases its hash snapshot", async () => {
    const projectKey = `DOCUMENT-CHAIN-${Date.now()}`;
    try {
      const draft = await request(app).post("/api/production/production-orders/sales-intake").set("X-Role", "sales").send({
        projectKey, projectName: "Dokumentumlánc teszt", customerName: "Teszt ügyfél", positions: [{ code: "01", name: "Ajtó", quantity: 1 }],
      }).expect(201);
      const positionId = draft.body.positions[0].id;

      const original = await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/documents`).set("X-Role", "sales").send({
        source: "SHAREPOINT", kind: "DRAWING", displayName: "Ajtó rajz v1.pdf", relativePath: "Teszt/Ajto-rajz.pdf", driveId: "drive-1", itemId: "item-1", versionId: "1.0", contentSha256: sha("a"),
      }).expect(201);
      const replacement = await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/documents`).set("X-Role", "sales").send({
        source: "SHAREPOINT", kind: "DRAWING", displayName: "Ajtó rajz v2.pdf", relativePath: "Teszt/Ajto-rajz.pdf", driveId: "drive-1", itemId: "item-1", versionId: "2.0", contentSha256: sha("b"), supersedesDocumentId: original.body.id,
      }).expect(201);
      expect(replacement.body.documentFamilyKey).toBe(original.body.documentFamilyKey);
      expect(replacement.body.supersedesDocumentId).toBe(original.body.id);

      await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/documents/${replacement.body.id}/positions`).set("X-Role", "technical_preparation").send({ orderPositionId: positionId }).expect(201);
      await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/documents/${replacement.body.id}/positions`).set("X-Role", "technical_preparation").send({ orderPositionId: positionId }).expect(201);
      const detail = await request(app).get(`/api/production/production-orders/${projectKey}`).expect(200);
      expect(detail.body.revisions[0].documents.find((document: { id: string }) => document.id === replacement.body.id).positionLinks).toEqual([{ orderPositionId: positionId }]);

      await approveDirectFixture(draft.body.id);
      const released = await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/document-releases`).set("X-Role", "technical_preparation").send({
        issuedWorkPackageKey: "WP-DOCUMENT-CHAIN-1", documentIds: [replacement.body.id], releaseNote: "Jóváhagyott rajzverzió kiadása.", confirmation: "ISSUE_DOCUMENT_VERSIONS",
      }).expect(201);
      expect(released.body[0]).toMatchObject({ orderDocumentId: replacement.body.id, documentVersionId: "2.0", documentContentSha256: sha("b"), issuedWorkPackageKey: "WP-DOCUMENT-CHAIN-1" });
      await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/document-releases`).set("X-Role", "technical_preparation").send({
        issuedWorkPackageKey: "WP-DOCUMENT-CHAIN-1", documentIds: [replacement.body.id], releaseNote: "Ismételt, idempotens kiadás.", confirmation: "ISSUE_DOCUMENT_VERSIONS",
      }).expect(201).expect(({ body }) => expect(body).toHaveLength(1));
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });

  it("rejects document release before approval or without a content hash", async () => {
    const projectKey = `DOCUMENT-RELEASE-GUARD-${Date.now()}`;
    try {
      const draft = await request(app).post("/api/production/production-orders/sales-intake").set("X-Role", "sales").send({
        projectKey, projectName: "Dokumentumkapu teszt", customerName: "Teszt ügyfél", positions: [{ code: "01", name: "Ajtó", quantity: 1 }],
      }).expect(201);
      const document = await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/documents`).set("X-Role", "sales").send({
        source: "LEGACY_FOLDER", kind: "DRAWING", displayName: "Hash nélküli.pdf", relativePath: "Teszt/Hash-nelkuli.pdf",
      }).expect(201);
      const releaseInput = { issuedWorkPackageKey: "WP-GUARD-1", documentIds: [document.body.id], releaseNote: "Kiadási kapu teszt.", confirmation: "ISSUE_DOCUMENT_VERSIONS" };
      await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/document-releases`).set("X-Role", "technical_preparation").send(releaseInput).expect(409).expect({ error: "approved_revision_required_for_document_release" });
      await approveDirectFixture(draft.body.id);
      await request(app).post(`/api/production/production-orders/${projectKey}/revisions/1/document-releases`).set("X-Role", "technical_preparation").send(releaseInput).expect(409).expect({ error: "release_document_hash_required" });
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });
});
