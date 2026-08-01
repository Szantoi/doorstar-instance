import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { ProductionOrderDetail, ProductionOrderRevision, TechnicalCatalog } from "@/services/production/types";
import {
  useCreateOrderSupplementaryItem,
  useOrderFeedback,
  useProductionOrder,
  useRequestOrderReview,
  useReviewManufacturedItem,
  useReviewManufacturedItemEvidence,
  useReviewOrderSupplementaryItem,
  useReviewOrderSupplementaryItemEvidence,
  useTechnicalCatalog,
  useUpdateOrderRevision,
} from "@/services/production/hooks";
import { useUiStore } from "@/store/uiStore";
import { TechnicalPreparationPage } from "./TechnicalPreparationPage";

vi.mock("@/services/production/hooks", () => ({
  useCreateOrderSupplementaryItem: vi.fn(),
  useOrderFeedback: vi.fn(),
  useProductionOrder: vi.fn(),
  useRequestOrderReview: vi.fn(),
  useReviewManufacturedItem: vi.fn(),
  useReviewManufacturedItemEvidence: vi.fn(),
  useReviewOrderSupplementaryItem: vi.fn(),
  useReviewOrderSupplementaryItemEvidence: vi.fn(),
  useTechnicalCatalog: vi.fn(),
  useUpdateOrderRevision: vi.fn(),
}));

vi.mock("@/lib/doorStructureReadiness", () => ({
  doorStructureContractBlockers: () => [],
}));
vi.mock("@/components/orders/DoorSideAppearancePanel", () => ({ DoorSideAppearancePanel: () => null }));
vi.mock("@/components/orders/ManufacturedItemsPanel", () => ({ ManufacturedItemsPanel: () => null }));
vi.mock("@/components/orders/SupplementaryItemsPanel", () => ({ SupplementaryItemsPanel: () => null }));

const requestReview = vi.fn(async () => undefined);
const position = {
  id: "position-1",
  code: "P01",
  name: "Irodaajtó",
  quantity: 1,
  openingWidthMm: 900,
  openingHeightMm: 2_100,
  openingDepthMm: 120,
  doorTypeKey: null,
  surface: null,
  finishKey: null,
  openingDirection: null,
  wallSolutionKey: null,
  glassKey: null,
  materialKey: "material-1",
  hardwareKeys: ["hardware-1"],
  machiningKeys: ["machining-1"],
  technicalNotes: "",
  evidence: [],
};
const revision = {
  id: "revision-1",
  revision: 1,
  status: "DRAFT",
  intakeStage: "TECHNICAL_PREPARATION",
  customerName: "Minta Kft.",
  positions: [position],
  documents: [{ id: "document-1" }],
  manufacturedItems: [],
  supplementaryItems: [],
} as unknown as ProductionOrderRevision;
const order = {
  id: "order-1",
  projectId: "project-1",
  revisions: [revision],
} as ProductionOrderDetail;
const catalog = {
  version: "catalog/v1",
  doorTypes: [],
  finishes: [],
  glass: [],
  hardware: [{ key: "hardware-1", label: "Pánt" }],
  wallSolutions: [],
  materials: [{ key: "material-1", label: "MDF" }],
  machinings: [{ key: "machining-1", label: "Marás" }],
} as TechnicalCatalog;

function inertMutation() {
  return { isPending: false, mutateAsync: vi.fn(async () => undefined) };
}

function renderPage() {
  const router = createMemoryRouter([{
    path: "/orders/:projectKey/technical-preparation",
    element: <TechnicalPreparationPage />,
  }], { initialEntries: ["/orders/DSMR-1/technical-preparation"] });
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  requestReview.mockClear();
  useUiStore.setState({ role: "technical_preparation" });
  vi.mocked(useProductionOrder).mockReturnValue({
    data: order,
    isLoading: false,
    isFetching: false,
    isError: false,
  } as unknown as ReturnType<typeof useProductionOrder>);
  vi.mocked(useOrderFeedback).mockReturnValue({
    data: [],
    isLoading: false,
    isFetching: false,
    isError: false,
  } as unknown as ReturnType<typeof useOrderFeedback>);
  vi.mocked(useTechnicalCatalog).mockReturnValue({ data: catalog } as ReturnType<typeof useTechnicalCatalog>);
  vi.mocked(useRequestOrderReview).mockReturnValue({
    isPending: false,
    mutateAsync: requestReview,
  } as unknown as ReturnType<typeof useRequestOrderReview>);
  vi.mocked(useUpdateOrderRevision).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useUpdateOrderRevision>);
  vi.mocked(useReviewManufacturedItem).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useReviewManufacturedItem>);
  vi.mocked(useReviewManufacturedItemEvidence).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useReviewManufacturedItemEvidence>);
  vi.mocked(useCreateOrderSupplementaryItem).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useCreateOrderSupplementaryItem>);
  vi.mocked(useReviewOrderSupplementaryItem).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useReviewOrderSupplementaryItem>);
  vi.mocked(useReviewOrderSupplementaryItemEvidence).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useReviewOrderSupplementaryItemEvidence>);
});

afterEach(cleanup);

describe("TechnicalPreparationPage review authority gate", () => {
  it("has a review-ready control state with stable dependencies", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Review-ra küldés" })).toHaveProperty("disabled", false);
  });

  it.each([
    { source: "order refetch", orderFetching: true, feedbackFetching: false },
    { source: "feedback refetch", orderFetching: false, feedbackFetching: true },
  ])("keeps review disabled during $source", ({ orderFetching, feedbackFetching }) => {
    vi.mocked(useProductionOrder).mockReturnValue({
      data: order,
      isLoading: false,
      isFetching: orderFetching,
      isError: false,
    } as unknown as ReturnType<typeof useProductionOrder>);
    vi.mocked(useOrderFeedback).mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: feedbackFetching,
      isError: false,
    } as unknown as ReturnType<typeof useOrderFeedback>);

    renderPage();

    const button = screen.getByRole("button", { name: "Review-ra küldés" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(requestReview).not.toHaveBeenCalled();
  });
});
