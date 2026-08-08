import type { ReactNode } from "react";
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
  return operationType === "Summary" ? "Ellenőrző pont" : "Munkalépés";
}

function displayOperationLabel(operation: FlowLabPlanOperationRead) {
  const humanName = operation.workflowGroup?.trim();
  if (humanName) return humanName.replace(/^Szintetikus\s+/iu, "");
  return operation.operationType === "Summary" ? "Megnevezetlen ellenőrző pont" : "Megnevezetlen munkalépés";
}

function blockerLabel(code: string): string {
  return {
    flow_lab_snapshot_payload_invalid: "A terv adatait újra ellenőrizni kell.",
    flow_lab_snapshot_production_authority_invalid: "A terv jóváhagyási adata nem megfelelő.",
    flow_lab_resource_mapping_stale: "Az állomások beállítása megváltozott. A tervet újra kell ellenőrizni.",
    flow_lab_plan_snapshot_not_verified: "A terv még nem kapott független ellenőrzést.",
    flow_lab_binding_authority_not_current: "A terv már nem a jelenlegi rendelési adatokhoz tartozik.",
    flow_lab_binding_authority_unavailable: "A tervhez tartozó rendelési adat most nem érhető el.",
  }[code] ?? "A tervhez tartozó egyik ellenőrzés még nem teljes. A részleteket a technikai adatoknál találja.";
}

function predecessorInstruction(
  predecessor: FlowLabPlanOperationRead["predecessors"][number],
  predecessorName: string,
): string {
  const wait = predecessor.lagMinutes > 0 ? ` ${predecessor.lagMinutes} perc várakozással` : "";
  const rule = {
    FS: `${predecessorName} befejezése után${wait} kezdhető.`,
    SS: `${predecessorName} indítása után${wait} kezdhető.`,
    FF: `Befejezése ${predecessorName} befejezéséhez igazodik${wait}.`,
    SF: `Befejezése ${predecessorName} indításához igazodik${wait}.`,
  }[predecessor.type];
  return predecessor.partialRelease ? `${rule} Részleges elkészülésnél is indítható.` : rule;
}

function planStatus(snapshot: FlowLabPlanSnapshotRead) {
  if (snapshot.state === "REJECTED") {
    return {
      heading: "Ez a tervverzió nem használható",
      description: "A tervet nem fogadták el. Meg lehet nézni, de ebből nem indulhat gyártási művelet.",
    };
  }
  if (snapshot.state === "VERIFIED" && snapshot.readiness.ready) {
    return {
      heading: "Ellenőrzött és használható",
      description: "A tervet ellenőrizték. Az üzemi táblára való átadás állapotát lent külön látja. Ezen az oldalon csak olvasni lehet az adatokat.",
    };
  }
  if (snapshot.state === "REVIEW") {
    return {
      heading: snapshot.readiness.ready ? "Még ellenőrzésre vár" : "Még nem használható",
      description: snapshot.readiness.ready
        ? "A terv adatai megvannak, de az ellenőrzés még nem ért véget."
        : "A terv használata előtt még rendezni kell az alábbi akadályokat.",
    };
  }
  return {
    heading: "Még nem használható",
    description: "A terv használata előtt még rendezni kell az alábbi akadályokat.",
  };
}

function Predecessors({
  operation,
  operationByCorrelationKey,
}: {
  operation: FlowLabPlanOperationRead;
  operationByCorrelationKey: Map<string, FlowLabPlanOperationRead>;
}) {
  if (!operation.predecessors.length) return <p className="flow-lab-empty-inline">Ez az első lépés.</p>;
  return <ul className="flow-lab-predecessors" aria-label={`${displayOperationLabel(operation)} előző lépései`}>
    {operation.predecessors.map((predecessor) => {
      const precedingOperation = operationByCorrelationKey.get(predecessor.correlationKey);
      const precedingName = precedingOperation ? displayOperationLabel(precedingOperation) : "Korábbi munkalépés";
      return <li key={`${predecessor.correlationKey}:${predecessor.type}:${predecessor.lagMinutes}`}>
        {predecessorInstruction(predecessor, precedingName)}
      </li>;
    })}
  </ul>;
}

