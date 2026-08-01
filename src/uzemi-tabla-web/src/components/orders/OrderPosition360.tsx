import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DoorSideAppearancePanel } from "./DoorSideAppearancePanel";
import {
  formatEvidenceConfidence,
  formatEvidenceValue,
  orderPositionEvidenceFieldLabel,
  orderPositionEvidenceStateLabel,
} from "../../lib/orderEvidence";
import { missingSurveyFields, surveyPositionEvidenceDecisionComplete } from "../../lib/surveyCompletion";
import type {
  ComponentSnapshot,
  ManufacturedItem,
  OrderDocument,
  ProductionOrderPosition,
  TechnicalCatalog,
} from "../../services/production/types";

interface OrderPosition360Props {
  positions: ProductionOrderPosition[];
  documents: OrderDocument[];
  manufacturedItems: ManufacturedItem[];
  componentSnapshots: ComponentSnapshot[];
  catalog: TechnicalCatalog | null;
  revisionNumber: number;
  initiallyOpen?: boolean;
  ownerAction?: { href: string; label: string } | null;
}

const wallTreatmentLabel = { NONE: "Nincs", WALL_PANEL: "Falpanel", BLENDE: "Blende" } as const;
const glazingLabel = { NONE: "Nem üveges", GLAZED: "Üveges" } as const;

function measurements(values: Array<number | null>) {
  return values.every((value) => value != null) ? `${values.join(" × ")} mm` : "Hiányos";
}

function wallDepth(value: number | null) {
  return value != null ? `${value} mm` : "Nincs rögzítve";
}

function shortHash(value: string | null) {
  if (!value) return "Nincs rögzített hash";
  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
}

function catalogLabel(
  choices: Array<{ key: string; label: string }> | undefined,
  key: string | null,
  fallback: string | null = null,
) {
  if (!key) return fallback ?? "Nincs megadva";
  return choices?.find((choice) => choice.key === key)?.label ?? fallback ?? key;
}

/** One office-facing read model for an order position. Mutations stay on the
 * survey and technical owner workspaces; this inspector never writes a full
 * order revision. */
