import "@testing-library/jest-dom/vitest";
// @ts-expect-error The frontend tsconfig intentionally excludes Node globals; Vitest still runs in Node.
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ProductionOrderDetail, ProductionOrderRevision } from "@/services/production/types";
import {
  useAddOrderDocument,
  useAdvanceOrderIntakeStage,
  useApproveOrderRevision,
  useComponentCalculatorProfiles,
  useComponentSnapshots,
  useCreateOrderFeedback,
  useCreateOrderSupplementaryItem,
  useLinkOrderDocumentToPosition,
  useOrderFeedback,
  useProductionOrder,
  useResolveOrderFeedback,
  useResolveOrderPositionEvidence,
  useReviewComponentSnapshot,
  useTechnicalCatalog,
} from "@/services/production/hooks";
import { useUiStore } from "@/store/uiStore";
import { OrderDetailPage } from "./OrderDetailPage";

const css = readFileSync("src/index.css", "utf8") as string;
const phoneCss = css.slice(css.lastIndexOf("@media (max-width: 620px)"));

vi.mock("@/services/production/hooks", () => ({
  useAddOrderDocument: vi.fn(),
  useAdvanceOrderIntakeStage: vi.fn(),
  useApproveOrderRevision: vi.fn(),
  useComponentCalculatorProfiles: vi.fn(),
  useComponentSnapshots: vi.fn(),
  useCreateOrderFeedback: vi.fn(),
  useCreateOrderSupplementaryItem: vi.fn(),
  useLinkOrderDocumentToPosition: vi.fn(),
  useOrderFeedback: vi.fn(),
  useProductionOrder: vi.fn(),
  useResolveOrderFeedback: vi.fn(),
  useResolveOrderPositionEvidence: vi.fn(),
  useReviewComponentSnapshot: vi.fn(),
  useTechnicalCatalog: vi.fn(),
}));

vi.mock("@/components/orders/ManufacturedItemsPanel", () => ({ ManufacturedItemsPanel: () => null }));
vi.mock("@/components/orders/SupplementaryItemsPanel", () => ({ SupplementaryItemsPanel: () => null }));
vi.mock("@/components/orders/OrderPositionEvidenceList", () => ({ OrderPositionEvidenceList: () => null }));
vi.mock("@/components/orders/ComponentSnapshotsPanel", () => ({ ComponentSnapshotsPanel: () => null }));
vi.mock("@/components/orders/OrderDocumentVersionsPanel", () => ({ OrderDocumentVersionsPanel: () => null }));
vi.mock("@/components/orders/OrderPosition360", () => ({
  OrderPosition360: ({ revisionNumber, initiallyOpen = false, ownerAction }: {
    revisionNumber: number;
    initiallyOpen?: boolean;
    ownerAction?: { href: string; label: string } | null;
  }) => <div data-testid="position-360-revision" data-initially-open={String(initiallyOpen)}>
    R{String(revisionNumber).padStart(2, "0")}
    {ownerAction && <a data-testid="position-owner-action" href={ownerAction.href}>{ownerAction.label}</a>}
  </div>,
}));

const approveRevision = vi.fn(async () => undefined);
const revision = {
  id: "revision-1",
  revision: 1,
  status: "REVIEW",
  intakeStage: "TECHNICAL_PREPARATION",
  customerName: "Minta Kft.",
  expectedDelivery: null,
  priority: 0,
  positions: [{ id: "position-1", evidence: [] }],
  manufacturedItems: [],
  supplementaryItems: [],
  documents: [{ id: "document-1" }],
  audit: [],
} as unknown as ProductionOrderRevision;
const order = {
  id: "order-1",
  projectId: "project-1",
  revisions: [revision],
} as ProductionOrderDetail;

