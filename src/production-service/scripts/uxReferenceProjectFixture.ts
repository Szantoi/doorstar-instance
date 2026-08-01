import type { Express } from "express";
import request from "supertest";
import {
  assertUxReferenceTarget,
  UX_REFERENCE_PROJECT_KEY,
  type UxReferenceTarget,
} from "./uxReferenceProjectTarget.js";

const historicalRevision = 1;
const revision = 2;
const documentHashes = {
  salesOrder: "1".repeat(64),
  survey: "2".repeat(64),
  drawing: "3".repeat(64),
} as const;

type HttpMethod = "get" | "post" | "put" | "patch";

interface ApiOptions {
  role?: string;
  principal?: string;
  body?: unknown;
  expectedStatus?: number;
}

async function api(
  app: Express,
  method: HttpMethod,
  path: string,
  options: ApiOptions = {},
) {
  const call = request(app)[method](path);
  if (options.role) call.set("X-Role", options.role);
  if (options.principal) call.set("X-Principal", options.principal);
  if (options.body !== undefined) call.send(options.body);
  const response = await call;
  const expectedStatus = options.expectedStatus ?? 200;
  if (response.status !== expectedStatus) {
    throw new Error(
      `${method.toUpperCase()} ${path} expected ${expectedStatus}, received ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
  return response.body;
}

function exactDocument(documentId: string) {
  return {
    documentVersionId: documentId,
    versionHash: documentHashes.drawing,
    locator: "UX referencia / 1. oldal",
  };
}

function qualityCheckpoint(key: string, label: string) {
  return [{
    key,
    label,
    acceptanceRule: "A fixture-ben kézzel rögzített, jóváhagyott rajzi adat ellenőrzendő.",
    measurementMethod: "Kézi ellenőrzés a hivatkozott rajz alapján",
    measurementToolKey: null,
    evidenceRequirement: "Végrehajtáskor külön mérési jegyzőkönyv szükséges.",
    required: true,
  }];
}

function documentEvidence(documentId: string, rawValue: string, normalizedValue: string) {
  return [{
    sourceKind: "DOCUMENT",
    documentVersionId: documentId,
    versionHash: documentHashes.drawing,
    locator: "UX referencia / 1. oldal",
    rawValue,
    normalizedValue,
    confidence: 1,
    reviewState: "RESOLVED",
  }];
}

function workInstruction(documentId: string) {
  return {
    ...exactDocument(documentId),
    contentCoverage: [
      "PREREQUISITES",
      "MATERIAL_AND_RESOURCE_CHECK",
      "SETUP",
      "SAFETY",
      "EXECUTION",
      "DRAWING_REFERENCE",
      "IN_PROCESS_CONTROL",
      "OUTPUT_HANDLING",
    ],
  };
}

function technologicalOperation(input: {
  id: string;
  sequence: number;
  name: string;
  group: string;
  resourceKey: string;
  machineKey: string | null;
  requirementIds: string[];
  lineHashes: string[];
  documentId: string;
  predecessors?: string[];
}) {
  return {
    id: input.id,
    sourceOperationKey: `ux-reference:${input.id}`,
    sourceComponentRequirementIds: input.requirementIds,
    sourceComponentLineHashes: input.lineHashes,
    outputAssemblyKey: null,
    sequence: input.sequence,
    workflowGroup: input.group,
    processKind: "TECHNOLOGICAL",
    operationType: input.name,
    standardKey: "doorstar-explicit-technological-operation",
    standardVersion: "v1",
    qualifiers: { source: "explicit-demo-fixture" },
    resourceKey: input.resourceKey,
    machineKey: input.machineKey,
    toolKeys: [],
    quantity: 1,
    quantityUnit: "db",
    setupMinutesPerBatch: 10,
    cycleMinutesPerUnit: 20,
    nonTechnologicalMinutes: null,
    plannedNaturalHoldMinutes: null,
    timeStandardSource: {
      ...exactDocument(input.documentId),
      standardKey: "doorstar-explicit-technological-operation",
      standardVersion: "v1",
      unit: "db",
    },
    workforce: 1,
    dependencies: (input.predecessors ?? []).map((predecessorOperationId) => ({
      predecessorOperationId,
      type: "FS",
      lagMinutes: 0,
    })),
    documentReferences: [{ ...exactDocument(input.documentId), purpose: "DRAWING" }],
    workInstruction: workInstruction(input.documentId),
    qualityCheckpoints: qualityCheckpoint(`qc:${input.id}`, `${input.name} ellenőrzése`),
    sourceEvidence: documentEvidence(input.documentId, input.name, input.name),
  };
}

function nonTechnologicalOperation(input: {
  id: string;
  sequence: number;
  name: string;
  requirementIds: string[];
  lineHashes: string[];
  documentId: string;
  predecessor: string;
}) {
  return {
    id: input.id,
    sourceOperationKey: `ux-reference:${input.id}`,
    sourceComponentRequirementIds: input.requirementIds,
    sourceComponentLineHashes: input.lineHashes,
    outputAssemblyKey: "ux-reference:packed-order",
    sequence: input.sequence,
    workflowGroup: "order-completion",
    processKind: "NON_TECHNOLOGICAL",
    operationType: input.name,
    standardKey: "doorstar-explicit-non-technological-operation",
    standardVersion: "v1",
    qualifiers: { source: "explicit-demo-fixture" },
    resourceKey: "packaging",
    machineKey: null,
    toolKeys: [],
    quantity: 1,
    quantityUnit: "db",
    setupMinutesPerBatch: null,
    cycleMinutesPerUnit: null,
    nonTechnologicalMinutes: 30,
    plannedNaturalHoldMinutes: null,
    timeStandardSource: null,
    workforce: 1,
    dependencies: [{ predecessorOperationId: input.predecessor, type: "FS", lagMinutes: 0 }],
    documentReferences: [{ ...exactDocument(input.documentId), purpose: "SPECIFICATION" }],
    workInstruction: workInstruction(input.documentId),
    qualityCheckpoints: qualityCheckpoint(`qc:${input.id}`, `${input.name} ellenőrzése`),
    sourceEvidence: documentEvidence(input.documentId, input.name, input.name),
  };
}

export interface UxReferenceSeedSummary {
  schema: string;
  projectKey: string;
  revision: number;
  orderStatus: string;
  positionCount: number;
  documentCount: number;
  componentSnapshotState: string;
  componentRequirementCount: number;
  operationPlanState: string;
  operationCount: number;
  productionReleaseState: string;
}

export async function seedUxReferenceProject(input: {
  databaseUrl?: string;
  arguments: string[];
  nodeEnv?: string;
}): Promise<UxReferenceSeedSummary> {
  const target: UxReferenceTarget = assertUxReferenceTarget(input);
  process.env.DATABASE_URL = target.databaseUrl;
  process.env.LOG_LEVEL = "silent";

  // The guard above intentionally runs before the application or Prisma
  // singleton is loaded, so an unsafe target cannot initiate a DB connection.
  const [{ createApp }, { prisma }] = await Promise.all([
    import("../src/app.js"),
    import("../src/db/client.js"),
  ]);
  const app = createApp();

  try {
    await prisma.$connect();
    await prisma.project.deleteMany({ where: { key: UX_REFERENCE_PROJECT_KEY } });

    const intake = await api(app, "post", "/api/production/production-orders/sales-intake", {
      role: "sales",
      expectedStatus: 201,
      body: {
        projectKey: UX_REFERENCE_PROJECT_KEY,
        projectName: "UX referencia – utólag beépíthető beltéri ajtók",
        projectNum: "UX-DEMO-001",
        customerName: "Bemutató ügyfél – nem valós adat",
        customerAddress: "Demó helyszín",
        contactName: "Teszt kapcsolattartó",
        contactEmail: "ux-reference@example.invalid",
        deliveryAddress: "Demó beépítési helyszín",
        expectedDelivery: "2026-09-30T10:00:00.000Z",
        plannedStart: "2026-09-01T06:00:00.000Z",
        priority: 2,
        notes: "Kizárólag helyi UX-referencia. Nem gyártási rendelés és nem valós ügyféladat.",
        positions: [{ code: "A-01", name: "Korábbi beltéri ajtó változat", quantity: 1 }],
      },
    });
    const historicalPositionId = intake.positions[0].id as string;
    const historicalPath = `/api/production/production-orders/${UX_REFERENCE_PROJECT_KEY}/revisions/${historicalRevision}`;
    await api(app, "post", `${historicalPath}/documents`, {
      role: "sales",
      expectedStatus: 201,
      body: {
        source: "SHAREPOINT",
        kind: "SALES_ORDER",
        displayName: "UX referencia korábbi megrendelés.pdf",
        relativePath: "UX-Reference/Historical/Megrendeles-v1.pdf",
        driveId: "ux-reference-drive",
        itemId: "ux-reference-historical-sales-order",
        versionId: "ux-reference-historical-sales-order-v1",
        contentSha256: "4".repeat(64),
      },
    });
    const historicalSurvey = await api(app, "post", `${historicalPath}/documents`, {
      role: "technical_preparation",
      expectedStatus: 201,
      body: {
        source: "SHAREPOINT",
        kind: "SURVEY",
        displayName: "UX referencia korábbi felmérés.pdf",
        relativePath: "UX-Reference/Historical/Felmeres-v1.pdf",
        driveId: "ux-reference-drive",
        itemId: "ux-reference-historical-survey",
        versionId: "ux-reference-historical-survey-v1",
        contentSha256: "5".repeat(64),
      },
    });
    await api(app, "patch", `${historicalPath}/intake-stage`, {
      role: "sales",
      body: { stage: "SALES_DOCUMENTS_RECEIVED" },
    });
    await api(app, "patch", `${historicalPath}/intake-stage`, {
      role: "sales",
      body: { stage: "SURVEY_PENDING" },
    });
    await api(app, "put", historicalPath, {
      role: "technical_preparation",
      body: {
        customerName: "Bemutató ügyfél – nem valós adat",
        customerAddress: "Demó helyszín",
        contactName: "Teszt kapcsolattartó",
        contactEmail: "ux-reference@example.invalid",
        deliveryAddress: "Demó beépítési helyszín",
        expectedDelivery: "2026-09-30T10:00:00.000Z",
        plannedStart: "2026-09-01T06:00:00.000Z",
        priority: 1,
        notes: "Történeti UX-revízió; a második revízió supersede-eli.",
        positions: [{
          id: historicalPositionId,
          code: "A-01",
          name: "Korábbi beltéri ajtó változat",
          quantity: 1,
          productType: "Utólag beépíthető beltéri ajtó",
          openingDirection: "Balos, befelé – explicit demóadat",
          openingWidthMm: 900,
          openingHeightMm: 2100,
          openingDepthMm: 150,
          doorWidthMm: 825,
          doorHeightMm: 2020,
          doorThicknessMm: 40,
          surface: "Festett RAL/NCS – korábbi demóváltozat",
          wallTreatment: "NONE",
          glazing: "NONE",
          doorTypeKey: "interior-rebated",
          finishKey: "painted-ral",
          glassKey: "none",
          hardwareKeys: ["hinge-3d", "lock-magnetic"],
          wallSolutionKey: "none",
          materialKey: "mdf-standard",
          machiningKeys: ["none"],
        }],
      },
    });
    await api(app, "post", `${historicalPath}/documents/${historicalSurvey.id}/positions`, {
      role: "technical_preparation",
      expectedStatus: 201,
      body: { orderPositionId: historicalPositionId },
    });
    await api(app, "patch", `${historicalPath}/intake-stage`, {
      role: "technical_preparation",
      body: { stage: "SURVEY_COMPLETED" },
    });
    await api(app, "patch", `${historicalPath}/intake-stage`, {
      role: "technical_preparation",
      body: { stage: "TECHNICAL_PREPARATION" },
    });
    await api(app, "post", `${historicalPath}/review`, {
      role: "technical_preparation",
      expectedStatus: 201,
      body: { note: "A történeti UX-revízió ellenőrizve." },
    });
    await api(app, "post", `${historicalPath}/approve`, {
      role: "order_approver",
      expectedStatus: 201,
      body: { note: "A történeti UX-revízió jóváhagyva a supersession demonstrációjához." },
    });

    const currentRevision = await api(app, "post", "/api/production/production-orders/revisions", {
      role: "technical_preparation",
      expectedStatus: 201,
      body: {
        projectKey: UX_REFERENCE_PROJECT_KEY,
        customerName: "Bemutató ügyfél – nem valós adat",
        customerAddress: "Demó helyszín",
        contactName: "Teszt kapcsolattartó",
        contactEmail: "ux-reference@example.invalid",
        deliveryAddress: "Demó beépítési helyszín",
        expectedDelivery: "2026-09-30T10:00:00.000Z",
        plannedStart: "2026-09-01T06:00:00.000Z",
        priority: 2,
        notes: "A legfrissebb UX-revízió a teljes meglévő lánc demonstrációjához.",
        positions: [
          { code: "A-01", name: "Nappali beltéri ajtó blendével", quantity: 1 },
          { code: "A-02", name: "Hálószoba beltéri ajtó", quantity: 1 },
          { code: "A-03", name: "Fürdőszoba beltéri ajtó falpanel-kapcsolattal", quantity: 1 },
        ],
      },
    });
    if (currentRevision.revision !== revision) {
      throw new Error(`Expected UX reference revision ${revision}, received ${currentRevision.revision}`);
    }
    const positionIds = currentRevision.positions.map((position: { id: string }) => position.id) as string[];
    const path = `/api/production/production-orders/${UX_REFERENCE_PROJECT_KEY}/revisions/${revision}`;

    await api(app, "post", `${path}/documents`, {
      role: "sales",
      expectedStatus: 201,
      body: {
        source: "SHAREPOINT",
        kind: "SALES_ORDER",
        displayName: "UX referencia megrendelés.pdf",
        relativePath: "UX-Reference/Megrendeles-v1.pdf",
        driveId: "ux-reference-drive",
        itemId: "ux-reference-sales-order",
        versionId: "ux-reference-sales-order-v1",
        contentSha256: documentHashes.salesOrder,
      },
    });
    const surveyDocument = await api(app, "post", `${path}/documents`, {
      role: "technical_preparation",
      expectedStatus: 201,
      body: {
        source: "SHAREPOINT",
        kind: "SURVEY",
        displayName: "UX referencia felmérési lap.pdf",
        relativePath: "UX-Reference/Felmeresi-lap-v1.pdf",
        driveId: "ux-reference-drive",
        itemId: "ux-reference-survey",
        versionId: "ux-reference-survey-v1",
        contentSha256: documentHashes.survey,
      },
    });
    const drawingDocument = await api(app, "post", `${path}/documents`, {
      role: "technical_preparation",
      expectedStatus: 201,
      body: {
        source: "SHAREPOINT",
        kind: "DRAWING",
        displayName: "UX referencia ellenőrzött műszaki rajz.pdf",
        relativePath: "UX-Reference/Muszaki-rajz-v1.pdf",
        driveId: "ux-reference-drive",
        itemId: "ux-reference-drawing",
        versionId: "ux-reference-drawing-v1",
        contentSha256: documentHashes.drawing,
      },
    });

    await api(app, "patch", `${path}/intake-stage`, {
      role: "sales",
      body: { stage: "SALES_DOCUMENTS_RECEIVED" },
    });
    await api(app, "patch", `${path}/intake-stage`, {
      role: "sales",
      body: { stage: "SURVEY_PENDING" },
    });
    await api(app, "put", path, {
      role: "technical_preparation",
      body: {
        customerName: "Bemutató ügyfél – nem valós adat",
        customerAddress: "Demó helyszín",
        contactName: "Teszt kapcsolattartó",
        contactEmail: "ux-reference@example.invalid",
        deliveryAddress: "Demó beépítési helyszín",
        expectedDelivery: "2026-09-30T10:00:00.000Z",
        plannedStart: "2026-09-01T06:00:00.000Z",
        priority: 2,
        notes: "Kizárólag helyi UX-referencia. A méretek kézzel rögzített demóadatok, nem kalkulált gyártási szabályok.",
        positions: [
          {
            id: positionIds[0], code: "A-01", name: "Nappali beltéri ajtó blendével", quantity: 1,
            productType: "Utólag beépíthető beltéri ajtó", openingDirection: "Balos, befelé – explicit demóadat",
            openingWidthMm: 900, openingHeightMm: 2120, openingDepthMm: 150,
            doorWidthMm: 825, doorHeightMm: 2040, doorThicknessMm: 40,
            surface: "Festett RAL/NCS – külön felületek még nem strukturáltak",
            wallTreatment: "BLENDE", glazing: "NONE",
            doorTypeKey: "interior-rebated", finishKey: "painted-ral", glassKey: "none",
            hardwareKeys: ["hinge-3d", "lock-magnetic", "handle-standard"], wallSolutionKey: "blende",
            materialKey: "mdf-standard", machiningKeys: ["cnc-groove"],
            technicalNotes: "A blende felső vízszintes takarás; itt kézzel rögzített demójelölés. Nem jelent automatikus BOM-ot vagy méretet.",
          },
          {
            id: positionIds[1], code: "A-02", name: "Hálószoba beltéri ajtó", quantity: 1,
            productType: "Utólag beépíthető beltéri ajtó", openingDirection: "Jobbos, befelé – explicit demóadat",
            openingWidthMm: 1000, openingHeightMm: 2120, openingDepthMm: 175,
            doorWidthMm: 925, doorHeightMm: 2040, doorThicknessMm: 40,
            surface: "Fóliás Supermatt Kashmir", wallTreatment: "NONE", glazing: "NONE",
            doorTypeKey: "interior-rebated", finishKey: "foil-supermatt-kashmir", glassKey: "none",
            hardwareKeys: ["hinge-3d", "lock-magnetic", "handle-standard"], wallSolutionKey: "none",
            materialKey: "mdf-standard", machiningKeys: ["none"],
            technicalNotes: "A nyitásirány explicit demóadat; SIDE_A/SIDE_B és casing-role nincs belőle levezetve.",
          },
          {
            id: positionIds[2], code: "A-03", name: "Fürdőszoba beltéri ajtó falpanel-kapcsolattal", quantity: 1,
            productType: "Utólag beépíthető beltéri ajtó", openingDirection: "Jobbos, kifelé – explicit demóadat",
            openingWidthMm: 800, openingHeightMm: 2120, openingDepthMm: 125,
            doorWidthMm: 725, doorHeightMm: 2040, doorThicknessMm: 40,
            surface: "Fóliás Magnolia", wallTreatment: "WALL_PANEL", glazing: "GLAZED",
            glazingSpecification: "Savmart 4 mm – explicit demóadat",
            doorTypeKey: "interior-flush", finishKey: "foil-renolit-magnolia-supermatt-classic", glassKey: "frosted-4mm",
            hardwareKeys: ["hinge-3d", "lock-magnetic", "handle-standard"], wallSolutionKey: "wall-panel",
            materialKey: "mdf-standard", machiningKeys: ["ventilation-grid"],
            technicalNotes: "A külön falpanel a legacy manufactured lane-ben szerepel; canonical wallZone/product spec még nincs.",
          },
        ],
      },
    });

    for (const positionId of positionIds) {
      await api(app, "post", `${path}/documents/${surveyDocument.id}/positions`, {
        role: "technical_preparation",
        expectedStatus: 201,
        body: { orderPositionId: positionId },
      });
      await api(app, "post", `${path}/documents/${drawingDocument.id}/positions`, {
        role: "technical_preparation",
        expectedStatus: 201,
        body: { orderPositionId: positionId },
      });
    }

    const blendeEvidence = await api(app, "post", `${path}/positions/${positionIds[0]}/evidence`, {
      role: "technical_preparation",
      expectedStatus: 201,
      body: {
        orderDocumentId: surveyDocument.id,
        sourceRoot: "ux-reference",
        relativePath: "UX-Reference/Felmeresi-lap-v1.pdf",
        page: 1,
        field: "WALL_TREATMENT",
        rawValue: "felső blende, kézi méret szükséges",
        normalizedValue: "BLENDE",
        confidence: 1,
        reviewState: "REVIEW",
      },
    });
    await api(app, "patch", `${path}/positions/${positionIds[0]}/evidence/${blendeEvidence.id}`, {
      role: "technical_preparation",
      principal: "doorstar:ux-reference:surveyor",
      body: { reviewState: "RESOLVED", resolution: "A demó felmérési forrásban szereplő blende-jelölés ellenőrizve; gyártási méretet nem vezetünk le." },
    });

    const depthEvidence = await api(app, "post", `${path}/positions/${positionIds[2]}/evidence`, {
      role: "technical_preparation",
      expectedStatus: 201,
      body: {
        orderDocumentId: surveyDocument.id,
        sourceRoot: "ux-reference",
        relativePath: "UX-Reference/Felmeresi-lap-v1.pdf",
        page: 2,
        field: "OPENING_DEPTH_MM",
        rawValue: "125 mm kész falvastagság",
        normalizedValue: 125,
        confidence: 1,
        reviewState: "REVIEW",
      },
    });
    await api(app, "patch", `${path}/positions/${positionIds[2]}/evidence/${depthEvidence.id}`, {
      role: "order_approver",
      principal: "doorstar:ux-reference:evidence-reviewer",
      body: { reviewState: "RESOLVED", resolution: "A demó kész falvastagság az exact felmérési dokumentumban ellenőrizve." },
    });

    const wallPanel = await api(app, "post", `${path}/manufactured-items`, {
      role: "technical_preparation",
      expectedStatus: 201,
      body: {
        kind: "WALL_PANEL",
        code: "FP-DEMO-01",
        name: "Külön falpanel – UX referencia",
        itemType: "Legacy manufactured source candidate",
        componentName: "Falpanel elem",
        quantity: 2,
        widthMm: 450,
        heightMm: 2400,
        thicknessMm: 18,
        material: "MDF – explicit demóadat",
        surface: "Fóliás – explicit demóadat",
        colour: "Magnolia – explicit demóadat",
        pattern: "Rajz szerint",
        workKind: "STANDARD",
        state: "REVIEW",
        notes: "Nem canonical WALL_PANEL product spec; kizárólag a meglévő manufactured-item UX tesztelésére.",
        evidence: [{
          orderDocumentId: drawingDocument.id,
          sourceRoot: "ux-reference",
          relativePath: "UX-Reference/Muszaki-rajz-v1.pdf",
          page: 1,
          field: "WIDTH_MM",
          rawValue: "450 mm",
          normalizedValue: 450,
          confidence: 1,
          reviewState: "REVIEW",
        }],
      },
    });
    await api(app, "patch", `${path}/manufactured-items/${wallPanel.id}/evidence/${wallPanel.evidence[0].id}/review`, {
      role: "technical_preparation",
      body: { reviewState: "RESOLVED", resolution: "A demó falpanel szélessége az exact rajzban ellenőrizve." },
    });
    await api(app, "patch", `${path}/manufactured-items/${wallPanel.id}/review`, {
      role: "technical_preparation",
      body: { state: "VERIFIED", resolution: "A legacy manufactured-item demóadatait ember ellenőrizte; ez nem production release." },
    });

    const handle = await api(app, "post", `${path}/supplementary-items`, {
      role: "sales",
      expectedStatus: 201,
      body: {
        entryMode: "MANUAL",
        category: "HARDWARE",
        code: "HANDLE-DEMO",
        name: "Standard kilincs – UX referencia",
        quantity: 3,
        unit: "db",
        manualReason: "Kézzel rögzített bemutató tartozék; nem automatikus mennyiségszámítás.",
      },
    });
    await api(app, "patch", `${path}/supplementary-items/${handle.id}/review`, {
      role: "technical_preparation",
      body: { state: "VERIFIED", resolution: "A bemutató tartozék explicit mennyisége ellenőrizve." },
    });

    await api(app, "patch", `${path}/intake-stage`, {
      role: "technical_preparation",
      body: { stage: "SURVEY_COMPLETED" },
    });
    await api(app, "patch", `${path}/intake-stage`, {
      role: "technical_preparation",
      body: { stage: "TECHNICAL_PREPARATION" },
    });
    const review = await api(app, "post", `${path}/review`, {
      role: "technical_preparation",
      expectedStatus: 201,
      body: { note: "Az UX-referencia rendelési, felmérési, dokumentum- és evidence-lánca ellenőrizve." },
    });
    const approval = await api(app, "post", `${path}/approve`, {
      role: "order_approver",
      expectedStatus: 201,
      body: { note: "Az UX-referencia rendelési revíziója bemutatási célra jóváhagyva; nem gyártási kiadás." },
    });
    if (review.contentHash !== approval.contentHash) {
      throw new Error("Order review and approval hashes diverged");
    }

    const requirements = [
      {
        source: { kind: "ORDER_POSITION", id: positionIds[0] }, requirementKind: "CUT_PART",
        sourceComponentKey: "A-01:door-leaf", componentKey: "door-leaf", name: "A-01 ajtólap",
        quantity: 1, quantityUnit: "db", materialKey: "mdf-standard", finishKey: "painted-ral",
        finishedDimensionsMm: { width: 825, height: 2040, thickness: 40 },
        cuttingDimensionsMm: { width: 835, height: 2050, thickness: 42 },
        notes: "Kézzel rögzített UX-demóméret; nem automatikus kalkuláció.",
      },
      {
        source: { kind: "ORDER_POSITION", id: positionIds[0] }, requirementKind: "CUT_PART",
        sourceComponentKey: "A-01:frame", componentKey: "frame", name: "A-01 tok",
        quantity: 1, quantityUnit: "garnitúra", materialKey: "mdf-standard", finishKey: "painted-ral",
        finishedDimensionsMm: { width: 900, height: 2120, thickness: 150 },
        cuttingDimensionsMm: { width: 910, height: 2130, thickness: 152 },
        notes: "A fizikai oldal és a tokborítás szerepe nincs ebből levezetve.",
      },
      {
        source: { kind: "ORDER_POSITION", id: positionIds[0] }, requirementKind: "CUT_PART",
        sourceComponentKey: "A-01:blende", componentKey: "upper-blende", name: "A-01 felső blende",
        quantity: 1, quantityUnit: "db", materialKey: "mdf-standard", finishKey: "painted-ral",
        finishedDimensionsMm: { width: 1000, height: 320, thickness: 18 },
        cuttingDimensionsMm: { width: 1010, height: 330, thickness: 19 },
        notes: "Explicit, kézzel jóváhagyott demóméret; a BLENDE jelölésből nem számolta a rendszer.",
      },
      {
        source: { kind: "ORDER_POSITION", id: positionIds[1] }, requirementKind: "CUT_PART",
        sourceComponentKey: "A-02:door-leaf", componentKey: "door-leaf", name: "A-02 ajtólap",
        quantity: 1, quantityUnit: "db", materialKey: "mdf-standard", finishKey: "foil-supermatt-kashmir",
        finishedDimensionsMm: { width: 925, height: 2040, thickness: 40 },
        cuttingDimensionsMm: { width: 935, height: 2050, thickness: 42 },
        notes: "Kézzel rögzített UX-demóméret; nem automatikus kalkuláció.",
      },
      {
        source: { kind: "ORDER_POSITION", id: positionIds[2] }, requirementKind: "CUT_PART",
        sourceComponentKey: "A-03:door-leaf", componentKey: "door-leaf", name: "A-03 ajtólap",
        quantity: 1, quantityUnit: "db", materialKey: "mdf-standard", finishKey: "foil-renolit-magnolia-supermatt-classic",
        finishedDimensionsMm: { width: 725, height: 2040, thickness: 40 },
        cuttingDimensionsMm: { width: 735, height: 2050, thickness: 42 },
        notes: "Kézzel rögzített UX-demóméret; nem automatikus kalkuláció.",
      },
      {
        source: { kind: "MANUFACTURED_ITEM", id: wallPanel.id }, requirementKind: "CUT_PART",
        sourceComponentKey: "FP-DEMO-01:panel", componentKey: "wall-panel", name: "Külön falpanel elem",
        quantity: 2, quantityUnit: "db", materialKey: "mdf-standard", finishKey: "foil-renolit-magnolia-supermatt-classic",
        finishedDimensionsMm: { width: 450, height: 2400, thickness: 18 },
        cuttingDimensionsMm: { width: 460, height: 2410, thickness: 19 },
        notes: "Legacy manufactured source; nem canonical wallZone/product spec.",
      },
      {
        source: { kind: "SUPPLEMENTARY_ITEM", id: handle.id }, requirementKind: "PURCHASED_PART",
        sourceComponentKey: "HANDLE-DEMO:purchased", componentKey: "handle-standard", name: "Standard kilincs",
        quantity: 3, quantityUnit: "db", notes: "Explicit bemutató mennyiség.",
      },
    ];
    const component = await api(app, "post", `${path}/component-snapshots`, {
      role: "technical_preparation",
      expectedStatus: 201,
      body: {
        calculatorProfileVersion: "doorstar-explicit-component-adapter/v1",
        expectedOrderContentHash: approval.contentHash,
        reviewNote: "Explicit UX-referencia alkatrész- és szabászati adatok emberi ellenőrzésre.",
        confirmation: "CREATE_COMPONENT_SNAPSHOT",
        requirements,
      },
    });
    const verifiedComponent = await api(app, "patch", `${path}/component-snapshots/${component.snapshot.id}/review`, {
      role: "order_approver",
      body: { state: "VERIFIED", resolution: "Az explicit fixture-alkatrészek, források és méretek bemutatási célra ellenőrizve." },
    });

    const cutRequirements = verifiedComponent.requirements.filter((item: { requirementKind: string }) => item.requirementKind === "CUT_PART");
    const allRequirements = verifiedComponent.requirements as Array<{ id: string; lineHash: string }>;
    const cutIds = cutRequirements.map((item: { id: string }) => item.id);
    const cutHashes = cutRequirements.map((item: { lineHash: string }) => item.lineHash);
    const allIds = allRequirements.map((item) => item.id);
    const allHashes = allRequirements.map((item) => item.lineHash);
    const operations = [
      technologicalOperation({
        id: "ux-reference:cutting", sequence: 10, name: "Explicit szabászat", group: "components",
        resourceKey: "circular-saw", machineKey: null, requirementIds: cutIds, lineHashes: cutHashes,
        documentId: drawingDocument.id,
      }),
      technologicalOperation({
        id: "ux-reference:machining", sequence: 20, name: "Explicit CNC megmunkálás", group: "components",
        resourceKey: "cnc", machineKey: "cnc", requirementIds: cutIds, lineHashes: cutHashes,
        documentId: drawingDocument.id, predecessors: ["ux-reference:cutting"],
      }),
      technologicalOperation({
        id: "ux-reference:assembly", sequence: 30, name: "Explicit összeszerelés", group: "assembly",
        resourceKey: "joinery", machineKey: null, requirementIds: cutIds, lineHashes: cutHashes,
        documentId: drawingDocument.id, predecessors: ["ux-reference:machining"],
      }),
      nonTechnologicalOperation({
        id: "ux-reference:packaging", sequence: 40, name: "Explicit csomagolási előkészítés",
        requirementIds: allIds, lineHashes: allHashes, documentId: drawingDocument.id,
        predecessor: "ux-reference:assembly",
      }),
    ];
    const operationPlan = await api(app, "post", `${path}/operation-plan-snapshots`, {
      role: "technical_preparation",
      principal: "doorstar:ux-reference:operation-author",
      expectedStatus: 201,
      body: {
        componentSnapshotId: verifiedComponent.id,
        expectedOrderContentHash: approval.contentHash,
        expectedComponentOutputHash: verifiedComponent.outputHash,
        generatorProfileVersion: "doorstar-explicit-operation-adapter/v1",
        reviewNote: "Explicit UX-referencia műveleti adatok; nem automatikus szabály és nem üzemi kiadás.",
        confirmation: "CREATE_OPERATION_PLAN_SNAPSHOT",
        operations,
      },
    });
    const verifiedOperationPlan = await api(app, "patch", `${path}/operation-plan-snapshots/${operationPlan.snapshot.id}/review`, {
      role: "order_approver",
      principal: "doorstar:ux-reference:operation-reviewer",
      body: {
        state: "VERIFIED",
        resolution: "Az explicit fixture-műveletek lineage-e, dokumentumai és kontrollpontjai bemutatási célra ellenőrizve.",
        expectedOutputHash: operationPlan.snapshot.outputHash,
      },
    });

    const order = await api(app, "get", `/api/production/production-orders/${UX_REFERENCE_PROJECT_KEY}`);
    const readiness = await api(app, "get", `${path}/readiness`, { role: "reader" });
    const current = order.revisions.find((item: { revision: number }) => item.revision === revision);
    const releaseGate = readiness.gates.find((gate: { key: string }) => gate.key === "PRODUCTION_RELEASE");
    const summary: UxReferenceSeedSummary = {
      schema: target.schema,
      projectKey: UX_REFERENCE_PROJECT_KEY,
      revision,
      orderStatus: current.status,
      positionCount: current.positions.length,
      documentCount: current.documents.length,
      componentSnapshotState: verifiedComponent.state,
      componentRequirementCount: verifiedComponent.requirements.length,
      operationPlanState: verifiedOperationPlan.state,
      operationCount: verifiedOperationPlan.operations.length,
      productionReleaseState: releaseGate?.state ?? "UNKNOWN",
    };
    console.info(JSON.stringify({ event: "ux_reference_seed_completed", ...summary }));
    return summary;
  } finally {
    await prisma.$disconnect();
  }
}
