import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type {
  ComponentCalculatorProfiles,
  ProductionOrderDetail,
  ProductionOrderRevision,
  TechnicalCatalog,
} from "@/services/production/types";
import {
  useComponentCalculatorProfiles,
  useComponentSnapshots,
  useCreateComponentSnapshot,
  useProductionOrder,
  useReviewComponentSnapshot,
  useTechnicalCatalog,
} from "@/services/production/hooks";
import { useUiStore } from "@/store/uiStore";
import {
  componentWorkspacePath,
  componentWorkspaceRoutePattern,
} from "@/lib/componentWorkspaceRoute";
import { ComponentWorkspacePage } from "./ComponentWorkspacePage";

vi.mock("@/services/production/hooks", () => ({
  useComponentCalculatorProfiles: vi.fn(),
  useComponentSnapshots: vi.fn(),
  useCreateComponentSnapshot: vi.fn(),
  useProductionOrder: vi.fn(),
  useReviewComponentSnapshot: vi.fn(),
  useTechnicalCatalog: vi.fn(),
}));

const createSnapshot = vi.fn(async () => undefined);
const reviewSnapshot = vi.fn(async () => undefined);

const revision: ProductionOrderRevision = {
  id: "revision-1",
  revision: 1,
  status: "APPROVED",
  intakeStage: "TECHNICAL_PREPARATION",
  customerName: "Minta Kft.",
  customerAddress: null,
  contactName: null,
  contactPhone: null,
  contactEmail: null,
  deliveryAddress: null,
  expectedDelivery: null,
  plannedStart: null,
  priority: 0,
  notes: "",
  positions: [{
    id: "position-1",
    code: "P01",
    name: "Irodaajtó",
    quantity: 1,
    productType: "Beltéri ajtó",
    openingDirection: null,
    openingWidthMm: null,
    openingHeightMm: null,
    openingDepthMm: null,
    doorWidthMm: null,
    doorHeightMm: null,
    doorThicknessMm: null,
    surface: null,
    wallTreatment: null,
    glazing: null,
    glazingSpecification: null,
    doorTypeKey: null,
    finishKey: null,
    glassKey: null,
    hardwareKeys: [],
    wallSolutionKey: null,
    materialKey: null,
    machiningKeys: [],
    technicalNotes: "",
    notes: "",
    evidence: [],
  }],
  manufacturedItems: [{
    id: "manufactured-1",
    kind: "WALL_PANEL",
    code: "FP01",
    name: "Lezáratlan falpanel",
    itemType: null,
    componentName: null,
    quantity: 1,
    widthMm: null,
    heightMm: null,
    thicknessMm: null,
    material: null,
    surface: null,
    colour: null,
    pattern: null,
    workKind: "STANDARD",
    state: "VERIFIED",
    notes: "",
    resolution: null,
    reviewedByRole: null,
    reviewedAt: null,
    relatedOrderPosition: null,
    evidence: [{
      id: "manufactured-evidence-1",
      manufacturedItemId: "manufactured-1",
      orderDocumentId: null,
      field: "QUANTITY",
      rawValue: "1",
      normalizedValue: 1,
      sourceRoot: "sales",
      relativePath: "order.xlsx",
      sheet: "Tételek",
      page: null,
      row: 8,
      confidence: 0.95,
      reviewState: "REVIEW",
      resolution: null,
      createdByRole: "import",
      reviewedByRole: null,
      reviewedAt: null,
      createdAt: "2026-07-30T09:00:00.000Z",
      updatedAt: "2026-07-30T09:00:00.000Z",
      orderDocument: null,
    }],
  }],
  supplementaryItems: [],
  documents: [],
  audit: [{
    id: "audit-1",
    orderRevisionId: "revision-1",
    action: "APPROVED",
    actorRole: "order_approver",
    contentHash: "a".repeat(64),
    contentHashSchemaVersion: 2,
    note: "Jóváhagyva.",
    createdAt: "2026-07-30T10:00:00.000Z",
  }],
  createdAt: "2026-07-30T09:00:00.000Z",
};

const order: ProductionOrderDetail = {
  id: "order-1",
  projectId: "project-1",
  revisions: [revision],
};

const catalog: TechnicalCatalog = {
  version: "doorstar-technical-catalog/v1",
  doorTypes: [],
  finishes: [],
  glass: [],
  hardware: [],
  wallSolutions: [],
  materials: [],
  machinings: [],
};

const profiles: ComponentCalculatorProfiles = {
  configurationVersion: "1",
  configurationFingerprint: "b".repeat(64),
  snapshotSchemaVersion: "doorstar-component-snapshot/v1",
  profiles: [{
    version: "doorstar-explicit-component-adapter/v1",
    label: "Explicit adapter",
    inputMode: "EXPLICIT_REVIEWED_OUTPUT",
    active: true,
    allowsFormulaExecution: false,
    allowsImplicitDefaults: false,
    cutPartDimensions: "FINISHED_AND_CUTTING_REQUIRED",
  }],
};

