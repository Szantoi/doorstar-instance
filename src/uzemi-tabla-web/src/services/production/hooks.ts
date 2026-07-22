import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { productionApi } from "./api";
import type { OrderChecklistItem, ProjectDetail, Task, UpdateTaskPatch } from "./types";

const keys = {
  stations: ["production", "stations"] as const,
  board: (week: string) => ["production", "board", week] as const,
  orders: ["production", "orders"] as const,
  kanban: (station: string) => ["production", "kanban", station] as const,
  load: (week: string) => ["production", "load", week] as const,
  projects: ["production", "projects"] as const,
  project: (key: string) => ["production", "project", key] as const,
  epikRollup: (key: string) => ["production", "epikRollup", key] as const,
  templates: ["production", "templates"] as const,
  epikTemplates: ["production", "epikTemplates"] as const,
  sheet: (key: string, kind: string) => ["production", "sheet", key, kind] as const,
  task: (id: string) => ["production", "task", id] as const,
};

export function useStations() {
  return useQuery({ queryKey: keys.stations, queryFn: productionApi.getStations, staleTime: Infinity });
}

export function useBoard(week: string) {
  return useQuery({ queryKey: keys.board(week), queryFn: () => productionApi.getBoard(week) });
}

function useInvalidateBoard(week: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.board(week) });
}

export function useCreateTask(week: string) {
  const invalidate = useInvalidateBoard(week);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productionApi.createTask,
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["production", "board"] });
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: ["production", "epikRollup"] });
      qc.invalidateQueries({ queryKey: ["production", "kanban"] });
      qc.invalidateQueries({ queryKey: ["production", "load"] });
    },
  });
}

export function useUpdateTask(week: string) {
  const invalidate = useInvalidateBoard(week);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskPatch }) => productionApi.updateTask(id, patch),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["production", "kanban"] });
      qc.invalidateQueries({ queryKey: ["production", "load"] });
      qc.invalidateQueries({ queryKey: ["production", "task"] });
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: ["production", "epikRollup"] });
    },
  });
}

export function useDeleteTask(week: string) {
  const invalidate = useInvalidateBoard(week);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productionApi.deleteTask,
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["production", "board"] });
      qc.invalidateQueries({ queryKey: ["production", "kanban"] });
      qc.invalidateQueries({ queryKey: ["production", "load"] });
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: ["production", "epikRollup"] });
    },
  });
}

export function useTask(id: string) {
  return useQuery({ queryKey: keys.task(id), queryFn: () => productionApi.getTask(id), enabled: !!id });
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => productionApi.addComment(taskId, text),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.task(taskId) }),
  });
}

export function useAddImage(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => productionApi.addImage(taskId, url),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.task(taskId) }),
  });
}

export function useDeleteImage(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) => productionApi.deleteImage(imageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.task(taskId) }),
  });
}

export function useOrders() {
  return useQuery({ queryKey: keys.orders, queryFn: productionApi.getOrders });
}

export function useAddOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productionApi.addOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.orders }),
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<OrderChecklistItem> }) =>
      productionApi.updateOrder(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.orders }),
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productionApi.deleteOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.orders }),
  });
}

export function useSaveWeekNote(week: string) {
  const invalidate = useInvalidateBoard(week);
  return useMutation({
    mutationFn: (text: string) => productionApi.saveWeekNote(week, text),
    onSuccess: invalidate,
  });
}

export function useKanban(station: string) {
  return useQuery({
    queryKey: keys.kanban(station),
    queryFn: () => productionApi.getKanban(station),
    enabled: !!station,
  });
}

export function useSaveStationWorkflow(station: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (steps: string[]) => productionApi.saveStationWorkflow(station, steps),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.kanban(station) }),
  });
}

export function useDeleteWorkflowColumn(station: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (index: number) => productionApi.deleteWorkflowColumn(station, index),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.kanban(station) });
      qc.invalidateQueries({ queryKey: ["production", "board"] });
    },
  });
}

export function useLoad(week: string) {
  return useQuery({ queryKey: keys.load(week), queryFn: () => productionApi.getLoad(week) });
}

export function useSetCapacity(week: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productionApi.setCapacity,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.load(week) }),
  });
}

export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: productionApi.getProjects });
}

export function useProject(key: string) {
  return useQuery({ queryKey: keys.project(key), queryFn: () => productionApi.getProject(key), enabled: !!key });
}

export function useEpikRollup(key: string) {
  return useQuery({ queryKey: keys.epikRollup(key), queryFn: () => productionApi.getEpikRollup(key), enabled: !!key });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productionApi.createProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useUpdateProject(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ProjectDetail>) => productionApi.updateProject(key, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.project(key) });
      qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

/** Project deletion is an archive action. The API retains the related work
 * sheet, issued tasks and audit data; only active project views are refreshed. */
export function useDeleteProject(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => productionApi.deleteProject(key),
    onSuccess: () => {
      qc.removeQueries({ queryKey: keys.project(key) });
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: keys.epikRollup(key) });
    },
  });
}

export function useSaveEpics(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (epics: ProjectDetail["epics"]) => productionApi.saveEpics(key, epics),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.project(key) }),
  });
}

/** Delete one saved epic without rebuilding the other work-sheet rows. */
export function useDeleteEpic(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (epicId: string) => productionApi.deleteEpic(key, epicId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.project(key) });
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: keys.epikRollup(key) });
      qc.invalidateQueries({ queryKey: ["production", "board"] });
    },
  });
}

export function useScheduleProject(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => productionApi.scheduleProject(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.project(key) });
      qc.invalidateQueries({ queryKey: ["production", "board"] });
      qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useTemplates() {
  return useQuery({ queryKey: keys.templates, queryFn: productionApi.getTemplates });
}

export function useEpikTemplates() {
  return useQuery({ queryKey: keys.epikTemplates, queryFn: productionApi.getEpikTemplates });
}

export function useApplyEpikTemplate(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => productionApi.applyEpikTemplate(name, key),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.project(key) }),
  });
}

export function useSaveEpikTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, epic }: { name: string; epic: ProjectDetail["epics"][number] }) =>
      productionApi.saveEpikTemplate(name, epic),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.epikTemplates }),
  });
}

export function useApplyTemplate(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => productionApi.applyTemplate(name, key),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.project(key) }),
  });
}

type SheetKind = "QUANTITIES" | "CUTTING" | "HARDWARE";

export function useSheet<T>(key: string, kind: SheetKind) {
  return useQuery({
    queryKey: keys.sheet(key, kind),
    queryFn: () => productionApi.getSheet(key, kind) as Promise<T | null>,
    enabled: !!key,
  });
}

export function useSaveSheet<T>(key: string, kind: SheetKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: T) => productionApi.saveSheet(key, kind, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sheet(key, kind) }),
  });
}
