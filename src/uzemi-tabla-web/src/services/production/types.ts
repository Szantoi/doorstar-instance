/** Mirrors production-service's Prisma models + computed view fields.
 * Keep in sync with src/production-service/prisma/schema.prisma and
 * src/production-service/src/domain/taskStatus.ts. */

export type MarkerStatus = "assigned" | "inprogress" | "done" | "problem";

export type Stage =
  | "SZABASZAT_ELOGYARTAS"
  | "MEGMUNKALAS"
  | "FELULETKEZELES"
  | "OSSZESZERELES"
  | "CSOMAGOLAS"
  | "KISZALLITASRA_MEGJELOLES";

export interface StationConfig {
  key: string;
  stage: Stage;
  defaultWorkflow: string[];
}

export interface Task {
  id: string;
  projectId: string | null;
  epicStepId: string | null;
  epicName: string | null;
  title: string;
  station: string | null;
  week: string;
  day: number;
  stepIndex: number;
  acknowledged: boolean;
  urgent: boolean;
  problem: boolean;
  dueDate: string | null;
  description: string;
  quantity: number | null;
  unitHours: number | null;
  dependsOnId: string | null;
  createdAt: string;
  updatedAt: string;
  status: MarkerStatus;
  isDone: boolean;
  flowLabel: string | null;
  depDone: boolean;
  dependsOnTitle: string | null;
  projectNum: string | null;
}

export interface TaskComment {
  id: string;
  text: string;
  createdAt: string;
}

export interface TaskImage {
  id: string;
  url: string;
  createdAt: string;
}

export interface TaskAuditEntry {
  id: string;
  label: string;
  at: string;
}

/** Full single-task fetch (GET /tasks/:id) — the list/board/kanban Task
 * shape plus its comments/images/audit, which aren't worth carrying on
 * every board card. */
export interface TaskDetail extends Task {
  comments: TaskComment[];
  images: TaskImage[];
  audit: TaskAuditEntry[];
  /** The planned quantity/unit-hours from the linked EpicStep, if any —
   * read-only here; the source of truth is the project's Munkamenet sheet. */
  epicStep: { quantity: number | null; unitHours: number | null } | null;
  epic: { id: string; name: string } | null;
  project: { id: string; key: string; name: string; num: string | null } | null;
}

/** Fields accepted by PATCH /tasks/:id. Project key is human-facing; the API
 * resolves it to its internal id and only a manager may change it. */
export interface UpdateTaskPatch {
  title?: string;
  projectKey?: string | null;
  epicId?: string | null;
  station?: string | null;
  week?: string;
  day?: number;
  stepIndex?: number;
  acknowledged?: boolean;
  urgent?: boolean;
  problem?: boolean;
  dueDate?: string | null;
  description?: string;
  quantity?: number | null;
  unitHours?: number | null;
  dependsOnId?: string | null;
}

export interface OrderChecklistItem {
  id: string;
  label: string;
  done: boolean;
  position: number;
}

export interface BoardResponse {
  week: string;
  stations: string[];
  tasks: Task[];
  orders: OrderChecklistItem[];
  infoNote: string;
}

export interface KanbanColumn {
  name: string;
  isTerminal: boolean;
  tasks: Task[];
}

/** A free/pool task also carries the station its EpicStep was actually
 * planned for (null for free-standing tasks with no station requirement). */
export interface PoolTask extends Task {
  designatedStation: string | null;
}

export interface KanbanResponse {
  station: string;
  week: string;
  flow: string[];
  assigned: Task[];
  pool: PoolTask[];
  columns: KanbanColumn[];
}

export interface DayLoad {
  day: number;
  hours: number;
  taskCount: number;
}

export interface StationLoad {
  station: string;
  cells: DayLoad[];
  totalHours: number;
  utilizationPct: number;
  overloadedDays: number[];
}

export interface LoadReport {
  week: string;
  hoursPerDay: number;
  stations: StationLoad[];
  bottlenecks: string[];
}

export type ProductionStatus = "QUEUED" | "IN_PROGRESS" | "SHIPPING_READY";

export interface EpikRollupStep {
  id: string;
  title: string;
  week: string;
  day: number;
  station: string | null;
  status: MarkerStatus;
  isDone: boolean;
}

