import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { productionApi } from "./api";
import type { OrderChecklistItem, ProjectDetail, Task, UpdateTaskPatch } from "./types";

const keys = {
  stations: ["production", "stations"] as const,
  technicalCatalog: ["production", "technical-catalog"] as const,
  componentCalculatorProfiles: ["production", "component-calculator-profiles"] as const,
  board: (week: string) => ["production", "board", week] as const,
  orders: ["production", "orders"] as const,
  kanban: (station: string) => ["production", "kanban", station] as const,
  load: (week: string) => ["production", "load", week] as const,
  projects: ["production", "projects"] as const,
  productionOrders: ["production", "production-orders"] as const,
  importInbox: (page: number, pageSize: number) => ["production", "import-inbox", page, pageSize] as const,
  importWorkNumberEvidence: (importRunId: string, workNumber: string) =>
    ["production", "import-inbox", importRunId, workNumber, "evidence"] as const,
  importRuns: ["production", "import-runs"] as const,
  importRunEvidence: (importRunId: string) => ["production", "import-runs", importRunId, "evidence"] as const,
  productionOrder: (projectKey: string) => ["production", "production-order", projectKey] as const,
  orderRevisionReadiness: (projectKey: string, revision: number) => ["production", "order-revision-readiness", projectKey, revision] as const,
  projectWorkflow: (projectKey: string) => ["production", "project-workflow", projectKey] as const,
  componentSnapshots: (projectKey: string, revision: number) => ["production", "component-snapshots", projectKey, revision] as const,
  operationPlanSnapshots: (projectKey: string, revision: number) => ["production", "operation-plan-snapshots", projectKey, revision] as const,
  orderFeedback: (projectKey: string, revision: number) => ["production", "order-feedback", projectKey, revision] as const,
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

export function useTechnicalCatalog() {
  return useQuery({ queryKey: keys.technicalCatalog, queryFn: productionApi.getTechnicalCatalog, staleTime: Infinity });
}

export function useComponentCalculatorProfiles() {
  return useQuery({
    queryKey: keys.componentCalculatorProfiles,
    queryFn: productionApi.getComponentCalculatorProfiles,
    staleTime: 0,
  });
}

export function useComponentSnapshots(projectKey: string, revision?: number) {
  return useQuery({
    queryKey: keys.componentSnapshots(projectKey, revision ?? 0),
    queryFn: () => productionApi.getComponentSnapshots(projectKey, revision!),
    enabled: !!projectKey && revision != null,
  });
}

export function useOperationPlanSnapshots(projectKey: string, revision?: number) {
  return useQuery({
    queryKey: keys.operationPlanSnapshots(projectKey, revision ?? 0),
    queryFn: () => productionApi.getOperationPlanSnapshots(projectKey, revision!),
    enabled: !!projectKey && revision != null,
    staleTime: 0,
  });
}

export function useCreateComponentSnapshot(projectKey: string, revision?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: import("./types").CreateComponentSnapshotInput) =>
      productionApi.createComponentSnapshot(projectKey, revision!, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.componentSnapshots(projectKey, revision ?? 0) });
      qc.invalidateQueries({ queryKey: keys.project(projectKey) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) }),
  });
}

export function useReviewComponentSnapshot(projectKey: string, revision?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ snapshotId, state, resolution }: {
      snapshotId: string;
      state: "VERIFIED" | "REJECTED";
      resolution: string;
    }) => productionApi.reviewComponentSnapshot(projectKey, revision!, snapshotId, state, resolution),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.componentSnapshots(projectKey, revision ?? 0) });
      qc.invalidateQueries({ queryKey: keys.project(projectKey) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) }),
  });
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

export function useProductionOrders() {
  return useQuery({ queryKey: keys.productionOrders, queryFn: productionApi.getProductionOrders });
}

export function useCreateSalesIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: import("./types").SalesIntakeInput) => productionApi.createSalesIntake(input),
    onSuccess: (_created, input) => {
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: keys.productionOrders });
      qc.invalidateQueries({ queryKey: keys.productionOrder(input.projectKey) });
    },
  });
}

