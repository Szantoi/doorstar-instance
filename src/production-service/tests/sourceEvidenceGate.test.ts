import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { revisionContentHash } from "../src/services/orderRevisionHash.js";
import { sourceEvidenceHasCompleteResolvedDecision } from "../src/services/sourceEvidenceGate.js";
import { attachSurveySource } from "./support/surveySource.js";

const app = createApp();
const createdProjectKeys = new Set<string>();
let projectSequence = 0;

type DraftFixture = {
  projectKey: string;
  revisionId: string;
  positionId: string;
  documentId: string;
};

function manufacturedEvidence(
  documentId: string,
  field = "QUANTITY",
  reviewState: "UNVERIFIED" | "REVIEW" | "RESOLVED" | "REJECTED" = "REVIEW",
) {
  return {
    orderDocumentId: documentId,
    sourceRoot: "LEGACY_2026",
    relativePath: "Teszt/Gyartasmegrendelo.xlsx",
    sheet: "Készméret",
    row: 4,
    field,
    rawValue: field === "QUANTITY" ? "2" : "Festett MDF",
    normalizedValue: field === "QUANTITY" ? 2 : "Festett MDF",
    reviewState,
    ...(
      reviewState === "RESOLVED" || reviewState === "REJECTED"
        ? { resolution: "Ezt a végállapotot csak a dedikált review parancs hozhatja létre." }
        : {}
    ),
  };
}

function supplementaryEvidence(documentId: string) {
  return {
    orderDocumentId: documentId,
    sourceRoot: "LEGACY_2026",
    relativePath: "Teszt/Gyartasmegrendelo.xlsx",
    page: 1,
    row: 4,
    field: "QUANTITY",
    rawValue: "2",
    normalizedValue: 2,
    reviewState: "REVIEW",
  };
}

function manufacturedItemPayload(
  documentId: string,
  code: string,
  evidence = [manufacturedEvidence(documentId)],
) {
  return {
    kind: "FURNITURE_FRONT",
    code,
    name: `Bútorfront ${code}`,
    itemType: "Egyedi bútorfront",
    quantity: 2,
    widthMm: 390,
    heightMm: 775,
    thicknessMm: 18,
    material: "MDF",
    surface: "Festett",
    workKind: "STANDARD",
    state: "REVIEW",
    evidence,
  };
}

