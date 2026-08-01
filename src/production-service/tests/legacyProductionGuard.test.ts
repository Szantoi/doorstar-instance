import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Response } from "supertest";
import {
  componentCalculatorProfileFingerprint,
  componentSnapshotSchemaVersion,
  findActiveComponentCalculatorProfile,
} from "../src/config/componentCalculatorProfiles.js";
import {
  findActiveOperationGeneratorProfile,
  operationAuthority,
  operationGeneratorProfileFingerprint,
  operationPlanSnapshotSchemaVersion,
  resourceMappingFingerprint,
  standardCatalogFingerprint,
} from "../src/config/operationAuthority.js";
import { technicalCatalog, technicalCatalogFingerprint } from "../src/config/technicalCatalog.js";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { canonicalHash, normalizeOperations } from "../src/services/operationPlanValidation.js";
import { revisionContentHash } from "../src/services/orderRevisionHash.js";

const app = createApp();
const documentHash = "a".repeat(64);
let lockClient: PrismaClient;
let observerClient: PrismaClient;
let sequence = 0;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
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

async function waitForBlocked(table: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const rows = await observerClient.$queryRaw<Array<{ pid: number }>>`
      SELECT pid
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state = 'active'
        AND wait_event_type = 'Lock'
        AND query ILIKE ${`%${table}%`}
        AND query LIKE '%FOR UPDATE%'
    `;
    if (rows.length) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected a blocked FOR UPDATE query on ${table}.`);
}

async function loadHashRevision(revisionId: string) {
  return prisma.orderRevision.findUniqueOrThrow({
    where: { id: revisionId },
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
}

async function createGuardFixture() {
  const project = await prisma.project.create({
    data: { key: `LEGACY-GUARD-${Date.now()}-${++sequence}`, name: "Legacy guard fixture" },
  });
  const epic = await prisma.epic.create({ data: { projectId: project.id, name: "Legacy draft epic" } });
  const step = await prisma.epicStep.create({
    data: { epicId: epic.id, name: "Legacy draft step", station: "CNC", planDate: new Date("2026-08-03") },
  });
  return { project, epic, step };
}

function issue(projectKey: string) {
  return request(app).post(`/api/production/projects/${projectKey}/schedule`).send({});
}

function blockerCodes(response: Response): string[] {
  return response.body.details.blockers.map((entry: { code: string }) => entry.code);
}

async function makeApprovedRevision(projectId: string) {
  const order = await prisma.productionOrder.create({ data: { projectId } });
  const revision = await prisma.orderRevision.create({
    data: {
      orderId: order.id,
      revision: 1,
      status: "DRAFT",
      intakeStage: "TECHNICAL_PREPARATION",
      customerName: "Guard customer",
      positions: { create: { position: 0, code: "01", name: "Door", quantity: 1 } },
      documents: { create: {
        source: "SHAREPOINT",
        kind: "DRAWING",
        displayName: "Exact drawing",
        relativePath: "Guard/exact-drawing.pdf",
        driveId: "drive",
        itemId: "item",
        versionId: "version-1",
        contentSha256: documentHash,
      } },
    },
    include: { positions: true, documents: true },
  });
  return { order, revision, position: revision.positions[0]!, document: revision.documents[0]! };
}

async function makeCurrentComponent(input: Awaited<ReturnType<typeof makeApprovedRevision>>, approvalAuditId: string, approvalHash: string) {
  const profile = findActiveComponentCalculatorProfile("doorstar-explicit-component-adapter/v1")!;
  const requirementPayload = {
    sourceKind: "ORDER_POSITION",
    sourceId: input.position.id,
    requirementKind: "CUT_PART",
    sourceComponentKey: "position-01:door-leaf-1",
    componentKey: "door-leaf",
    name: "Door leaf",
    quantity: 1,
    quantityUnit: "db",
    materialKey: "mdf-standard",
    finishKey: "painted-ral",
    finishedWidthMm: 820,
    finishedHeightMm: 2040,
    finishedThicknessMm: 40,
    cuttingWidthMm: 830,
    cuttingHeightMm: 2050,
    cuttingThicknessMm: 42,
    grainDirection: null,
    notes: "",
  } as const;
  const lineHash = canonicalHash(requirementPayload);
  const component = await prisma.componentSnapshot.create({
    data: {
      orderRevisionId: input.revision.id,
      approvalAuditId,
      state: "VERIFIED",
      snapshotSchemaVersion: componentSnapshotSchemaVersion,
      calculatorProfileVersion: profile.version,
      calculatorProfileFingerprint: componentCalculatorProfileFingerprint(profile),
      technicalCatalogVersion: technicalCatalog.version,
      technicalCatalogFingerprint,
      sourceWorkOrderKey: input.order.id,
      sourceOrderRevision: `${input.revision.id}:${approvalHash}`,
      sourceCalculatorRevision: `${profile.version}:${canonicalHash([requirementPayload])}`,
      orderContentHash: approvalHash,
      inputHash: "b".repeat(64),
      outputHash: canonicalHash([requirementPayload]),
      materializationKey: `guard-component-${input.revision.id}`,
      reviewNote: "Guard fixture component",
      createdByRole: "technical_preparation",
      reviewResolution: "Verified fixture",
      reviewedByRole: "order_approver",
      reviewedAt: new Date(),
      requirements: { create: {
        sourceKind: "ORDER_POSITION",
        sourceRecordId: input.position.id,
        requirementKind: "CUT_PART",
        sourceComponentKey: requirementPayload.sourceComponentKey,
        componentKey: requirementPayload.componentKey,
        name: requirementPayload.name,
        quantity: 1,
        quantityUnit: "db",
        materialKey: requirementPayload.materialKey,
        finishKey: requirementPayload.finishKey,
        finishedWidthMm: 820,
        finishedHeightMm: 2040,
        finishedThicknessMm: 40,
        cuttingWidthMm: 830,
        cuttingHeightMm: 2050,
        cuttingThicknessMm: 42,
        lineHash,
      } },
    },
    include: { requirements: true },
  });
  return { component, requirement: component.requirements[0]!, lineHash };
}

async function makeCurrentOperation(
  input: Awaited<ReturnType<typeof makeApprovedRevision>>,
  componentInput: Awaited<ReturnType<typeof makeCurrentComponent>>,
  approvalHash: string,
) {
  const generator = findActiveOperationGeneratorProfile("doorstar-explicit-operation-adapter/v1")!;
  const exactDocument = { documentVersionId: input.document.id, versionHash: documentHash, locator: "page 1" };
  const operations = normalizeOperations([{
    id: "operation:door-leaf:cnc-1",
    sourceOperationKey: "explicit:door-leaf:cnc-1",
    sourceComponentRequirementIds: [componentInput.requirement.id],
    sourceComponentLineHashes: [componentInput.lineHash],
    outputAssemblyKey: null,
    sequence: 10,
    workflowGroup: "door-leaf",
    processKind: "TECHNOLOGICAL",
    operationType: "Explicit CNC operation",
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
    timeStandardSource: { ...exactDocument, standardKey: "doorstar-explicit-technological-operation", standardVersion: "v1", unit: "db" },
    workforce: 1,
    dependencies: [],
    documentReferences: [{ ...exactDocument, purpose: "TECHNOLOGY" }],
    workInstruction: { ...exactDocument, contentCoverage: ["PREREQUISITES", "SETUP", "SAFETY", "EXECUTION", "IN_PROCESS_CONTROL", "OUTPUT_HANDLING"] },
    qualityCheckpoints: [{
      key: "qc:door-leaf:dimensions",
      label: "Dimension check",
      acceptanceRule: "Matches the exact drawing.",
      measurementMethod: "Measurement",
      measurementToolKey: null,
      evidenceRequirement: "Execution record",
      required: true,
    }],
    sourceEvidence: [{
      sourceKind: "DOCUMENT",
      documentVersionId: input.document.id,
      versionHash: documentHash,
      locator: "page 1",
      rawValue: "Explicit CNC operation",
      normalizedValue: "Explicit CNC operation",
      confidence: 1,
      reviewState: "RESOLVED",
    }],
  }]);
  const generatorFingerprint = operationGeneratorProfileFingerprint(generator);
  const inputHash = canonicalHash({
    schemaVersion: operationPlanSnapshotSchemaVersion,
    orderRevisionId: input.revision.id,
    orderContentHash: approvalHash,
    componentSnapshotId: componentInput.component.id,
    componentOutputHash: componentInput.component.outputHash,
    generatorProfileVersion: generator.version,
    generatorProfileFingerprint: generatorFingerprint,
    standardCatalogVersion: operationAuthority.standardCatalog.version,
    standardCatalogFingerprint,
    resourceMappingVersion: operationAuthority.resourceMapping.version,
    resourceMappingFingerprint,
  });
  return prisma.operationPlanSnapshot.create({ data: {
    orderRevisionId: input.revision.id,
    componentSnapshotId: componentInput.component.id,
    state: "VERIFIED",
    schemaVersion: operationPlanSnapshotSchemaVersion,
    generatorProfileVersion: generator.version,
    generatorProfileFingerprint: generatorFingerprint,
    standardCatalogVersion: operationAuthority.standardCatalog.version,
    standardCatalogFingerprint,
    resourceMappingVersion: operationAuthority.resourceMapping.version,
    resourceMappingFingerprint,
    orderContentHash: approvalHash,
    componentOutputHash: componentInput.component.outputHash,
    inputHash,
    outputHash: canonicalHash(operations),
    materializationKey: `guard-operation-${componentInput.component.id}`,
    reviewNote: "Guard fixture operation",
    createdByRole: "technical_preparation",
    createdByPrincipal: "fixture:creator",
    reviewResolution: "Verified fixture",
    reviewedByRole: "order_approver",
    reviewedByPrincipal: "fixture:reviewer",
    reviewedAt: new Date(),
    operations,
  } });
}

describe("legacy production issue guard", () => {
  beforeAll(async () => {
    lockClient = new PrismaClient();
    observerClient = new PrismaClient();
    await Promise.all([prisma.$connect(), lockClient.$connect(), observerClient.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([prisma.$disconnect(), lockClient.$disconnect(), observerClient.$disconnect()]);
  });

  it("enumerates authority gaps without ever materializing a partial Task", async () => {
    const fixture = await createGuardFixture();
    try {
      let response = await issue(fixture.project.key).expect(409);
      expect(blockerCodes(response)).toEqual(expect.arrayContaining([
        "approved_revision_required",
        "current_verified_component_snapshot_required",
        "issued_work_package_required",
      ]));

      const orderInput = await makeApprovedRevision(fixture.project.id);
      response = await issue(fixture.project.key).expect(409);
      expect(blockerCodes(response)).toContain("approved_revision_required");

      await prisma.orderRevision.update({ where: { id: orderInput.revision.id }, data: { status: "APPROVED" } });
      const audit = await prisma.orderRevisionAudit.create({ data: {
        orderRevisionId: orderInput.revision.id,
        action: "APPROVED",
        actorRole: "order_approver",
        contentHash: "f".repeat(64),
        contentHashSchemaVersion: 3,
        note: "Intentionally stale guard fixture",
      } });
      response = await issue(fixture.project.key).expect(409);
      expect(blockerCodes(response)).toContain("approved_order_content_changed");

      const approvalHash = revisionContentHash(await loadHashRevision(orderInput.revision.id), 3);
      await prisma.orderRevisionAudit.update({ where: { id: audit.id }, data: { contentHash: approvalHash } });
      response = await issue(fixture.project.key).expect(409);
      expect(blockerCodes(response)).toContain("current_verified_component_snapshot_required");

      const componentInput = await makeCurrentComponent(orderInput, audit.id, approvalHash);
      await prisma.componentSnapshot.update({
        where: { id: componentInput.component.id },
        data: { state: "REVIEW" },
      });
      response = await issue(fixture.project.key).expect(409);
      expect(blockerCodes(response)).toContain("current_verified_component_snapshot_required");
      await prisma.componentSnapshot.update({
        where: { id: componentInput.component.id },
        data: { state: "VERIFIED", calculatorProfileFingerprint: "0".repeat(64) },
      });
      response = await issue(fixture.project.key).expect(409);
      expect(blockerCodes(response)).toContain("current_verified_component_snapshot_required");
      const profile = findActiveComponentCalculatorProfile(componentInput.component.calculatorProfileVersion)!;
      await prisma.componentSnapshot.update({
        where: { id: componentInput.component.id },
        data: { calculatorProfileFingerprint: componentCalculatorProfileFingerprint(profile) },
      });
      response = await issue(fixture.project.key).expect(409);
      expect(blockerCodes(response)).not.toContain("current_verified_component_snapshot_required");
      expect(blockerCodes(response)).toContain("current_verified_operation_plan_required");

      await makeCurrentOperation(orderInput, componentInput, approvalHash);
      response = await issue(fixture.project.key).expect(409);
      expect(blockerCodes(response)).not.toContain("current_verified_component_snapshot_required");
      expect(blockerCodes(response)).not.toContain("current_verified_operation_plan_required");
      expect(blockerCodes(response)).toEqual(expect.arrayContaining([
        "explicit_order_revision_lineage_required",
        "explicit_component_snapshot_lineage_required",
        "planning_proposal_required",
        "issued_work_package_required",
        "exact_document_lineage_required",
      ]));
      expect(await prisma.task.count({ where: { projectId: fixture.project.id } })).toBe(0);
    } finally {
      await prisma.project.deleteMany({ where: { id: fixture.project.id } });
    }
  });

  it("waits for concurrent supersession and rejects from the committed latest revision", async () => {
    const fixture = await createGuardFixture();
    const orderInput = await makeApprovedRevision(fixture.project.id);
    await prisma.orderRevision.update({ where: { id: orderInput.revision.id }, data: { status: "APPROVED" } });
    const approvalHash = revisionContentHash(await loadHashRevision(orderInput.revision.id), 3);
    await prisma.orderRevisionAudit.create({ data: {
      orderRevisionId: orderInput.revision.id,
      action: "APPROVED",
      actorRole: "order_approver",
      contentHash: approvalHash,
      contentHashSchemaVersion: 3,
      note: "Concurrency fixture",
    } });

    const acquired = deferred<void>();
    const release = deferred<void>();
    const supersession = lockClient.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ProductionOrder" WHERE "id" = ${orderInput.order.id} FOR UPDATE`;
      await tx.orderRevision.update({ where: { id: orderInput.revision.id }, data: { status: "SUPERSEDED" } });
      await tx.orderRevision.create({ data: {
        orderId: orderInput.order.id,
        revision: 2,
        status: "DRAFT",
        customerName: "Concurrent replacement",
      } });
      acquired.resolve();
      await release.promise;
    });
    void supersession.catch((error) => acquired.reject(error));
    await acquired.promise;

    const pendingIssue = Promise.resolve(issue(fixture.project.key));
    try {
      await waitForBlocked("ProductionOrder");
      release.resolve();
      await supersession;
      const response = await pendingIssue;
      expect(response.status).toBe(409);
      expect(blockerCodes(response)).toEqual(["legacy_lineage_concurrency_conflict"]);
      expect(await prisma.orderRevision.findFirst({
        where: { orderId: orderInput.order.id },
        orderBy: { revision: "desc" },
        select: { revision: true, status: true },
      })).toEqual({ revision: 2, status: "DRAFT" });
      expect(await prisma.task.count({ where: { projectId: fixture.project.id } })).toBe(0);
    } finally {
      release.resolve();
      await Promise.allSettled([supersession, pendingIssue]);
      await prisma.project.deleteMany({ where: { id: fixture.project.id } });
    }
  });
});
