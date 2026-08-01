import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAdvanceOrderIntakeStage, useProductionOrder, useTechnicalCatalog, useUpdateOrderRevision } from "@/services/production/hooks";
import type { OrderPositionEvidence, ProductionOrderPosition } from "@/services/production/types";
import { DoorSideAppearancePanel } from "@/components/orders/DoorSideAppearancePanel";
import { useUiStore } from "@/store/uiStore";
import { canCompleteSurvey } from "@/lib/roles";
import { formatEvidenceConfidence, formatEvidenceValue, orderPositionEvidenceFieldLabel, orderPositionEvidenceStateLabel } from "@/lib/orderEvidence";
import { buildSurveyCompletionReadiness, missingSurveyFields } from "@/lib/surveyCompletion";
import { toOrderRevisionInput } from "@/lib/orderRevisionInput";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

type SurveyPosition = Omit<ProductionOrderPosition, "evidence">;
type SurveySaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function evidenceLocator(evidence: OrderPositionEvidence) {
  return [evidence.orderDocument?.displayName ?? evidence.relativePath, evidence.sheet, evidence.page ? `${evidence.page}. oldal` : null, evidence.row ? `${evidence.row}. sor` : null].filter(Boolean).join(" · ");
}

interface PositionEditorProps {
  position: SurveyPosition;
  evidence: OrderPositionEvidence[];
  ready: boolean;
  onPatch: (values: Partial<SurveyPosition>) => void;
}