export interface EpikRollupNext {
  id: string;
  title: string;
  week: string;
  day: number;
  station: string | null;
}

export interface EpikRollupRow {
  name: string;
  done: number;
  total: number;
  next: EpikRollupNext | null;
  steps: EpikRollupStep[];
}

export interface EpikRollup {
  epikRows: EpikRollupRow[];
}

export interface ProjectCard {
  key: string;
  name: string;
  num: string | null;
  status: ProductionStatus;
  totalTasks: number;
  doneTasks: number;
  progressPct: number;
}

export type OrderRevisionStatus = "DRAFT" | "REVIEW" | "APPROVED" | "SUPERSEDED";
export type OrderIntakeStage = "SALES_DRAFT" | "SALES_DOCUMENTS_RECEIVED" | "SURVEY_PENDING" | "SURVEY_COMPLETED" | "SURVEY_EXCEPTION_REVIEW" | "TECHNICAL_PREPARATION";

/** Latest visible revision for one active production order. */
export interface ProductionOrderCard {
  projectKey: string;
  projectName: string;
  projectNum: string | null;
  revision: number;
  status: OrderRevisionStatus;
  intakeStage: OrderIntakeStage;
  customerName: string;
  expectedDelivery: string | null;
  positionCount: number;
  updatedAt: string;
}

export interface ProductionOrderPosition {
  id: string;
  code: string;
  name: string;
  quantity: number;
  productType: string | null;
  openingDirection: string | null;
  openingWidthMm: number | null;
  openingHeightMm: number | null;
  openingDepthMm: number | null;
  doorWidthMm: number | null;
  doorHeightMm: number | null;
  doorThicknessMm: number | null;
  surface: string | null;
  wallTreatment: "NONE" | "WALL_PANEL" | "BLENDE" | null;
  glazing: "NONE" | "GLAZED" | null;
  glazingSpecification: string | null;
  evidence: OrderPositionEvidence[];
}

export type OrderPositionEvidenceField =
  | "CODE" | "NAME" | "QUANTITY" | "PRODUCT_TYPE" | "OPENING_DIRECTION"
  | "OPENING_WIDTH_MM" | "OPENING_HEIGHT_MM" | "OPENING_DEPTH_MM"
  | "DOOR_WIDTH_MM" | "DOOR_HEIGHT_MM" | "DOOR_THICKNESS_MM" | "SURFACE"
  | "WALL_TREATMENT" | "GLAZING" | "GLAZING_SPECIFICATION" | "NOTES";

export interface OrderPositionEvidence {
  id: string;
  orderPositionId: string;
  field: OrderPositionEvidenceField;
  rawValue: string;
  normalizedValue: string | number | boolean | null;
  sourceRoot: string;
  relativePath: string;
  sheet: string | null;
  page: number | null;
  row: number | null;
  confidence: number | null;
  reviewState: "UNVERIFIED" | "REVIEW" | "RESOLVED" | "REJECTED";
  resolution: string | null;
  createdByRole: string;
  createdAt: string;
  orderDocument: Pick<OrderDocument, "id" | "displayName" | "kind" | "relativePath"> | null;
}

export interface ProductionOrderRevision {
  id: string;
  revision: number;
  status: OrderRevisionStatus;
  intakeStage: OrderIntakeStage;
  customerName: string;
  expectedDelivery: string | null;
  priority: number;
  notes: string;
  positions: ProductionOrderPosition[];
  manufacturedItems: ManufacturedItem[];
  documents: OrderDocument[];
  audit: OrderRevisionAudit[];
  createdAt: string;
}

export type ManufacturedItemKind = "WALL_PANEL" | "FURNITURE_FRONT";
export type ManufacturedItemState = "CANDIDATE" | "REVIEW" | "VERIFIED" | "REJECTED";
export type ManufacturedItemWorkKind = "STANDARD" | "REWORK" | "REMANUFACTURE" | "REPLACEMENT";
export type ManufacturedItemEvidenceField =
  | "CODE" | "NAME" | "ITEM_TYPE" | "COMPONENT_NAME" | "QUANTITY"
  | "WIDTH_MM" | "HEIGHT_MM" | "THICKNESS_MM" | "MATERIAL" | "SURFACE"
  | "COLOUR" | "PATTERN" | "WORK_KIND" | "NOTES";