async function createDraftFixture(suffix: string): Promise<DraftFixture> {
  const projectKey = `SOURCE-GATE-${suffix}-${Date.now()}-${++projectSequence}`;
  createdProjectKeys.add(projectKey);
  const draft = await request(app)
    .post("/api/production/production-orders/sales-intake")
    .set("X-Role", "sales")
    .send({
      projectKey,
      projectName: "Forrásbizonyíték kapu teszt",
      customerName: "Teszt ügyfél",
      positions: [{
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
    .expect(201);
  const document = await request(app)
    .post(`/api/production/production-orders/${projectKey}/revisions/1/documents`)
    .set("X-Role", "sales")
    .send({
      source: "LEGACY_FOLDER",
      kind: "SALES_ORDER",
      displayName: "Gyártásmegrendelő.xlsx",
      relativePath: "Teszt/Gyartasmegrendelo.xlsx",
    })
    .expect(201);
  return {
    projectKey,
    revisionId: draft.body.id as string,
    positionId: draft.body.positions[0].id as string,
    documentId: document.body.id as string,
  };
}

async function advanceAndApprove(projectKey: string) {
  await request(app)
    .patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`)
    .set("X-Role", "sales")
    .send({ stage: "SALES_DOCUMENTS_RECEIVED" })
    .expect(200);
  await request(app)
    .patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`)
    .set("X-Role", "sales")
    .send({ stage: "SURVEY_PENDING" })
    .expect(200);
  const detail = await request(app)
    .get(`/api/production/production-orders/${projectKey}`)
    .expect(200);
  await attachSurveySource(
    app,
    projectKey,
    detail.body.revisions[0].positions.map((position: { id: string }) => position.id),
  );
  await request(app)
    .patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`)
    .set("X-Role", "technical_preparation")
    .send({ stage: "SURVEY_COMPLETED" })
    .expect(200);
  await request(app)
    .patch(`/api/production/production-orders/${projectKey}/revisions/1/intake-stage`)
    .set("X-Role", "technical_preparation")
    .send({ stage: "TECHNICAL_PREPARATION" })
    .expect(200);
  await request(app)
    .post(`/api/production/production-orders/${projectKey}/revisions/1/review`)
    .set("X-Role", "technical_preparation")
    .send({ note: "A források és a műszaki adatok ellenőrizve." })
    .expect(201);
  return request(app)
    .post(`/api/production/production-orders/${projectKey}/revisions/1/approve`)
    .set("X-Role", "order_approver")
    .send({ note: "A rendelési revízió jóváhagyva." })
    .expect(201);
}

/** Pins an otherwise current approval to the explicitly supported legacy v1
 * envelope. This lets the adversarial tests corrupt reviewer metadata that v1
 * did not cover, proving that source validation is independent from the hash. */
async function pinApprovalToLegacyV1(revisionId: string) {
  const revision = await prisma.orderRevision.findUniqueOrThrow({
    where: { id: revisionId },
    include: {
      positions: { orderBy: { position: "asc" } },
      documents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      manufacturedItems: {
        orderBy: [{ kind: "asc" }, { code: "asc" }, { id: "asc" }],
        include: { evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      },
      supplementaryItems: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      },
    },
  });
  const contentHash = revisionContentHash(revision, 1);
  await prisma.$executeRaw`
    UPDATE "OrderRevisionAudit"
    SET "contentHash" = ${contentHash},
        "contentHashSchemaVersion" = 1
    WHERE "orderRevisionId" = ${revisionId}
      AND "action" = 'APPROVED'
  `;
  return contentHash;
}

function componentSnapshotPayload(
  approvedContentHash: string,
  sourceKind: "MANUFACTURED_ITEM" | "SUPPLEMENTARY_ITEM",
  sourceId: string,
) {
  return {
    calculatorProfileVersion: "doorstar-explicit-component-adapter/v1",
    expectedOrderContentHash: approvedContentHash,
    reviewNote: "Adverzárius forráskapu-ellenőrzés.",
    confirmation: "CREATE_COMPONENT_SNAPSHOT",
    requirements: [{
      source: { kind: sourceKind, id: sourceId },
      requirementKind: "PURCHASED_PART",
      sourceComponentKey: `${sourceKind.toLowerCase()}:fake-reviewed-source`,
      componentKey: "source-gate-test-part",
      name: "Forráskapu tesztalkatrész",
      quantity: 1,
      quantityUnit: "db",
    }],
  };
}

function positionOnlyComponentSnapshotPayload(approvedContentHash: string, positionId: string) {
  return {
    calculatorProfileVersion: "doorstar-explicit-component-adapter/v1",
    expectedOrderContentHash: approvedContentHash,
    reviewNote: "A karanténos forrást szándékosan kihagyó payload ellenőrzése.",
    confirmation: "CREATE_COMPONENT_SNAPSHOT",
    requirements: [{
      source: { kind: "ORDER_POSITION", id: positionId },
      requirementKind: "PURCHASED_PART",
      sourceComponentKey: "position:omitted-quarantined-source",
      componentKey: "source-gate-test-part",
      name: "Forráskapu tesztalkatrész",
      quantity: 1,
      quantityUnit: "db",
    }],
  };
}

describe("component source evidence P0 gate", () => {
  beforeAll(async () => { await prisma.$connect(); });

  afterEach(async () => {
    const projectKeys = [...createdProjectKeys];
    createdProjectKeys.clear();
    if (projectKeys.length !== 0) {
      await prisma.project.deleteMany({ where: { key: { in: projectKeys } } });
    }
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it("accepts only normative or compatibility reviewer roles as a complete evidence audit", () => {
    const auditedEvidence = {
      reviewState: "RESOLVED",
      resolution: "Emberi ellenőrzés dokumentált eredménye.",
      reviewedAt: new Date("2026-07-30T12:00:00.000Z"),
    };
    expect(["technical_preparation", "order_approver", "administrator", "vezeto"].every(
      (reviewedByRole) => sourceEvidenceHasCompleteResolvedDecision({
        ...auditedEvidence,
        reviewedByRole,
      }),
    )).toBe(true);
    expect(sourceEvidenceHasCompleteResolvedDecision({
      ...auditedEvidence,
      reviewedByRole: "sales",
    })).toBe(false);
  });

  it.each(["RESOLVED", "REJECTED"] as const)(
    "rejects manufactured evidence created directly in the final %s state",
    async (reviewState) => {
      const { projectKey, documentId } = await createDraftFixture(`FINAL-${reviewState}`);
      await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items`)
        .set("X-Role", "technical_preparation")
        .send(manufacturedItemPayload(documentId, `FINAL-${reviewState}`, [
          manufacturedEvidence(documentId, "QUANTITY", reviewState),
        ]))
        .expect(400)
        .expect(({ body }) => expect(body.error).toBe("invalid_request"));
    },
  );

  it("records an audited final manufactured evidence decision and makes it immutable", async () => {
    const { projectKey, documentId } = await createDraftFixture("EVIDENCE-AUDIT");
    const item = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items`)
      .set("X-Role", "technical_preparation")
      .send(manufacturedItemPayload(documentId, "AUDIT"))
      .expect(201);
    expect(item.body.evidence[0]).toMatchObject({
      reviewState: "REVIEW",
      createdByRole: "technical_preparation",
      resolution: null,
      reviewedByRole: null,
      reviewedAt: null,
    });

    const evidenceUrl = `/api/production/production-orders/${projectKey}/revisions/1/manufactured-items/${item.body.id}/evidence/${item.body.evidence[0].id}/review`;
    const reviewed = await request(app)
      .patch(evidenceUrl)
      .set("X-Role", "technical_preparation")
      .send({ reviewState: "RESOLVED", resolution: "A mennyiségi forrássor emberileg ellenőrizve." })
      .expect(200);
    expect(reviewed.body).toMatchObject({
      reviewState: "RESOLVED",
      resolution: "A mennyiségi forrássor emberileg ellenőrizve.",
      reviewedByRole: "technical_preparation",
    });
    expect(reviewed.body.reviewedAt).toBeTruthy();

    const repeated = await request(app)
      .patch(evidenceUrl)
      .set("X-Role", "order_approver")
      .send({ reviewState: "REJECTED", resolution: "Végleges evidence-döntés nem írható felül." })
      .expect(409);
    expect(repeated.body.error).toMatch(/evidence_review_final$/);
    expect(repeated.body.reviewState).toBe("RESOLVED");
  });

  it("blocks manufactured verification without evidence and with unresolved or rejected evidence", async () => {
    const { projectKey, revisionId, documentId } = await createDraftFixture("PARENT-BLOCK");

    const noEvidence = await prisma.manufacturedItem.create({
      data: {
        orderRevisionId: revisionId,
        kind: "WALL_PANEL",
        code: "NO-EVIDENCE",
        name: "Bizonyíték nélküli falpanel",
        quantity: 1,
        workKind: "STANDARD",
        state: "REVIEW",
      },
    });
    const noEvidenceReview = await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items/${noEvidence.id}/review`)
      .set("X-Role", "technical_preparation")
      .send({ state: "VERIFIED", resolution: "Bizonyíték nélkül nem fogadható el." })
      .expect(409);
    expect(noEvidenceReview.body.error).toMatch(/evidence_required$/);

    const unresolved = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items`)
      .set("X-Role", "technical_preparation")
      .send(manufacturedItemPayload(documentId, "UNRESOLVED"))
      .expect(201);
    const unresolvedReviewUrl = `/api/production/production-orders/${projectKey}/revisions/1/manufactured-items/${unresolved.body.id}/review`;
    const unresolvedDecision = await request(app)
      .patch(unresolvedReviewUrl)
      .set("X-Role", "technical_preparation")
      .send({ state: "VERIFIED", resolution: "Nyitott evidence mellett nem fogadható el." })
      .expect(409);
    expect(unresolvedDecision.body.error).toMatch(/evidence_unresolved$/);

    const evidenceUrl = `/api/production/production-orders/${projectKey}/revisions/1/manufactured-items/${unresolved.body.id}/evidence/${unresolved.body.evidence[0].id}/review`;
    await request(app)
      .patch(evidenceUrl)
      .set("X-Role", "technical_preparation")
      .send({ reviewState: "REJECTED", resolution: "A forrássor nem ehhez a tételhez tartozik." })
      .expect(200);
    const rejectedDecision = await request(app)
      .patch(unresolvedReviewUrl)
      .set("X-Role", "technical_preparation")
      .send({ state: "VERIFIED", resolution: "Elutasított evidence mellett nem fogadható el." })
      .expect(409);
    expect(rejectedDecision.body.error).toMatch(/evidence_unresolved$/);
  });

  it("verifies a manufactured parent only after every evidence row is completely RESOLVED", async () => {
    const { projectKey, documentId } = await createDraftFixture("PARENT-VERIFIED");
    const item = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items`)
      .set("X-Role", "technical_preparation")
      .send(manufacturedItemPayload(documentId, "COMPLETE", [
        manufacturedEvidence(documentId, "QUANTITY", "REVIEW"),
        manufacturedEvidence(documentId, "MATERIAL", "UNVERIFIED"),
      ]))
      .expect(201);

    const [firstEvidence, secondEvidence] = item.body.evidence;
    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items/${item.body.id}/evidence/${firstEvidence.id}/review`)
      .set("X-Role", "technical_preparation")
      .send({ reviewState: "RESOLVED", resolution: `A(z) ${firstEvidence.field} forrássor ellenőrizve.` })
      .expect(200);
    const partiallyResolved = await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items/${item.body.id}/review`)
      .set("X-Role", "technical_preparation")
      .send({ state: "VERIFIED", resolution: "Egyetlen feloldott sor még nem elegendő." })
      .expect(409);
    expect(partiallyResolved.body.error).toBe("manufactured_item_evidence_unresolved");

    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items/${item.body.id}/evidence/${secondEvidence.id}/review`)
      .set("X-Role", "order_approver")
      .send({ reviewState: "RESOLVED", resolution: `A(z) ${secondEvidence.field} forrássor ellenőrizve.` })
      .expect(200);

    const verified = await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items/${item.body.id}/review`)
      .set("X-Role", "order_approver")
      .send({ state: "VERIFIED", resolution: "Minden forrásbizonyíték ellenőrizve." })
      .expect(200);
    expect(verified.body).toMatchObject({
      state: "VERIFIED",
      reviewedByRole: "order_approver",
      evidence: [
        expect.objectContaining({ reviewState: "RESOLVED" }),
        expect.objectContaining({ reviewState: "RESOLVED" }),
      ],
    });
    expect(verified.body.reviewedAt).toBeTruthy();
  });

  it("blocks a fake VERIFIED manufactured source with an incomplete evidence audit", async () => {
    const { projectKey, revisionId, documentId } = await createDraftFixture("FAKE-MANUFACTURED");
    const item = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items`)
      .set("X-Role", "technical_preparation")
      .send(manufacturedItemPayload(documentId, "FAKE-SOURCE"))
      .expect(201);
    const evidence = item.body.evidence[0];
    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items/${item.body.id}/evidence/${evidence.id}/review`)
      .set("X-Role", "technical_preparation")
      .send({ reviewState: "RESOLVED", resolution: "A forrás először szabályosan ellenőrizve." })
      .expect(200);
    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/manufactured-items/${item.body.id}/review`)
      .set("X-Role", "technical_preparation")
      .send({ state: "VERIFIED", resolution: "A tétel először szabályosan ellenőrizve." })
      .expect(200);
    await advanceAndApprove(projectKey);
    const legacyContentHash = await pinApprovalToLegacyV1(revisionId);

    // Adversarial direct-DB corruption: the parent state remains VERIFIED,
    // but the reviewer is changed to a role that cannot make evidence
    // decisions. Legacy v1 hashes do not cover this metadata, so only the
    // independent component-source gate can reject the source.
    await prisma.$executeRaw`
      UPDATE "ManufacturedItemEvidence"
      SET "reviewedByRole" = 'sales'
      WHERE "id" = ${evidence.id}
    `;

    await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
      .set("X-Role", "technical_preparation")
      .send(componentSnapshotPayload(legacyContentHash, "MANUFACTURED_ITEM", item.body.id))
      .expect(409)
      .expect(({ body }) => expect(body.error).toBe("component_source_evidence_unresolved"));
  });

  it("blocks a fake VERIFIED SOURCE_REVIEW supplementary source with an incomplete evidence audit", async () => {
    const { projectKey, revisionId, positionId, documentId } = await createDraftFixture("FAKE-SUPPLEMENTARY");
    const item = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items`)
      .set("X-Role", "technical_preparation")
      .send({
        entryMode: "SOURCE_REVIEW",
        category: "HARDWARE",
        code: "FAKE-SUPPLEMENTARY",
        name: "Forrásból érkező vasalat",
        quantity: 2,
        unit: "db",
        evidence: [supplementaryEvidence(documentId)],
      })
      .expect(201);
    const evidence = item.body.evidence[0];
    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${item.body.id}/evidence/${evidence.id}/review`)
      .set("X-Role", "technical_preparation")
      .send({ reviewState: "RESOLVED", resolution: "A forrás először szabályosan ellenőrizve." })
      .expect(200);
    await request(app)
      .patch(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${item.body.id}/review`)
      .set("X-Role", "technical_preparation")
      .send({ state: "VERIFIED", resolution: "A tétel először szabályosan ellenőrizve." })
      .expect(200);
    await advanceAndApprove(projectKey);
    const legacyContentHash = await pinApprovalToLegacyV1(revisionId);
    const reviewableSnapshot = await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
      .set("X-Role", "technical_preparation")
      .send(positionOnlyComponentSnapshotPayload(legacyContentHash, positionId))
      .expect(201);

    await prisma.orderSupplementaryItemEvidence.update({
      where: { id: evidence.id },
      data: { reviewedAt: null },
    });

    // A v1 approval hash did not include supplementary items. The aggregate
    // gate must therefore reject the revision even when the adapter payload
    // tries to omit the quarantined source and references only a position.
    await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
      .set("X-Role", "technical_preparation")
      .send(positionOnlyComponentSnapshotPayload(legacyContentHash, positionId))
      .expect(409)
      .expect(({ body }) => expect(body.error).toBe("component_source_evidence_unresolved"));

    await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/component-snapshots`)
      .set("X-Role", "technical_preparation")
      .send(componentSnapshotPayload(legacyContentHash, "SUPPLEMENTARY_ITEM", item.body.id))
      .expect(409)
      .expect(({ body }) => expect(body.error).toBe("component_source_evidence_unresolved"));

    const reviewUrl =
      `/api/production/production-orders/${projectKey}/revisions/1/component-snapshots/${reviewableSnapshot.body.snapshot.id}/review`;
    await request(app)
      .patch(reviewUrl)
      .set("X-Role", "order_approver")
      .send({ state: "VERIFIED", resolution: "Karanténos forrással nem fogadható el." })
      .expect(409)
      .expect(({ body }) => expect(body.error).toBe("component_source_evidence_unresolved"));
    await request(app)
      .patch(reviewUrl)
      .set("X-Role", "order_approver")
      .send({ state: "REJECTED", resolution: "A snapshot a karanténos forrás miatt elutasítva." })
      .expect(200)
      .expect(({ body }) => expect(body.state).toBe("REJECTED"));
  });

  it.each(["VERIFIED", "REJECTED"] as const)(
    "keeps a %s supplementary item immutable for both update and delete",
    async (finalState) => {
      const { projectKey } = await createDraftFixture(`SUPPLEMENTARY-${finalState}`);
      const item = await request(app)
        .post(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items`)
        .set("X-Role", "sales")
        .send({
          entryMode: "MANUAL",
          category: "OTHER",
          name: "Általános kézi tétel",
          quantity: 1,
          unit: "db",
          manualReason: "Emberi egyeztetés alapján.",
        })
        .expect(201);
      await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${item.body.id}/review`)
        .set("X-Role", "technical_preparation")
        .send({ state: finalState, resolution: "A kézi tétel véglegesen elbírálva." })
        .expect(200);

      await request(app)
        .patch(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${item.body.id}`)
        .set("X-Role", "sales")
        .send({ quantity: 2 })
        .expect(409)
        .expect({ error: "supplementary_item_review_final", state: finalState });
      await request(app)
        .delete(`/api/production/production-orders/${projectKey}/revisions/1/supplementary-items/${item.body.id}`)
        .set("X-Role", "sales")
        .expect(409)
        .expect({ error: "supplementary_item_review_final", state: finalState });
    },
  );
});
