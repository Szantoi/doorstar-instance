import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAddOrderDocument, useAdvanceOrderIntakeStage, useApproveOrderRevision, useComponentCalculatorProfiles, useComponentSnapshots, useCreateOrderFeedback, useCreateOrderSupplementaryItem, useLinkOrderDocumentToPosition, useOrderFeedback, useProductionOrder, useResolveOrderFeedback, useResolveOrderPositionEvidence, useReviewComponentSnapshot, useTechnicalCatalog } from "@/services/production/hooks";
import { useUiStore } from "@/store/uiStore";
import { canApproveOrder, canCompleteSurvey, canCreateSalesOrder, canRequestOrderReview, canReviewComponentSnapshot, canSendToTechnicalPreparation } from "@/lib/roles";
import { componentWorkspacePath } from "@/lib/componentWorkspaceRoute";
import type { OrderDocumentKind, OrderFeedbackCategory, OrderIntakeStage, OrderRevisionAudit, OrderRevisionStatus, OrderSupplementaryItemInput } from "@/services/production/types";
import { OrderPositionEvidenceList } from "@/components/orders/OrderPositionEvidenceList";
import { ManufacturedItemsPanel } from "@/components/orders/ManufacturedItemsPanel";
import { SupplementaryItemsPanel } from "@/components/orders/SupplementaryItemsPanel";
import { canApproveReadiness, getOrderReviewReadiness, OrderReviewReadiness } from "@/components/orders/OrderReviewReadiness";
import { ComponentSnapshotsPanel } from "@/components/orders/ComponentSnapshotsPanel";
import { OrderDocumentVersionsPanel } from "@/components/orders/OrderDocumentVersionsPanel";
import { OrderPosition360 } from "@/components/orders/OrderPosition360";
import { OfficeProjectNavigator } from "@/components/projects/OfficeProjectNavigator";
import { missingSurveyFields, surveyPositionEvidenceDecisionComplete } from "@/lib/surveyCompletion";

const statusLabel: Record<OrderRevisionStatus, string> = { DRAFT: "Piszkozat", REVIEW: "Ellenőrzés alatt", APPROVED: "Jóváhagyott", SUPERSEDED: "Leváltott" };
const intakeLabel: Record<OrderIntakeStage, string> = { SALES_DRAFT: "Sales piszkozat", SALES_DOCUMENTS_RECEIVED: "Dokumentumok átvéve", SURVEY_PENDING: "Felmérésre vár", SURVEY_COMPLETED: "Felmérés kész", SURVEY_EXCEPTION_REVIEW: "Felmérési kivétel", TECHNICAL_PREPARATION: "Műszaki előkészítés" };
const documentKindLabel: Record<OrderDocumentKind, string> = { SALES_ORDER: "Megrendelés", SURVEY: "Felmérés", DRAWING: "Rajz", OTHER: "Egyéb" };
const auditActionLabel: Record<OrderRevisionAudit["action"], string> = {
  REVIEW_REQUESTED: "Review-ra küldve",
  APPROVED: "Jóváhagyva",
  SUPERSEDED: "Újabb revízióval leváltva",
};

