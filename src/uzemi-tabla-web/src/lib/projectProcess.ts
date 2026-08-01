import type {
  ComponentCalculatorProfiles,
  ComponentSnapshot,
  Epic,
  EpicStep,
  MarkerStatus,
  ProductionOrderRevision,
  ProjectDetail,
  Task,
} from "@/services/production/types";
import {
  hasExactComponentSnapshotAuthority,
  matchesExactCurrentComponentSnapshot,
} from "@/lib/operationWorkspace";

export type ProjectProcessState = "DONE" | "ACTIVE" | "WAITING" | "BLOCKED" | "CONTRACT_REQUIRED";
export type OperationState = "OMITTED" | "BLOCKED" | "UNPLANNED" | "PLANNED" | "ISSUED" | "IN_PROGRESS" | "DONE";

export interface ProjectProcessGate {
  key: "ORDER" | "COMPONENTS" | "OPERATIONS" | "PLANNING" | "ISSUE" | "PRODUCTION" | "HANDOVER";
  label: string;
  source: string;
  state: ProjectProcessState;
  detail: string;
  responsible: string;
  requiredData: string[];
  authority: "SERVER_RECORD" | "LEGACY_PROJECTION" | "CONTRACT_REQUIRED";
}

interface ProjectOperationRowBase {
  id: string;
  name: string;
  station: string | null;
  quantity: number | null;
  unitHours: number | null;
  taskCount: number;
  problemCount: number;
  state: OperationState;
  stateLabel: string;
}

export interface ProjectEpicStepOperationRow extends ProjectOperationRowBase {
  sourceKind: "EPIC_STEP";
  planDate: string | null;
  planLocked: boolean;
}

/** Direct board-task projection. Its scheduling and status fields stay in
 * their backend shape; they are not converted into planning or OperationPlan
 * facts by the project cockpit. */
export interface ProjectDirectTaskOperationRow extends ProjectOperationRowBase {
  sourceKind: "DIRECT_TASK";
  week: string;
  day: number;
  status: MarkerStatus;
  problem: boolean;
}

export type ProjectOperationRow = ProjectEpicStepOperationRow | ProjectDirectTaskOperationRow;

export interface ProjectProcessLane {
  id: string;
  name: string;
  done: number;
  total: number;
  rows: ProjectOperationRow[];
}

export interface ProjectProcessView {
  gates: ProjectProcessGate[];
  lanes: ProjectProcessLane[];
  nextAction: string;
  sourceWarning: string | null;
}

export type ComponentSnapshotLoadState = "UNAVAILABLE" | "PENDING" | "READY" | "ERROR";

export interface ProjectProcessSources {
  componentSnapshots?: ComponentSnapshot[];
  componentSnapshotsState?: ComponentSnapshotLoadState;
  componentCalculatorProfiles?: ComponentCalculatorProfiles | null;
  componentCalculatorProfilesState?: ComponentSnapshotLoadState;
}

type GateBase = Pick<ProjectProcessGate, "key" | "label" | "source" | "state" | "detail">;
const gateMetadata: Record<ProjectProcessGate["key"], Pick<ProjectProcessGate, "responsible" | "requiredData" | "authority">> = {
  ORDER: {
    responsible: "Sales · felmérő · műszaki előkészítő · jóváhagyó",
    requiredData: ["Sales törzsadatok és dokumentumverzió", "Felmért pozíciók és evidence", "Műszaki katalógusdöntések", "Független jóváhagyás"],
    authority: "SERVER_RECORD",
  },
  COMPONENTS: {
    responsible: "Műszaki előkészítő · jóváhagyó",
    requiredData: ["Jóváhagyott rendelési hash", "Kalkulátorprofil-verzió", "Kész- és szabászati méretek", "Anyag-, felület- és forráskapcsolat"],
    authority: "SERVER_RECORD",
  },
  OPERATIONS: {
    responsible: "Műszaki előkészítő · termeléstervező",
    requiredData: ["Forrás alkatrész vagy pozíció", "Standard művelet és revízió", "Részleg / erőforrás", "Mennyiség, normaidő és függőség"],
    authority: "CONTRACT_REQUIRED",
  },
  PLANNING: {
    responsible: "Termeléstervező",
    requiredData: ["Műveleti tervverzió", "Műszaknaptár és kapacitás", "FS/SS/FF/SF függőségek", "Overload- és határidő-warningok"],
    authority: "CONTRACT_REQUIRED",
  },
  ISSUE: {
    responsible: "Termeléstervező · kiíró",
    requiredData: ["Jóváhagyott rendelési revízió", "Ellenőrzött alkatrészsnapshot", "Jóváhagyott tervjavaslat", "Változatlan kiadási csomag"],
    authority: "CONTRACT_REQUIRED",
  },
  PRODUCTION: {
    responsible: "Üzemi állomáskezelők",
    requiredData: ["Kiadott munkacsomag", "Állomás és sorrend", "Mennyiség / készültség", "Eltérés, probléma és bizonyíték"],
    authority: "LEGACY_PROJECTION",
  },
  HANDOVER: {
    responsible: "Raktár · kiszállítás · beépítő",
    requiredData: ["Kiosztott helyszíni csomag", "Mennyiség, időpont és felelős", "Fotó vagy eltérés-bizonyíték", "Átadás-átvételi döntés"],
    authority: "CONTRACT_REQUIRED",
  },
};

