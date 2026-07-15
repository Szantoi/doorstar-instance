import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { productionApi } from "./api";
import type { OrderChecklistItem, ProjectDetail, Task } from "./types";

const keys = {
  stations: ["production", "stations"] as const,
  board: (week: string) => ["production", "board", week] as const,
  orders: ["production", "orders"] as const,
  kanban: (station: string, week: string) => ["production", "kanban", station, week] as const,
  load: (week: string) => ["production", "load", week] as const,
  projects: ["production", "projects"] as const,
  project: (key: string) => ["production", "project", key] as const,
  templates: ["production", "templates"] as const,
  epikTemplates: ["production", "epikTemplates"] as const,
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
  return useMutation({ mutationFn: productionApi.createTask, onSuccess: invalidate });
}

export function useUpdateTask(week: string) {
  const invalidate = useInvalidateBoard(week);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Task> }) => productionApi.updateTask(id, patch),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["production", "kanban"] });
      qc.invalidateQueries({ queryKey: ["production", "load"] });
    },
  });
}

export function useDeleteTask(week: string) {
  const invalidate = useInvalidateBoard(week);
  return useMutation({ mutationFn: productionApi.deleteTask, onSuccess: invalidate });
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

export function useKanban(station: string, week: string) {
  return useQuery({
    queryKey: keys.kanban(station, week),
    queryFn: () => productionApi.getKanban(station, week),
    enabled: !!station,
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

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: productionApi.createProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useSaveEpics(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (epics: ProjectDetail["epics"]) => productionApi.saveEpics(key, epics),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.project(key) }),
  });
}

export function useScheduleProject(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (schedDays?: boolean[]) => productionApi.scheduleProject(key, schedDays),
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

export function useApplyTemplate(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => productionApi.applyTemplate(name, key),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.project(key) }),
  });
}
