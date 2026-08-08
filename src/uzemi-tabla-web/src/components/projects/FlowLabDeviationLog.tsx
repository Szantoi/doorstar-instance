import { formatFlowLabPayloadValue, type FlowLabDeviationRecord } from "@/lib/flowLab";

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Nem értelmezhető időbélyeg"
    : new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function deviationLabel(kind: string): string {
  return {
    QUANTITY_CHANGED: "Mennyiség változott",
    UNIT_HOURS_CHANGED: "Ráfordított idő változott",
    STEP_DISABLED: "Egy munkalépés leállítva",
    STEP_ENABLED: "Egy munkalépés újra használható",
    STEP_REORDERED: "A munkalépések sorrendje változott",
    STATION_CHANGED: "Az állomás változott",
    PLAN_LOCKED: "A terv lezárva",
    PLAN_UNLOCKED: "A terv feloldva",
    STEP_ADDED_BY_HAND: "Kézzel felvett munkalépés",
    TASK_PROBLEM_FLAGGED: "Problémát jelöltek egy lépésnél",
  }[kind] ?? "Üzemi változás";
}

function PayloadView({ payload }: { payload: Record<string, unknown> }) {
  const fields = Object.entries(payload);
  if (!fields.length) return <p className="flow-lab-empty-inline">Nincs rögzített nyers adat.</p>;
  return <dl className="flow-lab-deviation-payload" aria-label="Nyers adatok">
    {fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{formatFlowLabPayloadValue(value)}</dd></div>)}
  </dl>;
}

/** Append-only evidence reader. Its only control loads the next read-only page;
 * it never exposes an edit or delete affordance for a record. */
export function FlowLabDeviationLog({
  records,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  records: FlowLabDeviationRecord[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  return <section className="flow-lab-deviation-log" aria-labelledby="flow-lab-deviations-heading">
    <header>
      <div>
        <span>Változások</span>
        <h2 id="flow-lab-deviations-heading">Rögzített üzemi változások</h2>
        <p>Ezek korábban rögzített megfigyelések. Itt nem lehet őket javítani, törölni vagy visszavonni.</p>
      </div>
      <b>Csak megtekintés</b>
    </header>

    {isLoading ? <p className="flow-lab-inline-status" role="status">A rögzített változások betöltődnek…</p>
      : isError ? <p className="flow-lab-inline-error" role="alert">A rögzített változások most nem érhetők el. A hiba részleteit biztonsági okból nem jelenítjük meg.</p>
        : !records.length ? <p className="flow-lab-empty-state">Ehhez a projekthez nincs rögzített üzemi változás.</p>
          : <ol className="flow-lab-deviation-records">
            {records.map((record) => <li key={record.id}>
              <header>
                <div>
                  <span>{formatDateTime(record.occurredAt)}</span>
                  <h3>{deviationLabel(record.kind)}</h3>
                </div>
              </header>
              <p className="flow-lab-deviation-description">A részletek a technikai ellenőrzési adatoknál láthatók.</p>
              <details className="flow-lab-technical-details">
                <summary>Technikai ellenőrzési adatok</summary>
                <dl className="flow-lab-deviation-meta">
                  <div><dt>Rekordazonosító</dt><dd><code>{record.id}</code></dd></div>
                  <div><dt>Változás típusa</dt><dd><code>{record.kind}</code></dd></div>
                  <div><dt>Korrelációs azonosító</dt><dd><code>{record.correlationKey ?? "Kézzel felvett lépés"}</code></dd></div>
                  <div><dt>Rögzítő belső azonosítója</dt><dd>{record.actor.role} · {record.actor.principal}</dd></div>
                  <div><dt>Átvételi azonosító</dt><dd><code>{record.materializationId}</code></dd></div>
                </dl>
                <section>
                  <h4>Nyers adatok</h4>
                  <PayloadView payload={record.payload} />
                </section>
                <section>
                  <h4>Rendszerlenyomatok</h4>
                  <dl className="flow-lab-deviation-pins-grid">
                    <div><dt>Forráskészlet</dt><dd><code>{record.pins.sourceSetKey}</code></dd></div>
                    <div><dt>Átvételi kulcs</dt><dd><code>{record.pins.materializationKey}</code></dd></div>
                    <div><dt>Katalógus</dt><dd><code>{record.pins.catalogRevision}</code></dd></div>
                    <div><dt>Katalógus hash</dt><dd><code>{record.pins.catalogHash}</code></dd></div>
                    <div><dt>Terv hash</dt><dd><code>{record.pins.planHash}</code></dd></div>
                    <div><dt>Engine</dt><dd><code>{record.pins.engineIdentity}</code></dd></div>
                  </dl>
                </section>
              </details>
            </li>)}
          </ol>}

    {!isLoading && !isError && hasNextPage && <button
      className="flow-lab-load-more"
      type="button"
      disabled={isFetchingNextPage}
      onClick={onLoadMore}
    >{isFetchingNextPage ? "Korábbi bejegyzések betöltése…" : "Korábbi bejegyzések betöltése"}</button>}
    {!isLoading && !isError && records.length > 0 && !hasNextPage && <p className="flow-lab-end-of-log">Nincs több korábbi bejegyzés.</p>}
  </section>;
}