export function useImportInbox(page: number, pageSize: number) {
  return useQuery({
    queryKey: keys.importInbox(page, pageSize),
    queryFn: () => productionApi.getImportInbox(page, pageSize),
    placeholderData: (previous) => previous,
  });
}

export function useImportWorkNumberEvidence(importRunId: string, workNumber: string) {
  return useQuery({
    queryKey: keys.importWorkNumberEvidence(importRunId, workNumber),
    queryFn: () => productionApi.getImportWorkNumberEvidence(importRunId, workNumber),
    enabled: !!importRunId && !!workNumber,
  });
}

export function useImportRuns() {
  return useQuery({ queryKey: keys.importRuns, queryFn: productionApi.getImportRuns });
}

export function useImportRunEvidence(importRunId: string) {
  return useQuery({
    queryKey: keys.importRunEvidence(importRunId),
    queryFn: () => productionApi.getImportRunEvidence(importRunId),
    enabled: !!importRunId,
  });
}

export function useApplyManufacturedItemCandidates(importRunId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orderRevisionId: string; sourceFingerprint: string; candidateIds: string[] }) =>
      productionApi.applyManufacturedItemCandidates(importRunId, {
        ...input,
        confirmation: "APPLY_READY_MANUFACTURED_ITEMS",
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: keys.importRunEvidence(importRunId) });
      qc.invalidateQueries({ queryKey: keys.importRuns });
      qc.invalidateQueries({ queryKey: keys.productionOrder(result.projectKey) });
    },
  });
}

export function useProductionOrder(projectKey: string) {
  return useQuery({ queryKey: keys.productionOrder(projectKey), queryFn: () => productionApi.getProductionOrder(projectKey), enabled: !!projectKey });
}

export function useOrderRevisionReadiness(projectKey: string, revision: number | undefined) {
  return useQuery({
    queryKey: keys.orderRevisionReadiness(projectKey, revision ?? 0),
    queryFn: () => productionApi.getOrderRevisionReadiness(projectKey, revision!),
    enabled: !!projectKey && revision != null,
    staleTime: 0,
  });
}

export function useProjectWorkflow(projectKey: string, enabled = true) {
  return useQuery({
    queryKey: keys.projectWorkflow(projectKey),
    queryFn: () => productionApi.getProjectWorkflow(projectKey),
    enabled: !!projectKey && enabled,
    staleTime: 0,
  });
}

export function useOrderFeedback(projectKey: string, revision: number | undefined) {
  return useQuery({ queryKey: keys.orderFeedback(projectKey, revision ?? 0), queryFn: () => productionApi.getOrderFeedback(projectKey, revision!), enabled: !!projectKey && revision != null });
}

export function useCreateOrderFeedback(projectKey: string, revision: number | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ category, message }: { category: import("./types").OrderFeedbackCategory; message: string }) => productionApi.createOrderFeedback(projectKey, revision!, category, message), onSuccess: () => qc.invalidateQueries({ queryKey: keys.orderFeedback(projectKey, revision ?? 0) }) });
}

export function useResolveOrderFeedback(projectKey: string, revision: number | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ feedbackId, status, resolution }: { feedbackId: string; status: "ACKNOWLEDGED" | "RESOLVED"; resolution: string }) => productionApi.resolveOrderFeedback(projectKey, revision!, feedbackId, status, resolution), onSuccess: () => qc.invalidateQueries({ queryKey: keys.orderFeedback(projectKey, revision ?? 0) }) });
}

export function useResolveOrderPositionEvidence(projectKey: string, revision: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ positionId, evidenceId, reviewState, resolution }: { positionId: string; evidenceId: string; reviewState: "RESOLVED" | "REJECTED"; resolution: string }) =>
      productionApi.resolveOrderPositionEvidence(projectKey, revision!, positionId, evidenceId, reviewState, resolution),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) }),
  });
}

