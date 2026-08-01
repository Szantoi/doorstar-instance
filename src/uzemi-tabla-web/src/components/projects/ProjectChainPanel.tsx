import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildProjectChainView,
  projectRoleLabel,
  readinessBlockerLabel,
  readinessGateLabel,
  type ProjectChainStage,
} from "@/lib/projectChain";

export type ProjectChainLoadState = "UNAVAILABLE" | "PENDING" | "ERROR" | "READY";

interface ProjectChainPanelProps {
  projectKey: string;
  revisionId: string | null;
  revisionNumber: number | null;
  readiness: unknown;
  workflow: unknown;
  state: ProjectChainLoadState;
}

const stageStateLabel = {
  COMPLETED: "Kész",
  CURRENT: "Itt tart",
  BLOCKED: "Blokkolt",
  NOT_AVAILABLE: "Nem elérhető",
} as const;

function GateInspector({ stage }: { stage: ProjectChainStage }) {
  return (
    <section className={`project-chain-inspector state-${stage.state.toLowerCase()}`} id="project-chain-gate-detail" aria-live="polite">
      <header>
        <div><span>Projektkapu</span><h3>{stage.label}</h3></div>
        <b>{stageStateLabel[stage.state]}</b>
      </header>
      <dl>
        <div><dt>Felelős szerepkör</dt><dd>{stage.ownerRole}</dd></div>
        <div><dt>Hiányok</dt><dd>{stage.blockers.length ? `${stage.blockers.length} blokkoló` : "Nincs szerveroldali blokkoló"}</dd></div>
      </dl>
      {stage.blockers.length > 0 ? (
        <div className="project-chain-missing">
          <span>Mi hiányzik?</span>
          <ul>{stage.blockers.map((blocker) => (
            <li key={`${blocker.code}-${blocker.entity?.id ?? "gate"}`}>
              <strong>{readinessBlockerLabel(blocker)}</strong>
              <small>{projectRoleLabel(blocker.ownerRole)} · <code>{blocker.code}</code></small>
            </li>
          ))}</ul>
        </div>
      ) : <p className="project-chain-no-missing">Ehhez a kapuhoz a szerver nem jelez hiányt.</p>}
      {stage.detailsHref && <Link to={stage.detailsHref}>Részletek az adatgazda munkatérben →</Link>}
    </section>
  );
}

function ClosedPanel({ kind, message, busy = false }: { kind: "status" | "alert"; message: string; busy?: boolean }) {
  return (
    <section className="project-chain-panel is-closed" aria-labelledby="project-chain-title" aria-busy={busy}>
      <header className="project-chain-heading">
        <div><span>Exact revíziós projektlánc</span><h2 id="project-chain-title">Hol tart a projekt?</h2></div>
        <b>Lezárva</b>
      </header>
      <p role={kind}>{message}</p>
    </section>
  );
}

/** Office-facing consumer of the backend readiness and workflow projections.
 * It renders no mutation control and never turns API command hrefs into links. */
export function ProjectChainPanel({
  projectKey,
  revisionId,
  revisionNumber,
  readiness,
  workflow,
  state,
}: ProjectChainPanelProps) {
  const view = useMemo(() => {
    if (state !== "READY" || !revisionId || revisionNumber == null) return null;
    return buildProjectChainView(readiness, workflow, { projectKey, revisionId, revisionNumber });
  }, [projectKey, readiness, revisionId, revisionNumber, state, workflow]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!view || view.status !== "READY") return;
    const preferred = view.currentGate ?? view.stages.at(-1)?.key ?? null;
    if (!view.stages.some((stage) => stage.key === selectedKey)) setSelectedKey(preferred);
  }, [selectedKey, view]);

  if (state === "UNAVAILABLE") {
    return <ClosedPanel kind="status" message="Nincs exact rendelési revízió. A projekt helye és következő művelete nem állapítható meg." />;
  }
  if (state === "PENDING") {
    return <ClosedPanel kind="status" busy message="A projektlánc szerveroldali állapotának ellenőrzése folyamatban van. Korábbi akció nem használható." />;
  }
  if (state === "ERROR") {
    return <ClosedPanel kind="alert" message="A projektlánc nem érhető el. A következő művelet fail-closed marad." />;
  }
  if (!view || view.status !== "READY") {
    return <ClosedPanel kind="alert" message={view?.reason ?? "A projektlánc szerződése nem ellenőrizhető."} />;
  }

  const selectedStage = view.stages.find((stage) => stage.key === selectedKey)
    ?? view.stages.find((stage) => stage.key === view.currentGate)
    ?? view.stages[0];

  return (
    <section className="project-chain-panel" aria-labelledby="project-chain-title">
      <header className="project-chain-heading">
        <div>
          <span>Exact revíziós projektlánc · R{String(view.revisionNumber).padStart(2, "0")}</span>
          <h2 id="project-chain-title">Hol tart a projekt?</h2>
          <p>A kapuk és a következő teendő a szerver azonos revíziójú readiness- és workflow-projekciójából származnak.</p>
        </div>
        <b>Szerver által ellenőrzött</b>
      </header>

      <ol className="project-chain-stages" aria-label="Projektlánc állapota">
        {view.stages.map((stage, index) => (
          <li className={`state-${stage.state.toLowerCase()}`} key={stage.key}>
            <button
              type="button"
              aria-pressed={stage.key === selectedStage?.key}
              aria-controls="project-chain-gate-detail"
              onClick={() => setSelectedKey(stage.key)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{stage.label}</strong>
              <b>{stageStateLabel[stage.state]}</b>
            </button>
          </li>
        ))}
      </ol>

      <section className={`project-chain-next is-${view.nextAction.kind.toLowerCase()}`} aria-labelledby="project-chain-next-title">
        <div>
          <span>Következő szerveroldali teendő</span>
          <h3 id="project-chain-next-title">{view.nextAction.title}</h3>
          <p>{view.nextAction.detail}</p>
        </div>
        <dl>
          <div><dt>Felelős</dt><dd>{view.nextAction.ownerRole}</dd></div>
          <div><dt>Azonosító</dt><dd>{view.nextAction.code ? <code>{view.nextAction.code}</code> : "—"}</dd></div>
        </dl>
        {view.nextAction.href && <Link to={view.nextAction.href}>Adatgazda munkatér megnyitása →</Link>}
      </section>

      {selectedStage && <GateInspector stage={selectedStage} />}

      <details className="project-chain-readiness-audit">
        <summary>Exact revízió részletes adatkapui ({view.readinessGates.length})</summary>
        <ol>{view.readinessGates.map((gate) => (
          <li key={gate.key}>
            <span>{readinessGateLabel[gate.key]}</span>
            <b>{gate.state === "READY" ? "Kész" : gate.state === "BLOCKED" ? "Blokkolt" : "Nem elérhető"}</b>
            <small>{gate.blockers.length ? `${gate.blockers.length} hiány` : projectRoleLabel(gate.ownerRole)}</small>
          </li>
        ))}</ol>
      </details>
    </section>
  );
}