function gate(base: GateBase): ProjectProcessGate {
  return { ...base, ...gateMetadata[base.key] };
}

const operationStateLabel: Record<OperationState, string> = {
  OMITTED: "Kimarad",
  BLOCKED: "Hiányos",
  UNPLANNED: "Tervezésre vár",
  PLANNED: "Tervezett",
  ISSUED: "Kiadva",
  IN_PROGRESS: "Folyamatban",
  DONE: "Kész",
};

function operationState(step: EpicStep): OperationState {
  if (step.disabled) return "OMITTED";
  const tasks = step.tasks ?? [];
  if (tasks.some((task) => task.problem)) return "BLOCKED";
  if (tasks.length && tasks.every((task) => task.isDone || task.status === "done")) return "DONE";
  if (tasks.some((task) => task.status === "inprogress")) return "IN_PROGRESS";
  if (tasks.length) return "ISSUED";
  if (!step.station) return "BLOCKED";
  if (!step.planDate) return "UNPLANNED";
  return "PLANNED";
}

function laneFromEpic(epic: Epic): ProjectProcessLane {
  const rows: ProjectEpicStepOperationRow[] = epic.steps.map((step) => {
    const state = operationState(step);
    return {
      id: step.id,
      sourceKind: "EPIC_STEP",
      name: step.name || "Névtelen művelet",
      station: step.station,
      planDate: step.planDate,
      quantity: step.quantity,
      unitHours: step.unitHours,
      planLocked: step.planLocked,
      taskCount: step.tasks?.length ?? 0,
      problemCount: step.tasks?.filter((task) => task.problem).length ?? 0,
      state,
      stateLabel: operationStateLabel[state],
    };
  });
  return { id: epic.id, name: epic.name, done: rows.filter((row) => row.state === "DONE" || row.state === "OMITTED").length, total: rows.length, rows };
}

function directTaskState(task: Task): OperationState {
  if (task.problem || task.status === "problem") return "BLOCKED";
  if (task.isDone || task.status === "done") return "DONE";
  if (task.status === "inprogress") return "IN_PROGRESS";
  return "ISSUED";
}

function laneFromDirectTasks(tasks: Task[]): ProjectProcessLane | null {
  if (tasks.length === 0) return null;
  const rows: ProjectDirectTaskOperationRow[] = tasks.map((task) => {
    const state = directTaskState(task);
    return {
      id: task.id,
      sourceKind: "DIRECT_TASK",
      name: task.title || "Névtelen üzemi feladat",
      station: task.station,
      week: task.week,
      day: task.day,
      status: task.status,
      problem: task.problem,
      quantity: task.quantity,
      unitHours: task.unitHours,
      taskCount: 1,
      problemCount: task.problem || task.status === "problem" ? 1 : 0,
      state,
      stateLabel: operationStateLabel[state],
    };
  });
  return {
    id: "direct-project-tasks",
    name: "(epik nélkül)",
    done: rows.filter((row) => row.state === "DONE").length,
    total: rows.length,
    rows,
  };
}

function orderGate(revision: ProductionOrderRevision | null): ProjectProcessGate {
  if (!revision) return gate({ key: "ORDER", label: "Rendelés és felmérés", source: "Gyártásmegrendelő", state: "BLOCKED", detail: "A projekthez nincs rendelési revízió." });
  if (revision.status === "APPROVED") return gate({ key: "ORDER", label: "Rendelés és felmérés", source: `R${String(revision.revision).padStart(2, "0")}`, state: "DONE", detail: "A műszaki revízió jóváhagyott és változatlan pillanatkép." });
  if (revision.status === "REVIEW") return gate({ key: "ORDER", label: "Rendelés és felmérés", source: `R${String(revision.revision).padStart(2, "0")}`, state: "ACTIVE", detail: "A revízió független jóváhagyásra vár." });
  return gate({ key: "ORDER", label: "Rendelés és felmérés", source: `R${String(revision.revision).padStart(2, "0")}`, state: "ACTIVE", detail: revision.intakeStage === "SURVEY_PENDING" ? "A végleges gyártási adatok felmérésre várnak." : "A rendelési adatkapu még nincs lezárva." });
}