function TechnicalDetails({ snapshot }: { snapshot: FlowLabPlanSnapshotRead }) {
  const evidence = snapshot.evidence;
  return <details className="flow-lab-technical-details">
    <summary>Technikai ellenőrzési adatok</summary>

    <section>
      <h4>A tervverzió belső azonosítói és ellenőrzése</h4>
      <dl className="flow-lab-metadata-grid">
        <div><dt>Tervverzió azonosító</dt><dd><code>{snapshot.id}</code></dd></div>
        <div><dt>Forráskészlet</dt><dd><code>{snapshot.sourceSetKey}</code></dd></div>
        <div><dt>Átvételi kulcs</dt><dd><code>{snapshot.materializationKey}</code></dd></div>
        <div><dt>Rendelési revízió</dt><dd><code>{snapshot.orderRevisionId}</code></dd></div>
        <div><dt>Komponensváltozat</dt><dd><code>{snapshot.componentSnapshotId}</code></dd></div>
        <div><dt>Létrehozva</dt><dd>{formatDateTime(snapshot.createdAt)}</dd></div>
        <div><dt>Létrehozó belső azonosítója</dt><dd>{snapshot.createdByRole} · {snapshot.createdByPrincipal}</dd></div>
        <div><dt>Ellenőrző belső azonosítója</dt><dd>{snapshot.reviewedByRole ?? "Nincs rögzítve"} · {snapshot.reviewedByPrincipal ?? "Nincs rögzítve"}</dd></div>
        <div><dt>Ellenőrzés ideje</dt><dd>{formatDateTime(snapshot.reviewedAt)}</dd></div>
        <div><dt>Ellenőrzési megjegyzés</dt><dd>{snapshot.reviewResolution ?? snapshot.reviewNote ?? "Nincs rögzítve"}</dd></div>
        <div><dt>Engedélyezett rendszerlépések</dt><dd>{snapshot.readiness.allowedActions.join(", ") || "Nincs"}</dd></div>
      </dl>
    </section>

    <section>
      <h4>Ellenőrzési jelzések</h4>
      <div className="flow-lab-evidence-grid">
        <article>
          <h5>Találatok</h5>
          {evidence.findings.length ? <ul>{evidence.findings.map((finding) => <li key={finding.code}><code>{finding.code}</code><span>{finding.severity} · {finding.count} db</span></li>)}</ul> : <p>Nincs rögzített jelzés.</p>}
        </article>
        <article>
          <h5>Nyitott ellenőrzések</h5>
          {evidence.unresolved.length ? <ul>{evidence.unresolved.map((entry) => <li key={`${entry.code}:${entry.field}`}><code>{entry.code}</code><span>{entry.field} · {entry.count} db</span></li>)}</ul> : <p>Nincs rögzített nyitott ellenőrzés.</p>}
        </article>
        <article>
          <h5>Nem kapott adatok</h5>
          {evidence.absentMembers.length ? <ul>{evidence.absentMembers.map((member) => <li key={member.name}><code>{member.name}</code><span>{member.reason}</span></li>)}</ul> : <p>Nincs rögzített hiányzó adat.</p>}
        </article>
      </div>
      {snapshot.readiness.blockers.length > 0 && <dl className="flow-lab-technical-blockers">
        {snapshot.readiness.blockers.map((blocker) => <div key={`${blocker.code}:${blocker.entityId ?? ""}`}>
          <dt>{blocker.code}</dt><dd>{blocker.message}</dd><dd>{blocker.entityId ?? "Nincs belső azonosító"}</dd>
        </div>)}
      </dl>}
    </section>

    <section>
      <h4>Lépések belső kapcsolatai</h4>
      <ol className="flow-lab-technical-operation-list">
        {snapshot.operations.map((operation) => <li key={operation.id}>
          <strong>{flowLabOperationLabel(operation)}</strong>
          <dl>
            <div><dt>Lépésazonosító</dt><dd><code>{operation.id}</code></dd></div>
            <div><dt>Korrelációs azonosító</dt><dd><code>{operation.correlationKey}</code></dd></div>
            <div><dt>Forrásművelet</dt><dd><code>{operation.sourceOperationKey ?? "Nincs"}</code></dd></div>
            <div><dt>Sorrendi hely</dt><dd>{operation.relativePosition}</dd></div>
          </dl>
          {operation.predecessors.length > 0 && <ul>
            {operation.predecessors.map((predecessor) => <li key={`${predecessor.correlationKey}:${predecessor.type}:${predecessor.lagMinutes}`}>
              <code>{predecessor.correlationKey}</code><span>{predecessor.type} · {predecessor.lagMinutes} perc · részleges kiadás: {predecessor.partialRelease ?? "nincs"}</span>
            </li>)}
          </ul>}
        </li>)}
      </ol>
    </section>

    <section>
      <h4>Rendszerlenyomatok</h4>
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
    </section>
  </details>;
}

