import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";

const app = createApp();

async function createOrderWithDocument(suffix: string) {
  const projectKey = `SUPPLEMENTARY-${suffix}-${Date.now()}`;
  await request(app)
    .post("/api/production/production-orders/sales-intake")
    .set("X-Role", "sales")
    .send({
      projectKey,
      projectName: "Tartozék teszt",
      customerName: "Teszt ügyfél",
      positions: [{ code: "01", name: "Ajtó", quantity: 1 }],
    })
    .expect(201);
  const document = await request(app)
    .post(`/api/production/production-orders/${projectKey}/revisions/1/documents`)
    .set("X-Role", "sales")
    .send({
      source: "LEGACY_FOLDER",
      kind: "SALES_ORDER",
      displayName: "Forrás.pdf",
      relativePath: "Teszt/Forras.pdf",
    })
    .expect(201);
  return { projectKey, documentId: document.body.id as string };
}

function evidence(documentId: string, field: string, reviewState: "UNVERIFIED" | "REVIEW" = "REVIEW") {
  return {
    orderDocumentId: documentId,
    sourceRoot: "LEGACY_2026",
    relativePath: "Teszt/Forras.pdf",
    page: 1,
    row: 2,
    field,
    rawValue: field === "QUANTITY" ? "5" : "szál",
    normalizedValue: field === "QUANTITY" ? 5 : "szál",
    reviewState,
  };
}

