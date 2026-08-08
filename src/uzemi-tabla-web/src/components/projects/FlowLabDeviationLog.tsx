import { formatFlowLabPayloadValue, type FlowLabDeviationRecord } from "@/lib/flowLab";

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Nem értelmezhető időbélyeg"
    : new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function PayloadView({ payload, recordId }: { payload: Record<string, unknown>; recordId: string }) {
  const fields = Object.entries(payload);
  if (!fields.length) return <p className="flow-lab-empty-inline">A typed payload nem tartalmaz mezőt.</p>;
  return <dl className="flow-lab-deviation-payload" aria-label={`${recordId} typed payload`}>
    {fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{formatFlowLabPayloadValue(value)}</dd></div>)}
  </dl>;
}

/** Append-only evidence reader. Its only control loads the next opaque cursor
 * page; it never exposes an edit or delete affordance for a record. */
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
        <span>Append-only eltérésnapló</span>
        <h2 id="flow-lab-deviations-heading">Üzemi megfigyelések időrendben</h2>
        <p>A rekordok megőrzött tények: nincs szerkesztés, törlés vagy visszavonás. Egy helyesbítés csak új eltérésként érkezhet.</p>
      </div>
      <b>Cursoros lista</b>
    </header>

    {isLoading ? <p className="flow-lab-inline-status" role="status">Az eltérésnapló betöltődik…</p>
      : isError ? <p className="flow-lab-inline-error" role="alert">Az eltérésnapló most nem érhető el. A hiba részleteit biztonsági okból nem jelenítjük meg.</p>
        : !records.length ? <p className="flow-lab-empty-state">Ehhez a projekthez nincs olvasható Flow Lab eltérésrekord.</p>
          : <ol className="flow-lab-deviation-records">
            {records.map((record) => <li key={record.id}>
              <header>
                <div>
                  <span>{formatDateTime(record.occurredAt)}</span>
                  <h3>{record.kind}</h3>
                </div>
                <code>{record.id}</code>
              </header>
              <dl className="flow-lab-deviation-meta">
                <div><dt>Korrelációs kulcs</dt><dd><code>{record.correlationKey ?? "Kézzel felvett lépés"}</code></dd></div>
                <div><dt>Actor</dt><dd>{record.actor.role} · {record.actor.principal}</dd></div>
                <div><dt>Materializáció</dt><dd><code>{record.materializationId}</code></dd></div>
              </dl>
              <section aria-label="Typed payload"><h4>Typed payload</h4><PayloadView payload={record.payload} recordId={record.id} /></section>
              <details className="flow-lab-deviation-pins">
                <summary>Snapshot pinek</summary>
                <dl>
                  <div><dt>Forráskészlet</dt><dd><code>{record.pins.sourceSetKey}</code></dd></div>
                  <div><dt>Materialization key</dt><dd><code>{record.pins.materializationKey}</code></dd></div>
                  <div><dt>Katalógus</dt><dd><code>{record.pins.catalogRevision}</code></dd></div>
                  <div><dt>Katalógus hash</dt><dd><code>{record.pins.catalogHash}</code></dd></div>
                  <div><dt>Terv hash</dt><dd><code>{record.pins.planHash}</code></dd></div>
                  <div><dt>Engine</dt><dd><code>{record.pins.engineIdentity}</code></dd></div>
                </dl>
              </details>
            </li>)}
          </ol>}

    {!isLoading && !isError && hasNextPage && <button
      className="flow-lab-load-more"
      type="button"
      disabled={isFetchingNextPage}
      onClick={onLoadMore}
    >{isFetchingNextPage ? "Korábbi eltérések betöltése…" : "Korábbi eltérések betöltése"}</button>}
    {!isLoading && !isError && records.length > 0 && !hasNextPage && <p className="flow-lab-end-of-log">Nincs több elérhető eltérés a kurzor után.</p>}
  </section>;
}
