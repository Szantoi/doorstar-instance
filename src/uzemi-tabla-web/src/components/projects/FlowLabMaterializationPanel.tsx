import type { FlowLabPlanSnapshotRead } from "@/lib/flowLab";
import type { ProjectDetail } from "@/services/production/types";

export interface FlowLabMaterializationSummary {
  epicCount: number;
  stepCount: number;
  summaryStepCount: number;
  activeWorkStepCount: number;
}

/** Narrow the legacy project read projection to immutable Flow Lab provenance.
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
        <span>Materializációs állapot</span>
        <h2 id="flow-lab-materialization-heading">Epic/EpicStep projekció provenance-a</h2>
        <p>A rendszer meglévő, csak olvasható projektprojekcióját ellenőrizzük. Ez nem a régi munkalap-szerkesztő, és nincs Materializálás gomb.</p>
      </div>
      <b>Csak olvasható</b>
    </header>
    {isLoading ? <p className="flow-lab-inline-status" role="status">A materializált munkalapsorok provenance-a betöltődik…</p>
      : isError ? <p className="flow-lab-inline-error" role="alert">A materializált munkalap-projekció most nem ellenőrizhető. A snapshot evidence nem változott.</p>
        : !summary ? <p className="flow-lab-empty-state">Ehhez a snapshothoz a projekt read modellje nem adott vissza Flow Lab Epic/EpicStep projekciót. Ez nem indít automatikus materializálást.</p>
          : <dl className="flow-lab-materialization-grid">
            <div><dt>Flow Lab epic</dt><dd>{summary.epicCount} db</dd></div>
            <div><dt>Flow Lab lépés</dt><dd>{summary.stepCount} db</dd></div>
            <div><dt>Összegző kapu</dt><dd>{summary.summaryStepCount} db</dd></div>
            <div><dt>Munkalépés</dt><dd>{summary.activeWorkStepCount} db</dd></div>
            <div><dt>Forráskészlet</dt><dd><code>{snapshot.sourceSetKey}</code></dd></div>
            <div><dt>Materialization key</dt><dd><code>{snapshot.materializationKey}</code></dd></div>
          </dl>}
  </section>;
}