function SurveyPositionEditor({ position, evidence, ready, onPatch }: PositionEditorProps) {
  const { data: catalog } = useTechnicalCatalog();
  const missing = missingSurveyFields(position);
  const textNumber = (value: number | null) => value == null ? "" : String(value);
  const legacyFinishLabel = catalog?.finishes.find((choice) => choice.key === position.finishKey)?.label ?? position.finishKey;

  return <div className="survey-position-editor">
    <header className="order-position-header"><div><span>Pozíció</span><strong>{position.code}</strong></div><span>{position.name} · {position.quantity} db</span></header>
    {missing.length > 0 && <div className="survey-missing-fields"><strong>Hiányzó kötelező adat</strong><span>{missing.join(" · ")}</span></div>}
    <div className="order-position-grid">
      <label className="order-field">
        <span>Ajtótípus <b>*</b></span>
        <select value={position.doorTypeKey ?? ""} onChange={(event) => onPatch({ doorTypeKey: event.target.value || null })} disabled={!ready || !catalog} required>
          <option value="">Választás…</option>
          {catalog?.doorTypes.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
        </select>
      </label>
      <label className="order-field">
        <span>Örökölt nyitásmegadás <b>*</b></span>
        <input value={position.openingDirection ?? ""} onChange={(event) => onPatch({ openingDirection: event.target.value || null })} disabled={!ready} placeholder="Pl. Bal be" required />
        <small>A jobbos/balos kivitelt, a pántoldalt és a nyitási teret a strukturált szerződés külön adatokként kezeli majd.</small>
      </label>
      <div className="order-field">
        <span>Összevont felület (legacy)</span>
        <output className="order-field-readonly">{legacyFinishLabel ?? position.surface ?? "Nincs összevont érték"}</output>
        <small>Csak olvasható: mentéskor sem írjuk vissza, mert felülírná a külön, szerepcímkés forrásértékeket.</small>
      </div>
      <label className="order-field">
        <span>Falmegoldás <b>*</b></span>
        <select value={position.wallSolutionKey ?? ""} onChange={(event) => onPatch({ wallSolutionKey: event.target.value || null })} disabled={!ready || !catalog} required>
          <option value="">Választás…</option>
          {catalog?.wallSolutions.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
        </select>
      </label>
      <label className="order-field">
        <span>Üvegezés <b>*</b></span>
        <select value={position.glassKey ?? ""} onChange={(event) => onPatch({ glassKey: event.target.value || null })} disabled={!ready || !catalog} required>
          <option value="">Választás…</option>
          {catalog?.glass.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
        </select>
      </label>
    </div>
    <div className="survey-opening-geometry">
      <div className="order-dimensions"><p>Falnyílás <span>szélesség × magasság</span></p>{([ ["openingWidthMm", "Szélesség"], ["openingHeightMm", "Magasság"] ] as const).map(([field, label]) => <label className="order-field" key={field}><span>{label} <b>*</b></span><div className="order-unit-input"><input inputMode="decimal" value={textNumber(position[field])} onChange={(event) => onPatch({ [field]: event.target.value ? Number(event.target.value) : null })} disabled={!ready} required /><i>mm</i></div></label>)}</div>
      <div className="order-dimensions order-dimensions-wall"><p>Kész fal <span>egyetlen örökölt mérés</span></p><label className="order-field"><span>Kész falvastagság <b>*</b></span><div className="order-unit-input"><input inputMode="decimal" value={textNumber(position.openingDepthMm)} onChange={(event) => onPatch({ openingDepthMm: event.target.value ? Number(event.target.value) : null })} disabled={!ready} required /><i>mm</i></div><small>Nem azonos a tok beállítási tartományával.</small></label></div>
    </div>
    <div className="order-dimensions"><p>Ajtólap <span>szélesség × magasság × vastagság</span></p>{([ ["doorWidthMm", "Szélesség"], ["doorHeightMm", "Magasság"], ["doorThicknessMm", "Vastagság"] ] as const).map(([field, label]) => <label className="order-field" key={field}><span>{label}{field === "doorThicknessMm" && <b> *</b>}</span><div className="order-unit-input"><input inputMode="decimal" value={textNumber(position[field])} onChange={(event) => onPatch({ [field]: event.target.value ? Number(event.target.value) : null })} disabled={!ready} required={field === "doorThicknessMm"} /><i>mm</i></div></label>)}</div>
    <DoorSideAppearancePanel
      surface={position.surface}
      legacyFinishLabel={legacyFinishLabel}
      wallDepthMm={position.openingDepthMm}
      context="SURVEY"
    />
    <section className="survey-evidence-panel" aria-labelledby="survey-evidence-title"><header><div><span>Forrásbizonyíték</span><h3 id="survey-evidence-title">Ehhez a pozícióhoz rögzített evidence</h3></div><b>{evidence.length} rekord</b></header>{evidence.length === 0 ? <p>Nincs ehhez a pozícióhoz rögzített mezőszintű bizonyíték. Ez nem jelenti azt, hogy egy érték automatikusan elfogadható.</p> : <ul>{evidence.map((item) => <li key={item.id}><div><strong>{orderPositionEvidenceFieldLabel[item.field]}</strong><span>{item.rawValue} → {formatEvidenceValue(item.normalizedValue)}</span><small>{[evidenceLocator(item), formatEvidenceConfidence(item.confidence)].filter(Boolean).join(" · ")}</small>{item.resolution && <small>Döntés: {item.resolution}</small>}</div><b className={`survey-evidence-state survey-evidence-state-${item.reviewState.toLowerCase()}`}>{orderPositionEvidenceStateLabel[item.reviewState]}</b></li>)}</ul>}</section>
  </div>;
}

/** Field-survey workspace. It only finalises a Sales DRAFT after the source
 * documents have been received and the position-specific process drivers are known. */
export function SurveyPage() {
  const { projectKey = "" } = useParams();
  const [searchParams] = useSearchParams();
  const requestedPositionId = searchParams.get("position");
  const role = useUiStore((state) => state.role);
  const navigate = useNavigate();
  const { data: order, isLoading, isError } = useProductionOrder(projectKey);
  const update = useUpdateOrderRevision(projectKey);
  const advance = useAdvanceOrderIntakeStage(projectKey);
  const revision = order?.revisions[0];
  const revisionIdentity = revision?.id;
  const [positions, setPositions] = useState<SurveyPosition[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [dirtyPositionIds, setDirtyPositionIds] = useState<Set<string>>(() => new Set());
  const [saveState, setSaveState] = useState<SurveySaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { allowNextNavigation } = useUnsavedChangesGuard(dirty);

  useEffect(() => {
    if (!revision) return;
    setPositions(revision.positions.map(({ evidence: _evidence, ...position }) => position));
    const requestedIndex = requestedPositionId ? revision.positions.findIndex((position) => position.id === requestedPositionId) : -1;
    setSelectedIndex(requestedIndex >= 0 ? requestedIndex : 0);
    setDirty(false);
    setDirtyPositionIds(new Set());
    setSaveState("idle");
    setLastSavedAt(null);
  }, [revisionIdentity]);
  useEffect(() => {
    if (!requestedPositionId || positions.length === 0) return;
    const requestedIndex = positions.findIndex((position) => position.id === requestedPositionId);
    if (requestedIndex >= 0) setSelectedIndex(requestedIndex);
  }, [requestedPositionId, revisionIdentity, positions.length]);
  useEffect(() => { if (selectedIndex >= positions.length) setSelectedIndex(Math.max(positions.length - 1, 0)); }, [positions.length, selectedIndex]);

  function patchSelected(values: Partial<SurveyPosition>) {
    const selectedId = positions[selectedIndex]?.id;
    setPositions((all) => all.map((position, index) => index === selectedIndex ? { ...position, ...values } : position));
    setDirty(true);
    if (selectedId) setDirtyPositionIds((current) => new Set(current).add(selectedId));
    setSaveState("dirty");
    setMessage(null);
  }

  async function persistDraft() {
    if (!revision || !dirty) return true;
    setSaveState("saving");
    setMessage(null);
    try {
      await update.mutateAsync({ revision: revision.revision, input: toOrderRevisionInput(revision, positions) });
      setDirty(false);
      setDirtyPositionIds(new Set<string>());
      setSaveState("saved");
      setLastSavedAt(new Date());
      return true;
    } catch {
      setSaveState("error");
      setMessage("A felmérési piszkozat mentése nem sikerült. A helyi módosítások megmaradtak; ne frissítsd az oldalt, amíg újra nem próbáltad.");
      return false;
    }
  }

  function currentSurveyReadiness() {
    if (!revision) return buildSurveyCompletionReadiness([], []);
    const evidenceByPosition = new Map(revision.positions.map((position) => [position.id, position.evidence]));
    return buildSurveyCompletionReadiness(
      positions.map((position) => ({ ...position, evidence: evidenceByPosition.get(position.id) ?? [] })),
      revision.documents,
    );
  }

  async function finaliseSurvey() {
    if (!revision) return;
    const completion = currentSurveyReadiness();
    if (!completion.ready) {
      setMessage("A felmérés még nem véglegesíthető. Pótold a kötelező adatokat és felmérési forráskapcsolatokat, majd zárd le a meglévő evidence-ek ellenőrzését.");
      return;
    }
    const draftWasDirty = dirty;
    if (draftWasDirty && !(await persistDraft())) return;
    setMessage(null);
    try {
      await advance.mutateAsync({ revision: revision.revision, stage: "SURVEY_COMPLETED" });
      allowNextNavigation();
      navigate(`/orders/${encodeURIComponent(projectKey)}`);
    } catch {
      setMessage(draftWasDirty
        ? "A piszkozat mentve, de a felmérés véglegesítése nem sikerült. Az adatok nem vesztek el; ellenőrizd a kötelező mezőket, a felmérési forráskapcsolatokat és az evidence-döntéseket."
        : "A felmérés véglegesítése nem sikerült. Ellenőrizd a kötelező mezőket, a felmérési forráskapcsolatokat, az evidence-döntéseket és a rendelés aktuális adatkapuját.");
    }
  }

  if (isLoading) return <main className="orders-page"><div className="orders-content"><div className="orders-state">Felmérés betöltése…</div></div></main>;
  if (isError || !revision) return <main className="orders-page"><div className="orders-content"><div className="orders-state">A felméréshez tartozó rendelés nem érhető el.</div></div></main>;
  const ready = revision.intakeStage === "SURVEY_PENDING" && canCompleteSurvey(role);
  const editingEnabled = ready && saveState !== "saving" && !advance.isPending;
  const selected = positions[selectedIndex];
  const selectedEvidence = revision.positions[selectedIndex]?.evidence ?? [];
  const completionReadiness = currentSurveyReadiness();
  const incompleteCount = completionReadiness.missingFieldPositionIds.length;
  const saveStatusLabel = saveState === "saving"
    ? "Piszkozat mentése…"
    : saveState === "dirty"
      ? `${dirtyPositionIds.size} pozíció módosítása nincs mentve`
      : saveState === "saved" && lastSavedAt
        ? `Piszkozat mentve: ${lastSavedAt.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}`
        : saveState === "error"
          ? "A mentés sikertelen; a helyi módosítások megmaradtak"
          : "Nincs mentetlen módosítás";

  return <main className="order-intake-page"><div className="order-intake-content">
    <div className="order-intake-breadcrumb"><Link to={`/orders/${encodeURIComponent(projectKey)}`}>Rendelés</Link> / Felmérés</div>
    <header className="order-intake-hero"><div><p className="order-intake-eyebrow">Felmérési munkatér</p><h1>{revision.customerName}</h1><p className="order-intake-lede">A felmérés a kötelező pozícióadatok, a kapcsolt felmérési forrásfájlok és a lezárt evidence-ellenőrzések együttese alapján véglegesíthető.</p></div><div className="order-intake-status"><span />{ready ? "Felmérés folyamatban" : "Felmérés zárolva"}</div></header>
    {!ready && <div className="order-intake-message"><strong>!</strong>A felméréshez dokumentumátvétel és műszaki előkészítői vagy jóváhagyói szerep szükséges.</div>}
    <div className={`survey-save-status is-${saveState}`} role={saveState === "error" ? "alert" : "status"} aria-live="polite"><span>{saveState === "dirty" || saveState === "error" ? "●" : "✓"}</span>{saveStatusLabel}</div>
    <section className="order-intake-section"><div className="order-intake-section-heading"><div><p className="order-intake-section-number">01</p><h2>Végleges pozícióadatok</h2></div><p>{incompleteCount ? `${incompleteCount} pozícióban még hiányos örökölt felmérési mező van.` : "Minden örökölt felmérési mező ki van töltve."}</p></div>
      <div className="survey-workspace-layout"><nav className="survey-position-nav" aria-label="Ajtópozíciók">{positions.map((position, index) => {
        const missing = missingSurveyFields(position);
        const positionDirty = dirtyPositionIds.has(position.id);
        const sourceMissing = completionReadiness.unlinkedPositionIds.includes(position.id);
        const status = [
          positionDirty ? "Nincs mentve" : null,
          missing.length ? `${missing.length} hiányzó kötelező mező` : "Kötelező mezők teljesek",
          sourceMissing ? "Nincs kapcsolt felmérési forrás" : "Felmérési forrás kapcsolva",
        ].filter(Boolean).join(" · ");
        return <button className={`survey-position-nav-item${index === selectedIndex ? " is-active" : ""}${missing.length || sourceMissing ? " is-incomplete" : ""}${positionDirty ? " is-dirty" : ""}`} type="button" key={position.id || `${position.code}-${index}`} onClick={() => setSelectedIndex(index)}><span>{position.code || `P${index + 1}`}</span><strong>{position.name || "Névtelen pozíció"}</strong><small>{status}</small></button>;
      })}</nav>
        <div className="survey-editor-card">{selected ? <SurveyPositionEditor position={selected} evidence={selectedEvidence} ready={editingEnabled} onPatch={patchSelected} /> : <p className="survey-empty-state">Nincs ajtópozíció a felméréshez.</p>}</div>
      </div>
    </section>
    {!completionReadiness.ready && <div className="order-intake-message survey-completion-gate" role="status" aria-label="A felmérés véglegesítésének hiányai"><strong>!</strong><div><b>Véglegesítés még zárt</b><ul>{completionReadiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul><p>A felmérési forrásfájl rögzítése és pozícióhoz kapcsolása önmagában nem jelenti a tartalom ellenőrzését.</p></div></div>}
    {message && <div className="order-intake-message" role="alert"><strong>!</strong>{message}</div>}
    <footer className="order-intake-footer"><p>A piszkozatmentés nem vált adatkaput. A véglegesítéshez teljes kötelező adat, pozíciónként kapcsolt felmérési forrásfájl és minden meglévő evidence auditált lezárása szükséges; az üzembe még ekkor sem kerül kiadás.</p><div className="survey-save-actions"><button className="order-button order-button-secondary" disabled={!ready || !dirty || update.isPending || advance.isPending} onClick={() => void persistDraft()}>{update.isPending ? "Mentés…" : "Piszkozat mentése"}</button><button className="order-button order-button-primary" disabled={!ready || update.isPending || advance.isPending || !completionReadiness.ready} onClick={() => void finaliseSurvey()}>{advance.isPending ? "Véglegesítés…" : "Felmérés véglegesítése"}</button></div></footer>
  </div></main>;
}