export function useReviewManufacturedItem(projectKey: string, revision: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, state, resolution }: { itemId: string; state: "VERIFIED" | "REJECTED"; resolution: string }) =>
      productionApi.reviewManufacturedItem(projectKey, revision!, itemId, state, resolution),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) }),
  });
}

export function useReviewManufacturedItemEvidence(projectKey: string, revision: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, evidenceId, reviewState, resolution }: {
      itemId: string;
      evidenceId: string;
      reviewState: "RESOLVED" | "REJECTED";
      resolution: string;
    }) => productionApi.reviewManufacturedItemEvidence(projectKey, revision!, itemId, evidenceId, reviewState, resolution),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) }),
  });
}

export function useCreateOrderSupplementaryItem(projectKey: string, revision: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: import("./types").OrderSupplementaryItemInput) =>
      productionApi.createOrderSupplementaryItem(projectKey, revision!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) }),
  });
}

export function useReviewOrderSupplementaryItem(projectKey: string, revision: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, state, resolution }: { itemId: string; state: "VERIFIED" | "REJECTED"; resolution: string }) =>
      productionApi.reviewOrderSupplementaryItem(projectKey, revision!, itemId, state, resolution),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) }),
  });
}

export function useReviewOrderSupplementaryItemEvidence(projectKey: string, revision: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, evidenceId, reviewState, resolution }: {
      itemId: string;
      evidenceId: string;
      reviewState: "RESOLVED" | "REJECTED";
      resolution: string;
    }) => productionApi.reviewOrderSupplementaryItemEvidence(projectKey, revision!, itemId, evidenceId, reviewState, resolution),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) }),
  });
}

export function useAdvanceOrderIntakeStage(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ revision, stage, exceptionReason }: { revision: number; stage: import("./types").OrderIntakeStage; exceptionReason?: string }) =>
      productionApi.advanceOrderIntakeStage(projectKey, revision, stage, exceptionReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.productionOrders });
      qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) });
    },
  });
}

export function useUpdateOrderRevision(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ revision, input }: { revision: number; input: import("./types").OrderRevisionInput }) =>
      productionApi.updateOrderRevision(projectKey, revision, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.productionOrders });
      qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) });
    },
  });
}

export function useAddOrderDocument(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ revision, input }: { revision: number; input: import("./types").OrderDocumentInput }) =>
      productionApi.addOrderDocument(projectKey, revision, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) }),
  });
}

export function useLinkOrderDocumentToPosition(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ revision, documentId, orderPositionId }: { revision: number; documentId: string; orderPositionId: string }) =>
      productionApi.linkOrderDocumentToPosition(projectKey, revision, documentId, orderPositionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) }),
  });
}

export function useRequestOrderReview(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ revision, note }: { revision: number; note?: string }) => productionApi.requestOrderReview(projectKey, revision, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.productionOrders }); qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) }); },
  });
}

export function useApproveOrderRevision(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ revision, note }: { revision: number; note: string }) => productionApi.approveOrderRevision(projectKey, revision, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.productionOrders }); qc.invalidateQueries({ queryKey: keys.productionOrder(projectKey) }); },
  });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.project(key) });
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: keys.epikRollup(key) });
    },
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

/** Per-step issue/revoke invalidates every view that derives board task state. */
export function useIssueProjectStep(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stepId: string) => productionApi.issueProjectStep(key, stepId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.project(key) });
      qc.invalidateQueries({ queryKey: ["production", "board"] });
      qc.invalidateQueries({ queryKey: ["production", "kanban"] });
      qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useRevokeProjectStep(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stepId: string) => productionApi.revokeProjectStep(key, stepId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.project(key) });
      qc.invalidateQueries({ queryKey: ["production", "board"] });
      qc.invalidateQueries({ queryKey: ["production", "kanban"] });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.project(key) });
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: keys.epikRollup(key) });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.project(key) });
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: keys.epikRollup(key) });
    },
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