function inertMutation() {
  return { isPending: false, mutateAsync: vi.fn(async () => undefined) };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

function renderPage(initialEntry = "/orders/DSMR-1") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes><Route path="/orders/:projectKey" element={<><OrderDetailPage /><LocationProbe /></>} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  approveRevision.mockClear();
  useUiStore.setState({ role: "order_approver" });
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
  vi.mocked(useComponentCalculatorProfiles).mockReturnValue({
    data: { snapshotSchemaVersion: "component-snapshot/v1", profiles: [] },
    isLoading: false,
    isFetching: false,
    isError: false,
  } as unknown as ReturnType<typeof useComponentCalculatorProfiles>);
  vi.mocked(useTechnicalCatalog).mockReturnValue({
    data: {},
    isLoading: false,
    isFetching: false,
    isError: false,
  } as unknown as ReturnType<typeof useTechnicalCatalog>);
  vi.mocked(useComponentSnapshots).mockReturnValue({
    data: [],
    isLoading: false,
    isFetching: false,
    isError: false,
  } as unknown as ReturnType<typeof useComponentSnapshots>);
  vi.mocked(useApproveOrderRevision).mockReturnValue({
    isPending: false,
    mutateAsync: approveRevision,
  } as unknown as ReturnType<typeof useApproveOrderRevision>);
  vi.mocked(useAdvanceOrderIntakeStage).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useAdvanceOrderIntakeStage>);
  vi.mocked(useAddOrderDocument).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useAddOrderDocument>);
  vi.mocked(useLinkOrderDocumentToPosition).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useLinkOrderDocumentToPosition>);
  vi.mocked(useCreateOrderFeedback).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useCreateOrderFeedback>);
  vi.mocked(useResolveOrderFeedback).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useResolveOrderFeedback>);
  vi.mocked(useResolveOrderPositionEvidence).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useResolveOrderPositionEvidence>);
  vi.mocked(useReviewComponentSnapshot).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useReviewComponentSnapshot>);
  vi.mocked(useCreateOrderSupplementaryItem).mockReturnValue(inertMutation() as unknown as ReturnType<typeof useCreateOrderSupplementaryItem>);
});

afterEach(cleanup);

describe("OrderDetailPage approval authority gate", () => {
  it.each(["REVIEW", "APPROVED"] as const)("does not expose a position editor for a %s revision", (status) => {
    useUiStore.setState({ role: "technical_preparation" });
    vi.mocked(useProductionOrder).mockReturnValue({
      data: { ...order, revisions: [{ ...revision, status }] },
      isLoading: false,
      isFetching: false,
      isError: false,
    } as unknown as ReturnType<typeof useProductionOrder>);

    renderPage();

    expect(screen.queryByTestId("position-owner-action")).not.toBeInTheDocument();
  });

  it.each([
    { stage: "SURVEY_PENDING", href: "/orders/DSMR-1/survey" },
    { stage: "TECHNICAL_PREPARATION", href: "/orders/DSMR-1/technical-preparation" },
  ] as const)("exposes exactly one position editor for a writable DRAFT in $stage", ({ stage, href }) => {
    useUiStore.setState({ role: "technical_preparation" });
    vi.mocked(useProductionOrder).mockReturnValue({
      data: { ...order, revisions: [{ ...revision, status: "DRAFT", intakeStage: stage }] },
      isLoading: false,
      isFetching: false,
      isError: false,
    } as unknown as ReturnType<typeof useProductionOrder>);

    renderPage();

    const actions = screen.getAllByTestId("position-owner-action");
    expect(actions).toHaveLength(1);
    expect(actions[0]).toHaveAttribute("href", href);
  });

  it("does not expose a DRAFT position editor without preparation authority", () => {
    useUiStore.setState({ role: "reader" });
    vi.mocked(useProductionOrder).mockReturnValue({
      data: { ...order, revisions: [{ ...revision, status: "DRAFT", intakeStage: "TECHNICAL_PREPARATION" }] },
      isLoading: false,
      isFetching: false,
      isError: false,
    } as unknown as ReturnType<typeof useProductionOrder>);

    renderPage();

    expect(screen.queryByTestId("position-owner-action")).not.toBeInTheDocument();
  });

  it("keeps mobile compaction scoped to clear summaries without hiding fail-closed warning details", () => {
    expect(phoneCss).toMatch(/\.order-handoff-facts \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    expect(phoneCss).toMatch(/\.order-revision-selector \{ display: grid; grid-template-columns: auto minmax\(0, 1fr\);/);
    expect(phoneCss).toMatch(/\.order-handoff-alert\.is-clear > span \{ display: none; \}/);
    expect(phoneCss).not.toMatch(/\.order-handoff-alert\.is-(?:critical|pending)[^}]*display:\s*none/);

    renderPage();

    const criticalSummary = document.querySelector(".order-handoff-alert");
    expect(criticalSummary).toBeInstanceOf(HTMLElement);
    expect(criticalSummary).toHaveClass("is-critical");
    expect(criticalSummary?.querySelector("ul")).not.toBeNull();
    expect(criticalSummary).toHaveTextContent(/A v.llalt id. nincs r.gz.tve/);
  });

  it("marks the no-gap summary as the only phone-collapsible alert variant", () => {
    vi.mocked(useProductionOrder).mockReturnValue({
      data: { ...order, revisions: [{ ...revision, expectedDelivery: "2026-09-30", positions: [] }] },
      isLoading: false,
      isFetching: false,
      isError: false,
    } as unknown as ReturnType<typeof useProductionOrder>);

    renderPage();

    const clearSummary = document.querySelector(".order-handoff-alert");
    expect(clearSummary).toBeInstanceOf(HTMLElement);
    expect(clearSummary).toHaveClass("is-clear");
    expect(clearSummary).toHaveTextContent(/Nincs nyitott kritikus elt.r.s/);
    expect(clearSummary).toHaveTextContent("nincs nyitott feedback");
  });

  it.each([
    { source: "order refetch", orderFetching: true, feedbackFetching: false },
    { source: "feedback refetch", orderFetching: false, feedbackFetching: true },
  ])("keeps approval disabled during $source", ({ orderFetching, feedbackFetching }) => {
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

    fireEvent.change(screen.getByPlaceholderText("Jóváhagyás indoklása *"), {
      target: { value: "A revízió ellenőrizve." },
    });
    const button = screen.getByRole("button", { name: "Jóváhagyás" });
    expect(button).toHaveProperty("disabled", true);
    if (orderFetching) {
      expect(screen.getByLabelText("Kritikus hiányok és eltérések")).toHaveTextContent("Ellenőrzés folyamatban");
      expect(screen.queryByText("Nincs nyitott kritikus eltérés")).not.toBeInTheDocument();
    }
    fireEvent.click(button);
    expect(approveRevision).not.toHaveBeenCalled();
  });

  it("names and opens the real approval gate for a review awaiting an approver", () => {
    renderPage();

    const nextStep = screen.getByText("Következő teendő").parentElement;
    expect(nextStep).toHaveTextContent("Rendelési revízió jóváhagyása");
    expect(screen.queryByText("Alkatrészképzés megnyitása")).not.toBeInTheDocument();

    const disclosure = screen.getByText("Részletes munkafolyamat, dokumentumok és audit").closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "Jóváhagyási kapu megnyitása" }));

    expect(disclosure).toHaveAttribute("open");
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Jóváhagyás indoklása *"));
    expect(screen.getByRole("button", { name: "Jóváhagyás" })).toBeInTheDocument();
  });
});

