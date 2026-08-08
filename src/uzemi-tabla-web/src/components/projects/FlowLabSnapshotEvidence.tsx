import {
  flowLabOperationLabel,
  flowLabSnapshotStateLabel,
  type FlowLabPlanOperationRead,
  type FlowLabPlanSnapshotRead,
} from "@/lib/flowLab";

function formatDateTime(value: string | null): string {
  if (!value) return "Nincs rögzítve";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Nem értelmezhető időbélyeg"
    : new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits }).format(value);
}

function operationTypeLabel(operationType: FlowLabPlanOperationRead["operationType"]) {
  return operationType === "Summary" ? "Összegző kapu" : "Munkalépés";
}

function Predecessors({ operation }: { operation: FlowLabPlanOperationRead }) {
  if (!operation.predecessors.length) return <p className="flow-lab-empty-inline">Nincs előd-függőség.</p>;
  return <ul className="flow-lab-predecessors" aria-label={`${operation.correlationKey} előd-függőségei`}>
    {operation.predecessors.map((predecessor) => <li key={`${predecessor.correlationKey}:${predecessor.type}:${predecessor.lagMinutes}`}>
      <code>{predecessor.correlationKey}</code>
      <span>{predecessor.type} · {predecessor.lagMinutes} perc késleltetés</span>
      {predecessor.partialRelease && <span>Részleges kiadás: {predecessor.partialRelease}</span>}
    </li>)}
  </ul>;
}

function ImmutablePlanGraph({ snapshot }: { snapshot: FlowLabPlanSnapshotRead }) {
  const summaryCount = snapshot.operations.filter((operation) => operation.operationType === "Summary").length;
  return <section className="flow-lab-section" aria-labelledby="flow-lab-plan-graph-heading">
    <header className="flow-lab-section-heading">
      <div>
        <span>Immuntábilis tervgráf</span>
        <h3 id="flow-lab-plan-graph-heading">Relatív sorrend és elődök</h3>
        <p>{snapshot.operations.length} művelet, ebből {summaryCount} összegző kapu. A tábla nem számol új tervet és nem lapítja a gráfot Task-lánccá.</p>
      </div>
    </header>

    {!snapshot.operations.length ? <p className="flow-lab-empty-state">Az importált snapshot nem tartalmaz megjeleníthető műveletet.</p> : <ol className="flow-lab-plan-graph">
      {snapshot.operations.map((operation) => <li key={operation.id} className={operation.operationType === "Summary" ? "is-summary" : undefined}>
        <header>
          <span className="flow-lab-relative-position">#{operation.relativePosition}</span>
          <div>
            <h4>{flowLabOperationLabel(operation)}</h4>
            <p><code>{operation.correlationKey}</code></p>
          </div>
          <b>{operationTypeLabel(operation.operationType)}</b>
        </header>
        <dl>
          <div><dt>Állomás</dt><dd>{operation.station ?? "Nincs állomáshoz kötve"}</dd></div>
          <div><dt>Átvett mennyiség</dt><dd>{formatNumber(operation.boardProjection.quantity)} {operation.quantityUnit ?? "egység"}</dd></div>
          <div><dt>Átvett egységóra</dt><dd>{formatNumber(operation.boardProjection.unitHours, 4)} óra/egység</dd></div>
          <div><dt>Forrásművelet</dt><dd>{operation.sourceOperationKey ?? "A read model nem adta át"}</dd></div>
        </dl>
        <div className="flow-lab-predecessor-block">
          <strong>Elődök</strong>
          <Predecessors operation={operation} />
        </div>
      </li>)}
    </ol>}
  </section>;
}