function renderPage() {
  const router = createMemoryRouter([{
    path: componentWorkspaceRoutePattern,
    element: <ComponentWorkspacePage />,
  }], {
    initialEntries: [componentWorkspacePath("DSMR-1", 1)],
  });
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  createSnapshot.mockClear();
  reviewSnapshot.mockClear();
  useUiStore.setState({ role: "technical_preparation" });
  vi.mocked(useProductionOrder).mockReturnValue({
    data: order,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useProductionOrder>);
  vi.mocked(useTechnicalCatalog).mockReturnValue({
    data: catalog,
    isSuccess: true,
    isFetching: false,
  } as unknown as ReturnType<typeof useTechnicalCatalog>);
  vi.mocked(useComponentCalculatorProfiles).mockReturnValue({
    data: profiles,
    isSuccess: true,
    isFetching: false,
  } as unknown as ReturnType<typeof useComponentCalculatorProfiles>);
  vi.mocked(useComponentSnapshots).mockReturnValue({
    data: [],
    isSuccess: true,
    isLoading: false,
    isFetching: false,
    isError: false,
  } as unknown as ReturnType<typeof useComponentSnapshots>);
  vi.mocked(useCreateComponentSnapshot).mockReturnValue({
    isPending: false,
    mutateAsync: createSnapshot,
  } as unknown as ReturnType<typeof useCreateComponentSnapshot>);
  vi.mocked(useReviewComponentSnapshot).mockReturnValue({
    isPending: false,
    mutateAsync: reviewSnapshot,
  } as unknown as ReturnType<typeof useReviewComponentSnapshot>);
});

afterEach(cleanup);

describe("ComponentWorkspacePage aggregate source gate", () => {
  it("keeps composition out of the DOM and never invokes snapshot creation", () => {
    renderPage();

    expect(screen.getByText("Adatkapu zárolva")).toBeTruthy();
    expect(screen.getByText("1 tétel nyitott")).toBeTruthy();
    expect(screen.getByText("Gyártott 0/1 · tartozék 0/0")).toBeTruthy();
    const blockerRegion = screen.getByRole("region", { name: "A szerkesztő még nem nyitható meg" });
    const blockerItems = within(blockerRegion).getAllByRole("listitem");
    expect(blockerItems).toHaveLength(1);
    expect(blockerItems[0]?.textContent).toBe("A teljes revízió forrásauditja hiányos: 1 külön gyártott tétel.");
    expect(screen.getByRole("link", { name: "Forrásaudit megnyitása a műszaki előkészítésben →" })
      .getAttribute("href")).toBe("/orders/DSMR-1/technical-preparation");
    expect(screen.queryByRole("heading", { name: "Mit bontunk alkatrészre?" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ellenőrzési snapshot létrehozása" })).toBeNull();
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it("keeps cached profile data fail-closed while the authority refetches", () => {
    vi.mocked(useComponentCalculatorProfiles).mockReturnValue({
      data: profiles,
      isSuccess: true,
      isFetching: true,
    } as unknown as ReturnType<typeof useComponentCalculatorProfiles>);

    renderPage();

    const blockerRegion = screen.getByRole("region", { name: "A szerkesztő még nem nyitható meg" });
    expect(within(blockerRegion).getByText("A profil-, katalógus- vagy snapshotadat még nem igazolt.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Mit bontunk alkatrészre?" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ellenőrzési snapshot létrehozása" })).toBeNull();
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it("keeps cached order data fail-closed while the order authority refetches", () => {
    vi.mocked(useProductionOrder).mockReturnValue({
      data: {
        ...order,
        revisions: [{ ...revision, manufacturedItems: [] }],
      },
      isLoading: false,
      isFetching: true,
      isError: false,
    } as unknown as ReturnType<typeof useProductionOrder>);

    renderPage();

    const blockerRegion = screen.getByRole("region", { name: "A szerkesztő még nem nyitható meg" });
    expect(within(blockerRegion).getByText("A profil-, katalógus- vagy snapshotadat még nem igazolt.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Mit bontunk alkatrészre?" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ellenőrzési snapshot létrehozása" })).toBeNull();
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it("keeps materialization fail-closed when the order authority errors", () => {
    vi.mocked(useProductionOrder).mockReturnValue({
      data: order,
      isLoading: false,
      isFetching: false,
      isError: true,
    } as unknown as ReturnType<typeof useProductionOrder>);

    renderPage();

    expect(screen.getByText("A rendelési csomag nem érhető el; a Kalkulátor fail-closed marad.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ellenőrzési snapshot létrehozása" })).toBeNull();
    expect(createSnapshot).not.toHaveBeenCalled();
  });
});
