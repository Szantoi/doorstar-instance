import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  displayImportWorkNumber,
  formatImportPayloadValue,
  importEvidenceLocator,
  IMPORT_CANDIDATE_STATUS_LABELS,
  IMPORT_DEADLINE_KIND_LABELS,
  IMPORT_REVIEW_STATE_LABELS,
  parseImportInboxPage,
} from "@/lib/importInbox";
import { useImportWorkNumberEvidence } from "@/services/production/hooks";

function formatDate(value: string | null) {
  if (!value) return "Nincs normalizált dátum";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium" }).format(date);
}

function formatConfidence(value: number | null) {
  return value == null ? "Nincs pontossági érték" : `${Math.round(value * 100)}% forrásbizalom`;
}

function PayloadValue({ value }: { value: unknown }) {
  if (value == null || typeof value !== "object") return <>{formatImportPayloadValue(value)}</>;
  const itemCount = Array.isArray(value) ? value.length : Object.keys(value).length;
  const label = Array.isArray(value) ? `${itemCount} elemű lista` : `${itemCount} mezős strukturált adat`;
  return (
    <details className="import-work-evidence-structured">
      <summary>{label}</summary>
      <pre>{formatImportPayloadValue(value)}</pre>
    </details>
  );
}

/** Read-only evidence workspace for one exact work-number group. It keeps
 * normalized payloads beside their source coordinates and offers no
 * accept-all action or inferred business decision. */
