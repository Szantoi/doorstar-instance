import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ManufacturedItemsPanel } from "@/components/orders/ManufacturedItemsPanel";
import { DoorSideAppearancePanel } from "@/components/orders/DoorSideAppearancePanel";
import { getOrderReviewReadiness, OrderReviewReadiness } from "@/components/orders/OrderReviewReadiness";
import { SupplementaryItemsPanel } from "@/components/orders/SupplementaryItemsPanel";
import { canCompleteSurvey, canReviewSourceEvidence } from "@/lib/roles";
import { doorStructureContractBlockers } from "@/lib/doorStructureReadiness";
import { toOrderRevisionInput } from "@/lib/orderRevisionInput";
import {
  useCreateOrderSupplementaryItem,
  useOrderFeedback,
  useProductionOrder,
  useRequestOrderReview,
  useReviewManufacturedItem,
  useReviewManufacturedItemEvidence,
  useReviewOrderSupplementaryItem,
  useReviewOrderSupplementaryItemEvidence,
  useTechnicalCatalog,
  useUpdateOrderRevision,
} from "@/services/production/hooks";
import type { OrderSupplementaryItemInput, ProductionOrderPosition } from "@/services/production/types";
import { useUiStore } from "@/store/uiStore";

type TechnicalPosition = Omit<ProductionOrderPosition, "evidence">;

function openingDimensions(position: TechnicalPosition) {
  const values = [position.openingWidthMm, position.openingHeightMm];
  return values.every((value) => value != null) ? `${values.join(" × ")} mm` : "Hiányos falnyílásméret";
}

function wallDepth(position: TechnicalPosition) {
  return position.openingDepthMm != null ? `${position.openingDepthMm} mm` : "Nincs rögzítve";
}

/** Technical preparation consumes the immutable survey facts and adds the
 * catalogue choices required before independent review. */
