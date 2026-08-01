import { useState } from "react";
import { Link } from "react-router-dom";
import { componentWorkspacePath } from "@/lib/componentWorkspaceRoute";
import { DAY_NAMES } from "@/lib/dates";
import { operationWorkspacePath } from "@/lib/operationWorkspaceRoute";
import {
  buildProjectProcessView,
  type ComponentSnapshotLoadState,
  type ProjectOperationRow,
  type ProjectProcessGate,
} from "@/lib/projectProcess";
import type {
  ComponentCalculatorProfiles,
  ComponentRequirement,
  ComponentSnapshot,
  ProductionOrderRevision,
  ProjectDetail,
} from "@/services/production/types";

interface ProjectProcessOverviewProps {
  project: ProjectDetail;
  revision: ProductionOrderRevision | null;
  componentSnapshots?: ComponentSnapshot[];
  componentSnapshotsState?: ComponentSnapshotLoadState;
  componentCalculatorProfiles?: ComponentCalculatorProfiles | null;
  componentCalculatorProfilesState?: ComponentSnapshotLoadState;
}

const gateStateLabel = {
  DONE: "Kész",
  ACTIVE: "Aktív",
  WAITING: "Várakozik",
  BLOCKED: "Blokkolt",
  CONTRACT_REQUIRED: "API szükséges",
} as const;

const authorityLabel = {
  SERVER_RECORD: "Szerver-authoritative rekord",
  LEGACY_PROJECTION: "Átmeneti segédprojekció",
  CONTRACT_REQUIRED: "Backend-szerződés szükséges",
} as const;

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)) : "nincs nap";
}

function rowSchedule(row: ProjectOperationRow) {
  if (row.sourceKind === "EPIC_STEP") return formatDate(row.planDate);
  const dayName = Number.isInteger(row.day) && row.day >= 0 && row.day < DAY_NAMES.length
    ? DAY_NAMES[row.day]
    : null;
  return `${row.week}${dayName ? ` · ${dayName}` : ""} · day=${row.day}`;
}

function formatDimensions(requirement: ComponentRequirement, prefix: "finished" | "cutting") {
  const values = prefix === "finished"
    ? [requirement.finishedWidthMm, requirement.finishedHeightMm, requirement.finishedThicknessMm]
    : [requirement.cuttingWidthMm, requirement.cuttingHeightMm, requirement.cuttingThicknessMm];
  return values.every((value) => value != null) ? `${values.join(" × ")} mm` : "nem értelmezett";
}

function gateAction(gate: ProjectProcessGate, project: ProjectDetail, revision: ProductionOrderRevision | null) {
  const key = encodeURIComponent(project.key);
  if (gate.key === "ORDER" && revision) {
    if (revision.intakeStage === "SURVEY_PENDING") return { href: `/orders/${key}/survey`, label: "Felmérési adatok megadása" };
    if (revision.intakeStage === "TECHNICAL_PREPARATION") return { href: `/orders/${key}/technical-preparation`, label: "Műszaki részletek megadása" };
    return { href: `/orders/${key}`, label: "Rendelési csomag megnyitása" };
  }
  if (gate.key === "COMPONENTS" && revision) {
    return {
      href: componentWorkspacePath(project.key, revision.revision),
      label: "Kalkulátor megnyitása",
    };
  }
  if (gate.key === "OPERATIONS" && revision) {
    return {
      href: operationWorkspacePath(project.key, revision.revision),
      label: "Műveletterv megnyitása",
    };
  }
  if (gate.key === "PRODUCTION") return { href: "/board", label: "Üzemi tábla megnyitása" };
  return null;
}

