import type { FlowLabPlanSnapshotRead } from "@/lib/flowLab";
import type { ProjectDetail } from "@/services/production/types";

export interface FlowLabMaterializationSummary {
  epicCount: number;
  stepCount: number;
  summaryStepCount: number;
  activeWorkStepCount: number;
}

/** Narrow the legacy project read projection to the read-only Flow Lab rows.
 * No worksheet input or mutation state crosses this component boundary. */
export function summarizeFlowLabMaterialization(
  project: ProjectDetail | undefined,
  snapshot: FlowLabPlanSnapshotRead,
): FlowLabMaterializationSummary | null {
  if (!project) return null;
  const epics = project.epics.filter((epic) => epic.origin === "FLOW_LAB"
    && epic.materializationKey === snapshot.materializationKey);
  if (!epics.length) return null;
  const steps = epics.flatMap((epic) => epic.steps).filter((step) => step.origin === "FLOW_LAB"
    && step.materializationKey === snapshot.materializationKey);
  return {
    epicCount: epics.length,
    stepCount: steps.length,
    summaryStepCount: steps.filter((step) => step.operationType === "Summary").length,
    activeWorkStepCount: steps.filter((step) => step.operationType === "ActiveWork").length,
  };
}

export function FlowLabMaterializationPanel({
  snapshot,
  project,
  isLoading,
  isError,
}: {
  snapshot: FlowLabPlanSnapshotRead;
  project: ProjectDetail | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const summary = summarizeFlowLabMaterialization(project, snapshot);
  return <section className="flow-lab-materialization" aria-labelledby="flow-lab-materialization-heading">
    <header>
      <div>
        <span>A terv átvétele</span>
        <h2 id="flow-lab-materialization-heading">Ez jutott el az üzemi táblára</h2>
        <p>Az itt látható munkaszakaszok és lépések már megjelentek az üzemi táblán. Ezen az oldalon csak meg lehet nézni őket.</p>
      </div>
      <b>Csak megtekintés</b>
    </header>
    {isLoading ? <p className="flow-lab-inline-status" role="status">Az üzemi tábla adatai betöltődnek…</p>
      : isError ? <p className="flow-lab-inline-error" role="alert">Most nem tudjuk ellenőrizni, mi jutott el az üzemi táblára. A tervverzió nem változott.</p>
        : !summary ? <p className="flow-lab-empty-state">Ez a terv még nem jelent meg az üzemi táblán.</p>
          : <dl className="flow-lab-materialization-grid">
            <div><dt>Munkaszakasz</dt><dd>{summary.epicCount} db</dd></div>
            <div><dt>Lépés</dt><dd>{summary.stepCount} db</dd></div>
            <div><dt>Ellenőrző pont</dt><dd>{summary.summaryStepCount} db</dd></div>
            <div><dt>Végrehajtható munkalépés</dt><dd>{summary.activeWorkStepCount} db</dd></div>
          </dl>}
    <details className="flow-lab-technical-details">
      <summary>Technikai ellenőrzési adatok</summary>
      <dl className="flow-lab-metadata-grid">
        <div><dt>Forráskészlet</dt><dd><code>{snapshot.sourceSetKey}</code></dd></div>
        <div><dt>Átvételi kulcs</dt><dd><code>{snapshot.materializationKey}</code></dd></div>
      </dl>
    </details>
  </section>;
}