describe("OrderDetailPage revision focus", () => {
  const latestRevision = {
    ...revision,
    id: "revision-2",
    revision: 2,
    customerName: "Referencia projekt · aktuális",
    positions: [{ id: "position-2", evidence: [] }, { id: "position-3", evidence: [] }],
    documents: [{ id: "document-2" }, { id: "document-3" }, { id: "document-4" }],
    manufacturedItems: [{ id: "manufactured-2" }],
    supplementaryItems: [{ id: "supplementary-2" }, { id: "supplementary-3" }],
  } as unknown as ProductionOrderRevision;
  const historicalRevision = {
    ...revision,
    id: "revision-1",
    revision: 1,
    status: "SUPERSEDED",
    customerName: "Referencia projekt · történeti",
    positions: [{ id: "position-1", evidence: [] }],
    documents: [{ id: "document-1" }],
  } as unknown as ProductionOrderRevision;
  const revisionedOrder = {
    ...order,
    revisions: [latestRevision, historicalRevision],
  } as ProductionOrderDetail;

  beforeEach(() => {
    vi.mocked(useProductionOrder).mockReturnValue({
      data: revisionedOrder,
      isLoading: false,
      isFetching: false,
      isError: false,
    } as unknown as ReturnType<typeof useProductionOrder>);
  });

  it.each([
    { source: "historical", path: "/orders/DSMR-1?revision=1" },
    { source: "invalid", path: "/orders/DSMR-1?revision=999" },
  ])("does not expose the position editor for a $source revision selection", ({ path }) => {
    useUiStore.setState({ role: "technical_preparation" });
    vi.mocked(useProductionOrder).mockReturnValue({
      data: {
        ...revisionedOrder,
        revisions: [
          { ...latestRevision, status: "DRAFT", intakeStage: "TECHNICAL_PREPARATION" },
          { ...historicalRevision, status: "DRAFT", intakeStage: "TECHNICAL_PREPARATION" },
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    } as unknown as ReturnType<typeof useProductionOrder>);

    renderPage(path);

    expect(screen.queryByTestId("position-owner-action")).not.toBeInTheDocument();
  });

  it("shows only the latest revision by default with a compact content summary", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Referencia projekt · aktuális");
    expect(screen.getByLabelText("Sales átadási összefoglaló")).toHaveTextContent("DSMR-1");
    expect(screen.getAllByText("Nem gyártási kiadás").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Revízió kiválasztása")).toHaveValue("2");
    expect(screen.getByTestId("position-360-revision")).toHaveTextContent("R02");
    expect(screen.getByTestId("position-360-revision")).toHaveAttribute("data-initially-open", "false");
    expect(screen.queryByText("Referencia projekt · történeti")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Kiválasztott revízió tartalma")).toHaveTextContent("Pozíció2");
    expect(screen.getByLabelText("Kiválasztott revízió tartalma")).toHaveTextContent("Dokumentum3");
    expect(screen.getByLabelText("Kiválasztott revízió tartalma")).toHaveTextContent("Gyártott tétel1");
    expect(screen.getByLabelText("Kiválasztott revízió tartalma")).toHaveTextContent("Tartozék2");
    const disclosure = screen.getByText("Részletes munkafolyamat, dokumentumok és audit").closest("details");
    expect(disclosure).not.toHaveAttribute("open");
  });

  it("names the exact available workflow action in the next-step summary", () => {
    vi.mocked(useProductionOrder).mockReturnValue({
      data: { ...revisionedOrder, revisions: [{ ...latestRevision, status: "APPROVED" }, historicalRevision] },
      isLoading: false,
      isFetching: false,
      isError: false,
    } as unknown as ReturnType<typeof useProductionOrder>);

    renderPage();

    expect(screen.getByText("Következő teendő").parentElement).toHaveTextContent("Alkatrészképzés megnyitása");
    expect(screen.getByRole("link", { name: "Alkatrészképzés megnyitása" })).toHaveAttribute("href", "/orders/DSMR-1/revisions/2/calculator");
  });

  it("opens an explicit historical revision read-only and keeps latest-only workspaces closed", () => {
    renderPage("/orders/DSMR-1?revision=1");

    expect(screen.getByLabelText("Revízió kiválasztása")).toHaveValue("1");
    expect(screen.getByTestId("position-360-revision")).toHaveTextContent("R01");
    expect(screen.getByText(/Történeti R01 pillanatkép/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Jóváhagyás indoklása *")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Jóváhagyás" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Felmérés.*Munkatér megnyitása/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Státusz és következő teendő/ })).toBeInTheDocument();
    expect(useComponentSnapshots).toHaveBeenLastCalledWith("DSMR-1", 1);
  });

  it("falls back visibly and fail-closed, with a direct recovery link, when the requested revision is invalid", async () => {
    vi.mocked(useProductionOrder).mockReturnValue({
      data: { ...revisionedOrder, revisions: [{ ...latestRevision, status: "APPROVED" }, historicalRevision] },
      isLoading: false,
      isFetching: false,
      isError: false,
    } as unknown as ReturnType<typeof useProductionOrder>);

    renderPage("/orders/DSMR-1?revision=999");

    expect(screen.getByLabelText("Revízió kiválasztása")).toHaveValue("2");
    expect(screen.getByRole("alert")).toHaveTextContent("revízió nem található");
    const currentView = screen.getByText("Aktuális nézet").parentElement;
    expect(currentView).toHaveTextContent("Legfrissebb revízió · a hibás kiválasztás helyreállításáig csak olvasható");
    expect(currentView).not.toHaveTextContent("Történeti");
    expect(screen.queryByPlaceholderText("Jóváhagyás indoklása *")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Jóváhagyás" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Alkatrészképzés megnyitása" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Legfrissebb revízió megnyitása" }));

    await waitFor(() => expect(screen.getByTestId("location-search")).toHaveTextContent(/^$/));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lets keyboard users confirm the latest revision and clears the deep link", async () => {
    renderPage("/orders/DSMR-1?revision=1");
    const selector = screen.getByLabelText("Revízió kiválasztása");
    selector.focus();
    expect(document.activeElement).toBe(selector);

    fireEvent.change(selector, { target: { value: "2" } });

    await waitFor(() => expect(screen.getByTestId("location-search")).toHaveTextContent(/^$/));
    expect(selector).toHaveValue("2");
  });
});
