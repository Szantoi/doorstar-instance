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
  dependsOnId: string | null;
  createdAt: string;
  updatedAt: string;
  status: MarkerStatus;
  isDone: boolean;
  flowLabel: string | null;
  depDone: boolean;
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

export interface KanbanResponse {
  station: string;
  week: string;
  flow: string[];
  assigned: Task[];
  pool: Task[];
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

export interface ProjectCard {
  key: string;
  name: string;
  num: string | null;
  status: ProductionStatus;
  totalTasks: number;
  doneTasks: number;
  progressPct: number;
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
  tasks?: Array<{ id: string }>;
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
  megj: string;
}

export interface HardwareSheet {
  rows: HardwareRow[];
}