function ReadinessPanel({ snapshot }: { snapshot: FlowLabPlanSnapshotRead }) {
  const { readiness } = snapshot;
  return <section className={`flow-lab-readiness ${readiness.ready ? "is-ready" : "is-blocked"}`} aria-labelledby="flow-lab-readiness-heading">
    <div>
      <span>Readiness</span>
      <h3 id="flow-lab-readiness-heading">{readiness.ready ? "A szerver szerint ellenőrizhető" : "A szerver blokkolót jelez"}</h3>
      <p>{readiness.ready
        ? "A snapshot evidence-e olvasható. Ez nem üzemi kiadás és nem ad írási jogosultságot."
        : "Az alábbi szerveroldali blokkolók miatt ez a snapshot nem tekinthető továbbvihetőnek."}</p>
    </div>
    {readiness.blockers.length ? <ul>
      {readiness.blockers.map((blocker) => <li key={`${blocker.code}:${blocker.entityId ?? ""}`}>
        <code>{blocker.code}</code><span>{blocker.message}</span>
      </li>)}
    </ul> : <p className="flow-lab-empty-inline">Nincs olvasható blokkoló.</p>}
    {readiness.allowedActions.length > 0 && <p className="flow-lab-readonly-boundary">A szerver lehetséges további workflow-műveleteket ismer, de ebben a csak olvasható munkatérben nincs ilyen vezérlő.</p>}
  </section>;
}

function ArtifactEvidence({ snapshot }: { snapshot: FlowLabPlanSnapshotRead }) {
  const evidence = snapshot.evidence;
  return <section className="flow-lab-section" aria-labelledby="flow-lab-artifact-evidence-heading">
    <header className="flow-lab-section-heading">
      <div>
        <span>Artifact evidence</span>
        <h3 id="flow-lab-artifact-evidence-heading">Találatok, feloldatlan elemek és tudatosan hiányzó adatok</h3>
      </div>
    </header>
    <>
      <p className="flow-lab-artifact-authority">Production authority: nincs — a Flow Lab terv-evidence nem üzemi kiadási authority.</p>
      <div className="flow-lab-evidence-grid">
        <article>
          <h4>Találatok</h4>
          {evidence.findings.length ? <ul>{evidence.findings.map((finding) => <li key={finding.code}><code>{finding.code}</code><span>{finding.severity} · {finding.count} db</span></li>)}</ul> : <p>Nincs rögzített finding.</p>}
        </article>
        <article>
          <h4>Feloldatlan elemek</h4>
          {evidence.unresolved.length ? <ul>{evidence.unresolved.map((entry) => <li key={`${entry.code}:${entry.field}`}><code>{entry.code}</code><span>{entry.field} · {entry.count} db</span></li>)}</ul> : <p>Nincs rögzített feloldatlan elem.</p>}
        </article>
        <article>
          <h4>Tudatosan hiányzó tagok</h4>
          {evidence.absentMembers.length ? <ul>{evidence.absentMembers.map((member) => <li key={member.name}><code>{member.name}</code><span>{member.reason}</span></li>)}</ul> : <p>Nincs rögzített hiányzó tag.</p>}
        </article>
      </div>
    </>
  </section>;
}

/** Detailed, immutable snapshot evidence. It deliberately has no command
 * handlers: the review and materialization policy boundary is server-owned. */
