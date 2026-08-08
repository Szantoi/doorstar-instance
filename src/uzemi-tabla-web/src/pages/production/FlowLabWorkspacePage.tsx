import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FlowLabDeviationLog } from "@/components/projects/FlowLabDeviationLog";
import { FlowLabMaterializationPanel } from "@/components/projects/FlowLabMaterializationPanel";
import { FlowLabSnapshotEvidence } from "@/components/projects/FlowLabSnapshotEvidence";
import { flowLabSnapshotStateLabel } from "@/lib/flowLab";
import { getFlowLabReadonlyUrl } from "@/lib/readOnlyDemo";
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
  const flowLabReadonlyUrl = getFlowLabReadonlyUrl();
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
      <div className="order-intake-breadcrumb"><Link to={`/projects/${encodeURIComponent(key)}`}>Projekt</Link> / {key} / Munkaterv</div>
      <header className="flow-lab-workspace-hero">
        <div>
          <span>Gyártási munkaterv</span>
          <h1>Munkaterv áttekintése</h1>
          <p>Itt látható, melyik tervverzió ellenőrzött, mi jutott már el az üzemi táblára, és milyen sorrendben következnek a munkalépések.</p>
        </div>
        <div className="flow-lab-workspace-actions">
          {flowLabReadonlyUrl ? <a
            href={flowLabReadonlyUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Külön Flow Lab-bemutató megnyitása új lapon
          </a> : null}
          <Link to={`/projects/${encodeURIComponent(key)}`}>Vissza a projekthez</Link>
        </div>
      </header>

      <aside className="flow-lab-boundary" aria-label="Flow Lab munkatér határa">
        <strong>Bemutató · csak megtekintés · mintaadat</strong>
        <p>Ezen az oldalon a tervet lehet megnézni. Nem lehet itt tervet módosítani, feltölteni, jóváhagyni vagy kiadni a gyártásba.</p>
      </aside>

      <section className="flow-lab-snapshot-list" aria-labelledby="flow-lab-snapshot-list-heading">
        <header>
          <div>
            <span>Tervverziók</span>
            <h2 id="flow-lab-snapshot-list-heading">Válasszon egy munkatervet</h2>
          </div>
        </header>
        {snapshotsQuery.isLoading ? <p className="flow-lab-inline-status" role="status">A tervverziók betöltődnek…</p>
          : snapshotsQuery.isError ? <p className="flow-lab-inline-error" role="alert">A tervverziók most nem érhetők el. A hiba részleteit biztonsági okból nem jelenítjük meg.</p>
            : !snapshots.length ? <p className="flow-lab-empty-state">Ehhez a projekthez még nincs megtekinthető tervverzió.</p>
              : <div className="flow-lab-snapshot-selector" aria-label="Munkaterv verziók">
                {snapshots.map((snapshot, index) => {
                  const selected = snapshot.id === selectedSnapshot?.id;
                  const stateLabel = flowLabSnapshotStateLabel(snapshot.state);
                  return <button
                    key={snapshot.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${index + 1}. tervverzió: ${stateLabel}, rögzítve ${formatDateTime(snapshot.createdAt)}`}
                    className={selected ? "is-selected" : undefined}
                    onClick={() => setSelectedSnapshotId(snapshot.id)}
                  >
                    <span className={`flow-lab-status is-${snapshot.state.toLowerCase()}`}>{stateLabel}</span>
                    <strong>{index + 1}. tervverzió</strong>
                    <small>Rögzítve: {formatDateTime(snapshot.createdAt)}</small>
                    <small>{snapshot.operations.length} munkalépés</small>
                  </button>;
                })}
              </div>}
      </section>

      {selectedSnapshot && <>
        <FlowLabSnapshotEvidence snapshot={selectedSnapshot}>
          <FlowLabMaterializationPanel
            snapshot={selectedSnapshot}
            project={materializedWorksheetQuery.data}
            isLoading={materializedWorksheetQuery.isLoading}
            isError={materializedWorksheetQuery.isError}
          />
        </FlowLabSnapshotEvidence>
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
