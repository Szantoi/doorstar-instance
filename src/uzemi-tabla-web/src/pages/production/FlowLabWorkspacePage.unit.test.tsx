import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { FlowLabDeviationRecord, FlowLabPlanSnapshotRead } from "@/lib/flowLab";
import type { ProjectDetail } from "@/services/production/types";
import {
  useFlowLabDeviations,
  useFlowLabMaterializedWorksheet,
  useFlowLabPlanSnapshots,
} from "@/services/production/hooks";
import { FlowLabWorkspacePage } from "./FlowLabWorkspacePage";

vi.mock("@/services/production/hooks", () => ({
  useFlowLabDeviations: vi.fn(),
  useFlowLabMaterializedWorksheet: vi.fn(),
  useFlowLabPlanSnapshots: vi.fn(),
}));

const hash = (letter: string) => letter.repeat(64);
const pins = { catalogRevision: "catalog/v1", catalogHash: hash("a"), planHash: hash("b"), engineIdentity: "flow-lab/v1" };
const materializationKey = `flm-v1-${hash("c")}`;

const verifiedSnapshot: FlowLabPlanSnapshotRead = {
  id: "snapshot-verified",
  origin: "FLOW_LAB",
  orderRevisionId: "revision-1",
  componentSnapshotId: "component-1",
  state: "VERIFIED",
  schemaVersion: "doorstar.flow-lab.plan-materialization/v1",
  generatorProfileVersion: "flow-lab",
  generatorProfileFingerprint: "flow-lab/v1",
  standardCatalogVersion: "catalog/v1",
  standardCatalogFingerprint: hash("b"),
  sourceSetKey: "26133",
  materializationKey,
  pins,
  operations: [{
    id: "summary-1",
    correlationKey: "26133/DOOR_LEAF/GyV-L.08",
    workflowGroup: "Ajtólap összegző kapu",
    sourceOperationKey: "GyV-L.08",
    quantityUnit: "db",
    operationType: "Summary",
    station: null,
    boardProjection: { quantity: 0, unitHours: 0 },
    relativePosition: 8,
    predecessors: [{ correlationKey: "26133/DOOR_LEAF/GyV-L.07", type: "FS", lagMinutes: 0, partialRelease: null }],
  }],
  readiness: { ready: true, blockers: [], allowedActions: [] },
  createdAt: "2026-08-08T08:00:00.000Z",
  reviewResolution: "A pontos projektkötés ellenőrizve.",
  reviewedByRole: "order_approver",
  reviewedByPrincipal: "reviewer-1",
  reviewedAt: "2026-08-08T08:15:00.000Z",
  createdByRole: "technical_preparation",
  createdByPrincipal: "import-service",
  reviewNote: "Importált terv evidence.",
  orderContentHash: hash("d"),
  componentOutputHash: hash("e"),
  inputHash: hash("f"),
  outputHash: hash("1"),
  resourceMappingVersion: "doorstar/v1",
  resourceMappingFingerprint: hash("2"),
  evidence: {
    findings: [{ code: "CATALOG_INFO", severity: "Information", count: 1 }],
    unresolved: [{ code: "OPEN_FIELD", field: "operations[1].station", count: 1 }],
    absentMembers: [{ name: "operations[].assignedPeople", reason: "A terv nem rendel személyt a művelethez." }],
    productionAuthority: false,
  },
};

const rejectedSnapshot: FlowLabPlanSnapshotRead = {
  ...verifiedSnapshot,
  id: "snapshot-rejected",
  state: "REJECTED",
  sourceSetKey: "26133-rejected",
  readiness: { ready: false, blockers: [{ code: "flow_lab_plan_snapshot_not_verified", message: "A snapshot nem ellenőrzött." }], allowedActions: [] },
};

const materializedProject: ProjectDetail = {
  id: "project-1", key: "DSMR-26133", name: "Minta projekt", num: "26133", kezdes: null, beepites: null,
  szinTok: null, szinLap: null, status: "QUEUED", unepicTasks: [],
  epics: [{
    id: "epic-1", name: "Ajtólap", quantityLabel: null, disabled: false,
    origin: "FLOW_LAB", sourceSetKey: "26133", materializationKey, pins,
    steps: [{
      id: "step-1", name: "Ajtólap összegző kapu", station: null, quantity: 0, unitHours: 0,
      planDate: null, planLocked: false, disabled: false, origin: "FLOW_LAB", sourceSetKey: "26133",
      materializationKey, pins, correlationKey: "26133/DOOR_LEAF/GyV-L.08", operationType: "Summary", relativePosition: 8, predecessors: [],
    }],
  }],
};

