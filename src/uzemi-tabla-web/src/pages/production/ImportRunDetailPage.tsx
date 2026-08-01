import { Link, useParams, useSearchParams } from "react-router-dom";
import { ManufacturedItemImportGate } from "@/components/orders/ManufacturedItemImportGate";
import { parseImportInboxPage } from "@/lib/importInbox";
import { useImportRunEvidence } from "@/services/production/hooks";
import type { ImportCandidate, OrderDeadlineObservation } from "@/services/production/types";

const candidateStatus = { READY: "Review után kijelölhető", REVIEW: "Ellenőrzendő", BLOCKED: "Blokkolt", APPLIED: "Teszt-DRAFT-ban rögzítve", SKIPPED: "Kihagyva" } as const;
const deadlineKind = { CONTRACTUAL: "Vállalt határidő", PLANNED_INSTALL: "Tervezett beépítés", PRODUCTION_END: "Gyártás vége", NOTE: "Megjegyzés" } as const;
const reviewState = { UNVERIFIED: "Ellenőrizetlen", REVIEW: "Ellenőrzendő", RESOLVED: "Feloldva", REJECTED: "Elutasítva" } as const;

function locator(item: Pick<ImportCandidate, "relativePath" | "sheet" | "page" | "row"> | Pick<OrderDeadlineObservation, "relativePath" | "sheet" | "page" | "row">) {
  return [item.relativePath, item.sheet, item.page ? `${item.page}. oldal` : null, item.row ? `${item.row}. sor` : null].filter(Boolean).join(" · ");
}

function payloadSummary(payload: Record<string, unknown>) {
  return Object.entries(payload).slice(0, 8).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ");
}

/** Read-only drill-down for the deterministic preview. It exposes evidence
 * and conflicts but deliberately offers no production target or accept-all. */
export function ImportRunDetailPage() {
  const { importRunId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const inboxPage = parseImportInboxPage(searchParams.get("page"));
  const inboxHref = inboxPage > 1 ? `/imports?page=${inboxPage}` : "/imports";
  const { data, isLoading, isError } = useImportRunEvidence(importRunId);
  if (isLoading) return <main className="orders-page"><div className="orders-content"><div className="orders-state">Importbizonyíték betöltése…</div></div></main>;
  if (isError || !data) return <main className="orders-page"><div className="orders-content"><div className="orders-state">Az importfutás nem érhető el.</div></div></main>;
  const run = data.importRun;
  const ready = data.candidates.filter((item) => item.status === "READY").length;
  const review = data.candidates.filter((item) => item.status === "REVIEW").length;
  const blocked = data.candidates.filter((item) => item.status === "BLOCKED").length;

  return <main className="orders-page"><div className="orders-content">
    <div className="order-intake-breadcrumb"><Link to={inboxHref}>Import Inbox</Link> / Bizonyíték</div>
    <header className="orders-hero"><div><p>{run.status} / {run.targetSchema}</p><h1>Importfutás részletei</h1><span>{run.previewArtifact}</span></div><Link className="doorstar-home-primary-action" to={inboxHref}>Vissza az Inboxhoz</Link></header>
    <section className="import-safety-banner" aria-label="Review határ"><strong>Bizonyíték-alapú review</strong><span>A <code>READY</code> csak azt jelenti, hogy a jelölt kijelölhető a teszt-DRAFT kapujában. Nem jelent műszaki jóváhagyást, kiadást vagy éles importot.</span></section>
    <section className="import-run-summary">
      <div><span>Mapping</span><strong>{run.profileVersion}</strong></div>
      <div><span>Betölthető</span><strong>{ready}</strong></div>
      <div><span>Ellenőrzendő</span><strong>{review}</strong></div>
      <div><span>Blokkolt</span><strong>{blocked}</strong></div>
      <div><span>Határidő-megfigyelés</span><strong>{data.deadlineObservations.length}</strong></div>
    </section>
    <ManufacturedItemImportGate importRunId={importRunId} sourceFingerprint={run.sourceFingerprint} candidates={data.candidates} targetRevisions={data.targetRevisions} />
    <section className="import-evidence-section">
      <header><div><span>Kereshető előnézet</span><h2>Importjelöltek</h2><p>A normalizált értékek még nem jóváhagyott gyártási adatok.</p></div><code>{run.sourceFingerprint.slice(0, 16)}…</code></header>
      {data.candidates.length === 0 ? <p className="import-evidence-empty">Nincs soronként rögzített importjelölt.</p> : <div className="import-candidate-list">{data.candidates.map((item) => <article key={item.id}>
        <div className="import-candidate-head"><b>{item.workNumber ?? "Munkaszám nélkül"}</b><span>{item.recordType}</span><i className={`import-state import-state-${item.status.toLowerCase()}`}>{candidateStatus[item.status]}</i></div>
        <p>{payloadSummary(item.normalizedPayload)}</p><code>{locator(item)}</code>
        {item.errors.length > 0 && <ul>{item.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
        {item.manufacturedItem && <Link to={`/orders/${encodeURIComponent(item.manufacturedItem.orderRevision.order.project.key)}`}>{item.manufacturedItem.kind} · {item.manufacturedItem.code} · {item.manufacturedItem.state} →</Link>}
      </article>)}</div>}
    </section>
    <section className="import-evidence-section">
      <header><div><span>Ütemterv összevetés</span><h2>Határidő-megfigyelések</h2><p>Egy megfigyelés sem írja felül automatikusan a rendelés vállalt határidejét.</p></div></header>
      {data.deadlineObservations.length === 0 ? <p className="import-evidence-empty">Nincs rögzített határidő-megfigyelés.</p> : <div className="deadline-observation-list">{data.deadlineObservations.map((item) => <article key={item.id}>
        <div><b>{deadlineKind[item.kind]}</b><span>{item.workNumber}</span><i className={`import-state import-state-${item.reviewState.toLowerCase()}`}>{reviewState[item.reviewState]}</i></div>
        <strong>{item.rawValue}</strong><span>{item.normalizedDate ? new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium" }).format(new Date(item.normalizedDate)) : "Nincs normalizált dátum"}</span>
        <code>{locator(item)}</code>{item.resolution && <p>{item.resolution}</p>}
      </article>)}</div>}
    </section>
  </div></main>;
}
