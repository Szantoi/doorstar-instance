import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ProductionOrderCard, ProjectCard } from "@/services/production/types";
import { useProjects, useProductionOrders } from "@/services/production/hooks";
import { useUiStore } from "@/store/uiStore";
import { HomePage } from "./HomePage";

vi.mock("@/services/production/hooks", () => ({
  useProjects: vi.fn(),
  useProductionOrders: vi.fn(),
}));

const project = (patch: Partial<ProjectCard> = {}): ProjectCard => ({
  key: "dsmr-26148",
  name: "Minta Projekt",
  num: "26148",
  status: "QUEUED",
  totalTasks: 0,
  doneTasks: 0,
  progressPct: 0,
  ...patch,
});

const order = (patch: Partial<ProductionOrderCard> = {}): ProductionOrderCard => ({
  projectKey: "dsmr-26148",
  projectName: "Minta Projekt",
  projectNum: "26148",
  revision: 2,
  status: "DRAFT",
  intakeStage: "SURVEY_PENDING",
  customerName: "Minta Kft.",
  expectedDelivery: null,
  positionCount: 3,
  updatedAt: "2026-07-31T10:00:00.000Z",
  ...patch,
});

function queryResult<T>(data: T, patch: Record<string, boolean> = {}) {
  return { data, isLoading: false, isFetching: false, isError: false, ...patch };
}

function renderPage() {
  return render(<MemoryRouter><HomePage /></MemoryRouter>);
}

