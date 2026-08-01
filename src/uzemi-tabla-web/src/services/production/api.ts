import { apiFetch } from "../apiClient";
import { PRODUCTION_API_BASE as BASE } from "./config";
import type {
  BoardResponse,
  ApplyManufacturedItemCandidatesResult,
  ComponentCalculatorProfiles,
  ComponentSnapshot,
  CreateComponentSnapshotInput,
  CreateComponentSnapshotResult,
  EpikRollup,
  EpikTemplate,
  IssueSessionResult,
  ImportRun,
  ImportRunEvidence,
  ImportInboxResponse,
  ImportWorkNumberEvidence,
  ManufacturedItemCommandResponse,
  ManufacturedItemEvidence,
  KanbanResponse,
  LoadReport,
  OrderChecklistItem,
  CreatedOrderDocument,
  CreatedSalesIntake,
  ProductionOverview,
  ProductionOrderCard,
  ProductionOrderDetail,
  OrderRevisionInput,
  OrderDocumentInput,
  OrderDocumentPositionLinkRecord,
  OrderFeedback,
  OrderFeedbackCategory,
  OrderPositionEvidence,
  OperationPlanSnapshotList,
  OrderSupplementaryItem,
  OrderSupplementaryItemEvidence,
  OrderSupplementaryItemInput,
  OrderIntakeStage,
  OrderRevisionReadiness,
  SalesIntakeInput,
  ProjectCard,
  ProjectDetail,
  ProjectWorkflow,
  SheetTemplate,
  StationConfig,
  TechnicalCatalog,
  Task,
  TaskDetail,
  UpdateTaskPatch,
} from "./types";

