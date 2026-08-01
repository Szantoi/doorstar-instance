import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type {
  OrderDocument,
  OrderPositionEvidence,
  ProductionOrderDetail,
  ProductionOrderPosition,
} from "@/services/production/types";
import {
  useAdvanceOrderIntakeStage,
  useProductionOrder,
  useTechnicalCatalog,
  useUpdateOrderRevision,
} from "@/services/production/hooks";
import { useUiStore } from "@/store/uiStore";
import { SurveyPage } from "./SurveyPage";

vi.mock("@/services/production/hooks", () => ({
  useAdvanceOrderIntakeStage: vi.fn(),
  useProductionOrder: vi.fn(),
  useTechnicalCatalog: vi.fn(),
  useUpdateOrderRevision: vi.fn(),
}));
vi.mock("@/hooks/useUnsavedChangesGuard", () => ({
  useUnsavedChangesGuard: () => ({ allowNextNavigation: vi.fn() }),
}));
vi.mock("@/components/orders/DoorSideAppearancePanel", () => ({
  DoorSideAppearancePanel: () => null,
}));

const advance = vi.fn(async () => undefined);

const basePosition = {
  id: "position-1",
  code: "01",
  name: "Gardrób",
  quantity: 1,
  productType: "Falc nélküli",
  openingDirection: "Bal ki",
  openingWidthMm: 840,
  openingHeightMm: 2150,
  openingDepthMm: 120,
  doorWidthMm: 800,
  doorHeightMm: 2100,
  doorThicknessMm: 40,
  surface: "Festésre előkészítve",
  wallTreatment: "NONE",
  glazing: "NONE",
  glazingSpecification: null,
  doorTypeKey: "frameless",
  finishKey: "paint-prep",
  glassKey: "none",
  hardwareKeys: [],
  wallSolutionKey: "none",
  materialKey: null,
  machiningKeys: [],
  technicalNotes: "",
  notes: "",
  evidence: [],
} as unknown as ProductionOrderPosition;

const salesDocument = {
  id: "sales-document",
  orderRevisionId: "revision-1",
  documentFamilyKey: "sales-family",
  supersedesDocumentId: null,
  source: "LEGACY_FOLDER",
  kind: "SALES_ORDER",
  displayName: "Sales átadás.pdf",
  relativePath: "DSMR-26148/Sales átadás.pdf",
  driveId: null,
  itemId: null,
  versionId: null,
  contentSha256: "a".repeat(64),
  positionLinks: [],
  releaseReferences: [],
  createdAt: "2026-07-31T18:00:00.000Z",
} satisfies OrderDocument;

const surveyDocument = {
  ...salesDocument,
  id: "survey-document",
  documentFamilyKey: "survey-family",
  kind: "SURVEY",
  displayName: "Felmérési forrás.jpg",
  relativePath: "DSMR-26148/Felmérési forrás.jpg",
  positionLinks: [{ orderPositionId: "position-1" }],
} satisfies OrderDocument;

function orderWith(documents: OrderDocument[], evidence: OrderPositionEvidence[] = []): ProductionOrderDetail {
  return {
    id: "order-1",
    projectId: "project-1",
    revisions: [{
      id: "revision-1",
      revision: 1,
      status: "DRAFT",
      intakeStage: "SURVEY_PENDING",
      customerName: "Séfer Kft.",
      customerAddress: null,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      deliveryAddress: null,
      expectedDelivery: null,
      plannedStart: null,
      priority: 0,
      notes: "",
      positions: [{ ...basePosition, evidence }],
      manufacturedItems: [],
      supplementaryItems: [],
      documents,
      audit: [],
      createdAt: "2026-07-31T18:00:00.000Z",
    }],
  };
}