const deviation: FlowLabDeviationRecord = {
  id: "a7f2f8d5-34aa-4cbb-8dd6-3f4ac6dc61be",
  occurredAt: "2026-08-08T09:00:00.000Z",
  kind: "QUANTITY_CHANGED",
  correlationKey: "26133/DOOR_LEAF/GyV-L.08",
  actor: { role: "shop_floor", principal: "operator-1" },
  payload: { quantityBefore: 0, quantityAfter: 2, quantityUnit: "db" },
  materializationId: "materialization-1",
  pins: { ...pins, sourceSetKey: "26133", materializationKey },
};

const fetchNextPage = vi.fn();

function queryResult<T>(data: T, patch: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, ...patch };
}

function renderPage() {
  return render(<MemoryRouter initialEntries={["/projects/DSMR-26133/flow-lab"]}>
    <Routes><Route path="/projects/:key/flow-lab" element={<FlowLabWorkspacePage />} /></Routes>
  </MemoryRouter>);
}

describe("FlowLabWorkspacePage", () => {
  beforeEach(() => {
    fetchNextPage.mockReset();
    vi.mocked(useFlowLabPlanSnapshots).mockReturnValue(queryResult({ snapshots: [verifiedSnapshot, rejectedSnapshot] }) as unknown as ReturnType<typeof useFlowLabPlanSnapshots>);
    vi.mocked(useFlowLabMaterializedWorksheet).mockReturnValue(queryResult(materializedProject) as unknown as ReturnType<typeof useFlowLabMaterializedWorksheet>);
    vi.mocked(useFlowLabDeviations).mockReturnValue(queryResult(
      { pages: [{ records: [deviation], nextCursor: "older" }] },
      { hasNextPage: true, isFetchingNextPage: false, fetchNextPage },
    ) as unknown as ReturnType<typeof useFlowLabDeviations>);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders immutable snapshots, explicit provenance, Summary 0/0 and typed cursor evidence without mutation UI", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Flow Lab evidence" })).toBeVisible();
    expect(screen.getByText(/Nincs fájlfeltöltés, Task-lánc, naptári ütemezés vagy üzemi kiadás/)).toBeVisible();
    expect(screen.getByText("Epic/EpicStep projekció provenance-a")).toBeVisible();
    expect(screen.getAllByText("1 db", { selector: "dd" })).toHaveLength(3);
    const summary = screen.getByRole("heading", { level: 4, name: "Ajtólap összegző kapu" }).closest("li");
    expect(summary).toHaveTextContent("0 db");
    expect(summary).toHaveTextContent("0 óra/egység");
    expect(screen.getByText("CATALOG_INFO")).toBeVisible();
    expect(screen.getByText("QUANTITY_CHANGED")).toBeVisible();
    expect(screen.getByText("quantityBefore")).toBeVisible();
    expect(screen.queryByRole("button", { name: /materializálás indítása/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /snapshot felülvizsgálata/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps a rejected snapshot inspectable and visibly read-only", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Elutasított.*26133-rejected/i }));

    expect(screen.getByRole("status")).toHaveTextContent("Ez a snapshot elutasított");
    expect(screen.getByText("flow_lab_plan_snapshot_not_verified")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("has clear empty and error states without exposing infrastructure details", () => {
    vi.mocked(useFlowLabPlanSnapshots).mockReturnValue(queryResult({ snapshots: [] }, { isError: false }) as unknown as ReturnType<typeof useFlowLabPlanSnapshots>);
    vi.mocked(useFlowLabDeviations).mockReturnValue(queryResult(undefined, { isLoading: false, isError: true, hasNextPage: false, isFetchingNextPage: false, fetchNextPage }) as unknown as ReturnType<typeof useFlowLabDeviations>);
    renderPage();

    expect(screen.getByText("Ehhez a projekthez nincs elérhető Flow Lab snapshot.")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Az eltérésnapló most nem érhető el");
    expect(screen.queryByText(/http:|token|stack/i)).not.toBeInTheDocument();
  });

  it("loads the next immutable cursor page without providing a record mutation", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Korábbi eltérések betöltése" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
