import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  buildOperationWorkspaceReadiness,
  groupComponentRequirements,
  operationFieldDefinitions,
  type OperationFieldDefinition,
} from "@/lib/operationWorkspace";
import { componentWorkspacePath } from "@/lib/componentWorkspaceRoute";
import {
  useComponentCalculatorProfiles,
  useComponentSnapshots,
  useOperationPlanSnapshots,
  useProductionOrder,
  useProject,
} from "@/services/production/hooks";
import type {
  ComponentRequirement,
  ComponentSnapshot,
  EpicStep,
  OperationCandidate,
  OperationPlanSnapshot,
} from "@/services/production/types";
import "./OperationWorkspacePage.css";

const fieldGroupLabel: Record<OperationFieldDefinition["group"], string> = {
  ROUTE: "Útvonal",
  RESOURCE: "Erőforrás",
  TIME: "Idő",
  CONTROL: "Utasítás és minőségterv",
};

function shortHash(value: string | null) {
  if (!value) return "—";
  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
}

function dimensions(requirement: ComponentRequirement, prefix: "finished" | "cutting") {
  const values = prefix === "finished"
    ? [requirement.finishedWidthMm, requirement.finishedHeightMm, requirement.finishedThicknessMm]
    : [requirement.cuttingWidthMm, requirement.cuttingHeightMm, requirement.cuttingThicknessMm];
  const [width, height, thickness] = values.map((value) => value == null ? "—" : value.toLocaleString("hu-HU"));
  return `Sz ${width} × M ${height} × V ${thickness} mm`;
}

function legacyStepFacts(step: EpicStep) {
  const facts = [
    step.station ? `állomás: ${step.station}` : "állomás nélkül",
    step.quantity == null ? "mennyiség nélkül" : `${step.quantity.toLocaleString("hu-HU")} egység`,
    step.unitHours == null ? "kézi idő nélkül" : `${step.unitHours.toLocaleString("hu-HU")} óra/egység`,
    step.planDate ? new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium" }).format(new Date(step.planDate)) : "nap nélkül",
  ];
  return facts.join(" · ");
}