export function FlowLabSnapshotEvidence({ snapshot }: { snapshot: FlowLabPlanSnapshotRead }) {
  const rejected = snapshot.state === "REJECTED";
  return <article className="flow-lab-snapshot-evidence" aria-labelledby="flow-lab-selected-snapshot-heading">
    <header className="flow-lab-snapshot-header">
      <div>
        <span>Flow Lab · csak olvasható snapshot</span>
        <h2 id="flow-lab-selected-snapshot-heading">{snapshot.sourceSetKey}</h2>
        <p>Az importált terv, hash-pinjei és relatív gráfja megőrzött evidence. Itt sem feltöltés, sem review, sem materializálás nem indítható.</p>
      </div>
      <b className={`flow-lab-status is-${snapshot.state.toLowerCase()}`}>{flowLabSnapshotStateLabel(snapshot.state)}</b>
    </header>

    {rejected && <p className="flow-lab-rejected-state" role="status">Ez a snapshot elutasított. A rögzített evidence továbbra is megtekinthető, de nem írható felül vagy indítható belőle művelet.</p>}

    <section className="flow-lab-section" aria-labelledby="flow-lab-audit-heading">
      <header className="flow-lab-section-heading"><div><span>Snapshot audit</span><h3 id="flow-lab-audit-heading">Kötés, létrehozás és független felülvizsgálat</h3></div></header>
      <dl className="flow-lab-metadata-grid">
        <div><dt>Snapshot azonosító</dt><dd><code>{snapshot.id}</code></dd></div>
        <div><dt>Forráskészlet</dt><dd><code>{snapshot.sourceSetKey}</code></dd></div>
        <div><dt>Materialization key</dt><dd><code>{snapshot.materializationKey}</code></dd></div>
        <div><dt>Rendelési revízió</dt><dd><code>{snapshot.orderRevisionId}</code></dd></div>
        <div><dt>Komponenssnapshot</dt><dd><code>{snapshot.componentSnapshotId}</code></dd></div>
        <div><dt>Létrehozva</dt><dd>{formatDateTime(snapshot.createdAt)}</dd></div>
        <div><dt>Létrehozó audit</dt><dd>{snapshot.createdByRole} · {snapshot.createdByPrincipal}</dd></div>
        <div><dt>Reviewer audit</dt><dd>{snapshot.reviewedByRole ?? "Nincs reviewer"} · {snapshot.reviewedByPrincipal ?? "Nincs reviewer"}</dd></div>
        <div><dt>Felülvizsgálat ideje</dt><dd>{formatDateTime(snapshot.reviewedAt)}</dd></div>
        <div><dt>Felülvizsgálati indok</dt><dd>{snapshot.reviewResolution ?? snapshot.reviewNote ?? "Nincs rögzítve"}</dd></div>
      </dl>
      <details className="flow-lab-hash-details">
        <summary>Hash-ek és Doorstar-kötések megjelenítése</summary>
        <dl className="flow-lab-hash-grid">
          <div><dt>Katalógus revízió</dt><dd><code>{snapshot.pins.catalogRevision}</code></dd></div>
          <div><dt>Katalógus hash</dt><dd><code>{snapshot.pins.catalogHash}</code></dd></div>
          <div><dt>Terv hash</dt><dd><code>{snapshot.pins.planHash}</code></dd></div>
          <div><dt>Engine identity</dt><dd><code>{snapshot.pins.engineIdentity}</code></dd></div>
          <div><dt>Generátorprofil</dt><dd><code>{snapshot.generatorProfileVersion}</code></dd></div>
          <div><dt>Generátor fingerprint</dt><dd><code>{snapshot.generatorProfileFingerprint}</code></dd></div>
          <div><dt>Standard katalógus</dt><dd><code>{snapshot.standardCatalogVersion}</code></dd></div>
          <div><dt>Standard katalógus hash</dt><dd><code>{snapshot.standardCatalogFingerprint}</code></dd></div>
          <div><dt>Rendelési hash</dt><dd><code>{snapshot.orderContentHash}</code></dd></div>
          <div><dt>Komponens hash</dt><dd><code>{snapshot.componentOutputHash}</code></dd></div>
          <div><dt>Input hash</dt><dd><code>{snapshot.inputHash}</code></dd></div>
          <div><dt>Output hash</dt><dd><code>{snapshot.outputHash}</code></dd></div>
          <div><dt>Mapping verzió</dt><dd><code>{snapshot.resourceMappingVersion}</code></dd></div>
          <div><dt>Mapping hash</dt><dd><code>{snapshot.resourceMappingFingerprint}</code></dd></div>
        </dl>
      </details>
    </section>

    <ReadinessPanel snapshot={snapshot} />
    <ArtifactEvidence snapshot={snapshot} />
    <ImmutablePlanGraph snapshot={snapshot} />
  </article>;
}