function componentGate(revision: ProductionOrderRevision | null, sources: ProjectProcessSources): ProjectProcessGate {
  const loadState = sources.componentSnapshotsState ?? "UNAVAILABLE";
  const profileLoadState = sources.componentCalculatorProfilesState ?? "UNAVAILABLE";
  const snapshots = sources.componentSnapshots ?? [];
  if (loadState === "UNAVAILABLE" || profileLoadState === "UNAVAILABLE") {
    const unavailable = gate({ key: "COMPONENTS", label: "Alkatrészek és méretek", source: "Kalkulátor", state: "CONTRACT_REQUIRED", detail: "A verziózott ComponentRequirement backend-projekció nem érhető el." });
    return { ...unavailable, authority: "CONTRACT_REQUIRED" };
  }
  if (loadState === "PENDING" || profileLoadState === "PENDING") return gate({ key: "COMPONENTS", label: "Alkatrészek és méretek", source: "Kalkulátor", state: "WAITING", detail: "Az alkatrészsnapshotok és profilverziók betöltése folyamatban van." });
  if (loadState === "ERROR" || profileLoadState === "ERROR") return gate({ key: "COMPONENTS", label: "Alkatrészek és méretek", source: "Kalkulátor", state: "BLOCKED", detail: "Az alkatrészsnapshotok vagy az aktív profil szerveroldali állapota nem érhető el." });
  if (revision?.status !== "APPROVED") return gate({ key: "COMPONENTS", label: "Alkatrészek és méretek", source: "Kalkulátor", state: "BLOCKED", detail: "Alkatrészsnapshot csak jóváhagyott rendelési revízióból készülhet." });

  const profiles = sources.componentCalculatorProfiles ?? null;
  if (!hasExactComponentSnapshotAuthority(profiles)) {
    return gate({
      key: "COMPONENTS",
      label: "Alkatrészek és méretek",
      source: "Kalkulátor",
      state: "BLOCKED",
      detail: "Az aktív kalkulátorprofil vagy a műszaki katalógus aktuális verziólenyomata nem érhető el; az exact komponenskapu zárva marad.",
    });
  }
  const isCurrent = (snapshot: ComponentSnapshot) => (
    matchesExactCurrentComponentSnapshot(snapshot, revision, profiles)
  );
  const verified = snapshots.find((snapshot) => snapshot.state === "VERIFIED" && isCurrent(snapshot));
  if (verified) return gate({ key: "COMPONENTS", label: "Alkatrészek és méretek", source: verified.calculatorProfileVersion, state: "DONE", detail: `${verified.requirements.length} ellenőrzött alkatrészsor, változatlan snapshotban.` });
  const staleFinal = snapshots.find((snapshot) => snapshot.state === "VERIFIED" && !isCurrent(snapshot));
  if (staleFinal) return gate({ key: "COMPONENTS", label: "Alkatrészek és méretek", source: staleFinal.calculatorProfileVersion, state: "BLOCKED", detail: "A VERIFIED snapshot már nem egyezik a legfrissebb approval hash- vagy aktív profilkapuval." });
  const review = snapshots.find((snapshot) => snapshot.state === "REVIEW" && isCurrent(snapshot));
  if (review) return gate({ key: "COMPONENTS", label: "Alkatrészek és méretek", source: review.calculatorProfileVersion, state: "ACTIVE", detail: `${review.requirements.length} alkatrészsor független review-ra vár.` });
  const staleReview = snapshots.find((snapshot) => snapshot.state === "REVIEW" && !isCurrent(snapshot));
  if (staleReview) return gate({ key: "COMPONENTS", label: "Alkatrészek és méretek", source: staleReview.calculatorProfileVersion, state: "BLOCKED", detail: "A review-snapshot forrása vagy profilverziója már nem aktuális." });
  const rejectedCount = snapshots.filter((snapshot) => snapshot.state === "REJECTED").length;
  if (rejectedCount) return gate({ key: "COMPONENTS", label: "Alkatrészek és méretek", source: "Kalkulátor", state: "BLOCKED", detail: `${rejectedCount} elutasított snapshot után új, explicit adapter-output szükséges.` });
  return gate({ key: "COMPONENTS", label: "Alkatrészek és méretek", source: "Kalkulátor", state: "WAITING", detail: "A jóváhagyott rendeléshez még nincs materializált alkatrészsnapshot." });
}

