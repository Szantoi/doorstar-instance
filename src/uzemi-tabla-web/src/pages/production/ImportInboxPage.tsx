import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  displayImportWorkNumber,
  importInboxCardTone,
  importInboxPageCount,
  IMPORT_INBOX_STATE_META,
  parseImportInboxPage,
  summarizeImportInbox,
} from "@/lib/importInbox";
import { useImportInbox } from "@/services/production/hooks";

const PAGE_SIZE = 25;

/** Work-number-oriented entry point for the deterministic import evidence.
 * Counts and states come from the backend projection; this page never infers
 * approval, completion, or delivery from file metadata. */
export function ImportInboxPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseImportInboxPage(searchParams.get("page"));
  const { data, isLoading, isError, isFetching } = useImportInbox(page, PAGE_SIZE);
  const items = data?.items ?? [];
  const pageCount = importInboxPageCount(data?.total ?? 0, data?.pageSize ?? PAGE_SIZE);
  const summary = useMemo(() => summarizeImportInbox(items), [items]);

  useEffect(() => {
    if (data && page > pageCount) {
      const next = new URLSearchParams(searchParams);
      if (pageCount === 1) next.delete("page");
      else next.set("page", String(pageCount));
      setSearchParams(next, { replace: true });
    }
  }, [data, page, pageCount, searchParams, setSearchParams]);

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setSearchParams(next);
  }

  return (
    <main className="orders-page">
      <div className="orders-content">
        <header className="orders-hero">
          <div>
            <p>Adatátállás · munkaszám szerinti ellenőrzés</p>
            <h1>Import Inbox</h1>
            <span>
              Egy helyen láthatók a forrásokból felismert munkaszámok, a nyitott ellenőrzések és a pontos
              bizonyítékhelyek.
            </span>
          </div>
          <Link className="doorstar-home-primary-action" to="/orders">Rendelések</Link>
        </header>

        <section className="import-safety-banner" aria-label="Import biztonsági határ">
          <strong>Csak tesztkörnyezet</strong>
          <span>
            A felület kizárólag a <code>doorstar_test</code> sémából olvas. A teszt-DRAFT létrejötte nem
            jelent műszaki jóváhagyást, kész importot vagy gyártási kiadást.
          </span>
        </section>

        {!isLoading && !isError && data && (
          <section className="import-inbox-summary" aria-label="Import Inbox összesítés">
            <div>
              <span>Összes munkaszámcsomag</span>
              <strong>{data.total}</strong>
              <small>A teljes inboxban</small>
            </div>
            <div>
              <span>Jelölt rekord</span>
              <strong>{summary.candidateCount}</strong>
              <small>Ezen az oldalon</small>
            </div>
            <div>
              <span>Előkészített</span>
              <strong>{summary.readyCount}</strong>
              <small>Ezen az oldalon</small>
            </div>
            <div>
              <span>Ellenőrzendő</span>
              <strong>{summary.reviewCount}</strong>
              <small>Ezen az oldalon</small>
            </div>
            <div>
              <span>Blokkolt</span>
              <strong>{summary.blockedCount}</strong>
              <small>Ezen az oldalon</small>
            </div>
          </section>
        )}

        {isLoading ? (
          <div className="orders-state">Munkaszámcsomagok betöltése…</div>
        ) : isError ? (
          <div className="orders-state">
            Az Import Inbox nem érhető el. Ellenőrizd a termelési szolgáltatást.
          </div>
        ) : items.length === 0 ? (
          <section className="order-document-card">
            <div className="order-document-heading">
              <div>
                <span>Üres inbox</span>
                <h2>Még nincs munkaszámhoz kötött importjelölt</h2>
                <p>
                  Az adatfelderítő által regisztrált bizonyítékcsomagok itt jelennek meg, változatlan
                  forráshivatkozásokkal.
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section
            className="import-work-package-list"
            aria-label="Munkaszám szerinti importcsomagok"
            aria-busy={isFetching}
          >
            {items.map((item) => {
              const workNumberLabel = displayImportWorkNumber(item.workNumber);
              const cardTone = importInboxCardTone(item);
              const pageContext = page > 1 ? `?page=${page}` : "";

              return (
                <article className={`import-work-package import-work-package-${cardTone}`} key={`${item.importRunId}:${item.workNumber}`}>
                  <header>
                    <div className="import-work-package-title">
                      <span>{item.workNumber === "UNASSIGNED" ? "Nem csoportosított forrás" : "Munkaszám"}</span>
                      <h2>{workNumberLabel}</h2>
                      <p>{item.candidateCount} forrásrekord ebben a bizonyítékcsomagban</p>
                    </div>
                    <div className="import-work-package-states" aria-label="Csomagállapotok">
                      {item.states.map((state) => {
                        const meta = IMPORT_INBOX_STATE_META[state];
                        return (
                          <span
                            className={`import-inbox-state import-inbox-state-${meta.tone}`}
                            title={meta.hint}
                            key={state}
                          >
                            {meta.label}
                          </span>
                        );
                      })}
                    </div>
                  </header>

                  <div className="import-work-package-body">
                    <dl className="import-work-package-counts">
                      <div>
                        <dt>Előkészített</dt>
                        <dd>{item.readyCount}</dd>
                      </div>
                      <div>
                        <dt>Ellenőrzendő</dt>
                        <dd>{item.reviewCount}</dd>
                      </div>
                      <div>
                        <dt>Blokkolt</dt>
                        <dd>{item.blockedCount}</dd>
                      </div>
                    </dl>

                    <section className="import-work-package-sources" aria-label={`${workNumberLabel} forrásai`}>
                      <h3>Források</h3>
                      <ul>
                        {item.sourcePaths.slice(0, 3).map((path) => <li key={path}>{path}</li>)}
                      </ul>
                      {item.sourcePaths.length > 3 && <small>+ {item.sourcePaths.length - 3} további forrás</small>}
                    </section>

                    <dl className="import-work-package-provenance">
                      <div>
                        <dt>Mappingprofil</dt>
                        <dd>{item.profileVersion}</dd>
                      </div>
                      <div>
                        <dt>Forrás-fingerprint</dt>
                        <dd><code>{item.sourceFingerprint.slice(0, 16)}…</code></dd>
                      </div>
                      <div>
                        <dt>Cél</dt>
                        <dd><code>{item.targetSchema}</code></dd>
                      </div>
                    </dl>
                  </div>

                  <footer>
                    <Link
                      className="import-work-package-primary"
                      to={`/imports/${encodeURIComponent(item.importRunId)}/${encodeURIComponent(item.workNumber)}${pageContext}`}
                    >
                      Bizonyítékcsomag megnyitása
                    </Link>
                    <Link
                      className="import-work-package-secondary"
                      to={`/imports/${encodeURIComponent(item.importRunId)}${pageContext}`}
                    >
                      Teljes importfutás
                    </Link>
                  </footer>
                </article>
              );
            })}
          </section>
        )}

        {!isLoading && !isError && data && data.total > 0 && (
          <nav className="import-inbox-pagination" aria-label="Import Inbox lapozás">
            <button type="button" onClick={() => goToPage(Math.max(1, page - 1))} disabled={page <= 1 || isFetching}>
              ← Előző
            </button>
            <span>
              <strong>{data.page} / {pageCount}</strong>
              <small>{data.total} munkaszámcsomag</small>
            </span>
            <button type="button" onClick={() => goToPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount || isFetching}>
              Következő →
            </button>
          </nav>
        )}
      </div>
    </main>
  );
}
