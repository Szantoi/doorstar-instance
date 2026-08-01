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
  doorTypeKey: string | null;
  finishKey: string | null;
  glassKey: string | null;
  hardwareKeys: string[];
  wallSolutionKey: string | null;
  materialKey: string | null;
  machiningKeys: string[];
  technicalNotes: string;
  notes: string;
  evidence: OrderPositionEvidence[];
}

export interface TechnicalCatalogChoice { key: string; label: string; }
export interface TechnicalCatalog {
  version: string;
  doorTypes: TechnicalCatalogChoice[];
  finishes: TechnicalCatalogChoice[];
  glass: Array<TechnicalCatalogChoice & { glazing: "NONE" | "GLAZED" }>;
  hardware: TechnicalCatalogChoice[];
  wallSolutions: Array<TechnicalCatalogChoice & { wallTreatment: "NONE" | "WALL_PANEL" | "BLENDE" }>;
  materials: TechnicalCatalogChoice[];
  machinings: TechnicalCatalogChoice[];
}

export type ComponentSnapshotState = "REVIEW" | "VERIFIED" | "REJECTED";
export type ComponentRequirementSourceKind = "ORDER_POSITION" | "MANUFACTURED_ITEM" | "SUPPLEMENTARY_ITEM";
export type ComponentRequirementKind = "CUT_PART" | "PURCHASED_PART";

export interface ComponentCalculatorProfile {
  version: string;
  /** Optional until the backend exposes the canonical per-profile hash.
   * Downstream operation planning must remain closed when it is absent. */
  fingerprint?: string;
  label: string;
  inputMode: "EXPLICIT_REVIEWED_OUTPUT";
  active: boolean;
  allowsFormulaExecution: false;
  allowsImplicitDefaults: false;
  cutPartDimensions: "FINISHED_AND_CUTTING_REQUIRED";
}

export interface ComponentCalculatorProfiles {
  configurationVersion: string;
  configurationFingerprint: string;
  snapshotSchemaVersion: string;
  /** Current catalog identity used for downstream snapshot freshness checks. */
  technicalCatalogVersion?: string;
  technicalCatalogFingerprint?: string;
  profiles: ComponentCalculatorProfile[];
}

export interface ComponentRequirement {
  id: string;
  componentSnapshotId: string;
  sourceKind: ComponentRequirementSourceKind;
  sourceRecordId: string;
  requirementKind: ComponentRequirementKind;
  sourceComponentKey: string;
  componentKey: string;
  name: string;
  quantity: number;
  quantityUnit: string;
  materialKey: string | null;
  finishKey: string | null;
  finishedWidthMm: number | null;
  finishedHeightMm: number | null;
  finishedThicknessMm: number | null;
  cuttingWidthMm: number | null;
  cuttingHeightMm: number | null;
  cuttingThicknessMm: number | null;
  grainDirection: string | null;
  lineHash: string;
  notes: string;
  createdAt: string;
}

/** Immutable, reviewed calculator-adapter output. The frontend only presents
 * these records; it never derives component dimensions or hidden defaults. */
export interface ComponentSnapshot {
  id: string;
  orderRevisionId: string;
  approvalAuditId: string;
  state: ComponentSnapshotState;
  snapshotSchemaVersion: string;
  calculatorProfileVersion: string;
  calculatorProfileFingerprint: string;
  technicalCatalogVersion: string;
  technicalCatalogFingerprint: string;
  sourceWorkOrderKey: string;
  sourceOrderRevision: string;
  sourceCalculatorRevision: string;
  orderContentHash: string;
  inputHash: string;
  outputHash: string;
  materializationKey: string;
  reviewNote: string;
  createdByRole: string;
  reviewResolution: string | null;
  reviewedByRole: string | null;
  reviewedAt: string | null;
  requirements: ComponentRequirement[];
  createdAt: string;
}

export interface ComponentDimensionInput {
  width: number;
  height: number;
  thickness: number;
}

export interface ComponentRequirementInput {
  source: {
    kind: ComponentRequirementSourceKind;
    id: string;
  };
  requirementKind: ComponentRequirementKind;
  sourceComponentKey: string;
  componentKey: string;
  name: string;
  quantity: number;
  quantityUnit: string;
  materialKey?: string;
  finishKey?: string;
  finishedDimensionsMm?: ComponentDimensionInput;
  cuttingDimensionsMm?: ComponentDimensionInput;
  grainDirection?: string;
  notes?: string;
}

/** Explicit, already reviewed adapter output. No field in this contract is
 * calculated or defaulted by the frontend. */