export function OrderPosition360({
  positions,
  documents,
  manufacturedItems,
  componentSnapshots,
  catalog,
  revisionNumber,
  initiallyOpen = false,
  ownerAction = null,
}: OrderPosition360Props) {
  const [selectedId, setSelectedId] = useState<string | null>(initiallyOpen ? positions[0]?.id ?? null : null);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusIdRef = useRef<string | null>(null);
  const listScrollTopRef = useRef(0);
  const focusDetailRef = useRef(false);
  const selected = positions.find((position) => position.id === selectedId) ?? null;
  const detailId = `order-position-detail-r${revisionNumber}`;
  const incompleteCount = positions.filter((position) => missingSurveyFields(position).length > 0).length;

  const related = useMemo(() => {
    if (!selected) return null;
    const linkedDocuments = documents.filter((document) => (document.positionLinks ?? []).some((link) => link.orderPositionId === selected.id));
    const linkedManufacturedItems = manufacturedItems.filter((item) => item.relatedOrderPosition?.id === selected.id);
    const componentRows = componentSnapshots.flatMap((snapshot) => snapshot.requirements
      .filter((requirement) => requirement.sourceKind === "ORDER_POSITION" && requirement.sourceRecordId === selected.id)
      .map((requirement) => ({ snapshot, requirement })));
    return { linkedDocuments, linkedManufacturedItems, componentRows };
  }, [componentSnapshots, documents, manufacturedItems, selected]);
  const hasLinkedSurveySource = related?.linkedDocuments.some((document) => document.kind === "SURVEY") ?? false;
  const unresolvedEvidenceCount = selected?.evidence.filter((item) => !surveyPositionEvidenceDecisionComplete(item)).length ?? 0;

  const openPosition = (positionId: string) => {
    if (selectedId === positionId) {
      setSelectedId(null);
      return;
    }
    returnFocusIdRef.current = positionId;
    listScrollTopRef.current = listRef.current?.scrollTop ?? 0;
    focusDetailRef.current = true;
    setSelectedId(positionId);
  };

  const closeDetail = () => setSelectedId(null);

  useEffect(() => {
    if (selectedId && focusDetailRef.current) {
      focusDetailRef.current = false;
      detailRef.current?.focus();
      return;
    }
    if (!selectedId && returnFocusIdRef.current) {
      if (listRef.current) listRef.current.scrollTop = listScrollTopRef.current;
      rowRefs.current.get(returnFocusIdRef.current)?.focus();
      returnFocusIdRef.current = null;
    }
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedId]);

  return <section className="order-position-360" aria-labelledby={`order-position-title-r${revisionNumber}`}>
    <header>
      <div>
        <span>Pozícióregiszter · R{String(revisionNumber).padStart(2, "0")}</span>
        <h3 id={`order-position-title-r${revisionNumber}`}>Ajtó- és termékpozíciók</h3>
        <p>Kattints egy sorra a teljes forrás-, műszaki és dokumentumkapcsolati nézethez.</p>
      </div>
      <div className="order-position-360-counts">
        <b>{positions.length} pozíció</b>
        <b className={incompleteCount ? "is-warning" : "is-ready"}>{incompleteCount ? `${incompleteCount} hiányos legacy adatlap` : "Legacy mezők teljesek"}</b>
      </div>
    </header>
    <p className="order-position-360-live" aria-live="polite">
      {selected ? `${selected.code} · ${selected.name} részletei megnyitva.` : "Nincs megnyitott pozíciórészlet."}
    </p>

    {positions.length === 0 ? <p className="order-position-360-empty">Nincs pozíció ebben a revízióban.</p> : <div className={`order-position-360-workspace${selected ? " has-detail" : ""}`}>
      <div className="order-position-360-list" ref={listRef}>
        {positions.map((position) => {
          const missing = missingSurveyFields(position);
          const isSelected = selected?.id === position.id;
          return <button
            type="button"
            className={`order-position-360-row${isSelected ? " is-selected" : ""}${missing.length ? " is-incomplete" : ""}`}
            aria-expanded={isSelected}
            aria-controls={isSelected ? detailId : undefined}
            key={position.id}
            ref={(element) => {
              if (element) rowRefs.current.set(position.id, element);
              else rowRefs.current.delete(position.id);
            }}
            onClick={() => openPosition(position.id)}
          >
            <span>{position.code}</span>
            <strong>{position.name}</strong>
            <small>{position.quantity} db</small>
            <small>Falnyílás: {measurements([position.openingWidthMm, position.openingHeightMm])} · kész fal: {wallDepth(position.openingDepthMm)}</small>
            <b>{missing.length ? `${missing.length} hiányzó legacy mező` : "Legacy mezők teljesek"}</b>
          </button>;
        })}
      </div>

      {selected && related && <article ref={detailRef} tabIndex={-1} className="order-position-360-detail" id={detailId} aria-labelledby={`${detailId}-title`}>
      <header>
        <button className="order-position-360-back" type="button" onClick={closeDetail}>← Vissza a tételekhez</button>
        <div><span>{selected.code}</span><h4 id={`${detailId}-title`}>{selected.name}</h4><p>{selected.quantity} db · Örökölt nyitásmegadás: {selected.openingDirection ?? "nincs megadva"}</p></div>
        {ownerAction && <Link to={`${ownerAction.href}?position=${encodeURIComponent(selected.id)}`}>{ownerAction.label} →</Link>}
      </header>

      <DoorSideAppearancePanel
        surface={selected.surface}
        legacyFinishLabel={selected.finishKey ? catalogLabel(catalog?.finishes, selected.finishKey) : null}
        wallDepthMm={selected.openingDepthMm}
        context="SUMMARY"
      />

      <div className="order-position-360-grid">
        <section>
          <span>Rögzített forrásadatok</span>
          {!hasLinkedSurveySource ? <aside className="order-source-validation-warning" role="note" aria-label="Hiányzó felmérési forráskapcsolat">
            <strong>Felmérési forráskapcsolat hiányzik</strong>
            <span>A pozícióhoz nincs közvetlenül kapcsolt felmérési forrásfájl.</span>
          </aside> : selected.evidence.length === 0 ? <aside className="order-source-validation-warning is-neutral" role="note" aria-label="Nincs mezőszintű evidence">
            <strong>Nincs mezőszintű evidence</strong>
            <span>A felmérési forrásfájl kapcsolva van; a dokumentumkapcsolat nem mezőszintű ellenőrzés.</span>
          </aside> : unresolvedEvidenceCount > 0 ? <aside className="order-source-validation-warning" role="note" aria-label="Lezáratlan evidence-ellenőrzés">
            <strong>Evidence-ellenőrzés nincs lezárva</strong>
            <span>{unresolvedEvidenceCount} evidence-rekord döntése nyitott vagy hiányosan auditált.</span>
          </aside> : null}
          <dl>
            <div><dt>Falnyílás</dt><dd>{measurements([selected.openingWidthMm, selected.openingHeightMm])}</dd></div>
            <div><dt>Kész falvastagság · örökölt forrásadat</dt><dd>{wallDepth(selected.openingDepthMm)}</dd></div>
            <div><dt>Ajtólap</dt><dd>{measurements([selected.doorWidthMm, selected.doorHeightMm, selected.doorThicknessMm])}</dd></div>
            <div><dt>Örökölt nyitásmegadás</dt><dd>{selected.openingDirection ?? "Nincs megadva"}</dd></div>
            <div><dt>Falmegoldás</dt><dd>{selected.wallTreatment ? wallTreatmentLabel[selected.wallTreatment] : "Nincs megadva"}</dd></div>
            <div><dt>Üvegezés</dt><dd>{selected.glazing ? glazingLabel[selected.glazing] : "Nincs megadva"}{selected.glazingSpecification ? ` · ${selected.glazingSpecification}` : ""}</dd></div>
            <div><dt>Forrásmegjegyzés</dt><dd>{selected.notes || "—"}</dd></div>
          </dl>
        </section>

        <section>
          <span>Műszaki katalógusdöntések</span>
          <dl>
            <div><dt>Ajtótípus</dt><dd>{catalogLabel(catalog?.doorTypes, selected.doorTypeKey, selected.productType)}</dd></div>
            <div><dt>Örökölt felületkatalógus</dt><dd>{catalogLabel(catalog?.finishes, selected.finishKey)}</dd></div>
            <div><dt>Üveg</dt><dd>{catalogLabel(catalog?.glass, selected.glassKey)}</dd></div>
            <div><dt>Falmegoldás</dt><dd>{catalogLabel(catalog?.wallSolutions, selected.wallSolutionKey)}</dd></div>
            <div><dt>Anyag</dt><dd>{catalogLabel(catalog?.materials, selected.materialKey)}</dd></div>
            <div><dt>Vasalat</dt><dd>{selected.hardwareKeys.length ? selected.hardwareKeys.map((key) => catalogLabel(catalog?.hardware, key)).join(" · ") : "Nincs megadva"}</dd></div>
            <div><dt>Megmunkálás</dt><dd>{selected.machiningKeys.length ? selected.machiningKeys.map((key) => catalogLabel(catalog?.machinings, key)).join(" · ") : "Nincs megadva"}</dd></div>
            <div><dt>Műszaki megjegyzés</dt><dd>{selected.technicalNotes || "—"}</dd></div>
          </dl>
        </section>
      </div>

      <div className="order-position-360-sources">
        <section>
          <header><span>Evidence</span><b>{selected.evidence.length} rekord</b></header>
          {selected.evidence.length === 0 ? <p>Nincs mezőszintű evidence. A dokumentumkapcsolat ettől külön, forrástagságot jelez.</p> : <ul>{selected.evidence.map((item) => <li key={item.id}>
            <div>
              <strong>{orderPositionEvidenceFieldLabel[item.field]}</strong>
              <span>{item.rawValue} → {formatEvidenceValue(item.normalizedValue)}</span>
              <small>{[
                item.orderDocument?.displayName ?? item.relativePath,
                item.sheet,
                item.page ? `${item.page}. oldal` : null,
                item.row ? `${item.row}. sor` : null,
                formatEvidenceConfidence(item.confidence),
              ].filter(Boolean).join(" · ")}</small>
              {item.resolution && <small>Döntés: {item.resolution}</small>}
            </div>
            <b className={`survey-evidence-state survey-evidence-state-${item.reviewState.toLowerCase()}`}>{orderPositionEvidenceStateLabel[item.reviewState]}</b>
          </li>)}</ul>}
        </section>

        <section>
          <header><span>Kapcsolt dokumentumverziók</span><b>{related.linkedDocuments.length} rekord</b></header>
          {related.linkedDocuments.length === 0 ? <p>Nincs közvetlen dokumentumkapcsolat.</p> : <ul>{related.linkedDocuments.map((document) => <li key={document.id}>
            <div><strong>{document.displayName}</strong><span>{document.versionId ?? "Helyi forrásverzió"}</span><small>{document.relativePath}</small></div>
            <code title={document.contentSha256 ?? undefined}>{shortHash(document.contentSha256)}</code>
          </li>)}</ul>}
        </section>
      </div>

      {(related.linkedManufacturedItems.length > 0 || related.componentRows.length > 0) && <div className="order-position-360-derived">
        <section>
          <header><span>Kapcsolt gyártási tételek</span><b>{related.linkedManufacturedItems.length}</b></header>
          {related.linkedManufacturedItems.length === 0 ? <p>Nincs kapcsolt falpanel vagy bútorfront.</p> : <ul>{related.linkedManufacturedItems.map((item) => <li key={item.id}><strong>{item.code} · {item.name}</strong><span>{item.quantity} db · {item.state}</span></li>)}</ul>}
        </section>
        <section>
          <header><span>Alkatrész-származékok</span><b>{related.componentRows.length}</b></header>
          {related.componentRows.length === 0 ? <p>Nincs materializált ComponentRequirement.</p> : <ul>{related.componentRows.map(({ snapshot, requirement }) => <li key={`${snapshot.id}-${requirement.id}`}><strong>{requirement.componentKey} · {requirement.name}</strong><span>{requirement.quantity} {requirement.quantityUnit} · {snapshot.state} · {snapshot.calculatorProfileVersion}</span></li>)}</ul>}
        </section>
      </div>}
      </article>}
    </div>}
  </section>;
}