export function TechnicalPreparationPage() {
  const { projectKey = "" } = useParams();
  const [searchParams] = useSearchParams();
  const requestedPositionId = searchParams.get("position");
  const navigate = useNavigate();
  const role = useUiStore((state) => state.role);
  const orderQuery = useProductionOrder(projectKey);
  const { data: order, isLoading, isError } = orderQuery;
  const revision = order?.revisions[0];
  const { data: catalog } = useTechnicalCatalog();
  const feedback = useOrderFeedback(projectKey, revision?.revision);
  const updateRevision = useUpdateOrderRevision(projectKey);
  const requestReview = useRequestOrderReview(projectKey);
  const reviewManufactured = useReviewManufacturedItem(projectKey, revision?.revision);
  const reviewManufacturedEvidence = useReviewManufacturedItemEvidence(projectKey, revision?.revision);
  const createSupplementary = useCreateOrderSupplementaryItem(projectKey, revision?.revision);
  const reviewSupplementary = useReviewOrderSupplementaryItem(projectKey, revision?.revision);
  const reviewSupplementaryEvidence = useReviewOrderSupplementaryItemEvidence(projectKey, revision?.revision);
  const revisionIdentity = revision?.id;
  const [positions, setPositions] = useState<TechnicalPosition[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!revision) return;
    setPositions(revision.positions.map(({ evidence: _evidence, ...position }) => position));
    const requestedIndex = requestedPositionId ? revision.positions.findIndex((position) => position.id === requestedPositionId) : -1;
    setSelectedIndex(requestedIndex >= 0 ? requestedIndex : 0);
    setDirty(false);
  }, [revisionIdentity]);
  useEffect(() => {
    if (!requestedPositionId || positions.length === 0) return;
    const requestedIndex = positions.findIndex((position) => position.id === requestedPositionId);
    if (requestedIndex >= 0) setSelectedIndex(requestedIndex);
  }, [requestedPositionId, revisionIdentity, positions.length]);

  if (isLoading) return <main className="orders-page"><div className="orders-content"><div className="orders-state">Műszaki előkészítés betöltése…</div></div></main>;
  if (isError || !revision) return <main className="orders-page"><div className="orders-content"><div className="orders-state">A műszaki előkészítéshez tartozó rendelés nem érhető el.</div></div></main>;

  const canEdit = revision.status === "DRAFT" && revision.intakeStage === "TECHNICAL_PREPARATION" && canCompleteSurvey(role);
  const canReviewSourceItems = revision.status === "DRAFT"
    && revision.intakeStage === "TECHNICAL_PREPARATION"
    && canReviewSourceEvidence(role);
  const selected = positions[selectedIndex];
  const reviewStatePending = orderQuery.isFetching || feedback.isLoading || feedback.isFetching || feedback.isError;
  const reviewReadiness = getOrderReviewReadiness(revision, feedback.data ?? []);
  const positionsLoaded = positions.length === revision.positions.length;
  const missingMaterialCount = positions.filter((position) => !position.materialKey).length;
  const missingHardwareCount = positions.filter((position) => position.hardwareKeys.length === 0).length;
  const missingMachiningCount = positions.filter((position) => position.machiningKeys.length === 0).length;
  const technicalBlockers = [
    ...(revision.status !== "DRAFT" ? ["Csak DRAFT revízió küldhető új review-ra."] : []),
    ...(revision.intakeStage !== "TECHNICAL_PREPARATION" ? ["A műszaki előkészítési adatkapu még nem aktív."] : []),
    ...(!positionsLoaded ? ["A műszaki pozíciók betöltése még folyamatban van."] : []),
    ...(positionsLoaded && missingMaterialCount > 0
      ? [`${missingMaterialCount} pozíción nincs anyag kiválasztva.`]
      : []),
    ...(positionsLoaded && missingHardwareCount > 0
      ? [`${missingHardwareCount} pozíción nincs explicit vasalatválasztás.`]
      : []),
    ...(positionsLoaded && missingMachiningCount > 0
      ? [`${missingMachiningCount} pozíción nincs explicit megmunkálási döntés.`]
      : []),
    ...doorStructureContractBlockers(positions.length),
  ];
  const reviewReady = !reviewStatePending && reviewReadiness.ready && technicalBlockers.length === 0;

  function patchSelected(values: Partial<TechnicalPosition>) {
    setPositions((current) => current.map((position, index) => index === selectedIndex ? { ...position, ...values } : position));
    setDirty(true);
  }

  function toggle(field: "hardwareKeys" | "machiningKeys", key: string) {
    const current = selected?.[field] ?? [];
    patchSelected({ [field]: current.includes(key) ? current.filter((value) => value !== key) : [...current, key] } as Partial<TechnicalPosition>);
  }

  function technicalPositionState(position: TechnicalPosition) {
    const explicitDecisionCount = Number(Boolean(position.materialKey))
      + Number(position.hardwareKeys.length > 0)
      + Number(position.machiningKeys.length > 0);
    return explicitDecisionCount > 0 ? `${explicitDecisionCount}/3 jelenlegi döntés · strukturált felületkiosztásra vár` : "Műszaki döntésekre vár";
  }

  async function save() {
    if (!canEdit || !revision) return;
    try {
      await updateRevision.mutateAsync({ revision: revision.revision, input: toOrderRevisionInput(revision, positions) });
      setDirty(false);
      setMessage("A műszaki adatok mentve.");
    } catch {
      setMessage("A műszaki adatok mentése nem sikerült. Frissítés előtt ellenőrizd, hogy a revízió továbbra is szerkeszthető-e.");
    }
  }

  async function sendToReview() {
    if (!canEdit || !revision) return;
    if (!reviewReady) {
      setMessage("A review még nem indítható. Zárd le a készenléti panel minden blokkolóját.");
      return;
    }
    setMessage(null);
    try {
      if (dirty) await updateRevision.mutateAsync({ revision: revision.revision, input: toOrderRevisionInput(revision, positions) });
      await requestReview.mutateAsync({ revision: revision.revision, note: "Műszaki előkészítés ellenőrizve; független review kérve." });
      navigate(`/orders/${encodeURIComponent(projectKey)}`);
    } catch {
      setMessage("A review még nem indítható. Zárd le a nyitott evidence-, gyártási tétel- és tartozék-review-kat.");
    }
  }

  async function reviewManufacturedItem(itemId: string, state: "VERIFIED" | "REJECTED", resolution: string) {
    try {
      await reviewManufactured.mutateAsync({ itemId, state, resolution });
      setMessage(null);
    } catch {
      setMessage("A gyártási tétel review-ja nem sikerült. Csak szerkeszthető műszaki piszkozatban végezhető.");
    }
  }

  async function reviewManufacturedItemEvidence(
    itemId: string,
    evidenceId: string,
    reviewState: "RESOLVED" | "REJECTED",
    resolution: string,
  ) {
    try {
      await reviewManufacturedEvidence.mutateAsync({ itemId, evidenceId, reviewState, resolution });
      setMessage(null);
    } catch (error) {
      setMessage("A gyártási forrásbizonyíték döntése nem menthető. Frissítsd a tételt; egy lezárt döntés nem módosítható.");
      throw error;
    }
  }

  async function createSupplementaryItem(input: OrderSupplementaryItemInput) {
    try {
      await createSupplementary.mutateAsync(input);
      setMessage(null);
    } catch {
      setMessage("A tartozék rögzítése nem sikerült. Ellenőrizd a kötelező mezőket és a revízió állapotát.");
    }
  }

  async function reviewSupplementaryItem(itemId: string, state: "VERIFIED" | "REJECTED", resolution: string) {
    try {
      await reviewSupplementary.mutateAsync({ itemId, state, resolution });
      setMessage(null);
    } catch {
      setMessage("A tartozék review-ja nem sikerült. Forrásos tétel elfogadásához lezárt evidence szükséges.");
    }
  }

  async function reviewSupplementaryItemEvidence(
    itemId: string,
    evidenceId: string,
    reviewState: "RESOLVED" | "REJECTED",
    resolution: string,
  ) {
    try {
      await reviewSupplementaryEvidence.mutateAsync({ itemId, evidenceId, reviewState, resolution });
      setMessage(null);
    } catch (error) {
      setMessage("A tartozék forrásbizonyíték döntése nem menthető. Frissítsd a tételt; egy lezárt döntés nem módosítható.");
      throw error;
    }
  }

  return <main className="technical-preparation-page"><div className="technical-preparation-content">
    <div className="order-intake-breadcrumb"><Link to={`/orders/${encodeURIComponent(projectKey)}`}>Rendelési adatlap</Link> / Műszaki előkészítés</div>
    <header className="technical-preparation-hero"><div><p>Műszaki előkészítés</p><h1>{revision.customerName}</h1><span>A felmért tényadatokból katalóguskulcsok, megmunkálások és review-kész műszaki csomag készül. Innen még nem adható ki munka az üzemnek.</span></div><b>{canEdit ? "Szerkeszthető DRAFT" : "Zárolt"}</b></header>
    {!canEdit && <div className="order-intake-message"><strong>!</strong>Ez a munkatér csak DRAFT + műszaki előkészítés állapotban, megfelelő szerepkörrel szerkeszthető.</div>}

    <OrderReviewReadiness revision={revision} feedback={feedback.data ?? []} reviewStatePending={reviewStatePending} additionalBlockers={technicalBlockers} />

    <section className="technical-position-workspace">
      <header><div><span>Ajtópozíciók</span><h2>Felmérési snapshot és műszaki konfiguráció</h2></div><b>{positions.length} pozíció</b></header>
      <div className="technical-position-layout">
        <nav className="survey-position-nav" aria-label="Ajtópozíciók">{positions.map((position, index) => <button className={`survey-position-nav-item${index === selectedIndex ? " is-active" : ""}`} key={position.id ?? `${position.code}-${index}`} type="button" onClick={() => setSelectedIndex(index)}><span>{position.code}</span><strong>{position.name}</strong><small>{technicalPositionState(position)}</small></button>)}</nav>
        {selected && <article className="technical-position-editor">
          <header><div><span>{selected.code}</span><h3>{selected.name}</h3></div><b>{selected.quantity} db</b></header>
          <dl className="technical-survey-snapshot"><div><dt>Falnyílás</dt><dd>{openingDimensions(selected)}</dd></div><div><dt>Kész falvastagság · örökölt mérés</dt><dd>{wallDepth(selected)}</dd></div><div><dt>Ajtótípus</dt><dd>{selected.doorTypeKey ?? "—"}</dd></div><div><dt>Örökölt felületi forrás</dt><dd>{selected.surface ?? selected.finishKey ?? "—"}</dd></div><div><dt>Örökölt nyitásmegadás</dt><dd>{selected.openingDirection ?? "—"}</dd></div><div><dt>Fal / üveg</dt><dd>{[selected.wallSolutionKey, selected.glassKey].filter(Boolean).join(" · ") || "—"}</dd></div></dl>
          <DoorSideAppearancePanel
            surface={selected.surface}
            legacyFinishLabel={catalog?.finishes.find((choice) => choice.key === selected.finishKey)?.label ?? selected.finishKey}
            wallDepthMm={selected.openingDepthMm}
            context="TECHNICAL"
          />
          <div className="technical-fields">
            <label><span>Anyag</span><select value={selected.materialKey ?? ""} disabled={!canEdit || !catalog} onChange={(event) => patchSelected({ materialKey: event.target.value || null })}><option value="">Választás…</option>{catalog?.materials.map((choice) => <option value={choice.key} key={choice.key}>{choice.label}</option>)}</select></label>
            <fieldset><legend>Vasalatok</legend>{catalog?.hardware.map((choice) => <label key={choice.key}><input type="checkbox" disabled={!canEdit} checked={selected.hardwareKeys.includes(choice.key)} onChange={() => toggle("hardwareKeys", choice.key)} /> {choice.label}</label>)}</fieldset>
            <fieldset><legend>Megmunkálások</legend>{catalog?.machinings.map((choice) => <label key={choice.key}><input type="checkbox" disabled={!canEdit} checked={selected.machiningKeys.includes(choice.key)} onChange={() => toggle("machiningKeys", choice.key)} /> {choice.label}</label>)}</fieldset>
            <label className="wide"><span>Műszaki megjegyzés</span><textarea value={selected.technicalNotes} disabled={!canEdit} onChange={(event) => patchSelected({ technicalNotes: event.target.value })} /></label>
          </div>
        </article>}
      </div>
    </section>

    <ManufacturedItemsPanel
      items={revision.manufacturedItems}
      canReview={canReviewSourceItems}
      canReviewEvidence={canReviewSourceItems}
      pending={reviewManufactured.isPending || reviewManufacturedEvidence.isPending}
      onReview={reviewManufacturedItem}
      onReviewEvidence={reviewManufacturedItemEvidence}
    />
    <SupplementaryItemsPanel
      items={revision.supplementaryItems}
      canCreate={canReviewSourceItems}
      canReview={canReviewSourceItems}
      canReviewEvidence={canReviewSourceItems}
      pending={createSupplementary.isPending || reviewSupplementary.isPending || reviewSupplementaryEvidence.isPending}
      onCreate={createSupplementaryItem}
      onReview={reviewSupplementaryItem}
      onReviewEvidence={reviewSupplementaryItemEvidence}
    />

    {message && <div className="order-intake-message" role="status"><strong>!</strong>{message}</div>}
    <footer className="technical-preparation-actions"><p>A review változatlan revíziót készít. Az alkatrészképzés és üzemi kiadás külön, későbbi kapu.</p><div><button className="order-button order-button-secondary" disabled={!canEdit || !dirty || updateRevision.isPending} onClick={() => void save()}>{updateRevision.isPending ? "Mentés…" : "Műszaki adatok mentése"}</button><button className="order-button order-button-primary" disabled={!canEdit || !reviewReady || requestReview.isPending || updateRevision.isPending} title={reviewReady ? undefined : "Előbb zárd le a készenléti panel minden blokkolóját."} onClick={() => void sendToReview()}>{requestReview.isPending ? "Küldés…" : "Review-ra küldés"}</button></div></footer>
  </div></main>;
}