export const productionApi = {
  getStations: () => apiFetch<{ stations: StationConfig[] }>(`${BASE}/stations`),
  getTechnicalCatalog: () => apiFetch<TechnicalCatalog>(`${BASE}/technical-catalog`),
  getComponentCalculatorProfiles: () => apiFetch<ComponentCalculatorProfiles>(`${BASE}/component-calculator-profiles`),

  getBoard: (week: string) => apiFetch<BoardResponse>(`${BASE}/board`, { query: { week } }),

  createTask: (input: { title: string; projectKey?: string; station?: string | null; week: string; day: number; urgent?: boolean }) =>
    apiFetch<Task>(`${BASE}/tasks`, { method: "POST", body: input }),

  updateTask: (id: string, patch: UpdateTaskPatch) =>
    apiFetch<Task>(`${BASE}/tasks/${id}`, { method: "PATCH", body: patch }),

  deleteTask: (id: string) => apiFetch<void>(`${BASE}/tasks/${id}`, { method: "DELETE" }),

  getTask: (id: string) => apiFetch<TaskDetail>(`${BASE}/tasks/${id}`),

  addComment: (id: string, text: string) =>
    apiFetch(`${BASE}/tasks/${id}/comments`, { method: "POST", body: { text } }),

  addImage: (id: string, url: string) =>
    apiFetch(`${BASE}/tasks/${id}/images`, { method: "POST", body: { url } }),
  deleteImage: (id: string) => apiFetch<void>(`${BASE}/images/${id}`, { method: "DELETE" }),

  getOrders: () => apiFetch<OrderChecklistItem[]>(`${BASE}/orders`),
  addOrder: (label: string) => apiFetch<OrderChecklistItem>(`${BASE}/orders`, { method: "POST", body: { label } }),
  updateOrder: (id: string, patch: Partial<OrderChecklistItem>) =>
    apiFetch<OrderChecklistItem>(`${BASE}/orders/${id}`, { method: "PATCH", body: patch }),
  deleteOrder: (id: string) => apiFetch<void>(`${BASE}/orders/${id}`, { method: "DELETE" }),

  getWeekNote: (week: string) => apiFetch<BoardResponse["infoNote"]>(`${BASE}/week-note`, { query: { week } }),
  saveWeekNote: (week: string, text: string) =>
    apiFetch(`${BASE}/week-note`, { method: "PUT", body: { week, text } }),

  getKanban: (station: string) =>
    apiFetch<KanbanResponse>(`${BASE}/kanban`, { query: { station } }),
  saveStationWorkflow: (station: string, steps: string[]) =>
    apiFetch(`${BASE}/kanban/${encodeURIComponent(station)}/workflow`, { method: "PUT", body: { steps } }),
  deleteWorkflowColumn: (station: string, index: number) =>
    apiFetch(`${BASE}/kanban/${encodeURIComponent(station)}/workflow/${index}`, { method: "DELETE" }),

  getLoad: (week: string) => apiFetch<LoadReport>(`${BASE}/load`, { query: { week } }),
  setCapacity: (hoursPerDay: number) => apiFetch(`${BASE}/capacity`, { method: "PUT", body: { hoursPerDay } }),

  getProjects: () => apiFetch<ProjectCard[]>(`${BASE}/projects`),
  getProductionOrders: () => apiFetch<ProductionOrderCard[]>(`${BASE}/production-orders`),
  getImportInbox: (page: number, pageSize: number) =>
    apiFetch<ImportInboxResponse>(`${BASE}/import-inbox`, { query: { page, pageSize } }),
  getImportWorkNumberEvidence: (importRunId: string, workNumber: string) =>
    apiFetch<ImportWorkNumberEvidence>(
      `${BASE}/import-inbox/${encodeURIComponent(importRunId)}/${encodeURIComponent(workNumber)}/evidence`,
    ),
  getImportRuns: () => apiFetch<ImportRun[]>(`${BASE}/import-runs`),
  getImportRunEvidence: (importRunId: string) => apiFetch<ImportRunEvidence>(`${BASE}/import-runs/${encodeURIComponent(importRunId)}/evidence`),
  applyManufacturedItemCandidates: (
    importRunId: string,
    input: { orderRevisionId: string; sourceFingerprint: string; candidateIds: string[]; confirmation: "APPLY_READY_MANUFACTURED_ITEMS" },
  ) => apiFetch<ApplyManufacturedItemCandidatesResult>(
    `${BASE}/import-runs/${encodeURIComponent(importRunId)}/apply-manufactured-items`,
    { method: "POST", body: input },
  ),
  getProductionOrder: (projectKey: string) => apiFetch<ProductionOrderDetail | null>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}`),
  getOrderRevisionReadiness: (projectKey: string, revision: number) =>
    apiFetch<OrderRevisionReadiness>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/readiness`),
  getProjectWorkflow: (projectKey: string) =>
    apiFetch<ProjectWorkflow>(`${BASE}/projects/${encodeURIComponent(projectKey)}/workflow`),
  getComponentSnapshots: (projectKey: string, revision: number) =>
    apiFetch<ComponentSnapshot[]>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/component-snapshots`),
  getOperationPlanSnapshots: (projectKey: string, revision: number) =>
    apiFetch<OperationPlanSnapshotList>(
      `${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/operation-plan-snapshots`,
    ),
  createComponentSnapshot: (
    projectKey: string,
    revision: number,
    input: CreateComponentSnapshotInput,
  ) => apiFetch<CreateComponentSnapshotResult>(
    `${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/component-snapshots`,
    { method: "POST", body: input },
  ),
  reviewComponentSnapshot: (
    projectKey: string,
    revision: number,
    snapshotId: string,
    state: "VERIFIED" | "REJECTED",
    resolution: string,
  ) => apiFetch<ComponentSnapshot>(
    `${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/component-snapshots/${encodeURIComponent(snapshotId)}/review`,
    { method: "PATCH", body: { state, resolution } },
  ),
  createSalesIntake: (input: SalesIntakeInput) =>
    apiFetch<CreatedSalesIntake>(`${BASE}/production-orders/sales-intake`, { method: "POST", body: input }),
  advanceOrderIntakeStage: (projectKey: string, revision: number, stage: OrderIntakeStage, exceptionReason?: string) =>
    apiFetch(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/intake-stage`, { method: "PATCH", body: { stage, exceptionReason } }),
  updateOrderRevision: (projectKey: string, revision: number, input: OrderRevisionInput) =>
    apiFetch(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}`, { method: "PUT", body: input }),
  addOrderDocument: (projectKey: string, revision: number, input: OrderDocumentInput) =>
    apiFetch<CreatedOrderDocument>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/documents`, { method: "POST", body: input }),
  linkOrderDocumentToPosition: (projectKey: string, revision: number, documentId: string, orderPositionId: string) =>
    apiFetch<OrderDocumentPositionLinkRecord>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/documents/${encodeURIComponent(documentId)}/positions`, { method: "POST", body: { orderPositionId } }),
  getOrderFeedback: (projectKey: string, revision: number) => apiFetch<OrderFeedback[]>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/feedback`),
  createOrderFeedback: (projectKey: string, revision: number, category: OrderFeedbackCategory, message: string) =>
    apiFetch<OrderFeedback>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/feedback`, { method: "POST", body: { category, message } }),
  resolveOrderFeedback: (projectKey: string, revision: number, feedbackId: string, status: "ACKNOWLEDGED" | "RESOLVED", resolution: string) =>
    apiFetch<OrderFeedback>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/feedback/${encodeURIComponent(feedbackId)}`, { method: "PATCH", body: { status, resolution } }),
  resolveOrderPositionEvidence: (projectKey: string, revision: number, positionId: string, evidenceId: string, reviewState: "RESOLVED" | "REJECTED", resolution: string) =>
    apiFetch<OrderPositionEvidence>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/positions/${encodeURIComponent(positionId)}/evidence/${encodeURIComponent(evidenceId)}`, { method: "PATCH", body: { reviewState, resolution } }),
  reviewManufacturedItem: (projectKey: string, revision: number, itemId: string, state: "VERIFIED" | "REJECTED", resolution: string) =>
    apiFetch<ManufacturedItemCommandResponse>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/manufactured-items/${encodeURIComponent(itemId)}/review`, { method: "PATCH", body: { state, resolution } }),
  reviewManufacturedItemEvidence: (projectKey: string, revision: number, itemId: string, evidenceId: string, reviewState: "RESOLVED" | "REJECTED", resolution: string) =>
    apiFetch<ManufacturedItemEvidence>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/manufactured-items/${encodeURIComponent(itemId)}/evidence/${encodeURIComponent(evidenceId)}/review`, { method: "PATCH", body: { reviewState, resolution } }),
  createOrderSupplementaryItem: (projectKey: string, revision: number, input: OrderSupplementaryItemInput) =>
    apiFetch<OrderSupplementaryItem>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/supplementary-items`, { method: "POST", body: input }),
  reviewOrderSupplementaryItem: (projectKey: string, revision: number, itemId: string, state: "VERIFIED" | "REJECTED", resolution: string) =>
    apiFetch<OrderSupplementaryItem>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/supplementary-items/${encodeURIComponent(itemId)}/review`, { method: "PATCH", body: { state, resolution } }),
  reviewOrderSupplementaryItemEvidence: (projectKey: string, revision: number, itemId: string, evidenceId: string, reviewState: "RESOLVED" | "REJECTED", resolution: string) =>
    apiFetch<OrderSupplementaryItemEvidence>(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/supplementary-items/${encodeURIComponent(itemId)}/evidence/${encodeURIComponent(evidenceId)}/review`, { method: "PATCH", body: { reviewState, resolution } }),
  requestOrderReview: (projectKey: string, revision: number, note?: string) =>
    apiFetch(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/review`, { method: "POST", body: { note } }),
  approveOrderRevision: (projectKey: string, revision: number, note: string) =>
    apiFetch(`${BASE}/production-orders/${encodeURIComponent(projectKey)}/revisions/${revision}/approve`, { method: "POST", body: { note } }),
  createProject: (input: { key: string; name: string; num?: string }) =>
    apiFetch<ProjectDetail>(`${BASE}/projects`, { method: "POST", body: input }),
  getProject: (key: string) => apiFetch<ProjectDetail>(`${BASE}/projects/${encodeURIComponent(key)}`),
  getEpikRollup: (key: string) => apiFetch<EpikRollup>(`${BASE}/projects/${encodeURIComponent(key)}/epik-rollup`),
  updateProject: (key: string, patch: Partial<ProjectDetail>) =>
    apiFetch<ProjectDetail>(`${BASE}/projects/${encodeURIComponent(key)}`, { method: "PUT", body: patch }),
  deleteProject: (key: string) =>
    apiFetch<void>(`${BASE}/projects/${encodeURIComponent(key)}`, { method: "DELETE" }),
  saveEpics: (key: string, epics: ProjectDetail["epics"]) =>
    apiFetch<ProjectDetail["epics"]>(`${BASE}/projects/${encodeURIComponent(key)}/epics`, {
      method: "PUT",
      body: { epics },
    }),
  deleteEpic: (key: string, epicId: string) =>
    apiFetch<void>(`${BASE}/projects/${encodeURIComponent(key)}/epics/${encodeURIComponent(epicId)}`, { method: "DELETE" }),
  scheduleProject: (key: string) =>
    apiFetch<IssueSessionResult>(`${BASE}/projects/${encodeURIComponent(key)}/schedule`, {
      method: "POST",
      body: {},
    }),
  issueProjectStep: (key: string, stepId: string) =>
    apiFetch<{ outcome: "issued" | "already_issued"; taskId: string }>(`${BASE}/projects/${encodeURIComponent(key)}/steps/${encodeURIComponent(stepId)}/issue`, { method: "POST" }),
  revokeProjectStep: (key: string, stepId: string) =>
    apiFetch<void>(`${BASE}/projects/${encodeURIComponent(key)}/steps/${encodeURIComponent(stepId)}/issue`, { method: "DELETE" }),
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
  saveEpikTemplate: (name: string, epic: ProjectDetail["epics"][number]) =>
    apiFetch(`${BASE}/epik-templates`, { method: "POST", body: { name, epic } }),

  getOverview: () => apiFetch<ProductionOverview>(`${BASE}/overview`),
};
