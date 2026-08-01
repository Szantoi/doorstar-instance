import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ComponentRequirementEditor } from "@/components/orders/ComponentRequirementEditor";
import { ComponentSnapshotsPanel } from "@/components/orders/ComponentSnapshotsPanel";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import {
  buildComponentSourceOptions,
  componentWorkspaceBlockers,
  createEmptyComponentDraft,
  toComponentRequirementInput,
  validateComponentDraft,
  type ComponentRequirementDraft,
  type ComponentSourceOption,
} from "@/lib/componentWorkspace";
import { componentSnapshotErrorMessage } from "@/lib/componentSnapshotErrors";
import { operationWorkspacePath } from "@/lib/operationWorkspaceRoute";
import { canCreateComponentSnapshot, canReviewComponentSnapshot } from "@/lib/roles";
import { buildRevisionSourceReadiness } from "@/lib/sourceEvidence";
import {
  useComponentCalculatorProfiles,
  useComponentSnapshots,
  useCreateComponentSnapshot,
  useProductionOrder,
  useReviewComponentSnapshot,
  useTechnicalCatalog,
} from "@/services/production/hooks";
import type { ComponentRequirementSourceKind } from "@/services/production/types";
import { useUiStore } from "@/store/uiStore";

const sourceGroups: Array<{ kind: ComponentRequirementSourceKind; label: string; hint: string }> = [
  { kind: "ORDER_POSITION", label: "Ajtópozíciók", hint: "Egy pozíció több explicit alkatrészsor forrása is lehet." },
  { kind: "MANUFACTURED_ITEM", label: "Külön gyártott tételek", hint: "Csak ellenőrzött falpanel vagy bútorfront használható." },
  { kind: "SUPPLEMENTARY_ITEM", label: "Tartozékok", hint: "Csak ellenőrzött kiegészítő tétel használható." },
];

/** Exact-revision office workspace for explicit component and cutting
 * output. It never runs calculator rules in the browser and permanently
 * switches to immutable review once a profile snapshot exists. */