export function OrderDetailPage() {
  const { projectKey = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useUiStore((state) => state.role);
  const orderQuery = useProductionOrder(projectKey);
  const { data: order, isLoading, isError } = orderQuery;
  const requestedRevisionValue = searchParams.get("revision");
  const requestedRevisionNumber = requestedRevisionValue && /^[1-9]\d*$/.test(requestedRevisionValue)
    ? Number(requestedRevisionValue)
    : null;
  const latestRevision = order?.revisions[0] ?? null;
  const requestedRevision = requestedRevisionNumber == null
    ? null
    : order?.revisions.find((revision) => revision.revision === requestedRevisionNumber) ?? null;
  const selectedRevision = requestedRevision ?? latestRevision;
  const revisionSelectionInvalid = requestedRevisionValue != null && requestedRevision == null;
  const selectedRevisionNumber = selectedRevision?.revision;
  const componentCalculatorProfiles = useComponentCalculatorProfiles();
  const technicalCatalog = useTechnicalCatalog();
  const componentSnapshots = useComponentSnapshots(projectKey, selectedRevisionNumber);
  const reviewComponentSnapshot = useReviewComponentSnapshot(projectKey, selectedRevisionNumber);
  const advance = useAdvanceOrderIntakeStage(projectKey);
  const addDocument = useAddOrderDocument(projectKey);
  const linkDocumentPosition = useLinkOrderDocumentToPosition(projectKey);
  const approve = useApproveOrderRevision(projectKey);
  const feedback = useOrderFeedback(projectKey, selectedRevisionNumber);
  const reportFeedback = useCreateOrderFeedback(projectKey, selectedRevisionNumber);
  const resolveFeedback = useResolveOrderFeedback(projectKey, selectedRevisionNumber);
  const resolveEvidence = useResolveOrderPositionEvidence(projectKey, selectedRevisionNumber);
  const createSupplementary = useCreateOrderSupplementaryItem(projectKey, selectedRevisionNumber);
  const [documentName, setDocumentName] = useState(""); const [documentPath, setDocumentPath] = useState("");
  const [documentKind, setDocumentKind] = useState<OrderDocumentKind>("SALES_ORDER"); const [message, setMessage] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState<OrderFeedbackCategory>("DATA_QUALITY"); const [feedbackMessage, setFeedbackMessage] = useState("");
  if (isLoading) return <main className="orders-page"><div className="orders-content"><div className="orders-state">Rendelés betöltése…</div></div></main>;
  if (isError || !order) return <main className="orders-page"><div className="orders-content"><div className="orders-state">A rendelés nem érhető el, vagy a termelési szolgáltatás nem fut.</div></div></main>;
  const latest = order.revisions[0];
  const selected = selectedRevision ?? latest;
  const selectedIsLatest = selected.id === latest.id;
  const selectedWriteVisible = selectedIsLatest && !revisionSelectionInvalid;
  const selectedWriteAllowed = selectedWriteVisible && !orderQuery.isFetching;
  const canSales = canCreateSalesOrder(role); const canPrepare = canCompleteSurvey(role);
  const reviewStatePending = orderQuery.isFetching || feedback.isLoading || feedback.isFetching || feedback.isError;
  const reviewReadiness = getOrderReviewReadiness(selected, feedback.data ?? []);
  const approvalAllowed = reviewReadiness ? canApproveReadiness(reviewReadiness, reviewStatePending) : false;
  const componentReviewAuthorityPending = orderQuery.isFetching
    || componentCalculatorProfiles.isLoading
    || componentCalculatorProfiles.isFetching
    || technicalCatalog.isLoading
    || technicalCatalog.isFetching
    || componentSnapshots.isLoading
    || componentSnapshots.isFetching;
  const componentReviewAuthorityError = orderQuery.isError
    || componentCalculatorProfiles.isError
    || technicalCatalog.isError
    || componentSnapshots.isError;
  const componentReviewAuthorityReady = !componentReviewAuthorityPending
    && !componentReviewAuthorityError
    && componentCalculatorProfiles.data != null
    && technicalCatalog.data != null
    && componentSnapshots.data != null;
  const approvedContentHash = selected.status === "APPROVED"
    ? selected.audit.find((entry) => entry.action === "APPROVED")?.contentHash ?? null
    : null;
  const componentReviewContext = componentReviewAuthorityReady
    && approvedContentHash
    && componentCalculatorProfiles.data
    ? {
        approvedOrderContentHash: approvedContentHash,
        snapshotSchemaVersion: componentCalculatorProfiles.data.snapshotSchemaVersion,
        activeProfileVersions: componentCalculatorProfiles.data.profiles.filter((profile) => profile.active).map((profile) => profile.version),
      }
    : null;
  async function receiveDocuments() { if (!selectedWriteAllowed) return; try { await advance.mutateAsync({ revision: selected.revision, stage: "SALES_DOCUMENTS_RECEIVED" }); await advance.mutateAsync({ revision: selected.revision, stage: "SURVEY_PENDING" }); } catch { setMessage("A dokumentumátvételhez legalább egy dokumentumhivatkozást rögzíts."); } }
  async function addReference() { if (!selectedWriteAllowed || !documentName.trim() || !documentPath.trim()) { setMessage("Add meg a dokumentum nevét és a Sales-forráshoz viszonyított útvonalát."); return; } try { await addDocument.mutateAsync({ revision: selected.revision, input: { source: "LEGACY_FOLDER", kind: documentKind, displayName: documentName.trim(), relativePath: documentPath.trim() } }); setDocumentName(""); setDocumentPath(""); setMessage(null); } catch { setMessage("Csak relatív útvonal rögzíthető; teljes helyi elérési út és .. nem használható."); } }
  async function sendToPreparation() { if (selectedWriteAllowed) await advance.mutateAsync({ revision: selected.revision, stage: "TECHNICAL_PREPARATION" }); }
  async function approveRevision() { if (!selectedWriteAllowed || !approvalAllowed || approvalNote.trim().length < 3) { setMessage("A jóváhagyáshoz lezárt adatkapu és rövid indoklás szükséges."); return; } try { await approve.mutateAsync({ revision: selected.revision, note: approvalNote.trim() }); setApprovalNote(""); setMessage(null); } catch { setMessage("A jóváhagyás nem sikerült; a revízió állapotát ellenőrizd újra."); } }
  async function reportIssue() { if (!selectedWriteAllowed) return; if (feedbackMessage.trim().length < 3) { setMessage("Írd le röviden a hibát vagy a hiányzó adatot."); return; } try { await reportFeedback.mutateAsync({ category: feedbackCategory, message: feedbackMessage.trim() }); setFeedbackMessage(""); setMessage(null); } catch { setMessage("A jelzés rögzítése nem sikerült."); } }
  async function addSupplementary(input: OrderSupplementaryItemInput) { if (!selectedWriteAllowed) return; try { await createSupplementary.mutateAsync(input); setMessage(null); } catch { setMessage("A tartozék rögzítése nem sikerült. Csak szerkeszthető sales piszkozatban adható hozzá kézi tétel."); } }

  function selectRevision(revisionNumber: number) {
    const next = new URLSearchParams(searchParams);
    if (revisionNumber === latest.revision) next.delete("revision");
    else next.set("revision", String(revisionNumber));
    setSearchParams(next, { replace: true });
  }

  function openApprovalGate() {
    const approvalGate = document.getElementById("order-approval-gate");
    const disclosure = approvalGate?.closest("details");
    if (disclosure) disclosure.open = true;
    approvalGate?.querySelector("input")?.focus();
  }

  const unresolvedFeedbackCount = feedback.data?.filter((item) => item.status !== "RESOLVED").length ?? 0;
  const criticalSummaryPending = orderQuery.isFetching || feedback.isLoading || feedback.isFetching;
  const incompletePositionCount = selected.positions.filter((position) => missingSurveyFields(position).length > 0).length;
  const unresolvedEvidenceCount = selected.positions.reduce((count, position) => (
    count + position.evidence.filter((item) => !surveyPositionEvidenceDecisionComplete(item)).length
  ), 0);
  const criticalSummary = [
    feedback.isError ? "Az eltérések lekérdezése nem sikerült." : null,
    unresolvedFeedbackCount > 0 ? `${unresolvedFeedbackCount} nyitott hiba- vagy hiányjelzés.` : null,
    incompletePositionCount > 0 ? `${incompletePositionCount} pozíción hiányos a rögzített adatlap.` : null,
    unresolvedEvidenceCount > 0 ? `${unresolvedEvidenceCount} evidence-döntés nincs lezárva.` : null,
    selected.expectedDelivery ? null : "A vállalt idő nincs rögzítve.",
  ].filter((item): item is string => item != null);
  const workflowNext = selectedWriteAllowed
    ? canSales && selected.intakeStage === "SALES_DRAFT"
      ? { label: "Sales-dokumentumok átvétele és felmérésre adás", control: <button className="order-button order-button-primary" onClick={() => void receiveDocuments()} disabled={advance.isPending}>Dokumentumok átvéve → felmérés</button> }
      : canPrepare && selected.intakeStage === "SURVEY_PENDING"
        ? { label: "Felmérés megnyitása", control: <Link className="order-button order-button-primary" to={`/orders/${encodeURIComponent(projectKey)}/survey`}>Felmérés megnyitása</Link> }
        : canSendToTechnicalPreparation(role) && selected.intakeStage === "SURVEY_COMPLETED"
          ? { label: "Műszaki előkészítésre adás", control: <button className="order-button order-button-primary" onClick={() => void sendToPreparation()} disabled={advance.isPending}>Műszaki előkészítésre adás</button> }
          : canRequestOrderReview(role) && selected.status === "DRAFT" && selected.intakeStage === "TECHNICAL_PREPARATION"
            ? { label: "Műszaki előkészítés megnyitása", control: <Link className="order-button order-button-primary" to={`/orders/${encodeURIComponent(projectKey)}/technical-preparation`}>Műszaki előkészítés megnyitása</Link> }
            : canApproveOrder(role) && selected.status === "REVIEW"
              ? { label: "Rendelési revízió jóváhagyása", control: <button className="order-button order-button-primary" type="button" onClick={openApprovalGate}>Jóváhagyási kapu megnyitása</button> }
            : selected.status === "APPROVED"
              ? { label: "Alkatrészképzés megnyitása", control: <Link className="order-button order-button-primary" to={componentWorkspacePath(projectKey, selected.revision)}>Alkatrészképzés megnyitása</Link> }
              : null
    : null;
  const positionOwnerAction = selectedWriteAllowed && selected.status === "DRAFT" && canPrepare
    ? selected.intakeStage === "SURVEY_PENDING"
      ? { href: `/orders/${encodeURIComponent(projectKey)}/survey`, label: "Felmérési adatok szerkesztése" }
      : selected.intakeStage === "TECHNICAL_PREPARATION"
        ? { href: `/orders/${encodeURIComponent(projectKey)}/technical-preparation`, label: "Műszaki adatok szerkesztése" }
        : null
    : null;

  return <main className="orders-page"><div className="orders-content">
    <header className="order-handoff-hero">
      <div>
        <p>Sales átadás · forrásnézet</p>
        <h1>{selected.customerName}</h1>
        <span>A rögzített megrendelési forrás rövid áttekintése. Nem gyártási kiadás és nem jóváhagyási bizonylat.</span>
      </div>
      <b>Nem gyártási kiadás</b>
    </header>
    <section className="order-handoff-sheet" aria-label="Sales átadási összefoglaló">
      <dl className="order-handoff-facts">
        <div><dt>Projekt / azonosító</dt><dd>{projectKey}</dd><small>{selected.customerName}</small></div>
        <div><dt>Vállalt idő</dt><dd>{selected.expectedDelivery ? new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(selected.expectedDelivery)) : "Nincs megadva"}</dd><small>{selected.plannedStart ? `Tervezett kezdés: ${new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(selected.plannedStart))}` : "Tervezett kezdés nincs megadva"}</small></div>
        <div><dt>Aktuális nézet</dt><dd>R{String(selected.revision).padStart(2, "0")} · {statusLabel[selected.status]}</dd><small>{selectedIsLatest && !revisionSelectionInvalid
          ? intakeLabel[selected.intakeStage]
          : revisionSelectionInvalid
            ? "Legfrissebb revízió · a hibás kiválasztás helyreállításáig csak olvasható"
            : "Történeti, csak olvasható pillanatkép"}</small></div>
      </dl>
      <div className="order-handoff-next">
        <div><span>Következő teendő</span><strong>{workflowNext?.label ?? (selectedIsLatest ? "Státusz ellenőrzése a projektcockpitben" : "Nincs író teendő ezen a történeti revízión")}</strong><small>A szerver-authoritatív státusz és következő lépés a projektcockpitben ellenőrizhető.</small></div>
        {workflowNext?.control ?? <Link className="order-button order-button-secondary" to={`/projects/${encodeURIComponent(projectKey)}`}>Projektcockpit megnyitása</Link>}
      </div>
    </section>
    <section className="order-revision-selector" aria-labelledby="order-revision-selector-title">
      <div>
        <span>Forráspéldány</span>
        <h2 id="order-revision-selector-title">Rendelési revízió</h2>
        <p>A történeti változatok mindig csak olvashatók.</p>
        <dl className="order-revision-summary" aria-label="Kiválasztott revízió tartalma">
          <div><dt>Pozíció</dt><dd>{selected.positions.length}</dd></div>
          <div><dt>Dokumentum</dt><dd>{selected.documents.length}</dd></div>
          <div><dt>Gyártott tétel</dt><dd>{selected.manufacturedItems.length}</dd></div>
          <div><dt>Tartozék</dt><dd>{selected.supplementaryItems.length}</dd></div>
        </dl>
      </div>
      <label>
        <span>Revízió kiválasztása</span>
        <select value={selected.revision} onChange={(event) => selectRevision(Number(event.target.value))}>
          {order.revisions.map((revision) => (
            <option key={revision.id} value={revision.revision}>
              R{String(revision.revision).padStart(2, "0")} · {statusLabel[revision.status]}{revision.id === latest.id ? " · legfrissebb" : " · történeti"}
            </option>
          ))}
        </select>
      </label>
    </section>
    {revisionSelectionInvalid && (
      <p className="order-revision-view-state is-warning" role="alert">
        A kért <code>?revision={requestedRevisionValue}</code> revízió nem található. A legfrissebb revízió látszik, de az író műveletek a kiválasztás megerősítéséig zárva maradnak.
        <Link to={`/orders/${encodeURIComponent(projectKey)}`}>Legfrissebb revízió megnyitása</Link>
      </p>
    )}
    {!selectedIsLatest && (
      <p className="order-revision-view-state" role="status">
        Történeti R{String(selected.revision).padStart(2, "0")} pillanatkép. Minden adat csak olvasható; módosítás, review és workflow-léptetés kizárólag a legfrissebb revízión érhető el.
      </p>
    )}
    <section className={`order-handoff-alert${criticalSummaryPending ? " is-pending" : criticalSummary.length ? " is-critical" : " is-clear"}`} role="status" aria-live="polite" aria-label="Kritikus hiányok és eltérések">
      <strong>{criticalSummaryPending ? "Ellenőrzés folyamatban" : criticalSummary.length ? "Figyelmet kér" : "Nincs nyitott kritikus eltérés"}</strong>
      {criticalSummaryPending ? <span>Az eltérések ellenőrzése folyamatban van; addig az összefoglaló nem tekinthető teljesnek.</span> : criticalSummary.length ? <ul>{criticalSummary.map((item) => <li key={item}>{item}</li>)}</ul> : <span>A jelenlegi read modelben nincs nyitott feedback, hiányos pozícióadat vagy lezáratlan evidence-döntés.</span>}
    </section>
    <OrderPosition360
      positions={selected.positions}
      documents={selected.documents}
      manufacturedItems={selected.manufacturedItems}
      componentSnapshots={componentSnapshots.data ?? []}
      catalog={technicalCatalog.data ?? null}
      revisionNumber={selected.revision}
      ownerAction={positionOwnerAction}
    />
    <details className="order-detail-disclosure">
      <summary><span>Részletes munkafolyamat, dokumentumok és audit</span><small>Műszaki, evidence- és dokumentumblokkok megnyitása</small></summary>
      <div className="order-detail-disclosure-body">
      <OfficeProjectNavigator projectKey={projectKey} current="ORDER" revisionNumber={selected.revision} historicalRevision={!selectedIsLatest || revisionSelectionInvalid} />
      <section className="order-workflow-card"><div><span>{selectedIsLatest && !revisionSelectionInvalid ? "Aktuális adatkapu" : "Kiválasztott revízió állapota"}</span><h2>{intakeLabel[selected.intakeStage]} · {statusLabel[selected.status]}</h2><p>Az approval egy konkrét tartalmi pillanatképet rögzít. Csak az így jóváhagyott revízióból készülhet később kalkuláció és gyártási kiadás.</p></div></section>
      {selected.status === "REVIEW" && <OrderReviewReadiness revision={selected} feedback={feedback.data ?? []} reviewStatePending={reviewStatePending} />}
      {selectedWriteVisible && selected.status === "REVIEW" && canApproveOrder(role) && <section id="order-approval-gate" className="order-approval-card"><div><span>Jóváhagyási kapu</span><h2>Független ellenőrzés</h2><p>A jóváhagyás lezárja ezt a revíziót és SHA-256 tartalmi ujjlenyomatot rögzít. Rövid indoklás kötelező.</p></div><input value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Jóváhagyás indoklása *" /><button className="order-button order-button-primary" onClick={() => void approveRevision()} disabled={approve.isPending || !approvalAllowed} title={approvalAllowed ? undefined : "Előbb zárd le a fenti review-teendőket."}>Jóváhagyás</button></section>}
      <ComponentSnapshotsPanel
      snapshots={componentSnapshots.data ?? []}
      revisionStatus={selected.status}
      loading={componentReviewAuthorityPending}
      error={componentReviewAuthorityError}
      canReview={selectedWriteAllowed && canReviewComponentSnapshot(role)}
      pending={reviewComponentSnapshot.isPending}
      authorityReady={componentReviewAuthorityReady}
      reviewContext={componentReviewContext}
      onReview={(snapshotId, state, resolution) => selectedWriteAllowed
        ? reviewComponentSnapshot.mutateAsync({ snapshotId, state, resolution })
        : Promise.resolve(undefined)}
    />
    <section className="order-document-card"><div className="order-document-heading"><div><span>Dokumentumkapu</span><h2>Sales dokumentumhivatkozások és változatok</h2><p>Forrás: <code>01 - Megrendelés</code>. A fájl binárisa a jóváhagyott forrásban marad; itt relatív hivatkozás, verzió, hash és pozíciókapcsolat él.</p></div></div>{selectedWriteAllowed && canSales && selected.status === "DRAFT" && <div className="order-document-form"><input value={documentName} onChange={(event) => setDocumentName(event.target.value)} placeholder="Dokumentum neve" /><select value={documentKind} onChange={(event) => setDocumentKind(event.target.value as OrderDocumentKind)}>{Object.entries(documentKindLabel).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select><input value={documentPath} onChange={(event) => setDocumentPath(event.target.value)} placeholder="Projekt mappa/Fájl.pdf" /><button className="order-button order-button-secondary" onClick={() => void addReference()} disabled={addDocument.isPending}>Hivatkozás rögzítése</button></div>}<OrderDocumentVersionsPanel
      documents={selected.documents}
      positions={selected.positions}
      canAddVersion={selectedWriteAllowed && canSales && selected.status === "DRAFT"}
      canLinkPosition={selectedWriteAllowed && canSales && selected.status === "DRAFT"}
      pending={addDocument.isPending || linkDocumentPosition.isPending}
      onAddVersion={(input) => selectedWriteAllowed ? addDocument.mutateAsync({ revision: selected.revision, input }) : Promise.resolve(undefined)}
      onLinkPosition={(documentId, orderPositionId) => selectedWriteAllowed ? linkDocumentPosition.mutateAsync({ revision: selected.revision, documentId, orderPositionId }) : Promise.resolve(undefined)}
    /></section>
    <section className="order-document-card"><div className="order-document-heading"><div><span>Adatminőség és visszajelzés</span><h2>Hiba vagy hiány jelzése</h2><p>A jelzés a rendszerben követhető; az eredeti Excel/PDF forrás változatlan marad.</p></div></div>{selectedWriteAllowed && role !== "reader" && <div className="order-document-form"><select value={feedbackCategory} onChange={(event) => setFeedbackCategory(event.target.value as OrderFeedbackCategory)}><option value="DATA_QUALITY">Hiányzó vagy hibás adat</option><option value="IMPORT_MAPPING">Import / forráseltérés</option><option value="DOCUMENT_REFERENCE">Dokumentumhivatkozás</option><option value="WORKFLOW">Határidő vagy folyamat</option></select><input value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value)} placeholder="Mi hibás vagy hiányzik?" /><button className="order-button order-button-secondary" onClick={() => void reportIssue()} disabled={reportFeedback.isPending}>Jelzés küldése</button></div>}{feedback.isLoading ? <p className="order-document-empty">Jelzések betöltése…</p> : !feedback.data?.length ? <p className="order-document-empty">Nincs nyitott vagy lezárt jelzés.</p> : <ul className="order-document-list">{feedback.data.map((item) => <li key={item.id}><b>{item.status === "RESOLVED" ? "Lezárt" : item.status === "ACKNOWLEDGED" ? "Nyugtázva" : "Nyitott"}</b><span>{item.category}: {item.message}</span>{item.resolution && <code>{item.resolution}</code>}{selectedWriteAllowed && canPrepare && item.status !== "RESOLVED" && <button className="order-button order-button-secondary" onClick={() => void resolveFeedback.mutateAsync({ feedbackId: item.id, status: "RESOLVED", resolution: "Műszaki előkészítés lezárta." })}>Lezárás</button>}</li>)}</ul>}</section>
    {message && <p className="order-document-message">{message}</p>}
    <section className="order-revision-list" aria-label="Kiválasztott rendelési revízió"><article className="order-revision" key={selected.id}>
        <ManufacturedItemsPanel
          items={selected.manufacturedItems}
          canReview={false}
          canReviewEvidence={false}
          pending={false}
          onReview={async () => undefined}
          onReviewEvidence={async () => undefined}
        />
        <SupplementaryItemsPanel
          items={selected.supplementaryItems}
          canCreate={selectedWriteAllowed && canSales && selected.status === "DRAFT" && (selected.intakeStage === "SALES_DRAFT" || selected.intakeStage === "SALES_DOCUMENTS_RECEIVED")}
          canReview={false}
          canReviewEvidence={false}
          pending={createSupplementary.isPending}
          onCreate={addSupplementary}
          onReview={async () => undefined}
          onReviewEvidence={async () => undefined}
        />
        <OrderPositionEvidenceList
          positions={selected.positions}
          canReview={selectedWriteAllowed && canPrepare && (selected.status === "DRAFT" || selected.status === "REVIEW")}
          pending={resolveEvidence.isPending}
          onReview={(positionId, evidenceId, reviewState, resolution) => selectedWriteAllowed
            ? resolveEvidence.mutateAsync({ positionId, evidenceId, reviewState, resolution })
            : Promise.resolve(undefined)}
        />
        {selected.audit.length > 0 && <div className="order-audit-list">{selected.audit.map((audit) => <div key={audit.id}>
          <b>{auditActionLabel[audit.action]}</b>
          <span>{audit.actorRole}</span>
          <code title={audit.contentHash}>Hash v{audit.contentHashSchemaVersion} · {audit.contentHash.slice(0, 12)}…</code>
          <span>{audit.note || "—"}</span>
        </div>)}</div>}
      </article></section>
      </div>
    </details>
  </div></main>;
}