export interface ManufacturedItemEvidence {
  id: string;
  field: ManufacturedItemEvidenceField;
  rawValue: string;
  normalizedValue: string | number | boolean | null;
  sourceRoot: string;
  relativePath: string;
  sheet: string | null;
  page: number | null;
  row: number | null;
  confidence: number | null;
  reviewState: "UNVERIFIED" | "REVIEW" | "RESOLVED" | "REJECTED";
  resolution: string | null;
  orderDocument: Pick<OrderDocument, "id" | "displayName" | "kind" | "relativePath"> | null;
}

export interface ManufacturedItem {
  id: string;
  kind: ManufacturedItemKind;
  code: string;
  name: string;
  itemType: string | null;
  componentName: string | null;
  quantity: number;
  widthMm: number | null;
  heightMm: number | null;
  thicknessMm: number | null;
  material: string | null;
  surface: string | null;
  colour: string | null;
  pattern: string | null;
  workKind: ManufacturedItemWorkKind;
  state: ManufacturedItemState;
  notes: string;
  resolution: string | null;
  reviewedByRole: string | null;
  reviewedAt: string | null;
  relatedOrderPosition: Pick<ProductionOrderPosition, "id" | "code" | "name"> | null;
  evidence: ManufacturedItemEvidence[];
}

export type OrderFeedbackCategory = "DATA_QUALITY" | "IMPORT_MAPPING" | "DOCUMENT_REFERENCE" | "WORKFLOW";
export type OrderFeedbackStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export interface OrderFeedback {
  id: string; category: OrderFeedbackCategory; status: OrderFeedbackStatus; message: string;
  createdByRole: string; resolution: string | null; resolvedByRole: string | null;
  resolvedAt: string | null; createdAt: string;
}

export interface ImportRun {
  id: string;
  profileVersion: string;
  sourceFingerprint: string;
  previewArtifact: string;
  targetSchema: "doorstar_test";
  status: "PREVIEWED" | "APPLIED" | "REJECTED";
  candidateCount: number;
  createdByRole: string;
  createdAt: string;
  appliedAt: string | null;
  _count: { candidates: number; deadlineObservations: number };
  revisions: Array<{
    revision: number;
    status: OrderRevisionStatus;
    intakeStage: OrderIntakeStage;
    order: { project: { key: string; name: string; num: string | null } };
    _count: { positions: number; documents: number; feedback: number };
  }>;
}

export interface ImportCandidate {
  id: string;
  recordType: string;
  workNumber: string | null;
  sourceRoot: string;
  relativePath: string;
  sheet: string | null;
  page: number | null;
  row: number | null;
  normalizedPayload: Record<string, unknown>;
  errors: string[];
  status: "READY" | "REVIEW" | "BLOCKED" | "APPLIED" | "SKIPPED";
  manufacturedItem: (Pick<ManufacturedItem, "id" | "kind" | "code" | "state"> & {
    orderRevision: { order: { project: { key: string } } };
  }) | null;
  createdAt: string;
}

export interface OrderDeadlineObservation {
  id: string;
  workNumber: string;
  sourceRoot: string;
  relativePath: string;
  sheet: string | null;
  page: number | null;
  row: number | null;
  kind: "CONTRACTUAL" | "PLANNED_INSTALL" | "PRODUCTION_END" | "NOTE";
  rawValue: string;
  normalizedDate: string | null;
  confidence: number | null;
  reviewState: "UNVERIFIED" | "REVIEW" | "RESOLVED" | "REJECTED";
  resolution: string | null;
  orderRevision: { revision: number; order: { project: { key: string; name: string } } } | null;
  createdAt: string;
}

export interface ImportRunEvidence {
  importRun: Omit<ImportRun, "_count" | "revisions">;
  candidates: ImportCandidate[];
  deadlineObservations: OrderDeadlineObservation[];
  targetRevisions: Array<{
    id: string;
    revision: number;
    status: OrderRevisionStatus;
    intakeStage: OrderIntakeStage;
    order: { project: { key: string; name: string } };
  }>;
}

