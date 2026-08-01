import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type {
  ComponentCalculatorProfiles,
  ComponentSnapshot,
  OperationPlanSnapshotList,
  ProductionOrderDetail,
  ProductionOrderRevision,
  ProjectDetail,
} from "@/services/production/types";
import {
  useComponentCalculatorProfiles,
  useComponentSnapshots,
  useOperationPlanSnapshots,
  useProductionOrder,
  useProject,
} from "@/services/production/hooks";
import {
  operationWorkspacePath,
  operationWorkspaceRoutePattern,
} from "@/lib/operationWorkspaceRoute";
import { OperationWorkspacePage } from "./OperationWorkspacePage";

vi.mock("@/services/production/hooks", () => ({
  useComponentCalculatorProfiles: vi.fn(),
  useComponentSnapshots: vi.fn(),
  useOperationPlanSnapshots: vi.fn(),
  useProductionOrder: vi.fn(),
  useProject: vi.fn(),
}));

const approvalHash = "a".repeat(64);
const revision = {
  id: "revision-1",
  revision: 1,
  status: "APPROVED",
  intakeStage: "TECHNICAL_PREPARATION",
  customerName: "Minta Kft.",
  audit: [{ action: "APPROVED", contentHash: approvalHash, createdAt: "2026-07-31T08:00:00.000Z" }],
} as ProductionOrderRevision;
const order = { id: "order-1", projectId: "project-1", revisions: [revision] } as ProductionOrderDetail;
const profiles: ComponentCalculatorProfiles = {
  configurationVersion: "profiles/v1",
  configurationFingerprint: "b".repeat(64),
  snapshotSchemaVersion: "component-snapshot/v1",
  technicalCatalogVersion: "catalog/v1",
  technicalCatalogFingerprint: "f".repeat(64),
  profiles: [{
    version: "explicit/v1",
    fingerprint: "e".repeat(64),
    label: "Explicit",
    inputMode: "EXPLICIT_REVIEWED_OUTPUT",
    active: true,
    allowsFormulaExecution: false,
    allowsImplicitDefaults: false,
    cutPartDimensions: "FINISHED_AND_CUTTING_REQUIRED",
  }],
};
const snapshot = {
  id: "snapshot-1",
  orderRevisionId: "revision-1",
  state: "VERIFIED",
  snapshotSchemaVersion: "component-snapshot/v1",
  calculatorProfileVersion: "explicit/v1",
  calculatorProfileFingerprint: "e".repeat(64),
  technicalCatalogVersion: "catalog/v1",
  technicalCatalogFingerprint: "f".repeat(64),
  orderContentHash: approvalHash,
  outputHash: "c".repeat(64),
  createdAt: "2026-07-31T09:00:00.000Z",
  requirements: [{
    id: "requirement-1",
    requirementKind: "CUT_PART",
    sourceKind: "ORDER_POSITION",
    sourceRecordId: "position-1",
    sourceComponentKey: "P01:leaf",
    componentKey: "leaf-core",
    name: "Ajtólap mag",
    quantity: 1,
    quantityUnit: "db",
    materialKey: "mdf",
    finishKey: "white",
    finishedWidthMm: 820,
    finishedHeightMm: 2040,
    finishedThicknessMm: 40,
    cuttingWidthMm: 830,
    cuttingHeightMm: 2050,
    cuttingThicknessMm: 40,
    lineHash: "d".repeat(64),
  }, {
    id: "requirement-2",
    requirementKind: "PURCHASED_PART",
    sourceKind: "SUPPLEMENTARY_ITEM",
    sourceRecordId: "supplementary-1",
    sourceComponentKey: "P01:handle",
    componentKey: "handle-set",
    name: "Kilincsgarnitúra",
    quantity: 1,
    quantityUnit: "garnitúra",
    materialKey: null,
    finishKey: "inox",
    finishedWidthMm: null,
    finishedHeightMm: null,
    finishedThicknessMm: null,
    cuttingWidthMm: null,
    cuttingHeightMm: null,
    cuttingThicknessMm: null,
    lineHash: "e".repeat(64),
  }],
} as ComponentSnapshot;
const operationPlans: OperationPlanSnapshotList = {
  readiness: { ready: true, blockers: [], allowedActions: ["CREATE_OPERATION_PLAN_SNAPSHOT"] },
  snapshots: [{
    id: "operation-snapshot-1",
    orderRevisionId: "revision-1",
    componentSnapshotId: "snapshot-1",
    state: "VERIFIED",
    schemaVersion: "operation-plan-snapshot/v1",
    generatorProfileVersion: "doorstar-explicit-operation-adapter/v1",
    generatorProfileFingerprint: "1".repeat(64),
    standardCatalogVersion: "operation-standards/v1",
    standardCatalogFingerprint: "2".repeat(64),
    resourceMappingVersion: "resource-mapping/v1",
    resourceMappingFingerprint: "3".repeat(64),
    orderContentHash: approvalHash,
    componentOutputHash: "c".repeat(64),
    inputHash: "4".repeat(64),
    outputHash: "5".repeat(64),
    materializationKey: "6".repeat(64),
    reviewNote: "Explicit tesztműveletek; nem automatikus generálás.",
    createdByRole: "technical_preparation",
    createdByPrincipal: "doorstar:test:author",
    reviewResolution: "Az explicit műveleti lineage ellenőrizve.",
    reviewedByRole: "order_approver",
    reviewedByPrincipal: "doorstar:test:reviewer",
    reviewedAt: "2026-08-01T08:30:00.000Z",
    createdAt: "2026-08-01T08:00:00.000Z",
    readiness: { ready: true, blockers: [], allowedActions: [] },
    operations: [
      [10, "op-cutting", "Explicit szabászat", "circular-saw", []],
      [20, "op-machining", "Explicit CNC megmunkálás", "cnc", ["op-cutting"]],
      [30, "op-assembly", "Explicit összeszerelés", "joinery", ["op-machining"]],
      [40, "op-packaging", "Explicit csomagolási előkészítés", "packaging", ["op-assembly"]],
    ].map(([sequence, id, operationType, resourceKey, predecessors]) => ({
      id: id as string,
      sourceOperationKey: `source:${id}`,
      sourceComponentRequirementIds: id === "op-packaging" ? ["requirement-1", "requirement-2"] : ["requirement-1"],
      sourceComponentLineHashes: id === "op-packaging" ? ["d".repeat(64), "e".repeat(64)] : ["d".repeat(64)],
      outputAssemblyKey: id === "op-packaging" ? "packed-order" : null,
      sequence: sequence as number,
      workflowGroup: id === "op-packaging" ? "order-completion" : "components",
      processKind: id === "op-packaging" ? "NON_TECHNOLOGICAL" as const : "TECHNOLOGICAL" as const,
      operationType: operationType as string,
      standardKey: id === "op-packaging" ? "explicit-non-technological" : "explicit-technological",
      standardVersion: "v1",
      qualifiers: { source: "explicit-test" },
      resourceKey: resourceKey as string,
      machineKey: id === "op-machining" ? "cnc" : null,
      toolKeys: [],
      quantity: 1,
      quantityUnit: "db",
      setupMinutesPerBatch: id === "op-packaging" ? null : 10,
      cycleMinutesPerUnit: id === "op-packaging" ? null : 20,
      nonTechnologicalMinutes: id === "op-packaging" ? 30 : null,
      plannedNaturalHoldMinutes: null,
      timeStandardSource: id === "op-packaging" ? null : {
        documentVersionId: "document-1",
        versionHash: "7".repeat(64),
        locator: "1. oldal",
        standardKey: "explicit-technological",
        standardVersion: "v1",
        unit: "db",
      },
      workforce: 1,
      dependencies: (predecessors as string[]).map((predecessorOperationId) => ({ predecessorOperationId, type: "FS" as const, lagMinutes: 0 })),
      documentReferences: [{ documentVersionId: "document-1", versionHash: "7".repeat(64), locator: "1. oldal", purpose: "DRAWING" as const }],
      workInstruction: {
        documentVersionId: "document-1",
        versionHash: "7".repeat(64),
        locator: "1. oldal",
        contentCoverage: ["EXECUTION" as const, "IN_PROCESS_CONTROL" as const],
      },
      qualityCheckpoints: [{
        key: `qc:${id}`,
        label: `${operationType} ellenőrzése`,
        acceptanceRule: "Explicit ellenőrzési szabály",
        measurementMethod: null,
        measurementToolKey: null,
        evidenceRequirement: "Mérési jegyzőkönyv",
        required: true,
      }],
      sourceEvidence: [{
        sourceKind: "DOCUMENT" as const,
        documentVersionId: "document-1",
        versionHash: "7".repeat(64),
        locator: "1. oldal",
        rawValue: operationType as string,
        normalizedValue: operationType as string,
        confidence: 1,
        reviewState: "RESOLVED" as const,
      }],
      state: "READY" as const,
      quarantineReasons: [],
    })),
  }],
};
const project = {
  id: "project-1",
  key: "DSMR-1",
  name: "Minta projekt",
  num: "1",
  kezdes: null,
  beepites: null,
  szinTok: null,
  szinLap: null,
  status: "QUEUED",
  epics: [{ id: "epic-1", name: "Ajtólap", quantityLabel: null, disabled: false, steps: [{ id: "step-1", name: "Régi szabás", station: "Szabászat", quantity: 1, unitHours: 1, planDate: null, planLocked: false, disabled: false, tasks: [] }] }],
  unepicTasks: [],
} as ProjectDetail;