describe("HomePage next actions", () => {
  beforeEach(() => {
    useUiStore.setState({ role: "vezeto" });
    vi.mocked(useProjects).mockReturnValue(queryResult([project()]) as unknown as ReturnType<typeof useProjects>);
    vi.mocked(useProductionOrders).mockReturnValue(queryResult([order()]) as unknown as ReturnType<typeof useProductionOrders>);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the projected blocker and links to the owning next workspace", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Következő teendők" })).toBeInTheDocument();
    expect(screen.getByText("A gyártható műszaki adatok felmérésre várnak.")).toBeInTheDocument();
    expect(screen.getByText("Minta Kft.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Felmérés megnyitása/ })).toHaveAttribute("href", "/orders/dsmr-26148/survey");
  });

  it("prioritises attention work before planning and ready projects", () => {
    vi.mocked(useProjects).mockReturnValue(queryResult([
      project({ key: "ready", name: "Kész projekt", status: "SHIPPING_READY" }),
      project({ key: "approved", name: "Tervezendő projekt" }),
      project(),
    ]) as unknown as ReturnType<typeof useProjects>);
    vi.mocked(useProductionOrders).mockReturnValue(queryResult([
      order({ projectKey: "approved", projectName: "Tervezendő projekt", status: "APPROVED" }),
      order(),
    ]) as unknown as ReturnType<typeof useProductionOrders>);

    renderPage();

    const cards = screen.getAllByRole("article");
    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual([
      "Minta Projekt",
      "Tervezendő projekt",
      "Kész projekt",
    ]);
  });

  it.each([
    ["projects", "isLoading"],
    ["projects", "isFetching"],
    ["projects", "isError"],
    ["orders", "isLoading"],
    ["orders", "isFetching"],
    ["orders", "isError"],
  ] as const)("keeps the queue closed when %s reports %s", (register, queryState) => {
    if (register === "projects") {
      vi.mocked(useProjects).mockReturnValue(queryResult([project()], { [queryState]: true }) as unknown as ReturnType<typeof useProjects>);
    } else {
      vi.mocked(useProductionOrders).mockReturnValue(queryResult([order()], { [queryState]: true }) as unknown as ReturnType<typeof useProductionOrders>);
    }

    renderPage();

    if (queryState === "isError") {
      expect(screen.getByText(/A következő teendők most nem ellenőrizhetők/)).toHaveAttribute("role", "alert");
    } else {
      expect(screen.getByText("Projekt- és rendelési kapcsolatok betöltése…")).toHaveAttribute("role", "status");
    }
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.queryByRole("link", { name: /Felmérés megnyitása/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Nincs kapcsolt rendelés")).not.toBeInTheDocument();
  });

  it.each([
    {
      state: "ATTENTION",
      project: project({ key: "attention", name: "Figyelmet kérő" }),
      orders: [order({ projectKey: "attention", projectName: "Figyelmet kérő" })],
      action: /Felmérés megnyitása/,
      href: "/orders/attention/survey",
    },
    {
      state: "PLANNING",
      project: project({ key: "planning", name: "Tervezésre váró" }),
      orders: [order({ projectKey: "planning", projectName: "Tervezésre váró", status: "APPROVED" })],
      action: /Folyamat megnyitása/,
      href: "/projects/planning",
    },
    {
      state: "UNSTRUCTURED",
      project: project({ key: "unstructured", name: "Munkamenet nélküli" }),
      orders: [],
      action: /Segédmunkalap összeállítása/,
      href: "/projects/unstructured/work-session",
    },
    {
      state: "IN_PRODUCTION",
      project: project({ key: "production", name: "Gyártásban", totalTasks: 3, doneTasks: 1, status: "IN_PROGRESS" }),
      orders: [],
      action: /Munkamenet megnyitása/,
      href: "/projects/production/work-session",
    },
    {
      state: "READY",
      project: project({ key: "ready", name: "Kiszállítható", status: "SHIPPING_READY" }),
      orders: [],
      action: /Projekt megnyitása/,
      href: "/projects/ready",
    },
  ])("maps $state to its real next workspace", ({ project: projectFixture, orders, action, href }) => {
    vi.mocked(useProjects).mockReturnValue(queryResult([projectFixture]) as unknown as ReturnType<typeof useProjects>);
    vi.mocked(useProductionOrders).mockReturnValue(queryResult(orders) as unknown as ReturnType<typeof useProductionOrders>);

    renderPage();

    expect(screen.getByRole("link", { name: action })).toHaveAttribute("href", href);
  });

  it("shows four priority cards and an exact remainder count", () => {
    const projects = Array.from({ length: 6 }, (_, index) => project({
      key: `attention-${index + 1}`,
      name: `Figyelmi projekt ${index + 1}`,
    }));
    const orders = projects.map((entry) => order({ projectKey: entry.key, projectName: entry.name }));
    vi.mocked(useProjects).mockReturnValue(queryResult(projects) as unknown as ReturnType<typeof useProjects>);
    vi.mocked(useProductionOrders).mockReturnValue(queryResult(orders) as unknown as ReturnType<typeof useProductionOrders>);

    renderPage();

    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.getByText("+ 2 további projekt a teljes projektmunkatérben")).toBeInTheDocument();
    expect(screen.queryByText("Figyelmi projekt 5")).not.toBeInTheDocument();
  });

  it("preserves source order between projects with the same priority", () => {
    const projects = [
      project({ key: "attention-b", name: "Második forrássor" }),
      project({ key: "attention-a", name: "Első betűrendben" }),
      project({ key: "attention-c", name: "Harmadik forrássor" }),
    ];
    const orders = projects.map((entry) => order({ projectKey: entry.key, projectName: entry.name }));
    vi.mocked(useProjects).mockReturnValue(queryResult(projects) as unknown as ReturnType<typeof useProjects>);
    vi.mocked(useProductionOrders).mockReturnValue(queryResult(orders) as unknown as ReturnType<typeof useProductionOrders>);

    renderPage();

    expect(screen.getAllByRole("article").map((card) => card.querySelector("h3")?.textContent)).toEqual([
      "Második forrássor",
      "Első betűrendben",
      "Harmadik forrássor",
    ]);
  });

  it("uses read-only wording for an unstructured project without planning authority", () => {
    useUiStore.setState({ role: "reader" });
    vi.mocked(useProductionOrders).mockReturnValue(queryResult([]) as unknown as ReturnType<typeof useProductionOrders>);

    renderPage();

    expect(screen.getByRole("link", { name: /Segédmunkalap megtekintése/ })).toHaveAttribute("href", "/projects/dsmr-26148/work-session");
    expect(screen.queryByRole("link", { name: /Segédmunkalap összeállítása/ })).not.toBeInTheDocument();
  });
});