export function ImportWorkNumberDetailPage() {
  const { importRunId = "", workNumber = "" } = useParams();
  const [searchParams] = useSearchParams();
  const inboxPage = parseImportInboxPage(searchParams.get("page"));
  const pageContext = inboxPage > 1 ? `?page=${inboxPage}` : "";
  const inboxHref = `/imports${pageContext}`;
  const { data, isLoading, isError } = useImportWorkNumberEvidence(importRunId, workNumber);

  if (isLoading) {
    return <main className="orders-page"><div className="orders-content"><div className="orders-state">Bizonyítékcsomag betöltése…</div></div></main>;
  }

  if (isError || !data) {
    return (
      <main className="orders-page">
        <div className="orders-content">
          <div className="order-intake-breadcrumb"><Link to={inboxHref}>Import Inbox</Link> / Bizonyítékcsomag</div>
          <div className="orders-state">A munkaszám bizonyítékcsomagja nem érhető el.</div>
        </div>
      </main>
    );
  }

  const workNumberLabel = displayImportWorkNumber(data.workNumber);
  const ready = data.candidates.filter((item) => item.status === "READY").length;
  const review = data.candidates.filter((item) => item.status === "REVIEW").length;
  const blocked = data.candidates.filter((item) => item.status === "BLOCKED").length;

  return (
    <main className="orders-page">
      <div className="orders-content">
        <div className="order-intake-breadcrumb">
          <Link to={inboxHref}>Import Inbox</Link> / {workNumberLabel}
        </div>

        <header className="orders-hero">
          <div>
            <p>Munkaszám · csak olvasható bizonyítékcsomag</p>
            <h1>{workNumberLabel}</h1>
            <span>
              {data.candidates.length} importjelölt és {data.deadlineObservations.length} határidő-megfigyelés,
              pontos forráshelyekkel.
            </span>
          </div>
          <Link className="doorstar-home-primary-action" to={inboxHref}>Vissza az Inboxhoz</Link>
        </header>

        <section className="import-safety-banner" aria-label="Bizonyítékcsomag határa">
          <strong>Nincs automatikus döntés</strong>
          <span>
            Ez a nézet a forrást és a normalizált előnézetet mutatja. Nem old fel eltérést, nem hagy jóvá
            műszaki adatot, és nem ír gyártási vagy éles adatbázisba.
          </span>
        </section>

        <section className="import-run-summary" aria-label="Bizonyítékcsomag összesítés">
          <div>
            <span>Mapping</span>
            <strong>{data.importRun.profileVersion}</strong>
          </div>
          <div>
            <span>Előkészített</span>
            <strong>{ready}</strong>
          </div>
          <div>
            <span>Ellenőrzendő</span>
            <strong>{review}</strong>
          </div>
          <div>
            <span>Blokkolt</span>
            <strong>{blocked}</strong>
          </div>
          <div>
            <span>Határidő-forrás</span>
            <strong>{data.deadlineObservations.length}</strong>
          </div>
        </section>

        <section className="import-work-evidence-provenance" aria-label="Importfutás származása">
          <div>
            <span>Forrás-fingerprint</span>
            <code>{data.importRun.sourceFingerprint}</code>
          </div>
          <div>
            <span>Tesztséma</span>
            <code>{data.importRun.targetSchema}</code>
          </div>
          <Link to={`/imports/${encodeURIComponent(data.importRun.id)}${pageContext}`}>Teljes importfutás megnyitása →</Link>
        </section>

        <section className="import-evidence-section">
          <header>
            <div>
              <span>Normalizált előnézet + forrás</span>
              <h2>Importjelöltek</h2>
              <p>Minden mező előnézet; az eltérések emberi review-t igényelnek.</p>
            </div>
            <code>{data.importRun.sourceFingerprint.slice(0, 16)}…</code>
          </header>

          {data.candidates.length === 0 ? (
            <p className="import-evidence-empty">Ehhez a munkaszámhoz nincs importjelölt.</p>
          ) : (
            <div className="import-work-evidence-list">
              {data.candidates.map((item, index) => (
                <article className={`import-work-evidence-card import-work-evidence-card-${item.status.toLowerCase()}`} key={item.id}>
                  <header>
                    <div>
                      <span>Jelölt {String(index + 1).padStart(2, "0")}</span>
                      <h3>{item.recordType}</h3>
                    </div>
                    <i className={`import-state import-state-${item.status.toLowerCase()}`}>
                      {IMPORT_CANDIDATE_STATUS_LABELS[item.status]}
                    </i>
                  </header>

                  {item.errors.length > 0 && (
                    <section className="import-work-evidence-errors" aria-label="Feldolgozási akadályok">
                      <strong>{item.status === "BLOCKED" ? "Blokkoló okok" : "Ellenőrzési megjegyzések"}</strong>
                      <ul>{item.errors.map((error) => <li key={error}>{error}</li>)}</ul>
                    </section>
                  )}

                  <section className="import-work-evidence-payload">
                    <h4>Normalizált mezők</h4>
                    {Object.keys(item.normalizedPayload).length === 0 ? (
                      <p>Nincs normalizált mező ebben a jelöltben.</p>
                    ) : (
                      <dl>
                        {Object.entries(item.normalizedPayload).map(([key, value]) => (
                          <div key={key}>
                            <dt><code>{key}</code></dt>
                            <dd><PayloadValue value={value} /></dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>

                  <footer>
                    <span>Forráshely</span>
                    <code>{importEvidenceLocator(item)}</code>
                    <small>{item.sourceRoot}</small>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="import-evidence-section">
          <header>
            <div>
              <span>Ütemterv összevetés</span>
              <h2>Határidő-megfigyelések</h2>
              <p>Egy megfigyelés sem írja felül automatikusan a rendelés vállalt határidejét.</p>
            </div>
          </header>

          {data.deadlineObservations.length === 0 ? (
            <p className="import-evidence-empty">Ehhez a munkaszámhoz nincs rögzített határidő-megfigyelés.</p>
          ) : (
            <div className="import-work-deadline-list">
              {data.deadlineObservations.map((item) => (
                <article key={item.id}>
                  <header>
                    <div>
                      <span>{IMPORT_DEADLINE_KIND_LABELS[item.kind]}</span>
                      <strong>{item.rawValue}</strong>
                    </div>
                    <i className={`import-state import-state-${item.reviewState.toLowerCase()}`}>
                      {IMPORT_REVIEW_STATE_LABELS[item.reviewState]}
                    </i>
                  </header>
                  <dl>
                    <div>
                      <dt>Normalizált dátum</dt>
                      <dd>{formatDate(item.normalizedDate)}</dd>
                    </div>
                    <div>
                      <dt>Forrásbizalom</dt>
                      <dd>{formatConfidence(item.confidence)}</dd>
                    </div>
                  </dl>
                  {item.resolution && <blockquote>{item.resolution}</blockquote>}
                  <footer>
                    <code>{importEvidenceLocator(item)}</code>
                    <small>{item.sourceRoot}</small>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
