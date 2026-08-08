import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ProjectDetail } from "@/services/production/types";
import {
  useDeleteProject,
  useOrderRevisionReadiness,
  useProductionOrder,
  useProject,
  useProjectWorkflow,
  useUpdateProject,
} from "@/services/production/hooks";
import { useUiStore } from "@/store/uiStore";
import { ProjectDetailPage } from "./ProjectDetailPage";

vi.mock("@/services/production/hooks", () => ({
  useDeleteProject: vi.fn(),
  useOrderRevisionReadiness: vi.fn(),
  useProductionOrder: vi.fn(),
  useProject: vi.fn(),
  useProjectWorkflow: vi.fn(),
  useUpdateProject: vi.fn(),
}));

vi.mock("@/components/projects/ProjectChainPanel", () => ({
  ProjectChainPanel: ({ state }: { state: string }) => <section aria-label="Projektlánc" data-state={state} />,
}));

const updateMutate = vi.fn();
const deleteMutate = vi.fn();

const project: ProjectDetail = {
  id: "project-1",
  key: "dsmr-26148",
  name: "Minta Projekt",
  num: "26148",
  kezdes: "2026-08-03",
  beepites: "2026-09-14",
  szinTok: "Fehér",
  szinLap: "Tölgy",
  status: "QUEUED",
  epics: [],
  unepicTasks: [],
};

function queryResult<T>(data: T, patch: Record<string, unknown> = {}) {
  return { data, error: null, isLoading: false, isFetching: false, isError: false, ...patch };
}

function mutationResult(mutate: ReturnType<typeof vi.fn>, patch: Record<string, unknown> = {}) {
  return { mutate, isPending: false, isError: false, error: null, ...patch };
}

function page() {
  return (
    <MemoryRouter initialEntries={["/projects/dsmr-26148"]}>
      <Routes>
        <Route path="/projects/:key" element={<ProjectDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPage() {
  return render(page());
}

describe("ProjectDetailPage accessibility and mutation authority", () => {
  beforeEach(() => {
    useUiStore.setState({ role: "vezeto" });
    vi.mocked(useProject).mockReturnValue(queryResult(project) as unknown as ReturnType<typeof useProject>);
    vi.mocked(useProductionOrder).mockReturnValue(queryResult(undefined) as unknown as ReturnType<typeof useProductionOrder>);
    vi.mocked(useUpdateProject).mockReturnValue(mutationResult(updateMutate) as unknown as ReturnType<typeof useUpdateProject>);
    vi.mocked(useDeleteProject).mockReturnValue(mutationResult(deleteMutate) as unknown as ReturnType<typeof useDeleteProject>);
    vi.mocked(useOrderRevisionReadiness).mockReturnValue(queryResult(undefined) as unknown as ReturnType<typeof useOrderRevisionReadiness>);
    vi.mocked(useProjectWorkflow).mockReturnValue(queryResult(undefined) as unknown as ReturnType<typeof useProjectWorkflow>);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps exactly one project-named level-one heading while the title remains editable", () => {
    renderPage();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Minta Projekt" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Projekt neve" })).toBeEnabled();
  });

  it("uses the route-stable project key in the breadcrumb", () => {
    renderPage();

    const projectsLink = screen.getByRole("link", { name: "Projektek" });
    expect(projectsLink.parentElement).toHaveTextContent("Projektek / dsmr-26148");
    expect(projectsLink.parentElement).not.toHaveTextContent("Projektek / 26148");
  });

  it("links to the plainly named read-only production-plan workspace", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "Gyártási terv megnyitása →" })).toHaveAttribute(
      "href",
      "/projects/dsmr-26148/flow-lab",
    );
  });

  it("disables every project mutation and calls no mutation while project data refetches", () => {
    vi.mocked(useProject).mockReturnValue(queryResult(project, { isFetching: true }) as unknown as ReturnType<typeof useProject>);

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Projektadatok háttérellenőrzése");
    for (const input of screen.getAllByRole("textbox")) expect(input).toBeDisabled();
    const title = screen.getByRole("textbox", { name: "Projekt neve" });
    fireEvent.change(title, { target: { value: "Módosított név" } });
    fireEvent.blur(title);
    fireEvent.click(screen.getByRole("button", { name: "Projekt archiválása" }));

    expect(updateMutate).not.toHaveBeenCalled();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("announces a project mutation error instead of failing silently", () => {
    vi.mocked(useUpdateProject).mockReturnValue(mutationResult(updateMutate, { isError: true }) as unknown as ReturnType<typeof useUpdateProject>);

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("A projektadatok mentése sikertelen");
  });

  it("passes a fail-closed chain state while either server projection refetches", () => {
    vi.mocked(useProductionOrder).mockReturnValue(queryResult({
      id: "order-1",
      projectId: project.id,
      revisions: [{ id: "revision-2", revision: 2 }],
    }) as unknown as ReturnType<typeof useProductionOrder>);
    vi.mocked(useOrderRevisionReadiness).mockReturnValue(queryResult({}, { isFetching: true }) as unknown as ReturnType<typeof useOrderRevisionReadiness>);
    vi.mocked(useProjectWorkflow).mockReturnValue(queryResult({}) as unknown as ReturnType<typeof useProjectWorkflow>);

    renderPage();

    expect(screen.getByLabelText("Projektlánc")).toHaveAttribute("data-state", "PENDING");
  });

  it("preserves a dirty field while background refetch synchronises clean fields", () => {
    const view = renderPage();
    fireEvent.change(screen.getByRole("textbox", { name: "Projekt neve" }), { target: { value: "Helyi piszkozat" } });

    vi.mocked(useProject).mockReturnValue(queryResult({
      ...project,
      name: "Háttérből érkező név",
      num: "26148-A",
    }, { isFetching: true }) as unknown as ReturnType<typeof useProject>);
    view.rerender(page());

    expect(screen.getByRole("textbox", { name: "Projekt neve" })).toHaveValue("Helyi piszkozat");
    expect(screen.getByRole("textbox", { name: "Munkaszám" })).toHaveValue("26148-A");
  });

  it("synchronises the saved field from a successful update response", () => {
    const successfulUpdateMutate = vi.fn((_: unknown, options?: { onSuccess?: (savedProject: ProjectDetail) => void }) => {
      options?.onSuccess?.({ ...project, name: "Mentett projekt" });
    });
    vi.mocked(useUpdateProject).mockReturnValue(mutationResult(successfulUpdateMutate) as unknown as ReturnType<typeof useUpdateProject>);
    renderPage();

    const title = screen.getByRole("textbox", { name: "Projekt neve" });
    fireEvent.change(title, { target: { value: "  Mentett projekt  " } });
    fireEvent.blur(title);

    expect(successfulUpdateMutate).toHaveBeenCalledWith(
      { name: "Mentett projekt" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(title).toHaveValue("Mentett projekt");
  });
});