function renderPage(order: ProductionOrderDetail) {
  vi.mocked(useProductionOrder).mockReturnValue({
    data: order,
    isLoading: false,
    isFetching: false,
    isError: false,
  } as unknown as ReturnType<typeof useProductionOrder>);
  const router = createMemoryRouter([{
    path: "/orders/:projectKey/survey",
    element: <SurveyPage />,
  }], { initialEntries: ["/orders/DSMR-26148/survey"] });
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  advance.mockClear();
  useUiStore.setState({ role: "technical_preparation" });
  vi.mocked(useAdvanceOrderIntakeStage).mockReturnValue({ isPending: false, mutateAsync: advance } as unknown as ReturnType<typeof useAdvanceOrderIntakeStage>);
  vi.mocked(useUpdateOrderRevision).mockReturnValue({ isPending: false, mutateAsync: vi.fn(async () => undefined) } as unknown as ReturnType<typeof useUpdateOrderRevision>);
  vi.mocked(useTechnicalCatalog).mockReturnValue({
    data: {
      doorTypes: [{ key: "frameless", label: "Falc nélküli" }],
      finishes: [{ key: "paint-prep", label: "Festésre előkészítve" }],
      glass: [{ key: "none", label: "Nem üveges" }],
      wallSolutions: [{ key: "none", label: "Nincs" }],
      materials: [], hardware: [], machinings: [],
    },
    isLoading: false,
    isFetching: false,
    isError: false,
  } as unknown as ReturnType<typeof useTechnicalCatalog>);
});

afterEach(cleanup);

describe("SurveyPage source readiness gate", () => {
  it("keeps DSMR-26148-style sales-only data visibly blocked", async () => {
    renderPage(orderWith([salesDocument]));

    const gate = await screen.findByRole("status", { name: "A felmérés véglegesítésének hiányai" });
    expect(within(gate).getByText("Nincs felmérési forrásfájl rögzítve.")).toBeTruthy();
    expect(within(gate).getByText("1 pozícióhoz nincs közvetlenül kapcsolt felmérési forrásfájl.")).toBeTruthy();
    expect(within(gate).getByText(/önmagában nem jelenti a tartalom ellenőrzését/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /01 Gardrób/ }).textContent).toContain("Nincs kapcsolt felmérési forrás");
    const finalise = screen.getByRole("button", { name: "Felmérés véglegesítése" });
    expect(finalise).toHaveProperty("disabled", true);
    fireEvent.click(finalise);
    expect(advance).not.toHaveBeenCalled();
  });

  it("opens the UI pre-gate only for linked survey source and complete evidence audit", async () => {
    const evidence = [{
      id: "evidence-1",
      reviewState: "RESOLVED",
      resolution: "A felmérési forrással összevetve.",
      reviewedByPrincipal: "user:reviewer-1",
      reviewedByRole: "technical_preparation",
      reviewedAt: "2026-07-31T19:00:00.000Z",
    }] as unknown as OrderPositionEvidence[];
    renderPage(orderWith([salesDocument, surveyDocument], evidence));

    await waitFor(() => expect(screen.getByRole("button", { name: "Felmérés véglegesítése" })).toHaveProperty("disabled", false));
    expect(screen.queryByRole("status", { name: "A felmérés véglegesítésének hiányai" })).toBeNull();
    expect(screen.getByRole("button", { name: /01 Gardrób/ }).textContent).toContain("Felmérési forrás kapcsolva");
  });

  it("keeps a legacy resolved row blocked when reviewer identity is missing", async () => {
    const evidence = [{
      id: "evidence-legacy",
      reviewState: "RESOLVED",
      resolution: "Régi lezárás reviewer nélkül.",
      reviewedByPrincipal: null,
      reviewedByRole: "technical_preparation",
      reviewedAt: "2026-07-31T19:00:00.000Z",
    }] as unknown as OrderPositionEvidence[];
    renderPage(orderWith([surveyDocument], evidence));

    const gate = await screen.findByRole("status", { name: "A felmérés véglegesítésének hiányai" });
    expect(within(gate).getByText("1 evidence-rekord ellenőrzése nincs teljesen, auditáltan lezárva.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Felmérés véglegesítése" })).toHaveProperty("disabled", true);
  });
});