function renderPage() {
  const router = createMemoryRouter([{
    path: operationWorkspaceRoutePattern,
    element: <OperationWorkspacePage />,
  }], { initialEntries: [operationWorkspacePath("DSMR-1", 1)] });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.mocked(useProductionOrder).mockReturnValue({ data: order, isLoading: false, isError: false } as unknown as ReturnType<typeof useProductionOrder>);
  vi.mocked(useComponentCalculatorProfiles).mockReturnValue({ data: profiles, isLoading: false, isFetching: false, isError: false } as unknown as ReturnType<typeof useComponentCalculatorProfiles>);
  vi.mocked(useComponentSnapshots).mockReturnValue({ data: [snapshot], isLoading: false, isFetching: false, isError: false } as unknown as ReturnType<typeof useComponentSnapshots>);
  vi.mocked(useOperationPlanSnapshots).mockReturnValue({ data: operationPlans, isLoading: false, isFetching: false, isError: false } as unknown as ReturnType<typeof useOperationPlanSnapshots>);
  vi.mocked(useProject).mockReturnValue({ data: project, isLoading: false, isError: false } as unknown as ReturnType<typeof useProject>);
});

afterEach(cleanup);

describe("OperationWorkspacePage server-authority boundary", () => {
  it("renders the VERIFIED exact-revision snapshot and its four explicit server rows read-only", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Műveletterv" })).toBeTruthy();
    expect(screen.getByText("Szerver által ellenőrzött műveletterv · 4 sor")).toBeTruthy();
    expect(screen.getAllByText("operation-standards/v1")).toHaveLength(2);
    expect(screen.getByText("resource-mapping/v1")).toBeTruthy();
    const rows = screen.getByRole("list", { name: "Szerver által ellenőrzött műveleti sorok" });
    expect(rows.querySelectorAll(":scope > li")).toHaveLength(4);
    expect(Array.from(rows.querySelectorAll("h3"), (heading) => heading.textContent)).toEqual([
      "Explicit szabászat",
      "Explicit CNC megmunkálás",
      "Explicit összeszerelés",
      "Explicit csomagolási előkészítés",
    ]);
    expect(screen.getByRole("heading", { name: "Explicit szabászat" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Explicit CNC megmunkálás" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Explicit összeszerelés" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Explicit csomagolási előkészítés" })).toBeTruthy();
    expect(screen.getByText("doorstar:test:author")).toBeTruthy();
    expect(screen.getByText("doorstar:test:reviewer")).toBeTruthy();
    expect(screen.getByText(/PRODUCTION_RELEASE · NOT_AVAILABLE/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Műveletterv létrehozása/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Kiadás|Felülvizsgálat|Jóváhagyás/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Kilincsgarnitúra/ }));
    expect(screen.getByText("1 explicit szerverművelet hivatkozik erre a sorra.")).toBeTruthy();
    expect(screen.getByText(/40\. Explicit csomagolási előkészítés/)).toBeTruthy();
  });

  it("keeps an empty server result visibly locked and fabricates no operation", () => {
    vi.mocked(useOperationPlanSnapshots).mockReturnValue({
      data: {
        readiness: {
          ready: false,
          blockers: [{ code: "operation_component_snapshot_not_current", message: "No current snapshot." }],
          allowedActions: [],
        },
        snapshots: [],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    } as unknown as ReturnType<typeof useOperationPlanSnapshots>);

    renderPage();

    expect(screen.getByText("Nincs rögzített műveletterv-snapshot.")).toBeTruthy();
    expect(screen.getByText(/operation_component_snapshot_not_current/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Szerver által ellenőrzött műveleti sorok" })).toBeNull();
    expect(screen.getByText("Nincs használható, explicit műveleti hivatkozás.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Műveletterv létrehozása/i })).toBeNull();
  });

  it("fails closed on an authority query error even when component data is cached", () => {
    vi.mocked(useOperationPlanSnapshots).mockReturnValue({
      data: operationPlans,
      isLoading: false,
      isFetching: false,
      isError: true,
    } as unknown as ReturnType<typeof useOperationPlanSnapshots>);

    renderPage();

    expect(screen.getByRole("alert").textContent).toContain("nem tölthető be");
    expect(screen.getByText("Műveletterv-authority nem érhető el")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Szerver által ellenőrzött műveleti sorok" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Explicit szabászat" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Műveletterv létrehozása/i })).toBeNull();
  });

  it("fails closed while the server-authority response is loading", () => {
    vi.mocked(useOperationPlanSnapshots).mockReturnValue({
      data: operationPlans,
      isLoading: true,
      isFetching: true,
      isError: false,
    } as unknown as ReturnType<typeof useOperationPlanSnapshots>);

    renderPage();

    expect(screen.getByRole("status").textContent).toContain("ellenőrzése folyamatban van");
    expect(screen.queryByRole("list", { name: "Szerver által ellenőrzött műveleti sorok" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Explicit szabászat" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Műveletterv létrehozása|Kiadás|Release|Felülvizsgálat|Jóváhagyás/i })).toBeNull();
  });

  it("fails closed when the returned snapshot lineage does not match the exact revision", () => {
    vi.mocked(useOperationPlanSnapshots).mockReturnValue({
      data: {
        ...operationPlans,
        snapshots: operationPlans.snapshots.map((operationSnapshot) => ({
          ...operationSnapshot,
          orderContentHash: "9".repeat(64),
        })),
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    } as unknown as ReturnType<typeof useOperationPlanSnapshots>);

    renderPage();

    expect(screen.getByRole("alert").textContent).toContain("lineage-e nem egyezik");
    expect(screen.getByRole("alert").textContent).toContain("Műveleti sor nem jeleníthető meg");
    expect(screen.queryByRole("list", { name: "Szerver által ellenőrzött műveleti sorok" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Explicit szabászat" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Műveletterv létrehozása|Kiadás|Release|Felülvizsgálat|Jóváhagyás/i })).toBeNull();
  });

  it("keeps an exact but non-ready snapshot visible only as blocked audit evidence", () => {
    vi.mocked(useOperationPlanSnapshots).mockReturnValue({
      data: {
        ...operationPlans,
        snapshots: operationPlans.snapshots.map((operationSnapshot) => ({
          ...operationSnapshot,
          readiness: {
            ready: false,
            blockers: [{
              code: "operation_plan_review_incomplete",
              message: "A műveletterv felülvizsgálata még nem teljes.",
            }],
            allowedActions: [],
          },
        })),
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    } as unknown as ReturnType<typeof useOperationPlanSnapshots>);

    renderPage();

    expect(screen.getByText("A snapshot nem használható végleges művelettervként.")).toBeTruthy();
    expect(screen.getByText(/operation_plan_review_incomplete/)).toBeTruthy();
    expect(screen.getByText(/felülvizsgálata még nem teljes/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Szerver által ellenőrzött műveleti sorok" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Explicit szabászat" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Műveletterv létrehozása|Kiadás|Release|Felülvizsgálat|Jóváhagyás/i })).toBeNull();
  });
});