export interface CreateComponentSnapshotInput {
  calculatorProfileVersion: string;
  expectedOrderContentHash: string;
  reviewNote: string;
  confirmation: "CREATE_COMPONENT_SNAPSHOT";
  requirements: ComponentRequirementInput[];
}

export interface CreateComponentSnapshotResult {
  created: boolean;
  snapshot: ComponentSnapshot;
}

export interface OperationPlanBlocker {
  code: string;
  message: string;
  entityId?: string;
}

export interface OperationPlanReadiness {
  ready: boolean;
  blockers: OperationPlanBlocker[];
  allowedActions: Array<
    "CREATE_OPERATION_PLAN_SNAPSHOT" | "VERIFY_OPERATION_PLAN" | "REJECT_OPERATION_PLAN"
  >;
}

export interface OperationDocumentVersionReference {
  documentVersionId: string;
  versionHash: string;
  locator: string | null;
}

export interface OperationTimeStandardSource extends OperationDocumentVersionReference {
  standardKey: string;
  standardVersion: string;
  unit: string;
}

export interface OperationDocumentReference extends OperationDocumentVersionReference {
  purpose: "DRAWING" | "SPECIFICATION" | "TECHNOLOGY" | "OTHER";
}

export interface OperationWorkInstruction extends OperationDocumentVersionReference {
  contentCoverage: Array<
    | "PREREQUISITES"
    | "MATERIAL_AND_RESOURCE_CHECK"
    | "SETUP"
    | "SAFETY"
    | "EXECUTION"
    | "DRAWING_REFERENCE"
    | "IN_PROCESS_CONTROL"
    | "OUTPUT_HANDLING"
  >;
}

export interface OperationDependency {
  predecessorOperationId: string;
  type: "FS" | "SS" | "FF" | "SF";
  lagMinutes: number;
  releaseThresholdPercent?: number;
}

export interface OperationQualityCheckpoint {
  key: string;
  label: string;
  acceptanceRule: string;
  measurementMethod: string | null;
  measurementToolKey: string | null;
  evidenceRequirement: string | null;
  required: boolean;
}

export interface OperationSourceEvidence {
  sourceKind: "DOCUMENT" | "KNOWLEDGE" | "LEGACY_COMPARISON";
  documentVersionId: string | null;
  versionHash: string | null;
  locator: string;
  rawValue: string | null;
  normalizedValue: string | number | boolean | null;
  confidence: number | null;
  reviewState: "OPEN" | "RESOLVED" | "REJECTED";
}

/** One explicit, server-stored plan row. It is not an execution record and
 * the frontend must not derive one from component names or woodworking RAG. */
export interface OperationCandidate {
  id: string;
  sourceOperationKey: string;
  sourceComponentRequirementIds: string[];
  sourceComponentLineHashes: string[];
  outputAssemblyKey: string | null;
  sequence: number;
  workflowGroup: string;
  processKind: "TECHNOLOGICAL" | "NON_TECHNOLOGICAL" | "NATURAL";
  operationType: string;
  standardKey: string;
  standardVersion: string;
  qualifiers: Record<string, string>;
  resourceKey: string;
  machineKey: string | null;
  toolKeys: string[];
  quantity: number;
  quantityUnit: string;
  setupMinutesPerBatch: number | null;
  cycleMinutesPerUnit: number | null;
  nonTechnologicalMinutes: number | null;
  plannedNaturalHoldMinutes: number | null;
  timeStandardSource: OperationTimeStandardSource | null;
  workforce: number | null;
  dependencies: OperationDependency[];
  documentReferences: OperationDocumentReference[];
  workInstruction: OperationWorkInstruction | null;
  qualityCheckpoints: OperationQualityCheckpoint[];
  sourceEvidence: OperationSourceEvidence[];
  state: "READY" | "QUARANTINED";
  quarantineReasons: Array<{ code: string; message: string }>;
}

/** Immutable exact-revision OperationPlan authority projection. VERIFIED is
 * still not a PlanningProposal, IssuedWorkPackage or production release. */
export interface OperationPlanSnapshot {
  id: string;
  orderRevisionId: string;
  componentSnapshotId: string;
  state: "REVIEW" | "VERIFIED" | "REJECTED";
  schemaVersion: string;
  generatorProfileVersion: string;
  generatorProfileFingerprint: string;
  standardCatalogVersion: string;
  standardCatalogFingerprint: string;
  resourceMappingVersion: string;
  resourceMappingFingerprint: string;
  orderContentHash: string;
  componentOutputHash: string;
  inputHash: string;
  outputHash: string;
  materializationKey: string;
  reviewNote: string;
  createdByRole: string;
  createdByPrincipal: string;
  reviewResolution: string | null;
  reviewedByRole: string | null;
  reviewedByPrincipal: string | null;
  reviewedAt: string | null;
  operations: OperationCandidate[];
  createdAt: string;
  readiness: OperationPlanReadiness;
}