export function ComponentWorkspacePage() {
  const { projectKey = "", revision: revisionParam = "" } = useParams();
  const revisionNumber = Number(revisionParam);
  const validRevisionNumber = Number.isInteger(revisionNumber) && revisionNumber > 0 ? revisionNumber : undefined;
  const role = useUiStore((state) => state.role);
  const orderQuery = useProductionOrder(projectKey);
  const catalogQuery = useTechnicalCatalog();
  const profilesQuery = useComponentCalculatorProfiles();
  const snapshotsQuery = useComponentSnapshots(projectKey, validRevisionNumber);
  const createSnapshot = useCreateComponentSnapshot(projectKey, validRevisionNumber);
  const reviewSnapshot = useReviewComponentSnapshot(projectKey, validRevisionNumber);
  const [selectedProfileVersion, setSelectedProfileVersion] = useState("");
  const [rows, setRows] = useState<ComponentRequirementDraft[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const nextRowId = useRef(1);
  const dirty = rows.length > 0 || reviewNote.trim().length > 0 || confirmed;
  useUnsavedChangesGuard(dirty);

  const order = orderQuery.data;
  const revision = order?.revisions.find((item) => item.revision === validRevisionNumber);
  const latestRevision = order?.revisions.length
    ? order.revisions.reduce(
        (latest, item) => item.revision > latest.revision ? item : latest,
        order.revisions[0]!,
      )
    : undefined;
  const activeProfiles = useMemo(
    () => profilesQuery.data?.profiles.filter((profile) => profile.active) ?? [],
    [profilesQuery.data],
  );

  useEffect(() => {
    if (selectedProfileVersion && activeProfiles.some((profile) => profile.version === selectedProfileVersion)) return;
    setSelectedProfileVersion(activeProfiles[0]?.version ?? "");
  }, [activeProfiles, selectedProfileVersion]);

  if (orderQuery.isLoading) {
    return <main className="orders-page"><div className="orders-content"><div className="orders-state">Kalkulátor munkatér betöltése…</div></div></main>;
  }
  if (orderQuery.isError || !order) {
    return <main className="orders-page"><div className="orders-content"><div className="orders-state">A rendelési csomag nem érhető el; a Kalkulátor fail-closed marad.</div></div></main>;
  }
  if (!validRevisionNumber || !revision || !latestRevision) {
    return <main className="orders-page"><div className="orders-content"><div className="order-intake-breadcrumb"><Link to={`/orders/${encodeURIComponent(projectKey)}`}>Rendelés</Link> / Kalkulátor</div><div className="orders-state">A kért rendelési revízió nem található.</div></div></main>;
  }

  const approvalAudit = [...revision.audit]
    .filter((entry) => entry.action === "APPROVED")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const approvalHash = approvalAudit?.contentHash ?? null;
  const selectedProfile = activeProfiles.find((profile) => profile.version === selectedProfileVersion) ?? null;
  const snapshots = snapshotsQuery.data ?? [];
  const dependenciesReady = !orderQuery.isFetching
    && !orderQuery.isError
    && catalogQuery.isSuccess
    && !catalogQuery.isFetching
    && profilesQuery.isSuccess
    && !profilesQuery.isFetching
    && snapshotsQuery.isSuccess
    && !snapshotsQuery.isFetching;
  const sourceReadiness = buildRevisionSourceReadiness(revision);
  const unresolvedSourceItemCount = sourceReadiness.manufacturedItems.unresolved
    + sourceReadiness.supplementaryItems.unresolved;
  const blockers = componentWorkspaceBlockers({
    revision,
    latestRevisionId: latestRevision.id,
    approvalHash,
    profile: selectedProfile,
    snapshots,
    role,
    dependenciesReady,
  });
  const existingProfileSnapshot = selectedProfile
    ? snapshots.find((snapshot) => snapshot.calculatorProfileVersion === selectedProfile.version) ?? null
    : null;
  const canCompose = blockers.length === 0 && existingProfileSnapshot == null;
  const sources = buildComponentSourceOptions(revision);
  const sourceByKey = new Map(sources.map((source) => [`${source.kind}:${source.id}`, source]));
  const validation = validateComponentDraft(rows, sources);
  const canMaterialize = canCompose
    && validation.valid
    && reviewNote.trim().length >= 3
    && confirmed
    && !createSnapshot.isPending;
  const componentReviewContext = dependenciesReady
    && revision.id === latestRevision.id
    && revision.status === "APPROVED"
    && approvalHash
    && profilesQuery.data
    ? {
        approvedOrderContentHash: approvalHash,
        snapshotSchemaVersion: profilesQuery.data.snapshotSchemaVersion,
        activeProfileVersions: activeProfiles.map((profile) => profile.version),
      }
    : null;

  function addRow(source: ComponentSourceOption) {
    if (!canCompose || !source.available) return;
    const clientId = `component-row-${nextRowId.current++}`;
    setRows((current) => [...current, createEmptyComponentDraft(clientId, source)]);
    setAttempted(false);
    setMessage(null);
  }

  function updateRow(clientId: string, next: ComponentRequirementDraft) {
    setRows((current) => current.map((row) => row.clientId === clientId ? next : row));
    setMessage(null);
  }

  async function materialize() {
    setAttempted(true);
    setMessage(null);
    if (!canMaterialize || !selectedProfile || !approvalHash) return;
    try {
      const result = await createSnapshot.mutateAsync({
        calculatorProfileVersion: selectedProfile.version,
        expectedOrderContentHash: approvalHash,
        reviewNote: reviewNote.trim(),
        confirmation: "CREATE_COMPONENT_SNAPSHOT",
        requirements: rows.map(toComponentRequirementInput),
      });
      setRows([]);
      setReviewNote("");
      setConfirmed(false);
      setAttempted(false);
      setMessage({
        tone: "success",
        text: result.created
          ? "Az ellenőrzési snapshot létrejött. A sorok mostantól megváltoztathatatlanok és még nem kiadhatók."
          : "Az azonos snapshot már létezett; az idempotens replay nem módosította.",
      });
    } catch (error) {
      setMessage({ tone: "error", text: componentSnapshotErrorMessage(error, "create") });
    }
  }

  return (
    <main className="component-workspace-page">
      <div className="component-workspace-content">
        <div className="order-intake-breadcrumb">
          <Link to={`/orders/${encodeURIComponent(projectKey)}`}>Rendelés</Link> / R{String(revision.revision).padStart(2, "0")} / Kalkulátor
        </div>

        <header className="component-workspace-hero">
          <div>
            <p>Termék-előkészítés · explicit adapterkimenet</p>
            <h1>Kalkulátor</h1>
            <span>{revision.customerName} · {projectKey} · R{String(revision.revision).padStart(2, "0")}</span>
          </div>
          <div className={`component-workspace-state is-${existingProfileSnapshot ? "immutable" : canCompose ? "compose" : "blocked"}`}>
            <span />
            {existingProfileSnapshot ? "Megváltoztathatatlan snapshot" : canCompose ? "Explicit sorok összeállítása" : "Adatkapu zárolva"}
          </div>
        </header>

        <section className="component-workspace-safety" aria-label="Kalkulátor biztonsági határ">
          <strong>Nincs böngészőoldali képlet</strong>
          <span>
            A felület nem másol ajtóméretet, projekt-színt vagy örökölt Excel-képletet az alkatrészsorokba.
            Minden név, mennyiség, anyag és méret explicit, ember által ellenőrzött adapterkimenet.
          </span>
        </section>

        <section className="component-gate-strip" aria-label="Materializálási adatkapuk">
          <div className={revision.id === latestRevision.id ? "is-ready" : "is-blocked"}>
            <span>Forrásrevízió</span>
            <strong>R{String(revision.revision).padStart(2, "0")}</strong>
            <small>{revision.id === latestRevision.id ? "Legfrissebb" : `Újabb: R${String(latestRevision.revision).padStart(2, "0")}`}</small>
          </div>
          <div className={revision.status === "APPROVED" && approvalHash ? "is-ready" : "is-blocked"}>
            <span>Jóváhagyás</span>
            <strong>{revision.status}</strong>
            <small title={approvalHash ?? undefined}>
              {approvalHash ? `Hash v${approvalAudit?.contentHashSchemaVersion ?? "?"} · ${approvalHash.slice(0, 12)}…` : "Hash hiányzik"}
            </small>
          </div>
          <div className={selectedProfile ? "is-ready" : "is-blocked"}>
            <span>Aktív profil</span>
            <strong>{selectedProfile?.label ?? "Nincs"}</strong>
            <small>{selectedProfile?.version ?? "Konfiguráció szükséges"}</small>
          </div>
          <div className={dependenciesReady ? "is-ready" : "is-blocked"}>
            <span>Függőségek</span>
            <strong>{dependenciesReady ? "Elérhetők" : "Nem igazolt"}</strong>
            <small>Profil · katalógus · snapshot</small>
          </div>
          <div className={sourceReadiness.ready ? "is-ready" : "is-blocked"}>
            <span>Teljes forrásaudit</span>
            <strong>{sourceReadiness.ready ? "Lezárt" : `${unresolvedSourceItemCount} tétel nyitott`}</strong>
            <small>
              Gyártott {sourceReadiness.manufacturedItems.ready}/{sourceReadiness.manufacturedItems.total}
              {" · "}
              tartozék {sourceReadiness.supplementaryItems.ready}/{sourceReadiness.supplementaryItems.total}
            </small>
          </div>
        </section>

        {blockers.length > 0 && (
          <section className="component-workspace-blockers" aria-labelledby="component-blockers-title">
            <div>
              <span>Fail-closed előfeltételek</span>
              <h2 id="component-blockers-title">A szerkesztő még nem nyitható meg</h2>
              <p>A backend minden feltételt újra ellenőriz; a lista azt mutatja, mi hiányzik ezen a konkrét revízión.</p>
            </div>
            <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
            {revision.status !== "APPROVED" && <Link to={`/orders/${encodeURIComponent(projectKey)}`}>Rendelési adatkapu megnyitása →</Link>}
            {!sourceReadiness.ready && <Link to={`/orders/${encodeURIComponent(projectKey)}/technical-preparation`}>Forrásaudit megnyitása a műszaki előkészítésben →</Link>}
          </section>
        )}

        <section className="component-workspace-profile" aria-labelledby="component-profile-title">
          <div>
            <span>Adapterkonfiguráció</span>
            <h2 id="component-profile-title">Kalkulátorprofil</h2>
            <p>A profil csak az explicit kimenet szerződését adja; üzleti képletet nem futtat.</p>
          </div>
          <label>
            <span>Aktív profilverzió</span>
            <select
              value={selectedProfileVersion}
              disabled={rows.length > 0 || activeProfiles.length <= 1}
              onChange={(event) => setSelectedProfileVersion(event.target.value)}
            >
              {activeProfiles.length === 0 && <option value="">Nincs aktív profil</option>}
              {activeProfiles.map((profile) => <option value={profile.version} key={profile.version}>{profile.label} · {profile.version}</option>)}
            </select>
          </label>
          <dl>
            <div><dt>Snapshot séma</dt><dd>{profilesQuery.data?.snapshotSchemaVersion ?? "—"}</dd></div>
            <div><dt>Konfiguráció</dt><dd><code>{profilesQuery.data?.configurationFingerprint.slice(0, 16) ?? "—"}…</code></dd></div>
            <div><dt>Képletfuttatás</dt><dd>Tiltott</dd></div>
            <div><dt>Implicit alapérték</dt><dd>Tiltott</dd></div>
          </dl>
        </section>

        {canCompose && (
          <div className="component-compose-layout">
            <aside className="component-source-browser">
              <header>
                <span>01 · Forráskészlet</span>
                <h2>Mit bontunk alkatrészre?</h2>
                <p>A forráskapcsolat önmagában nem másol át komponensadatot.</p>
              </header>
              {sourceGroups.map((group) => {
                const groupSources = sources.filter((source) => source.kind === group.kind);
                return (
                  <section key={group.kind}>
                    <div><h3>{group.label}</h3><p>{group.hint}</p></div>
                    {groupSources.length === 0 ? <small>Nincs ilyen forrás ezen a revízión.</small> : (
                      <ul>{groupSources.map((source) => (
                        <li className={source.available ? "" : "is-unavailable"} key={source.id}>
                          <div><strong>{source.label}</strong><span>{source.detail}</span>{source.unavailableReason && <small>{source.unavailableReason}</small>}</div>
                          <button type="button" disabled={!canCompose || !source.available} onClick={() => addRow(source)}>Sor hozzáadása</button>
                        </li>
                      ))}</ul>
                    )}
                  </section>
                );
              })}
            </aside>

            <section className="component-draft-workspace" aria-labelledby="component-draft-title">
              <header>
                <div>
                  <span>02 · Explicit kimenet</span>
                  <h2 id="component-draft-title">Alkatrész- és szabászati sorok</h2>
                  <p>Minden sor egy pontos forrásrekordra mutat, de minden gyártási értéket külön kell megadni.</p>
                </div>
                <b>{rows.length} sor</b>
              </header>

              {rows.length === 0 ? (
                <div className="component-draft-empty">
                  <strong>Még nincs alkatrészsor.</strong>
                  <span>Válassz bal oldalt egy igazolt forrást, majd add meg az explicit adapterkimenetet.</span>
                </div>
              ) : (
                <div className="component-draft-list">
                  {rows.map((row, index) => {
                    const source = sourceByKey.get(`${row.sourceKind}:${row.sourceId}`);
                    if (!source) return null;
                    return (
                      <ComponentRequirementEditor
                        key={row.clientId}
                        row={row}
                        index={index}
                        source={source}
                        catalog={catalogQuery.data!}
                        errors={attempted ? validation.rowErrors[row.clientId] ?? [] : []}
                        disabled={!canCompose || createSnapshot.isPending}
                        onChange={(next) => updateRow(row.clientId, next)}
                        onRemove={() => setRows((current) => current.filter((item) => item.clientId !== row.clientId))}
                      />
                    );
                  })}
                </div>
              )}

              <section className="component-materialize-panel">
                <div>
                  <span>03 · Végleges előnézet</span>
                  <h2>Ellenőrzési snapshot létrehozása</h2>
                  <p>Ez a művelet a kiválasztott profilverzióhoz megváltoztathatatlan kimenetet rögzít.</p>
                </div>
                {attempted && validation.globalErrors.length > 0 && <ul className="component-materialize-errors">{validation.globalErrors.map((error) => <li key={error}>{error}</li>)}</ul>}
                <label>
                  <span>Review-megjegyzés *</span>
                  <textarea
                    value={reviewNote}
                    maxLength={2_000}
                    disabled={!canCompose || createSnapshot.isPending}
                    placeholder="Mi alapján ellenőrizted az explicit alkatrész- és méretsorokat?"
                    onChange={(event) => setReviewNote(event.target.value)}
                  />
                </label>
                <label className="component-materialize-confirmation">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={!canCompose || createSnapshot.isPending}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  <span>Megértettem, hogy ugyanazon profilverzió alatt a snapshot nem javítható és nem írható felül.</span>
                </label>
                {attempted && reviewNote.trim().length < 3 && <p className="component-materialize-error">Legalább 3 karakteres review-megjegyzés szükséges.</p>}
                {attempted && !confirmed && <p className="component-materialize-error">Az immutábilis materializálást külön meg kell erősíteni.</p>}
                <button type="button" disabled={!canCompose || createSnapshot.isPending} onClick={() => void materialize()}>
                  {createSnapshot.isPending ? "Materializálás…" : "Ellenőrzési snapshot létrehozása"}
                </button>
                {message?.tone === "error" && (
                  <div className="component-workspace-message is-error" role="alert">{message.text}</div>
                )}
              </section>
            </section>
          </div>
        )}

        {message?.tone === "success" && <div className="component-workspace-message is-success" role="status">{message.text}</div>}

        <ComponentSnapshotsPanel
          snapshots={snapshots}
          revisionStatus={revision.status}
          loading={orderQuery.isFetching
            || catalogQuery.isLoading
            || catalogQuery.isFetching
            || profilesQuery.isLoading
            || profilesQuery.isFetching
            || snapshotsQuery.isLoading
            || snapshotsQuery.isFetching}
          error={orderQuery.isError || catalogQuery.isError || profilesQuery.isError || snapshotsQuery.isError}
          canReview={canReviewComponentSnapshot(role)}
          pending={reviewSnapshot.isPending}
          authorityReady={dependenciesReady}
          reviewContext={componentReviewContext}
          onReview={(snapshotId, state, resolution) => reviewSnapshot.mutateAsync({ snapshotId, state, resolution })}
        />

        <footer className="component-workspace-footer">
          <p>A VERIFIED snapshot a következő művelettervi adatkapu bemenete lehet. Ettől még nem munkacsomag és nem üzemi kiadás.</p>
          <div>
            <Link to={operationWorkspacePath(projectKey, revision.revision)}>Műveletterv megnyitása →</Link>
            <Link to={`/projects/${encodeURIComponent(projectKey)}`}>Projektfolyamat →</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
