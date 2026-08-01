import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { Epic, ProjectDetail, Task } from "@/services/production/types";
import {
  useApplyEpikTemplate,
  useDeleteEpic,
  useEpikTemplates,
  useIssueProjectStep,
  useKanban,
  useProject,
  useRevokeProjectStep,
  useSaveEpics,
  useSaveEpikTemplate,
  useScheduleProject,
  useStations,
  useTemplates,
} from "@/services/production/hooks";
import { useUiStore } from "@/store/uiStore";
import { ProjectWorkSessionPage } from "./ProjectWorkSessionPage";

vi.mock("@/services/production/hooks", () => ({
  useApplyEpikTemplate: vi.fn(),
  useDeleteEpic: vi.fn(),
  useEpikTemplates: vi.fn(),
  useIssueProjectStep: vi.fn(),
  useKanban: vi.fn(),
  useProject: vi.fn(),
  useRevokeProjectStep: vi.fn(),
  useSaveEpics: vi.fn(),
  useSaveEpikTemplate: vi.fn(),
  useScheduleProject: vi.fn(),
  useStations: vi.fn(),
  useTemplates: vi.fn(),
}));

vi.mock("./ProjectSubSheets", () => ({
  ProjectSubSheets: ({ canManage }: { canManage: boolean }) => <div data-testid="subsheets" data-can-manage={String(canManage)} />,
}));
vi.mock("./TaskDetailModal", () => ({ TaskDetailModal: () => <div>Feladat részletei</div> }));

const NativeRequest = globalThis.Request;

beforeAll(() => {
  globalThis.Request = class TestRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const { signal: _signal, ...compatibleInit } = init ?? {};
      super(input, compatibleInit);
    }
  };
});

afterAll(() => {
  globalThis.Request = NativeRequest;
});

const task: Task = {
  id: "task-1",
  projectId: "project-1",
  epicStepId: "step-issued",
  epicName: "Forrás epik",
  title: "Kiadott megmunkálás",
  station: "CNC",
  week: "2026-W31",
  day: 1,
  stepIndex: 0,
  acknowledged: false,
  urgent: false,
  problem: false,
  dueDate: null,
  description: "",
  quantity: 1,
  unitHours: 0.5,
  dependsOnId: null,
  createdAt: "2026-07-31T10:00:00.000Z",
  updatedAt: "2026-07-31T10:00:00.000Z",
  status: "assigned",
  isDone: false,
  flowLabel: "Felvett",
  depDone: true,
  dependsOnTitle: null,
  projectNum: "26148",
};

const epic: Epic = {
  id: "epic-1",
  name: "Forrás epik",
  quantityLabel: "2 db",
  disabled: false,
  steps: [
    { id: "step-open", name: "Szabás", station: "SZABASZAT", quantity: 2, unitHours: 0.5, planDate: "2026-08-03", planLocked: true, disabled: false },
    { id: "step-issued", name: "Megmunkálás", station: "CNC", quantity: 1, unitHours: 0.5, planDate: "2026-08-04", planLocked: true, disabled: false, tasks: [task] },
  ],
};

const project: ProjectDetail = {
  id: "project-1",
  key: "demo",
  name: "Minta projekt",
  num: "26148",
  kezdes: null,
  beepites: null,
  szinTok: null,
  szinLap: null,
  status: "QUEUED",
  epics: [epic],
  unepicTasks: [],
};

function queryResult<T>(data: T) {
  return { data, isLoading: false, isFetching: false, isError: false };
}

function mutationResult(mutateAsync: ReturnType<typeof vi.fn>) {
  return { mutateAsync, mutate: vi.fn(), isPending: false, data: undefined };
}

const mutations = {
  applyTemplate: vi.fn(),
  deleteEpic: vi.fn(),
  issueStep: vi.fn(),
  revokeStep: vi.fn(),
  saveEpics: vi.fn(),
  saveTemplate: vi.fn(),
  schedule: vi.fn(),
};