function ImmutablePlanGraph({ snapshot }: { snapshot: FlowLabPlanSnapshotRead }) {
  const summaryCount = snapshot.operations.filter((operation) => operation.operationType === "Summary").length;
  const operationByCorrelationKey = new Map(snapshot.operations.map((operation) => [operation.correlationKey, operation]));
  return <section className="flow-lab-section" aria-labelledby="flow-lab-plan-graph-heading">
    <header className="flow-lab-section-heading">
      <div>
        <span>Munkafolyamat</span>
        <h3 id="flow-lab-plan-graph-heading">Munkalépések sorrendben</h3>
        <p>{snapshot.operations.length} lépésből áll a terv, ebből {summaryCount} ellenőrző pont. A sorrend a terv rögzített sorrendje.</p>
      </div>
    </header>

    {!snapshot.operations.length ? <p className="flow-lab-empty-state">Ebben a tervverzióban nincs megjeleníthető munkalépés.</p> : <ol className="flow-lab-plan-graph" aria-label="Munkafolyamat">
      {snapshot.operations.map((operation) => <li key={operation.id} className={operation.operationType === "Summary" ? "is-summary" : undefined}>
        <header>
          <span className="flow-lab-relative-position">{operation.relativePosition}</span>
          <div>
            <h4>{displayOperationLabel(operation)}</h4>
            <p>{operationTypeLabel(operation.operationType)}</p>
          </div>
        </header>
        <dl>
          <div><dt>Állomás</dt><dd>{operation.station ?? "Nincs megadva"}</dd></div>
          <div><dt>Mennyiség</dt><dd>{formatNumber(operation.boardProjection.quantity)} {operation.quantityUnit ?? "egység"}</dd></div>
          <div><dt>Idő / egység</dt><dd>{formatNumber(operation.boardProjection.unitHours, 4)} óra</dd></div>
        </dl>
        <div className="flow-lab-predecessor-block">
          <strong>Előző lépés</strong>
          <Predecessors operation={operation} operationByCorrelationKey={operationByCorrelationKey} />
        </div>
      </li>)}
    </ol>}
  </section>;
}

function ReadinessPanel({ snapshot }: { snapshot: FlowLabPlanSnapshotRead }) {
  const status = planStatus(snapshot);
  const { readiness } = snapshot;
  return <section className={`flow-lab-readiness ${readiness.ready ? "is-ready" : "is-blocked"}`} aria-labelledby="flow-lab-readiness-heading">
    <div>
      <span>Terv állapota</span>
      <h3 id="flow-lab-readiness-heading">{status.heading}</h3>
      <p>{status.description}</p>
    </div>
    {readiness.blockers.length ? <ul aria-label="Akadályok">
      {readiness.blockers.map((blocker) => <li key={`${blocker.code}:${blocker.entityId ?? ""}`}><span>{blockerLabel(blocker.code)}</span></li>)}
    </ul> : <p className="flow-lab-empty-inline">Nincs akadály, amit rendezni kellene.</p>}
  </section>;
}

/** This reader intentionally accepts only GET read models. It contains no
 * mutation handlers; the technical data is available only when expanded. */
export function FlowLabSnapshotEvidence({
  snapshot,
  children,
}: {
  snapshot: FlowLabPlanSnapshotRead;
  children?: ReactNode;
}) {
  const rejected = snapshot.state === "REJECTED";
  return <article className="flow-lab-snapshot-evidence" aria-labelledby="flow-lab-selected-snapshot-heading">
    <header className="flow-lab-snapshot-header">
      <div>
        <span>Gyártási munkaterv</span>
        <h2 id="flow-lab-selected-snapshot-heading">A kiválasztott tervverzió</h2>
        <p>A terv azt mutatja meg, milyen sorrendben kell a munkalépéseknek következniük. Az oldal csak megtekintésre szolgál.</p>
      </div>
      <b className={`flow-lab-status is-${snapshot.state.toLowerCase()}`}>{flowLabSnapshotStateLabel(snapshot.state)}</b>
    </header>

    {rejected && <p className="flow-lab-rejected-state" role="status">Ezt a tervverziót nem fogadták el. Megnézheti, de ebből nem indulhat gyártási művelet.</p>}

    <ReadinessPanel snapshot={snapshot} />
    {children}
    <ImmutablePlanGraph snapshot={snapshot} />
    <TechnicalDetails snapshot={snapshot} />
  </article>;
}