export interface OperationPlanSnapshotList {
  readiness: OperationPlanReadiness;
  snapshots: OperationPlanSnapshot[];
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
  /** Nullable for quarantined legacy rows; temporarily optional while older
   * read-model payloads are phased out. Missing audit identity is not trusted. */
  reviewedByPrincipal?: string | null;
  reviewedByRole?: string | null;
  reviewedAt?: string | null;
  createdByRole: string;
  createdAt: string;
  orderDocument?: Pick<OrderDocument, "id" | "displayName" | "kind" | "relativePath"> | null;
}

export interface ProductionOrderRevision {
  id: string;
  revision: number;
  status: OrderRevisionStatus;
  intakeStage: OrderIntakeStage;
  customerName: string;
  customerAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  deliveryAddress: string | null;
  expectedDelivery: string | null;
  plannedStart: string | null;
  priority: number;
  notes: string;
  positions: ProductionOrderPosition[];
  manufacturedItems: ManufacturedItem[];
  supplementaryItems: OrderSupplementaryItem[];
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
  manufacturedItemId: string;
  orderDocumentId: string | null;
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
  createdByRole: string;
  reviewedByRole: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  orderDocument?: Pick<OrderDocument, "id" | "displayName" | "kind" | "relativePath"> | null;
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

/** Command endpoints return the persistence-shaped aggregate; the production
 * order read model above joins the related position for display. */
export interface ManufacturedItemCommandResponse extends Omit<ManufacturedItem, "relatedOrderPosition"> {
  orderRevisionId: string;
  relatedOrderPositionId: string | null;
  importCandidateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type OrderSupplementaryItemState = "REVIEW" | "VERIFIED" | "REJECTED";
export interface OrderSupplementaryItemEvidence {
  id: string;
  supplementaryItemId: string;
  orderDocumentId: string | null;
  sourceRoot: string;
  relativePath: string;
  page: number | null;
  row: number | null;
  field: string;
  rawValue: string;
  normalizedValue: string | number | boolean | null;
  confidence: number | null;
  reviewState: "UNVERIFIED" | "REVIEW" | "RESOLVED" | "REJECTED";
  resolution: string | null;
  createdByRole: string;
  reviewedByRole: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface OrderSupplementaryItem {
  id: string;
  orderRevisionId: string;
  entryMode: "MANUAL" | "SOURCE_REVIEW";
  state: OrderSupplementaryItemState;
  category: string;
  code: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  calculatedQuantity: number | null;
  calculatedUnit: string | null;
  notes: string;
  manualReason: string | null;
  createdByRole: string;
  reviewedByRole: string | null;
  reviewedAt: string | null;
  reviewResolution: string | null;
  evidence: OrderSupplementaryItemEvidence[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderSupplementaryItemInput {
  entryMode: "MANUAL";
  category: string;
  code?: string;
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
  manualReason: string;
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

/** Backend-owned state of one work-number group in the read-only Import
 * Inbox. APPLIED_TO_TEST means only that a test DRAFT exists; candidate
 * review and blocker counts remain authoritative alongside it. */
export type ImportInboxState =
  | "PDF_REVISION_SELECTION_REQUIRED"
  | "SALES_REVIEW"
  | "SURVEY_RECONCILIATION"
  | "DEADLINE_CONFLICT"
  | "READY_FOR_TEST_DRAFT"
  | "APPLIED_TO_TEST";

export interface ImportInboxItem {
  importRunId: string;
  workNumber: string;
  profileVersion: string;
  sourceFingerprint: string;
  targetSchema: "doorstar_test";
  states: ImportInboxState[];
  candidateCount: number;
  readyCount: number;
  reviewCount: number;
  blockedCount: number;
  sourcePaths: string[];
}

export interface ImportInboxResponse {
  page: number;
  pageSize: number;
  total: number;
  items: ImportInboxItem[];
}

export interface ImportWorkNumberCandidate {
  id: string;
  recordType: string;
  status: ImportCandidate["status"];
  sourceRoot: string;
  relativePath: string;
  sheet: string | null;
  page: number | null;
  row: number | null;
  normalizedPayload: Record<string, unknown>;
  errors: string[];
}

export interface ImportWorkNumberDeadlineObservation {
  id: string;
  kind: OrderDeadlineObservation["kind"];
  rawValue: string;
  normalizedDate: string | null;
  confidence: number | null;
  reviewState: OrderDeadlineObservation["reviewState"];
  resolution: string | null;
  sourceRoot: string;
  relativePath: string;
  sheet: string | null;
  page: number | null;
  row: number | null;
}

/** Evidence packet scoped to one exact import run and work number. It is
 * intentionally read-only and contains no inferred business outcome. */
export interface ImportWorkNumberEvidence {
  workNumber: string;
  importRun: Pick<ImportRun, "id" | "profileVersion" | "sourceFingerprint" | "targetSchema">;
  candidates: ImportWorkNumberCandidate[];
  deadlineObservations: ImportWorkNumberDeadlineObservation[];
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
  orderRevisionId: string;
  action: "REVIEW_REQUESTED" | "APPROVED" | "SUPERSEDED";
  actorRole: string;
  contentHash: string;
  contentHashSchemaVersion: number;
  note: string;
  createdAt: string;
}

export type OrderDocumentKind = "SALES_ORDER" | "SURVEY" | "DRAWING" | "OTHER";

export interface OrderDocumentPositionLink {
  orderPositionId: string;
}

export interface OrderDocumentPositionLinkRecord extends OrderDocumentPositionLink {
  id: string;
  orderDocumentId: string;
  createdAt: string;
}

export interface OrderDocumentReleaseReference {
  id: string;
  orderRevisionId: string;
  orderDocumentId: string;
  issuedWorkPackageKey: string;
  documentVersionId: string | null;
  documentContentSha256: string;
  releasedByRole: string;
  releaseNote: string;
  createdAt: string;
}

/** Metadata-only source reference. Binaries stay in the approved source. */
export interface OrderDocument {
  id: string;
  orderRevisionId: string;
  documentFamilyKey: string;
  supersedesDocumentId: string | null;
  source: "LEGACY_FOLDER" | "SHAREPOINT";
  kind: OrderDocumentKind;
  displayName: string;
  relativePath: string;
  driveId: string | null;
  itemId: string | null;
  versionId: string | null;
  contentSha256: string | null;
  positionLinks: OrderDocumentPositionLink[];
  releaseReferences: OrderDocumentReleaseReference[];
  createdAt: string;
}

export type CreatedOrderDocument = Omit<OrderDocument, "positionLinks" | "releaseReferences">;

export interface OrderDocumentInput {
  source: "LEGACY_FOLDER" | "SHAREPOINT";
  kind: OrderDocumentKind;
  displayName: string;
  relativePath: string;
  driveId?: string;
  itemId?: string;
  versionId?: string;
  contentSha256?: string;
  supersedesDocumentId?: string;
}

/** Sales-owned source fields accepted by the atomic project + revision-1
 * create command. Technical catalog choices and manufacturing output are
 * intentionally absent from this boundary. */
export interface SalesIntakePositionInput {
  code: string;
  name: string;
  quantity: number;
  productType: string | null;
  openingDirection: string | null;
  openingWidthMm: number | null;
  openingHeightMm: number | null;
  openingDepthMm: number | null;
  surface: string | null;
  glazing: "NONE" | "GLAZED" | null;
  glazingSpecification: string | null;
  notes: string;
}

export interface SalesIntakeInput {
  projectKey: string;
  projectName: string;
  projectNum?: string;
  customerName: string;
  customerAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  deliveryAddress: string | null;
  expectedDelivery: string | null;
  priority: number;
  notes: string;
  positions: SalesIntakePositionInput[];
}

/** The create route returns the newly persisted revision. Intake navigation
 * only needs this stable identity; the full joined read model is fetched on
 * the destination route. */
export interface CreatedSalesIntake {
  id: string;
  revision: number;
  status: OrderRevisionStatus;
  intakeStage: OrderIntakeStage;
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
  positions: Array<Omit<ProductionOrderPosition, "id" | "evidence" | "finishKey"> & {
    id?: string;
    /** Optional only for legacy create compatibility. Survey/technical full
     * replacements omit it so catalog derivation cannot flatten side data. */
    finishKey?: string | null;
  }>;
}

export interface ProductionOrderDetail {
  id: string;
  projectId: string;
  revisions: ProductionOrderRevision[];
}

export type OrderRevisionReadinessGateKey =
  | "SURVEY"
  | "POSITION_EVIDENCE"
  | "DOCUMENTS"
  | "MANUFACTURED_ITEMS"
  | "SUPPLEMENTARY_ITEMS"
  | "ORDER_REVIEW"
  | "COMPONENT_SNAPSHOT"
  | "OPERATION_PLAN"
  | "PRODUCTION_RELEASE";

export type ProjectWorkflowGateKey =
  | "ORDER"
  | "COMPONENTS"
  | "OPERATIONS"
  | "PLANNING"
  | "WORK_PACKAGE"
  | "PRODUCTION_6_STAGE"
  | "HANDOVER";

export interface ReadinessEntityReference {
  kind: string;
  id: string;
  href: string;
}

export type CanonicalDoorstarRole =
  | "sales"
  | "technical_preparation"
  | "order_approver"
  | "production_planner"
  | "shop_floor"
  | "installer"
  | "warehouse_dispatch"
  | "administrator"
  | "reader";

export interface ReadinessBlocker {
  code: string;
  message: string;
  ownerRole: CanonicalDoorstarRole;
  entity: ReadinessEntityReference | null;
  detail: Record<string, unknown>;
}

export type ReadinessAllowedActionCode =
  | "REQUEST_ORDER_REVIEW"
  | "APPROVE_ORDER_REVISION"
  | "CREATE_COMPONENT_SNAPSHOT"
  | "VERIFY_COMPONENT_SNAPSHOT"
  | "REJECT_COMPONENT_SNAPSHOT"
  | "CREATE_OPERATION_PLAN_SNAPSHOT"
  | "VERIFY_OPERATION_PLAN"
  | "REJECT_OPERATION_PLAN";

export interface ReadinessAllowedAction {
  code: ReadinessAllowedActionCode;
  method: "POST" | "PATCH";
  href: string;
  ownerRoles: CanonicalDoorstarRole[];
  targetEntityId: string;
}

export type ReadinessNextAction =
  | { kind: "ACTION"; action: ReadinessAllowedAction }
  | { kind: "BLOCKED"; blockerCode: string; ownerRole: CanonicalDoorstarRole; href: string | null }
  | { kind: "COMPLETE"; message: string };

export interface OrderRevisionReadinessGate {
  key: OrderRevisionReadinessGateKey;
  state: "READY" | "BLOCKED" | "NOT_AVAILABLE";
  ready: boolean;
  ownerRole: CanonicalDoorstarRole;
  detailsHref: string | null;
  blockers: ReadinessBlocker[];
  allowedActions: ReadinessAllowedAction[];
  details: { kind: OrderRevisionReadinessGateKey; [key: string]: unknown };
}

/** Server-authoritative exact-revision readiness. Runtime consumers still
 * validate this shape before exposing any action because generic API typing
 * alone cannot protect the UI from a partial or older deployment. */
export interface OrderRevisionReadiness {
  schemaVersion: "doorstar.order-revision-readiness/v1";
  projectKey: string;
  revision: {
    id: string;
    number: number;
    isLatest: boolean;
    latestRevisionNumber: number;
    status: OrderRevisionStatus;
    intakeStage: OrderIntakeStage;
    updatedAt: string;
    contentHash: {
      value: string;
      schemaVersion: 1 | 2 | 3;
      verification: "UNAPPROVED_CURRENT" | "VERIFIED" | "MISMATCH" | "AUDIT_MISSING";
      auditId: string | null;
    };
  };
  gates: OrderRevisionReadinessGate[];
  blockers: ReadinessBlocker[];
  allowedActions: ReadinessAllowedAction[];
  nextAction: ReadinessNextAction;
}

export interface ProjectWorkflowGate {
  key: ProjectWorkflowGateKey;
  state: "READY" | "BLOCKED" | "NOT_AVAILABLE" | "CONTRACT_REQUIRED";
  ownerRole: CanonicalDoorstarRole;
  source: {
    kind: string;
    id: string;
    revision: number;
    contentHash: string;
    href: string;
  };
  blockers: ReadinessBlocker[];
  allowedActions: ReadinessAllowedAction[];
  detailsHref: string | null;
}

/** Office/project projection of the exact readiness chain. It does not add
 * planning, work-package, shop-floor or handover authority. */
export interface ProjectWorkflow {
  schemaVersion: "doorstar.project-workflow/v1";
  projectKey: string;
  revision: {
    id: string;
    number: number;
    isLatest: boolean;
    href: string;
  };
  currentGate: ProjectWorkflowGateKey | null;
  gates: ProjectWorkflowGate[];
  blockers: ReadinessBlocker[];
  allowedActions: ReadinessAllowedAction[];
  nextAction: ReadinessNextAction;
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