describe("order supplementary items", () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("requires every source evidence row to have an audited RESOLVED decision", async () => {
    const { projectKey, documentId } = await createOrderWithDocument("EVIDENCE");
    try {
      await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items`)
        .set("X-Role", "technical_preparation")
        .send({
          entryMode: "SOURCE_REVIEW",
          category: "SKIRTING",
          name: "Érvénytelen előre elfogadott tétel",
          evidence: [{ ...evidence(documentId, "QUANTITY"), reviewState: "RESOLVED" }],
        })
        .expect(400)
        .expect(({ body }) => expect(body.error).toBe("invalid_request"));

      const source = await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items`)
        .set("X-Role", "technical_preparation")
        .send({
          entryMode: "SOURCE_REVIEW",
          category: "SKIRTING",
          code: "1",
          name: "Lábazati szegőléc",
          quantity: 5,
          unit: "szál",
          calculatedQuantity: 12,
          calculatedUnit: "fm",
          evidence: [
            evidence(documentId, "QUANTITY"),
            evidence(documentId, "UNIT", "UNVERIFIED"),
          ],
        })
        .expect(201);
      expect(source.body.evidence).toHaveLength(2);
      expect(source.body.evidence[0]).toMatchObject({
        createdByRole: "technical_preparation",
        resolution: null,
        reviewedByRole: null,
        reviewedAt: null,
      });

      const reviewItemUrl = `/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${source.body.id}/review`;
      await request(app)
        .patch(reviewItemUrl)
        .set("X-Role", "technical_preparation")
        .send({ state: "VERIFIED", resolution: "Még nincs minden forrás ellenőrizve." })
        .expect(409)
        .expect({
          error: "source_review_item_evidence_unresolved",
          details: { totalEvidence: 2, resolvedEvidence: 0, unresolvedEvidence: 2, rejectedEvidence: 0 },
        });

      const firstEvidenceUrl = `/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${source.body.id}/evidence/${source.body.evidence[0].id}/review`;
      await request(app)
        .patch(firstEvidenceUrl)
        .set("X-Role", "sales")
        .send({ reviewState: "RESOLVED", resolution: "Sales nem hozhat műszaki evidence-döntést." })
        .expect(403)
        .expect({ error: "role_not_permitted" });

      const firstDecision = await request(app)
        .patch(firstEvidenceUrl)
        .set("X-Role", "technical_preparation")
        .send({ reviewState: "RESOLVED", resolution: "A PDF mennyiségi sora ellenőrizve." })
        .expect(200);
      expect(firstDecision.body).toMatchObject({
        reviewState: "RESOLVED",
        resolution: "A PDF mennyiségi sora ellenőrizve.",
        reviewedByRole: "technical_preparation",
      });
      expect(firstDecision.body.reviewedAt).toBeTruthy();

      await request(app)
        .patch(reviewItemUrl)
        .set("X-Role", "technical_preparation")
        .send({ state: "VERIFIED", resolution: "A második evidence még nyitott." })
        .expect(409)
        .expect({
          error: "source_review_item_evidence_unresolved",
          details: { totalEvidence: 2, resolvedEvidence: 1, unresolvedEvidence: 1, rejectedEvidence: 0 },
        });

      const secondEvidenceUrl = `/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${source.body.id}/evidence/${source.body.evidence[1].id}/review`;
      await request(app)
        .patch(secondEvidenceUrl)
        .set("X-Role", "order_approver")
        .send({ reviewState: "RESOLVED", resolution: "A mértékegység forrása ellenőrizve." })
        .expect(200);

      await request(app)
        .patch(secondEvidenceUrl)
        .set("X-Role", "order_approver")
        .send({ reviewState: "REJECTED", resolution: "Végállapot nem írható felül." })
        .expect(409)
        .expect({ error: "supplementary_evidence_review_final", reviewState: "RESOLVED" });

      const verified = await request(app)
        .patch(reviewItemUrl)
        .set("X-Role", "order_approver")
        .send({ state: "VERIFIED", resolution: "Minden forrásbizonyíték ellenőrizve." })
        .expect(200);
      expect(verified.body.state).toBe("VERIFIED");

      await request(app)
        .patch(firstEvidenceUrl)
        .set("X-Role", "order_approver")
        .send({ reviewState: "REJECTED", resolution: "Lezárt tétel evidence-e változatlan." })
        .expect(409)
        .expect({ error: "supplementary_item_review_final", state: "VERIFIED" });
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });

  it("keeps rejected evidence auditable and allows the source item to be rejected", async () => {
    const { projectKey, documentId } = await createOrderWithDocument("REJECTED");
    try {
      const source = await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items`)
        .set("X-Role", "technical_preparation")
        .send({
          entryMode: "SOURCE_REVIEW",
          category: "OTHER",
          name: "Nem alkalmazható forrástétel",
          evidence: [evidence(documentId, "NAME")],
        })
        .expect(201);
      const evidenceUrl = `/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${source.body.id}/evidence/${source.body.evidence[0].id}/review`;
      await request(app)
        .patch(evidenceUrl)
        .set("X-Role", "technical_preparation")
        .send({ reviewState: "REJECTED", resolution: "A forrás nem ehhez a rendelési pozícióhoz tartozik." })
        .expect(200);

      const itemUrl = `/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${source.body.id}/review`;
      await request(app)
        .patch(itemUrl)
        .set("X-Role", "technical_preparation")
        .send({ state: "VERIFIED", resolution: "Elutasított evidence mellett tilos." })
        .expect(409)
        .expect({
          error: "source_review_item_evidence_unresolved",
          details: { totalEvidence: 1, resolvedEvidence: 0, unresolvedEvidence: 1, rejectedEvidence: 1 },
        });
      await request(app)
        .patch(itemUrl)
        .set("X-Role", "technical_preparation")
        .send({ state: "REJECTED", resolution: "A hibás forrástétel auditálva lezárva." })
        .expect(200)
        .expect(({ body }) => expect(body.state).toBe("REJECTED"));
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });

  it("preserves the manual item lifecycle and rejects evidence-less source verification", async () => {
    const { projectKey } = await createOrderWithDocument("MANUAL");
    try {
      const manual = await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items`)
        .set("X-Role", "sales")
        .send({
          entryMode: "MANUAL",
          category: "HARDWARE",
          name: "Standard kilincsgarnitúra",
          quantity: 2,
          unit: "db",
          manualReason: "Helyszíni egyeztetés alapján.",
        })
        .expect(201);
      await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${manual.body.id}`)
        .set("X-Role", "sales")
        .send({ quantity: 3, notes: "Pontosított mennyiség." })
        .expect(200)
        .expect(({ body }) => expect(body.quantity).toBe(3));
      await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${manual.body.id}`)
        .set("X-Role", "sales")
        .send({ quantity: null })
        .expect(400)
        .expect({ error: "manual_supplementary_item_fields_required" });

      const sourceWithoutEvidence = await prisma.orderSupplementaryItem.create({
        data: {
          orderRevisionId: manual.body.orderRevisionId,
          entryMode: "SOURCE_REVIEW",
          category: "OTHER",
          name: "Bizonyíték nélküli importjelölt",
          createdByRole: "import_worker",
        },
      });
      await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${sourceWithoutEvidence.id}/review`)
        .set("X-Role", "technical_preparation")
        .send({ state: "VERIFIED", resolution: "Ezt nem szabad elfogadni." })
        .expect(409)
        .expect({ error: "source_review_item_evidence_required" });
      await prisma.orderSupplementaryItem.delete({ where: { id: sourceWithoutEvidence.id } });

      await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${manual.body.id}/review`)
        .set("X-Role", "technical_preparation")
        .send({ state: "VERIFIED", resolution: "Az általános tétel ellenőrizve." })
        .expect(200);
      await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${manual.body.id}`)
        .set("X-Role", "sales")
        .send({ quantity: 4 })
        .expect(409)
        .expect(({ body }) => expect(body.error).toBe("supplementary_item_review_final"));
    } finally {
      await prisma.project.deleteMany({ where: { key: projectKey } });
    }
  });
});
