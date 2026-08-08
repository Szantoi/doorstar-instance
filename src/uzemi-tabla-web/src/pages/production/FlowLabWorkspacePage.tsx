import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FlowLabDeviationLog } from "@/components/projects/FlowLabDeviationLog";
import { FlowLabMaterializationPanel } from "@/components/projects/FlowLabMaterializationPanel";
import { FlowLabSnapshotEvidence } from "@/components/projects/FlowLabSnapshotEvidence";
import { flowLabSnapshotStateLabel } from "@/lib/flowLab";
import {
  useFlowLabDeviations,
  useFlowLabMaterializedWorksheet,
  useFlowLabPlanSnapshots,
} from "@/services/production/hooks";
import "./flowLab.css";

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Nem értelmezhető időbélyeg"
    : new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

/** Dedicated Flow Lab operator view. It consumes only GET read models and
 * keeps the historical worksheet editor isolated on its own locked route. */
export function FlowLabWorkspacePage() {
  const { key = "" } = useParams();
  const snapshotsQuery = useFlowLabPlanSnapshots(key);
  const materializedWorksheetQuery = useFlowLabMaterializedWorksheet(key);
  const deviationsQuery = useFlowLabDeviations(key);
  const snapshots = snapshotsQuery.data?.snapshots ?? [];
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  useEffect(() => {
    if (!snapshots.length) {
      setSelectedSnapshotId(null);
      return;
    }
    if (!selectedSnapshotId || !snapshots.some((snapshot) => snapshot.id === selectedSnapshotId)) {
      setSelectedSnapshotId(snapshots[0]!.id);
    }
  }, [selectedSnapshotId, snapshots]);

  const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null;
  const deviationRecords = useMemo(
    () => deviationsQuery.data?.pages.flatMap((page) => page.records) ?? [],
    [deviationsQuery.data],
  );

  return <main className="flow-lab-workspace-page">
    <div className="flow-lab-workspace-content">
      <div className="order-intake-breadcrumb"><Link to={`/projects/${encodeURIComponent(key)}`}>Projekt</Link> / {key} / Flow Lab</div>
      <header className="flow-lab-workspace-hero">
        <div>
          <span>Projektkötött operátori munkatér</span>
          <h1>Flow Lab evidence</h1>
          <p>Snapshotok, változatlan pinek, readiness és append-only eltérések egy elkülönített, csak olvasható nézetben.</p>
        </div>
        <Link to={`/projects/${encodeURIComponent(key)}`}>Vissza a projekthez</Link>
      </header>

      <aside className="flow-lab-boundary" aria-label="Flow Lab munkatér határa">
        <strong>Szándékos határ</strong>
        <p>Nincs fájlfeltöltés, Task-lánc, naptári ütemezés vagy üzemi kiadás. Review, materializáció és board-parancs sem indítható innen; a szerver- és session-policy marad az authority.</p>
      </aside>

      <section className="flow-lab-snapshot-list" aria-labelledby="flow-lab-snapshot-list-heading">
        <header>
          <div>
            <span>Snapshot lista</span>
            <h2 id="flow-lab-snapshot-list-heading">Elérhető Flow Lab tervsnapshotok</h2>
          </div>
        </header>
        {snapshotsQuery.isLoading ? <p className="flow-lab-inline-status" role="status">A Flow Lab snapshotok betöltődnek…</p>
          : snapshotsQuery.isError ? <p className="flow-lab-inline-error" role="alert">A Flow Lab snapshotok most nem érhetők el. A hiba részleteit biztonsági okból nem jelenítjük meg.</p>
            : !snapshots.length ? <p className="flow-lab-empty-state">Ehhez a projekthez nincs elérhető Flow Lab snapshot.</p>
              : <div className="flow-lab-snapshot-selector" aria-label="Flow Lab snapshotok">
                {snapshots.map((snapshot) => {
                  const selected = snapshot.id === selectedSnapshot?.id;
                  return <button
                    key={snapshot.id}
                    type="button"
                    aria-pressed={selected}
                    className={selected ? "is-selected" : undefined}
                    onClick={() => setSelectedSnapshotId(snapshot.id)}
                  >
                    <span className={`flow-lab-status is-${snapshot.state.toLowerCase()}`}>{flowLabSnapshotStateLabel(snapshot.state)}</span>
                    <strong>{snapshot.sourceSetKey}</strong>
                    <small>{formatDateTime(snapshot.createdAt)}</small>
                    <small>Creator: {snapshot.createdByRole ?? "nincs audit"} · Reviewer: {snapshot.reviewedByRole ?? "nincs"}</small>
                  </button>;
                })}
              </div>}
      </section>

      {selectedSnapshot && <>
        <FlowLabMaterializationPanel
          snapshot={selectedSnapshot}
          project={materializedWorksheetQuery.data}
          isLoading={materializedWorksheetQuery.isLoading}
          isError={materializedWorksheetQuery.isError}
        />
        <FlowLabSnapshotEvidence snapshot={selectedSnapshot} />
      </>}

      <FlowLabDeviationLog
        records={deviationRecords}
        isLoading={deviationsQuery.isLoading}
        isError={deviationsQuery.isError}
        hasNextPage={Boolean(deviationsQuery.hasNextPage)}
        isFetchingNextPage={deviationsQuery.isFetchingNextPage}
        onLoadMore={() => void deviationsQuery.fetchNextPage()}
      />
    </div>
  </main>;
}