const processKindLabel: Record<OperationCandidate["processKind"], string> = {
  TECHNOLOGICAL: "Technológiai",
  NON_TECHNOLOGICAL: "Nem technológiai",
  NATURAL: "Természeti folyamat",
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Érvénytelen időbélyeg"
    : new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function operationTimeFacts(operation: OperationCandidate) {
  return [
    operation.setupMinutesPerBatch == null ? null : `beállítás ${operation.setupMinutesPerBatch} perc/tétel`,
    operation.cycleMinutesPerUnit == null ? null : `darabidő ${operation.cycleMinutesPerUnit} perc/${operation.quantityUnit}`,
    operation.nonTechnologicalMinutes == null ? null : `nem technológiai idő ${operation.nonTechnologicalMinutes} perc`,
    operation.plannedNaturalHoldMinutes == null ? null : `természeti folyamat ${operation.plannedNaturalHoldMinutes} perc`,
  ].filter((value): value is string => value != null).join(" · ") || "Nincs rögzített időadat";
}

function snapshotHasExactLineage(
  snapshot: OperationPlanSnapshot,
  revisionId: string,
  approvalHash: string | null,
  componentSnapshots: ComponentSnapshot[],
) {
  const source = componentSnapshots.find((component) => component.id === snapshot.componentSnapshotId);
  return snapshot.orderRevisionId === revisionId
    && !!approvalHash
    && snapshot.orderContentHash === approvalHash
    && source?.state === "VERIFIED"
    && source.outputHash === snapshot.componentOutputHash
    && snapshot.operations.every((operation) => operation.sourceComponentRequirementIds.length > 0);
}

/** Read-only exact-revision OperationPlan projection. The browser displays
 * stored server rows but never generates, schedules, reviews or issues them. */
export function OperationWorkspacePage() {
  const { projectKey = "", revision: revisionParam = "" } = useParams();
  const revisionNumber = Number(revisionParam);
  const validRevisionNumber = Number.isInteger(revisionNumber) && revisionNumber > 0 ? revisionNumber : undefined;
  const orderQuery = useProductionOrder(projectKey);
  const profilesQuery = useComponentCalculatorProfiles();
  const snapshotsQuery = useComponentSnapshots(projectKey, validRevisionNumber);
  const operationPlansQuery = useOperationPlanSnapshots(projectKey, validRevisionNumber);
  const projectQuery = useProject(projectKey);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [selectedRequirementId, setSelectedRequirementId] = useState("");
  const [selectedOperationPlanId, setSelectedOperationPlanId] = useState("");

  const order = orderQuery.data;
  const revision = order?.revisions.find((item) => item.revision === validRevisionNumber);
  const latestRevision = order?.revisions.length
    ? order.revisions.reduce(
        (latest, item) => item.revision > latest.revision ? item : latest,
        order.revisions[0]!,
      )
    : undefined;
  const dependenciesState = profilesQuery.isLoading
    || profilesQuery.isFetching
    || snapshotsQuery.isLoading
    || snapshotsQuery.isFetching
    ? "PENDING"
    : profilesQuery.isError || snapshotsQuery.isError
      ? "ERROR"
      : "READY";
  const readiness = revision && latestRevision
    ? buildOperationWorkspaceReadiness({
        revision,
        latestRevisionId: latestRevision.id,
        profiles: profilesQuery.data ?? null,
        snapshots: snapshotsQuery.data ?? [],
        dependenciesState,
      })
    : null;
  const approvalHash = readiness?.approvalHash ?? null;
  const operationAuthorityPending = operationPlansQuery.isLoading
    || operationPlansQuery.isFetching
    || profilesQuery.isLoading
    || profilesQuery.isFetching
    || snapshotsQuery.isLoading
    || snapshotsQuery.isFetching;
  const operationAuthorityError = operationPlansQuery.isError
    || profilesQuery.isError
    || snapshotsQuery.isError;
  const operationPlanResponseReady = !operationAuthorityPending
    && !operationAuthorityError
    && !!operationPlansQuery.data;
  const exactOperationPlans = operationPlanResponseReady && revision
    ? operationPlansQuery.data.snapshots.filter((snapshot) => snapshotHasExactLineage(
        snapshot,
        revision.id,
        approvalHash,
        snapshotsQuery.data ?? [],
      ))
    : [];

  useEffect(() => {
    if (exactOperationPlans.some((snapshot) => snapshot.id === selectedOperationPlanId)) return;
    const preferred = [...exactOperationPlans].reverse().find(
      (snapshot) => snapshot.state === "VERIFIED" && snapshot.readiness.ready,
    ) ?? exactOperationPlans.at(-1);
    setSelectedOperationPlanId(preferred?.id ?? "");
  }, [exactOperationPlans, selectedOperationPlanId]);

  const selectedOperationPlan = exactOperationPlans.find(
    (snapshot) => snapshot.id === selectedOperationPlanId,
  ) ?? [...exactOperationPlans].reverse().find(
    (snapshot) => snapshot.state === "VERIFIED" && snapshot.readiness.ready,
  ) ?? exactOperationPlans.at(-1) ?? null;
  const operationPlanReady = selectedOperationPlan?.state === "VERIFIED"
    && selectedOperationPlan.readiness.ready
    && selectedOperationPlan.operations.length > 0
    && selectedOperationPlan.operations.every((operation) => operation.state === "READY");
  const orderedOperations = selectedOperationPlan
    ? [...selectedOperationPlan.operations].sort((left, right) => (
        left.sequence - right.sequence || left.id.localeCompare(right.id)
      ))
    : [];
  const revisionSourceReady = (
    revision?.id === latestRevision?.id
    && revision?.status === "APPROVED"
    && !!readiness?.approvalHash
    && /^[a-f0-9]{64}$/i.test(readiness.approvalHash)
  );

  useEffect(() => {
    const options = readiness?.currentVerifiedSnapshots ?? [];
    if (options.some((snapshot) => snapshot.id === selectedSnapshotId)) return;
    setSelectedSnapshotId(options[0]?.id ?? "");
  }, [readiness?.currentVerifiedSnapshots, selectedSnapshotId]);

  const selectedSnapshot = readiness?.currentVerifiedSnapshots.find(
    (snapshot) => snapshot.id === selectedSnapshotId,
  ) ?? readiness?.currentVerifiedSnapshots[0] ?? null;
  const requirementGroups = useMemo(
    () => groupComponentRequirements(selectedSnapshot?.requirements ?? []),
    [selectedSnapshot],
  );

  useEffect(() => {
    const requirements = selectedSnapshot?.requirements ?? [];
    if (requirements.some((requirement) => requirement.id === selectedRequirementId)) return;
    setSelectedRequirementId(requirements[0]?.id ?? "");
  }, [selectedRequirementId, selectedSnapshot]);

  const selectedRequirement = selectedSnapshot?.requirements.find(
    (requirement) => requirement.id === selectedRequirementId,
  ) ?? selectedSnapshot?.requirements[0] ?? null;
  const selectedRequirementOperations = operationPlanReady && selectedRequirement
    ? orderedOperations.filter((operation) => (
        operation.sourceComponentRequirementIds.includes(selectedRequirement.id)
      ))
    : [];
  const fieldGroups = (["ROUTE", "RESOURCE", "TIME", "CONTROL"] as const).map((group) => ({
    group,
    fields: operationFieldDefinitions.filter((field) => field.group === group),
  }));

  if (orderQuery.isLoading) {
    return <main className="operation-workspace-page"><div className="operation-workspace-content"><div className="operation-workspace-state-message">Műveletterv betöltése…</div></div></main>;
  }
  if (orderQuery.isError || !order) {
    return <main className="operation-workspace-page"><div className="operation-workspace-content"><div className="operation-workspace-state-message is-error">A rendelési csomag nem érhető el; a műveletképzés fail-closed marad.</div></div></main>;
  }
  if (!validRevisionNumber || !revision || !latestRevision) {
    return <main className="operation-workspace-page"><div className="operation-workspace-content"><div className="order-intake-breadcrumb"><Link to={`/orders/${encodeURIComponent(projectKey)}`}>Rendelés</Link> / Műveletterv</div><div className="operation-workspace-state-message">A kért rendelési revízió nem található.</div></div></main>;
  }

  return (
    <main className="operation-workspace-page">
      <div className="operation-workspace-content">
        <div className="order-intake-breadcrumb">
          <Link to={`/orders/${encodeURIComponent(projectKey)}`}>Rendelés</Link>
          {" / "}R{String(revision.revision).padStart(2, "0")} / Műveletterv
        </div>

        <header className="operation-workspace-hero">
          <div>
            <p>Gyártás-előkészítés · rögzített rendelési revízió</p>
            <h1>Műveletterv</h1>
            <span>{revision.customerName} · {projectKey} · R{String(revision.revision).padStart(2, "0")}</span>
          </div>
          <div className={`operation-workspace-status is-${operationPlanReady ? "handoff" : "blocked"}`}>
            <span />
            {operationAuthorityError
              ? "Műveletterv-authority nem érhető el"
              : operationAuthorityPending
                ? "Műveletterv-authority ellenőrzése…"
                : operationPlanReady
                  ? `Szerver által ellenőrzött műveletterv · ${selectedOperationPlan.operations.length} sor`
                  : "Műveletterv nincs végleges, használható állapotban"}
          </div>
        </header>

        <section className="operation-boundary-note" aria-label="Műveletterv határa">
          <strong>Technológiai sorrend ≠ ütemezés</strong>
          <span>
            Itt a szerver által rögzített gyártási vagy ellátási út, erőforrás, időforrás, munkautasítás és minőség-ellenőrzési terv olvasható.
            Naptári dátumot, kapacitást vagy üzemi feladatot ez a felület nem számol és nem ad ki.
          </span>
        </section>

        <section className="operation-gate-strip" aria-label="Műveletterv adatkapui">
          <div className={revisionSourceReady ? "is-ready" : "is-blocked"}>
            <span>Rendelési revízió</span>
            <strong>R{String(revision.revision).padStart(2, "0")} · {revision.status}</strong>
            <small>{revision.id !== latestRevision.id
              ? `Újabb: R${String(latestRevision.revision).padStart(2, "0")}`
              : revisionSourceReady
                ? "Legfrissebb · jóváhagyási hash rendben"
                : "Legfrissebb, de még nem jóváhagyott és lezárt"}</small>
          </div>
          <div className={selectedSnapshot ? "is-ready" : "is-blocked"}>
            <span>Alkatrészbemenet</span>
            <strong>{selectedSnapshot ? `${selectedSnapshot.requirements.length} ellenőrzött sor` : "Nincs aktuális snapshot"}</strong>
            <small>{selectedSnapshot?.calculatorProfileVersion ?? "Hash + profil + séma egyezés szükséges"}</small>
          </div>
          <div className={selectedOperationPlan?.readiness.ready ? "is-ready" : "is-blocked"}>
            <span>Műveleti standardok</span>
            <strong>{selectedOperationPlan?.standardCatalogVersion ?? "Nincs szerver-snapshot"}</strong>
            <small>{selectedOperationPlan
              ? `Erőforrástérkép: ${selectedOperationPlan.resourceMappingVersion}`
              : "Verzió és erőforrás-hozzárendelés csak szerverről fogadható el"}</small>
          </div>
          <div className={operationPlanReady ? "is-ready" : "is-blocked"}>
            <span>Műveletterv-rekord</span>
            <strong>{selectedOperationPlan ? `${selectedOperationPlan.state} · ${selectedOperationPlan.operations.length} sor` : "Nincs snapshot"}</strong>
            <small>{operationPlanReady ? "Exact revízió · dinamikus readiness READY" : "Olvasás és lineage-ellenőrzés fail-closed"}</small>
          </div>
        </section>

        <section className="operation-authority-panel" aria-labelledby="operation-authority-title">
          <header>
            <div>
              <span>04 · Szerver-authority</span>
              <h2 id="operation-authority-title">Rögzített műveletterv-snapshot</h2>
              <p>Az itt látható sorokat az exact revíziós backend szolgáltatja. A böngésző nem képez műveletet alkatrésznévből, legacy munkalapból vagy RAG-találatból.</p>
            </div>
            {exactOperationPlans.length > 1 && (
              <label>
                <span>Snapshot kiválasztása</span>
                <select
                  value={selectedOperationPlan?.id ?? ""}
                  onChange={(event) => setSelectedOperationPlanId(event.target.value)}
                >
                  {exactOperationPlans.map((snapshot) => (
                    <option key={snapshot.id} value={snapshot.id}>
                      {snapshot.state} · {snapshot.operations.length} sor · {formatDateTime(snapshot.createdAt)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </header>

          {operationAuthorityPending && (
            <p className="operation-authority-state" role="status">A szerver-authority ellenőrzése folyamatban van; műveleti sor nem használható.</p>
          )}
          {operationAuthorityError && (
            <p className="operation-authority-state is-error" role="alert">A műveletterv-snapshot nem tölthető be. A felület fail-closed marad, és nem mutat helyettesítő műveleteket.</p>
          )}
          {operationPlanResponseReady && operationPlansQuery.data.snapshots.length > 0 && exactOperationPlans.length === 0 && (
            <p className="operation-authority-state is-error" role="alert">A válasz lineage-e nem egyezik az exact rendelési revízió és alkatrészsnapshot aktuális hash-láncával. Műveleti sor nem jeleníthető meg.</p>
          )}
          {operationPlanResponseReady && operationPlansQuery.data.snapshots.length === 0 && (
            <div className="operation-authority-empty">
              <strong>Nincs rögzített műveletterv-snapshot.</strong>
              <span>A backend forráskapuja {operationPlansQuery.data.readiness.ready ? "READY" : "BLOCKED"}; ez önmagában nem hoz létre tervet.</span>
              {operationPlansQuery.data.readiness.blockers.length > 0 && (
                <ul>{operationPlansQuery.data.readiness.blockers.map((blocker) => (
                  <li key={`${blocker.code}:${blocker.entityId ?? "revision"}`}><code>{blocker.code}</code> · {blocker.message}</li>
                ))}</ul>
              )}
            </div>
          )}

          {selectedOperationPlan && (
            <>
              <div className="operation-authority-summary">
                <div>
                  <span>Snapshot állapot</span>
                  <strong>{selectedOperationPlan.state}</strong>
                  <small>{selectedOperationPlan.readiness.ready ? "Dinamikus readiness: READY" : "Dinamikus readiness: BLOCKED"}</small>
                </div>
                <div>
                  <span>Műveleti sorok</span>
                  <strong>{selectedOperationPlan.operations.length}</strong>
                  <small>{selectedOperationPlan.operations.filter((operation) => operation.state === "READY").length} READY</small>
                </div>
                <div>
                  <span>Létrehozta</span>
                  <strong>{selectedOperationPlan.createdByRole}</strong>
                  <small>{formatDateTime(selectedOperationPlan.createdAt)}</small>
                </div>
                <div>
                  <span>Felülvizsgálta</span>
                  <strong>{selectedOperationPlan.reviewedByRole ?? "Nincs végső review"}</strong>
                  <small>{formatDateTime(selectedOperationPlan.reviewedAt)}</small>
                </div>
              </div>

              <details className="operation-authority-audit">
                <summary>Snapshot audit és hash-metaadatok</summary>
                <dl>
                  <div><dt>Snapshot ID</dt><dd><code title={selectedOperationPlan.id}>{selectedOperationPlan.id}</code></dd></div>
                  <div><dt>Komponenssnapshot</dt><dd><code title={selectedOperationPlan.componentSnapshotId}>{selectedOperationPlan.componentSnapshotId}</code></dd></div>
                  <div><dt>Generátorprofil</dt><dd>{selectedOperationPlan.generatorProfileVersion}</dd></div>
                  <div><dt>Snapshot-séma</dt><dd>{selectedOperationPlan.schemaVersion}</dd></div>
                  <div><dt>Standardszabály-katalógus</dt><dd>{selectedOperationPlan.standardCatalogVersion}</dd></div>
                  <div><dt>Erőforrástérkép</dt><dd>{selectedOperationPlan.resourceMappingVersion}</dd></div>
                  <div><dt>Rendelési hash</dt><dd><code title={selectedOperationPlan.orderContentHash}>{shortHash(selectedOperationPlan.orderContentHash)}</code></dd></div>
                  <div><dt>Komponens output hash</dt><dd><code title={selectedOperationPlan.componentOutputHash}>{shortHash(selectedOperationPlan.componentOutputHash)}</code></dd></div>
                  <div><dt>Input hash</dt><dd><code title={selectedOperationPlan.inputHash}>{shortHash(selectedOperationPlan.inputHash)}</code></dd></div>
                  <div><dt>Output hash</dt><dd><code title={selectedOperationPlan.outputHash}>{shortHash(selectedOperationPlan.outputHash)}</code></dd></div>
                  <div><dt>Létrehozó principal</dt><dd><code>{selectedOperationPlan.createdByPrincipal}</code></dd></div>
                  <div><dt>Reviewer principal</dt><dd><code>{selectedOperationPlan.reviewedByPrincipal ?? "—"}</code></dd></div>
                </dl>
                <p><strong>Létrehozási megjegyzés:</strong> {selectedOperationPlan.reviewNote}</p>
                <p><strong>Review döntés:</strong> {selectedOperationPlan.reviewResolution ?? "Nincs végső döntés."}</p>
              </details>

              {!operationPlanReady && (
                <div className="operation-authority-empty is-blocked">
                  <strong>A snapshot nem használható végleges művelettervként.</strong>
                  <span>Csak VERIFIED, dinamikusan READY és kizárólag READY sorokat tartalmazó exact snapshot jelenhet meg művelettervként.</span>
                  {selectedOperationPlan.readiness.blockers.length > 0 && (
                    <ul>{selectedOperationPlan.readiness.blockers.map((blocker) => (
                      <li key={`${blocker.code}:${blocker.entityId ?? "snapshot"}`}><code>{blocker.code}</code> · {blocker.message}</li>
                    ))}</ul>
                  )}
                </div>
              )}

              {operationPlanReady && (
                <ol className="operation-authority-rows" aria-label="Szerver által ellenőrzött műveleti sorok">
                  {orderedOperations.map((operation) => (
                    <li key={operation.id}>
                      <article>
                        <header>
                          <div>
                            <span>{String(operation.sequence).padStart(2, "0")} · {processKindLabel[operation.processKind]}</span>
                            <h3>{operation.operationType}</h3>
                            <p>{operation.workflowGroup} · {operation.quantity.toLocaleString("hu-HU")} {operation.quantityUnit}</p>
                          </div>
                          <strong>{operation.state}</strong>
                        </header>
                        <dl>
                          <div><dt>Standard</dt><dd><code>{operation.standardKey}</code> · {operation.standardVersion}</dd></div>
                          <div><dt>Erőforrás</dt><dd><code>{operation.resourceKey}</code>{operation.machineKey ? ` · gép: ${operation.machineKey}` : ""}</dd></div>
                          <div><dt>Időmodell</dt><dd>{operationTimeFacts(operation)}</dd></div>
                          <div><dt>Létszám</dt><dd>{operation.workforce == null ? "Nincs rögzítve" : `${operation.workforce} fő`}</dd></div>
                          <div><dt>Forrásalkatrészek</dt><dd>{operation.sourceComponentRequirementIds.length} explicit sor</dd></div>
                          <div><dt>Előfeltétel</dt><dd>{operation.dependencies.length === 0
                            ? "Első explicit sor"
                            : operation.dependencies.map((dependency) => `${dependency.predecessorOperationId} · ${dependency.type} · ${dependency.lagMinutes} perc`).join("; ")}</dd></div>
                          <div><dt>Munkautasítás</dt><dd>{operation.workInstruction
                            ? `${operation.workInstruction.documentVersionId} · ${operation.workInstruction.contentCoverage.length} lefedett rész`
                            : "Nincs rögzítve"}</dd></div>
                          <div><dt>Minőségkapuk</dt><dd>{operation.qualityCheckpoints.length} ellenőrzési pont</dd></div>
                          <div><dt>Dokumentumok</dt><dd>{operation.documentReferences.length} explicit hivatkozás</dd></div>
                          <div><dt>Forrás-evidence</dt><dd>{operation.sourceEvidence.length} sor · {operation.sourceEvidence.filter((evidence) => evidence.reviewState === "RESOLVED").length} RESOLVED</dd></div>
                        </dl>
                      </article>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          <aside className="operation-release-boundary">
            <strong>PRODUCTION_RELEASE · NOT_AVAILABLE</strong>
            <span>A VERIFIED műveletterv sem PlanningProposal, sem immutable IssuedWorkPackage, sem üzemi kiadás. A felület nem kínál tervezési, kiadási vagy végrehajtási műveletet.</span>
          </aside>
        </section>

        {readiness && readiness.sourceBlockers.length > 0 && (
          <section className="operation-source-blockers" aria-labelledby="operation-source-blockers-title">
            <div>
              <span>Fail-closed forráskapu</span>
              <h2 id="operation-source-blockers-title">Az alkatrészbemenet még nem használható</h2>
              <p>A központi szerverfunkció később ezeket a feltételeket is ellenőrzi.</p>
            </div>
            <ul>{readiness.sourceBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
            <Link to={componentWorkspacePath(projectKey, revision.revision)}>Kalkulátor és snapshotok megnyitása →</Link>
          </section>
        )}

        {readiness?.sourceReady && selectedSnapshot && (
          <>
            <section className="operation-snapshot-lineage" aria-labelledby="operation-snapshot-title">
              <div>
                <span>01 · Megváltoztathatatlan bemenet</span>
                <h2 id="operation-snapshot-title">Ellenőrzött alkatrészsnapshot</h2>
                <p>Az alábbi forrás csak olvasható. A műveleti tervnek ezt az azonosítót és output hash-t kell majd megőriznie.</p>
              </div>
              {readiness.currentVerifiedSnapshots.length > 1 && (
                <label>
                  <span>Ellenőrzött snapshot</span>
                  <select value={selectedSnapshot.id} onChange={(event) => setSelectedSnapshotId(event.target.value)}>
                    {readiness.currentVerifiedSnapshots.map((snapshot) => (
                      <option value={snapshot.id} key={snapshot.id}>{snapshot.calculatorProfileVersion} · {snapshot.requirements.length} sor</option>
                    ))}
                  </select>
                </label>
              )}
              <dl>
                <div><dt>Rendelési hash</dt><dd><code title={readiness.approvalHash ?? undefined}>{shortHash(readiness.approvalHash)}</code></dd></div>
                <div><dt>Snapshot ID</dt><dd><code title={selectedSnapshot.id}>{shortHash(selectedSnapshot.id)}</code></dd></div>
                <div><dt>Output hash</dt><dd><code title={selectedSnapshot.outputHash}>{shortHash(selectedSnapshot.outputHash)}</code></dd></div>
                <div><dt>Katalógus</dt><dd>{selectedSnapshot.technicalCatalogVersion}</dd></div>
              </dl>
            </section>

            <div className="operation-workspace-grid">
              <aside className="operation-component-browser" aria-labelledby="operation-components-title">
                <header>
                  <span>02 · Forrásalkatrészek</span>
                  <h2 id="operation-components-title">Mely elemekből indulunk?</h2>
                  <p>A csoportosítás kizárólag a snapshot explicit jellegét használja; névből nem következtet ajtószerkezetre.</p>
                </header>
                {requirementGroups.map((group) => (
                  <section key={group.key}>
                    <div><h3>{group.label}</h3><b>{group.requirements.length}</b></div>
                    <ul>{group.requirements.map((requirement) => (
                      <li key={requirement.id}>
                        <button
                          type="button"
                          className={requirement.id === selectedRequirement?.id ? "is-selected" : ""}
                          aria-pressed={requirement.id === selectedRequirement?.id}
                          onClick={() => setSelectedRequirementId(requirement.id)}
                        >
                          <span>{requirement.componentKey}</span>
                          <strong>{requirement.name}</strong>
                          <small>{requirement.quantity} {requirement.quantityUnit} · {dimensions(requirement, "finished")}</small>
                          <b>{requirement.id === selectedRequirement?.id ? "Részletek nyitva" : "Megnyitás"}</b>
                        </button>
                      </li>
                    ))}</ul>
                  </section>
                ))}
              </aside>

              <section className="operation-route-workspace" aria-labelledby="operation-route-title">
                <header>
                  <div>
                    <span>03 · {selectedRequirement?.requirementKind === "PURCHASED_PART" ? "Ellátási sorrend" : "Technológiai sorrend"}</span>
                    <h2 id="operation-route-title">{selectedRequirement?.requirementKind === "PURCHASED_PART" ? "Beszerzéstől a szerelési átadásig" : "Alkatrészhez kötött gyártási út"}</h2>
                    <p>{selectedRequirement?.requirementKind === "PURCHASED_PART"
                      ? "Csak azok a szerverről érkező sorok kapcsolódnak ide, amelyek explicit forrásként hivatkoznak erre a beszerzett tételre."
                      : "Csak azok a szerverről érkező sorok kapcsolódnak ide, amelyek explicit forrásként hivatkoznak erre a gyártandó alkatrészre."}</p>
                  </div>
                </header>

                {selectedRequirement && (
                  <article className="operation-component-inspector" aria-live="polite">
                    <header>
                      <div><span>{selectedRequirement.componentKey}</span><h3>{selectedRequirement.name}</h3></div>
                      <b>{selectedRequirement.requirementKind === "CUT_PART" ? "Gyártandó" : "Beszerzendő"}</b>
                    </header>
                    <dl>
                      <div><dt>Forrásrekord</dt><dd>{selectedRequirement.sourceKind} · {selectedRequirement.sourceRecordId}</dd></div>
                      <div><dt>Forráskomponens</dt><dd><code>{selectedRequirement.sourceComponentKey}</code></dd></div>
                      <div><dt>Anyag / felület</dt><dd>{[selectedRequirement.materialKey, selectedRequirement.finishKey].filter(Boolean).join(" · ") || "Nincs megadva"}</dd></div>
                      <div><dt>Készméret</dt><dd>{dimensions(selectedRequirement, "finished")}</dd></div>
                      <div><dt>Szabászati méret</dt><dd>{dimensions(selectedRequirement, "cutting")}</dd></div>
                      <div><dt>Sor hash</dt><dd><code title={selectedRequirement.lineHash}>{shortHash(selectedRequirement.lineHash)}</code></dd></div>
                    </dl>
                    <div className="operation-route-empty">
                      <strong>{selectedRequirementOperations.length > 0
                        ? `${selectedRequirementOperations.length} explicit szerverművelet hivatkozik erre a sorra.`
                        : "Nincs használható, explicit műveleti hivatkozás."}</strong>
                      <span>{selectedRequirementOperations.length > 0
                        ? selectedRequirementOperations.map((operation) => `${operation.sequence}. ${operation.operationType}`).join(" · ")
                        : "A böngésző nem pótolja a hiányt alkatrésznévből, standardból vagy faipari háttértudásból képzett művelettel."}</span>
                    </div>
                  </article>
                )}

                {!selectedOperationPlan && <section className="operation-contract-preview" aria-labelledby="operation-contract-title">
                  <div className="operation-contract-heading">
                    <span>Várt szerverrekord</span>
                    <h3 id="operation-contract-title">Minden műveleti sornak visszakövethetőnek kell lennie</h3>
                    <p>A faipari tudástár itt szerkezeti támpont; nem választ automatikusan standardot, időt vagy gépet.</p>
                  </div>
                  {fieldGroups.map(({ group, fields }) => (
                    <section key={group}>
                      <header><span>{fieldGroupLabel[group]}</span><b>{fields.length} mező</b></header>
                      <div>{fields.map((field) => (
                        <article key={field.key}>
                          <strong>{field.label}</strong>
                          <span>{field.description}</span>
                        </article>
                      ))}</div>
                    </section>
                  ))}
                </section>}
              </section>
            </div>
          </>
        )}

        <section className="operation-legacy-comparison" aria-labelledby="operation-legacy-title">
          <details>
            <summary>
              <div><span>Összevetési segédadat</span><h2 id="operation-legacy-title">Örökölt munkalap</h2><p>Az epik-, állomás-, kézi idő- és dátumadat nem jóváhagyott műveletterv, normaidő vagy kiadási jogosultság.</p></div>
              <b>{projectQuery.data?.epics.reduce((count, epic) => count + epic.steps.length, 0) ?? 0} régi sor</b>
            </summary>
            {projectQuery.isLoading && <p className="operation-legacy-state">Örökölt összevetés betöltése…</p>}
            {projectQuery.isError && <p className="operation-legacy-state is-error">Az örökölt munkalap nem érhető el; a felület nem helyettesíti üres adattal.</p>}
            {projectQuery.data && (
              <div className="operation-legacy-content">
                <div className="operation-legacy-warning"><strong>Nem másolható át automatikusan</strong><span>Az alábbi sorok csak emberi összevetésre szolgálnak. Egyik értékük sem nyit ki műveletképzési vagy üzemi kaput.</span></div>
                {projectQuery.data.epics.length === 0 ? <p className="operation-legacy-state">Nincs örökölt epik ezen a projekten.</p> : projectQuery.data.epics.map((epic) => (
                  <article key={epic.id}>
                    <header><div><span>Legacy epik</span><h3>{epic.name}</h3></div><b>{epic.steps.length} sor</b></header>
                    <ol>{epic.steps.map((step) => (
                      <li key={step.id}><strong>{step.name || "Névtelen sor"}</strong><span>{legacyStepFacts(step)}</span><small>{step.tasks?.length ? `${step.tasks.length} kapcsolt üzemi feladat` : "nincs kiadott feladat"}</small></li>
                    ))}</ol>
                  </article>
                ))}
                <Link to={`/projects/${encodeURIComponent(projectKey)}/work-session`}>Örökölt munkalap külön megnyitása →</Link>
              </div>
            )}
          </details>
        </section>

        <footer className="operation-workspace-footer">
          <p>A műveletterv ezen az oldalon csak olvasható exact-revíziós snapshot. Tervezés, Gantt, kiadás és üzemi végrehajtás továbbra is külön, zárt szerverkapu.</p>
          <div>
            <Link to={componentWorkspacePath(projectKey, revision.revision)}>← Kalkulátor</Link>
            <Link to={`/projects/${encodeURIComponent(projectKey)}`}>Projektfolyamat →</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