function ComponentSnapshotDetails({ snapshots, state }: { snapshots: ComponentSnapshot[]; state: ComponentSnapshotLoadState }) {
  if (state === "PENDING") return <p className="project-gate-empty">Az alkatrészsnapshotok betöltése folyamatban van…</p>;
  if (state === "ERROR") return <p className="project-gate-empty is-error">Az alkatrészsnapshotok nem érhetők el; a felület nem talál ki helyettesítő méreteket.</p>;
  if (state !== "READY" || snapshots.length === 0) return <p className="project-gate-empty">Még nincs materializált snapshot. A kliens nem futtat kalkulátorképletet és nem pótol hiányzó méretet.</p>;

  return <div className="component-snapshot-list">
    {snapshots.map((snapshot) => <article className={`component-snapshot state-${snapshot.state.toLowerCase()}`} key={snapshot.id}>
      <header>
        <div><span>{snapshot.calculatorProfileVersion}</span><h4>{snapshot.requirements.length} alkatrészsor</h4></div>
        <b>{snapshot.state}</b>
      </header>
      <dl className="component-snapshot-meta">
        <div><dt>Rendelési forrás</dt><dd>{snapshot.sourceWorkOrderKey} · {snapshot.sourceOrderRevision}</dd></div>
        <div><dt>Katalógus</dt><dd>{snapshot.technicalCatalogVersion}</dd></div>
        <div><dt>Output hash</dt><dd><code>{snapshot.outputHash.slice(0, 12)}…</code></dd></div>
        <div><dt>Létrehozva</dt><dd>{formatDate(snapshot.createdAt)}</dd></div>
      </dl>
      <div className="component-requirement-list">
        {snapshot.requirements.map((requirement) => <details key={requirement.id}>
          <summary><span>{requirement.componentKey}</span><strong>{requirement.name}</strong><b>{requirement.quantity} {requirement.quantityUnit}</b></summary>
          <dl>
            <div><dt>Típus</dt><dd>{requirement.requirementKind === "CUT_PART" ? "Gyártott alkatrész" : "Vásárolt alkatrész"}</dd></div>
            <div><dt>Forrás</dt><dd>{requirement.sourceKind} · {requirement.sourceRecordId}</dd></div>
            <div><dt>Készméret</dt><dd>{formatDimensions(requirement, "finished")}</dd></div>
            <div><dt>Szabászati méret</dt><dd>{formatDimensions(requirement, "cutting")}</dd></div>
            <div><dt>Anyag / felület</dt><dd>{[requirement.materialKey, requirement.finishKey].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt>Szálirány</dt><dd>{requirement.grainDirection ?? "—"}</dd></div>
          </dl>
          {requirement.notes && <p>{requirement.notes}</p>}
        </details>)}
      </div>
    </article>)}
  </div>;
}

function GateInspector({
  gate,
  project,
  revision,
  componentSnapshots,
  componentSnapshotsState,
}: {
  gate: ProjectProcessGate;
  project: ProjectDetail;
  revision: ProductionOrderRevision | null;
  componentSnapshots: ComponentSnapshot[];
  componentSnapshotsState: ComponentSnapshotLoadState;
}) {
  const action = gateAction(gate, project, revision);
  return <section className={`project-gate-inspector state-${gate.state.toLowerCase()}`} id="project-process-gate-detail" aria-live="polite">
    <header>
      <div><span>{gate.source}</span><h3>{gate.label}</h3><p>{gate.detail}</p></div>
      <b>{gateStateLabel[gate.state]}</b>
    </header>
    <div className="project-gate-detail-grid">
      <dl className="project-gate-facts">
        <div><dt>Felelős</dt><dd>{gate.responsible}</dd></div>
        <div><dt>Adatforrás</dt><dd>{gate.source}</dd></div>
        <div><dt>Bizalmi szint</dt><dd>{authorityLabel[gate.authority]}</dd></div>
      </dl>
      <div className="project-gate-requirements"><span>Megadandó / ellenőrzendő részletek</span><ul>{gate.requiredData.map((item) => <li key={item}>{item}</li>)}</ul></div>
    </div>
    {gate.key === "COMPONENTS" && <ComponentSnapshotDetails snapshots={componentSnapshots} state={componentSnapshotsState} />}
    {gate.authority !== "SERVER_RECORD" && <div className="project-gate-authority-note"><strong>{gate.authority === "CONTRACT_REQUIRED" ? "Zárolt adatkapu" : "Segédadat"}</strong><span>{gate.authority === "CONTRACT_REQUIRED" ? "A szükséges részletek csak a backend-szerződés elkészülte után rögzíthetők autoritatívan." : "A kézi munkalap szerkeszthető, de nem helyettesíti a verziózott műveleti vagy tervrekordot."}</span></div>}
    {action && <div className="project-gate-action"><Link to={action.href}>{action.label} →</Link><span>A részletek azon a munkatéren adhatók meg, amelyik az adat gazdája.</span></div>}
  </section>;
}

function OperationInspector({ row, laneName, projectKey }: { row: ProjectOperationRow; laneName: string; projectKey: string }) {
  if (row.sourceKind === "DIRECT_TASK") {
    return <section className={`project-operation-inspector state-${row.state.toLowerCase()}`} id="project-operation-detail" aria-live="polite">
      <header><div><span>{laneName} · közvetlen Task</span><h3>{row.name}</h3></div><b>{row.stateLabel}</b></header>
      <dl>
        <div><dt>Forrástípus</dt><dd>Közvetlen legacy üzemi feladat</dd></div>
        <div><dt>Állomás</dt><dd>{row.station ?? "Nincs megadva"}</dd></div>
        <div><dt>Backend hét / nap</dt><dd>{rowSchedule(row)}</dd></div>
        <div><dt>Backend státusz</dt><dd><code>{row.status}</code></dd></div>
        <div><dt>Problémajelzés</dt><dd>{row.problem ? "Igen" : "Nem"}</dd></div>
        <div><dt>Mennyiség</dt><dd>{row.quantity == null ? "Nincs megadva" : row.quantity.toLocaleString("hu-HU")}</dd></div>
        <div><dt>Egységidő</dt><dd>{row.unitHours == null ? "Nincs megadva" : `${row.unitHours} óra`}</dd></div>
        <div><dt>Bizalmi szint</dt><dd>Read-only Task projekció</dd></div>
      </dl>
      <div className="project-operation-lineage"><strong>Forrás és authority</strong><span>Ez a backend Task közvetlenül a projekthez tartozik, aktív epik vagy munkalaplépés nélkül. Nem OperationPlan, nem PlanningProposal és nem igazolt IssuedWorkPackage.</span></div>
      <Link to="/board">Üzemi tábla megnyitása →</Link>
    </section>;
  }

  const estimatedHours = row.quantity != null && row.unitHours != null ? row.quantity * row.unitHours : null;
  return <section className={`project-operation-inspector state-${row.state.toLowerCase()}`} id="project-operation-detail" aria-live="polite">
    <header><div><span>{laneName}</span><h3>{row.name}</h3></div><b>{row.stateLabel}</b></header>
    <dl>
      <div><dt>Állomás</dt><dd>{row.station ?? "Nincs megadva"}</dd></div>
      <div><dt>Tervezett nap</dt><dd>{formatDate(row.planDate)}</dd></div>
      <div><dt>Mennyiség</dt><dd>{row.quantity == null ? "Nincs megadva" : row.quantity.toLocaleString("hu-HU")}</dd></div>
      <div><dt>Egységidő</dt><dd>{row.unitHours == null ? "Nincs megadva" : `${row.unitHours} óra`}</dd></div>
      <div><dt>Becsült terhelés</dt><dd>{estimatedHours == null ? "Nem számítható" : `${estimatedHours.toLocaleString("hu-HU")} óra`}</dd></div>
      <div><dt>Kézi tervzár</dt><dd>{row.planLocked ? "Zárolt" : "Nyitott"}</dd></div>
      <div><dt>Üzemi feladat</dt><dd>{row.taskCount ? `${row.taskCount} kapcsolt feladat` : "Még nincs kiadva"}{row.problemCount ? ` · ${row.problemCount} probléma` : ""}</dd></div>
    </dl>
    <div className="project-operation-lineage"><strong>Forrás és authority</strong><span>Ez a sor az örökölt munkalap egyik EpicStep rekordjából származik; standard-, normaidő- és alkatrészrevíziója nincs igazolva.</span></div>
    <Link to={`/projects/${encodeURIComponent(projectKey)}/work-session`}>Műveleti segédadat szerkesztése →</Link>
  </section>;
}

/** Office-facing projection of the documented Doorstar data chain. */
export function ProjectProcessOverview({
  project,
  revision,
  componentSnapshots = [],
  componentSnapshotsState = "UNAVAILABLE",
  componentCalculatorProfiles = null,
  componentCalculatorProfilesState = "UNAVAILABLE",
}: ProjectProcessOverviewProps) {
  const [selectedGateKey, setSelectedGateKey] = useState<ProjectProcessGate["key"]>("ORDER");
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const view = buildProjectProcessView(project, revision, {
    componentSnapshots,
    componentSnapshotsState,
    componentCalculatorProfiles,
    componentCalculatorProfilesState,
  });
  const selectedGate = view.gates.find((gate) => gate.key === selectedGateKey) ?? view.gates[0];
  const operationSelection = view.lanes
    .flatMap((lane) => lane.rows.map((row) => ({ row, laneId: lane.id, laneName: lane.name })))
    .find(({ row }) => row.id === selectedOperationId) ?? null;

  return <section className="project-process-overview" aria-labelledby="project-process-title">
    <header className="project-process-heading">
      <div><span>Doorstar folyamat</span><h2 id="project-process-title">Megrendeléstől az átadásig</h2><p>{view.nextAction}</p></div>
      <div className="project-process-links">{revision && <Link to={`/orders/${encodeURIComponent(project.key)}`}>Rendelési adatlap</Link>}<Link to="/board">Üzemi tábla</Link></div>
    </header>

    <ol className="project-process-gates">
      {view.gates.map((gate, index) => <li className={`project-process-gate state-${gate.state.toLowerCase()}${gate.key === selectedGate.key ? " is-selected" : ""}`} key={gate.key}>
        <button type="button" aria-expanded={gate.key === selectedGate.key} aria-controls="project-process-gate-detail" onClick={() => setSelectedGateKey(gate.key)}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div><small>{gate.source}</small><strong>{gate.label}</strong><p>{gate.detail}</p></div>
          <b>{gateStateLabel[gate.state]}</b>
        </button>
      </li>)}
    </ol>

    <GateInspector
      gate={selectedGate}
      project={project}
      revision={revision}
      componentSnapshots={componentSnapshots}
      componentSnapshotsState={
        componentSnapshotsState === "ERROR" || componentCalculatorProfilesState === "ERROR"
          ? "ERROR"
          : componentSnapshotsState === "PENDING" || componentCalculatorProfilesState === "PENDING"
            ? "PENDING"
            : componentSnapshotsState
      }
    />

    {view.sourceWarning && <div className="project-process-warning"><strong>Forráskapcsolat</strong><span>{view.sourceWarning}</span></div>}

    <div className="project-process-lanes">
      <div className="project-process-section-title"><span>Műveleti vázlat</span><h3>Termék- és munkafolyamatok</h3><p>Kattints egy műveletre a részletekhez és a szerkesztési célfelülethez.</p></div>
      {view.lanes.length === 0 ? <div className="project-process-empty"><strong>Még nincs műveleti terv.</strong><span>A dokumentált lánc szerint előbb a felmérést és rendelési jóváhagyást, majd a verziózott alkatrészképzést kell lezárni.</span></div> : view.lanes.map((lane) => <article className={`project-process-lane${lane.rows[0]?.sourceKind === "DIRECT_TASK" ? " is-direct-task-lane" : ""}`} key={lane.id}>
        <header><div><span>{lane.rows[0]?.sourceKind === "DIRECT_TASK" ? "Read-only legacy Task projekció" : "Örökölt munkalapfolyamat"}</span><h4>{lane.name}</h4></div><b>{lane.done}/{lane.total} kész</b></header>
        <div className="project-operation-list">{lane.rows.map((row, index) => <button type="button" aria-expanded={row.id === selectedOperationId} aria-controls="project-operation-detail" className={`project-operation-row state-${row.state.toLowerCase()}${row.id === selectedOperationId ? " is-selected" : ""}`} key={row.id} onClick={() => setSelectedOperationId((current) => current === row.id ? null : row.id)}>
          <span>{String(index + 1).padStart(2, "0")}</span><strong>{row.name}</strong><small>{row.station ?? "állomás hiányzik"}</small><small>{rowSchedule(row)}</small><small>{row.quantity == null ? "mennyiség —" : row.quantity.toLocaleString("hu-HU")}</small><b>{row.stateLabel}</b>
        </button>)}</div>
        {operationSelection?.laneId === lane.id && <OperationInspector row={operationSelection.row} laneName={operationSelection.laneName} projectKey={project.key} />}
      </article>)}
    </div>
  </section>;
}