export interface ApplyManufacturedItemCandidatesResult {
  importRunId: string;
  orderRevisionId: string;
  projectKey: string;
  revision: number;
  createdCount: number;
  existingCount: number;
  items: ManufacturedItem[];
}

export interface OrderRevisionAudit {
  id: string;
  action: "REVIEW_REQUESTED" | "APPROVED";
  actorRole: string;
  contentHash: string;
  note: string;
  createdAt: string;
}

export type OrderDocumentKind = "SALES_ORDER" | "SURVEY" | "DRAWING" | "OTHER";

/** Metadata-only source reference. Binaries stay in the approved source. */
export interface OrderDocument {
  id: string;
  source: "LEGACY_FOLDER" | "SHAREPOINT";
  kind: OrderDocumentKind;
  displayName: string;
  relativePath: string;
  driveId: string | null;
  itemId: string | null;
  versionId: string | null;
  contentSha256: string | null;
  createdAt: string;
}

export interface OrderDocumentInput {
  source: "LEGACY_FOLDER" | "SHAREPOINT";
  kind: OrderDocumentKind;
  displayName: string;
  relativePath: string;
  driveId?: string;
  itemId?: string;
  versionId?: string;
  contentSha256?: string;
}

export interface OrderRevisionInput {
  customerName: string;
  customerAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  deliveryAddress?: string | null;
  expectedDelivery?: string | null;
  plannedStart?: string | null;
  priority?: number;
  notes?: string;
  positions: Array<Omit<ProductionOrderPosition, "id" | "evidence"> & { id?: string; notes?: string }>;
}

export interface ProductionOrderDetail {
  id: string;
  projectId: string;
  revisions: ProductionOrderRevision[];
}

export interface EpicStep {
  id: string;
  name: string;
  station: string | null;
  quantity: number | null;
  unitHours: number | null;
  planDate: string | null;
  planLocked: boolean;
  disabled: boolean;
  tasks?: Task[];
}

export interface Epic {
  id: string;
  name: string;
  quantityLabel: string | null;
  disabled: boolean;
  steps: EpicStep[];
}

export interface ProjectDetail {
  id: string;
  key: string;
  name: string;
  num: string | null;
  kezdes: string | null;
  beepites: string | null;
  szinTok: string | null;
  szinLap: string | null;
  status: ProductionStatus;
  epics: Epic[];
  /** Board tasks linked directly to this project without an active epic. */
  unepicTasks: Task[];
}

export interface SheetTemplate {
  id: string;
  name: string;
  epics: Array<Omit<Epic, "id" | "disabled"> & { disabled?: boolean; steps: Array<Omit<EpicStep, "id" | "disabled" | "planLocked"> & Partial<Pick<EpicStep, "disabled" | "planLocked">>> }>;
}

export interface EpikTemplate {
  id: string;
  name: string;
  epic: SheetTemplate["epics"][number];
}

export interface IssueSessionResult {
  createdCount: number;
  skippedExisting: number;
  missingPlanDates: Array<{ epicId: string; epicName: string; stepId: string; stepName: string }>;
}

export interface ProductionOverview {
  activeJobs: number;
  completedJobs: number;
  overdueJobs: number;
  shippingReadyJobs: number;
}

/** Row shapes for the three free-form ProjectSheet kinds. See
 * production-service/prisma/schema.prisma's ProjectSheet comment for why
 * these stay as JSON instead of normalized tables. */
export interface QuantityRow {
  name: string;
  felulet: string;
  db: string;
}

export interface QuantityBreakRow {
  label: string;
  vsz: string;
  fugg: string;
}

export interface QuantitiesSheet {
  menny: QuantityRow[];
  mennyBreak: QuantityBreakRow[];
}

export interface CuttingRow {
  i: number;
  sz: string;
  h: string;
  db: number;
  anyag: string;
  megj: string;
}

export interface CuttingSheet {
  rows: CuttingRow[];
}

export interface HardwareRow {
  i: number;
  nyitas: string;
  pant: string;
  lap: string;
  tok: string;
  uveg: string;
  zar: string;
  kilincs: string;
  cnc: string;
  megj: string;
}

export interface HardwareSheet {
  rows: HardwareRow[];
}