function renderPage() {
  const router = createMemoryRouter([
    { path: "/projects/:key/work-session", element: <ProjectWorkSessionPage /> },
    { path: "/projects/:key", element: <p>Projekt áttekintése cél</p> },
  ], { initialEntries: ["/projects/demo/work-session"] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("ProjectWorkSessionPage fail-closed write authority", () => {
  beforeEach(() => {
    useUiStore.setState({ role: "production_planner" });
    Object.values(mutations).forEach((mutation) => mutation.mockReset());
    vi.mocked(useProject).mockReturnValue(queryResult(project) as unknown as ReturnType<typeof useProject>);
    vi.mocked(useTemplates).mockReturnValue(queryResult([{ id: "template-1", name: "Teljes sablon", epics: [] }]) as unknown as ReturnType<typeof useTemplates>);
    vi.mocked(useStations).mockReturnValue(queryResult({ stations: [{ key: "SZABASZAT", name: "Szabászat" }, { key: "CNC", name: "CNC" }] }) as unknown as ReturnType<typeof useStations>);
    vi.mocked(useEpikTemplates).mockReturnValue(queryResult([{ id: "epic-template-1", name: "Epik sablon", epic: { name: "Sablon epik", quantityLabel: "1 db", steps: [] } }]) as unknown as ReturnType<typeof useEpikTemplates>);
    vi.mocked(useKanban).mockReturnValue(queryResult(undefined) as unknown as ReturnType<typeof useKanban>);
    vi.mocked(useSaveEpics).mockReturnValue(mutationResult(mutations.saveEpics) as unknown as ReturnType<typeof useSaveEpics>);
    vi.mocked(useApplyEpikTemplate).mockReturnValue(mutationResult(mutations.applyTemplate) as unknown as ReturnType<typeof useApplyEpikTemplate>);
    vi.mocked(useDeleteEpic).mockReturnValue(mutationResult(mutations.deleteEpic) as unknown as ReturnType<typeof useDeleteEpic>);
    vi.mocked(useIssueProjectStep).mockReturnValue(mutationResult(mutations.issueStep) as unknown as ReturnType<typeof useIssueProjectStep>);
    vi.mocked(useRevokeProjectStep).mockReturnValue(mutationResult(mutations.revokeStep) as unknown as ReturnType<typeof useRevokeProjectStep>);
    vi.mocked(useSaveEpikTemplate).mockReturnValue(mutationResult(mutations.saveTemplate) as unknown as ReturnType<typeof useSaveEpikTemplate>);
    vi.mocked(useScheduleProject).mockReturnValue(mutationResult(mutations.schedule) as unknown as ReturnType<typeof useScheduleProject>);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps the legacy worksheet readable and explains the server conflict lock", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Minta projekt" })).toBeInTheDocument();
    expect(screen.getByText("Nem kiadási forrás")).toBeInTheDocument();
    expect(screen.getByText(/csak olvasható megtekintése/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Szerkesztés zárolva");
    expect(screen.getByRole("status")).toHaveTextContent("szerveroldali verzió- és ütközésvédelem");
    expect(screen.getByRole("button", { name: "Nyomtatás" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Projekt áttekintése/ })).toBeEnabled();
    expect(screen.getByDisplayValue("Forrás epik")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Szabás")).toBeInTheDocument();
    expect(screen.getByTestId("subsheets")).toHaveAttribute("data-can-manage", "false");
  });

  it("keeps every manager worksheet write path disabled with zero mutations", () => {
    renderPage();

    const disabledButtons = [
      screen.getByRole("button", { name: "Mentés" }),
      screen.getByRole("button", { name: "Betölt" }),
      screen.getByRole("button", { name: "Hozzáad" }),
      screen.getByRole("button", { name: "Munkamenet kiadása" }),
      screen.getByRole("button", { name: "+ Epik" }),
      screen.getByRole("button", { name: "Sablonként ment" }),
      screen.getByRole("button", { name: "+ Task" }),
      screen.getByRole("button", { name: "Epik törlése" }),
      screen.getByRole("button", { name: "Kiadás" }),
      screen.getByRole("button", { name: "Munkalap" }),
      screen.getByRole("button", { name: "Visszavon" }),
      ...screen.getAllByRole("button", { name: "×" }),
    ];
    disabledButtons.forEach((button) => {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    });

    expect(screen.getByDisplayValue("Forrás epik")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Kimarad" })).toBeDisabled();
    expect(screen.getAllByRole("combobox").every((control) => control.hasAttribute("disabled"))).toBe(true);
    expect(screen.getAllByRole("spinbutton").every((control) => control.hasAttribute("disabled"))).toBe(true);
    expect(screen.getAllByDisplayValue(/Szabás|Megmunkálás/).every((control) => control.hasAttribute("disabled"))).toBe(true);
    expect(screen.getByTestId("subsheets")).toHaveAttribute("data-can-manage", "false");

    Object.values(mutations).forEach((mutation) => expect(mutation).not.toHaveBeenCalled());
    expect(screen.queryByText("Feladat részletei")).not.toBeInTheDocument();
  });
});
