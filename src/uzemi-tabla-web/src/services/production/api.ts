import { apiFetch } from "../apiClient";
import { PRODUCTION_API_BASE as BASE } from "./config";
import type {
  BoardResponse,
  EpikTemplate,
  IssueSessionResult,
  KanbanResponse,
  LoadReport,
  OrderChecklistItem,
  ProductionOverview,
  ProjectCard,
  ProjectDetail,
  SheetTemplate,
  StationConfig,
  Task,
} from "./types";

export const productionApi = {
  getStations: () => apiFetch<{ stations: StationConfig[] }>(`${BASE}/stations`),

  getBoard: (week: string) => apiFetch<BoardResponse>(`${BASE}/board`, { query: { week } }),

  createTask: (input: { title: string; station?: string | null; week: string; day: number; urgent?: boolean }) =>
    apiFetch<Task>(`${BASE}/tasks`, { method: "POST", body: input }),

  updateTask: (id: string, patch: Partial<Task>) =>
    apiFetch<Task>(`${BASE}/tasks/${id}`, { method: "PATCH", body: patch }),

  deleteTask: (id: string) => apiFetch<void>(`${BASE}/tasks/${id}`, { method: "DELETE" }),

  addComment: (id: string, text: string) =>
    apiFetch(`${BASE}/tasks/${id}/comments`, { method: "POST", body: { text } }),

  getOrders: () => apiFetch<OrderChecklistItem[]>(`${BASE}/orders`),
  addOrder: (label: string) => apiFetch<OrderChecklistItem>(`${BASE}/orders`, { method: "POST", body: { label } }),
  updateOrder: (id: string, patch: Partial<OrderChecklistItem>) =>
    apiFetch<OrderChecklistItem>(`${BASE}/orders/${id}`, { method: "PATCH", body: patch }),
  deleteOrder: (id: string) => apiFetch<void>(`${BASE}/orders/${id}`, { method: "DELETE" }),

  getWeekNote: (week: string) => apiFetch<BoardResponse["infoNote"]>(`${BASE}/week-note`, { query: { week } }),
  saveWeekNote: (week: string, text: string) =>
    apiFetch(`${BASE}/week-note`, { method: "PUT", body: { week, text } }),

  getKanban: (station: string, week: string) =>
    apiFetch<KanbanResponse>(`${BASE}/kanban`, { query: { station, week } }),
  saveStationWorkflow: (station: string, steps: string[]) =>
    apiFetch(`${BASE}/kanban/${encodeURIComponent(station)}/workflow`, { method: "PUT", body: { steps } }),

  getLoad: (week: string) => apiFetch<LoadReport>(`${BASE}/load`, { query: { week } }),
  setCapacity: (hoursPerDay: number) => apiFetch(`${BASE}/capacity`, { method: "PUT", body: { hoursPerDay } }),

  getProjects: () => apiFetch<ProjectCard[]>(`${BASE}/projects`),
  createProject: (input: { key: string; name: string; num?: string }) =>
    apiFetch<ProjectDetail>(`${BASE}/projects`, { method: "POST", body: input }),
  getProject: (key: string) => apiFetch<ProjectDetail>(`${BASE}/projects/${encodeURIComponent(key)}`),
  updateProject: (key: string, patch: Partial<ProjectDetail>) =>
    apiFetch<ProjectDetail>(`${BASE}/projects/${encodeURIComponent(key)}`, { method: "PUT", body: patch }),
  saveEpics: (key: string, epics: ProjectDetail["epics"]) =>
    apiFetch<ProjectDetail["epics"]>(`${BASE}/projects/${encodeURIComponent(key)}/epics`, {
      method: "PUT",
      body: { epics },
    }),
  scheduleProject: (key: string, schedDays?: boolean[]) =>
    apiFetch<IssueSessionResult>(`${BASE}/projects/${encodeURIComponent(key)}/schedule`, {
      method: "POST",
      body: { schedDays },
    }),
  getSheet: (key: string, kind: "QUANTITIES" | "CUTTING" | "HARDWARE") =>
    apiFetch<unknown>(`${BASE}/projects/${encodeURIComponent(key)}/sheets/${kind}`),
  saveSheet: (key: string, kind: "QUANTITIES" | "CUTTING" | "HARDWARE", data: unknown) =>
    apiFetch<unknown>(`${BASE}/projects/${encodeURIComponent(key)}/sheets/${kind}`, { method: "PUT", body: data }),

  getTemplates: () => apiFetch<SheetTemplate[]>(`${BASE}/templates`),
  applyTemplate: (name: string, projectKey: string) =>
    apiFetch<{ epics: ProjectDetail["epics"] }>(
      `${BASE}/templates/${encodeURIComponent(name)}/apply/${encodeURIComponent(projectKey)}`,
      { method: "POST" }
    ),
  getEpikTemplates: () => apiFetch<EpikTemplate[]>(`${BASE}/epik-templates`),
  applyEpikTemplate: (name: string, projectKey: string) =>
    apiFetch(`${BASE}/epik-templates/${encodeURIComponent(name)}/apply/${encodeURIComponent(projectKey)}`, {
      method: "POST",
    }),

  getOverview: () => apiFetch<ProductionOverview>(`${BASE}/overview`),
};