/** The current UI exposes existing records and makes missing authority
 * explicit. It never presents a work-sheet draft as a verified calculation. */
export function buildProjectProcessView(project: ProjectDetail, revision: ProductionOrderRevision | null, sources: ProjectProcessSources = {}): ProjectProcessView {
  const directTaskLane = laneFromDirectTasks(project.unepicTasks);
  const lanes = [
    ...project.epics.filter((epic) => !epic.disabled).map(laneFromEpic),
    ...(directTaskLane ? [directTaskLane] : []),
  ];
  const rows = lanes.flatMap((lane) => lane.rows);
  const issued = rows.filter((row) => (
    row.sourceKind === "DIRECT_TASK"
    || ["ISSUED", "IN_PROGRESS", "DONE"].includes(row.state)
  )).length;
  const completed = rows.filter((row) => row.state === "DONE").length;
  const epicStepRows = rows.filter((row): row is ProjectEpicStepOperationRow => row.sourceKind === "EPIC_STEP");
  const planned = epicStepRows.filter((row) => row.planDate && !["BLOCKED", "UNPLANNED"].includes(row.state)).length;
  const sourceWarning = rows.length
    ? "A jelenlegi legacy sorok még nem őrzik a Kalkulátor-, normaidő- és Folyamat-revízió kötelező forráshivatkozásait."
    : null;

  const order = orderGate(revision);
  const components = componentGate(revision, sources);
  const operationState: ProjectProcessState = components.state !== "DONE" ? "BLOCKED" : "CONTRACT_REQUIRED";
  const operationDetail = components.state !== "DONE"
    ? "A művelettervhez előbb aktuális, ellenőrzött alkatrészsnapshot szükséges."
    : rows.length
      ? `Az alkatrészbemenet kész; ${rows.length} örökölt munkamenetsor csak összevetési segédadat. Az OperationPlan backend-szerződése még hiányzik.`
      : "Az alkatrészbemenet kész; a verziózott OperationPlan backend-szerződése még hiányzik.";
  const gates: ProjectProcessGate[] = [
    order,
    components,
    gate({ key: "OPERATIONS", label: "Műveleti terv", source: "Folyamatok", state: operationState, detail: operationDetail }),
    gate({ key: "PLANNING", label: "Tervezés és kapacitás", source: "Gantt / részlegterhelés", state: "CONTRACT_REQUIRED", detail: epicStepRows.length ? `${planned} / ${epicStepRows.length} kézi munkamenetsor kapott napot; a ${project.unepicTasks.length} közvetlen üzemi feladat hét/nap adata nem tervjavaslat.` : project.unepicTasks.length ? `${project.unepicTasks.length} közvetlen üzemi feladat hét/nap adata nem tervjavaslat.` : "A verziózott tervjavaslat backend-szerződése még hiányzik." }),
    gate({ key: "ISSUE", label: "Üzemi kiadás", source: "Kiíró", state: issued ? "BLOCKED" : "CONTRACT_REQUIRED", detail: issued ? `${issued} örökölt feladat létezik változatlan IssuedWorkPackage lineage nélkül.` : "Üzemi kiadás csak változatlan IssuedWorkPackage alapján engedhető." }),
    gate({ key: "PRODUCTION", label: "Gyártás", source: "Üzemi tábla", state: issued ? "BLOCKED" : "WAITING", detail: issued ? `${completed} / ${issued} legacy feladat kész, de IssuedWorkPackage lineage nélkül a gyártási kapu nem igazolható.` : "A végrehajtás az üzemi kiadás után indul." }),
    gate({ key: "HANDOVER", label: "Kiszállítás és beépítés", source: "Átadás-átvétel", state: "CONTRACT_REQUIRED", detail: project.status === "SHIPPING_READY" ? "A SHIPPING_READY jelzés látható, de nem helyettesít kiosztott helyszíni és átadási csomagot." : "A kiszállítási és beépítői lezárási csomag backend-szerződése még hiányzik." }),
  ];

  const active = gates.find((gate) => gate.state === "ACTIVE" || gate.state === "BLOCKED" || gate.state === "CONTRACT_REQUIRED");
  return { gates, lanes, nextAction: active?.detail ?? "Nincs nyitott folyamatlépés.", sourceWarning };
}
