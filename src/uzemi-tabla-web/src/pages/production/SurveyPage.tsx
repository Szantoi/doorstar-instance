import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAdvanceOrderIntakeStage, useProductionOrder, useUpdateOrderRevision } from "@/services/production/hooks";
import type { ProductionOrderPosition } from "@/services/production/types";
import { useUiStore } from "@/store/uiStore";
import { canCompleteSurvey } from "@/lib/roles";

type SurveyPosition = Omit<ProductionOrderPosition, "evidence">;
const wallLabel = { NONE: "Nincs", WALL_PANEL: "Falpaneles", BLENDE: "Blendés" } as const;

/** Field-survey workspace. It only finalises a Sales DRAFT after the source
 * documents have been received and the position-specific process drivers are known. */
export function SurveyPage() {
  const { projectKey = "" } = useParams();
  const role = useUiStore((state) => state.role);
  const navigate = useNavigate();
  const { data: order, isLoading, isError } = useProductionOrder(projectKey);
  const update = useUpdateOrderRevision(projectKey);
  const advance = useAdvanceOrderIntakeStage(projectKey);
  const revision = order?.revisions[0];
  const [positions, setPositions] = useState<SurveyPosition[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { if (revision) setPositions(revision.positions.map(({ evidence: _evidence, ...position }) => position)); }, [revision]);
  function patch(index: number, values: Partial<SurveyPosition>) { setPositions((all) => all.map((position, i) => i === index ? { ...position, ...values } : position)); }
  function textNumber(value: number | null) { return value == null ? "" : String(value); }

  async function saveSurvey() {
    if (!revision) return;
    setMessage(null);
    try {
      await update.mutateAsync({ revision: revision.revision, input: {
        customerName: revision.customerName, expectedDelivery: revision.expectedDelivery, priority: revision.priority, notes: revision.notes,
        positions: positions.map((position) => ({ ...position })),
      } });
      await advance.mutateAsync({ revision: revision.revision, stage: "SURVEY_COMPLETED" });
      navigate(`/orders/${encodeURIComponent(projectKey)}`);
    } catch { setMessage("A felmérés még hiányos. Minden pozíción add meg a típust, nyitásirányt, szélességet × magasságot × vastagságot, felületet, falmegoldást és üvegezést."); }
  }

  if (isLoading) return <main className="orders-page"><div className="orders-content"><div className="orders-state">Felmérés betöltése…</div></div></main>;
  if (isError || !revision) return <main className="orders-page"><div className="orders-content"><div className="orders-state">A felméréshez tartozó rendelés nem érhető el.</div></div></main>;
  const ready = revision.intakeStage === "SURVEY_PENDING" && canCompleteSurvey(role);

  return <main className="order-intake-page"><div className="order-intake-content">
    <div className="order-intake-breadcrumb"><Link to={`/orders/${encodeURIComponent(projectKey)}`}>Rendelés</Link> / Felmérés</div>
    <header className="order-intake-hero"><div><p className="order-intake-eyebrow">Felmérési munkatér</p><h1>{revision.customerName}</h1><p className="order-intake-lede">A felmérés véglegesíti a gyártást befolyásoló pozícióadatokat. Csak teljes adatlap kerülhet műszaki előkészítésre.</p></div><div className="order-intake-status"><span />{ready ? "Felmérés folyamatban" : "Felmérés zárolva"}</div></header>
    {!ready && <div className="order-intake-message"><strong>!</strong>A felméréshez dokumentumátvétel és műszaki előkészítői vagy jóváhagyói szerep szükséges.</div>}
    <section className="order-intake-section"><div className="order-intake-section-heading"><div><p className="order-intake-section-number">01</p><h2>Végleges pozícióadatok</h2></div><p>A csillaggal jelölt mezők minden ajtópozícióhoz kötelezőek.</p></div>
      <div className="order-position-list">{positions.map((position, index) => <article className="order-position-card" key={`${position.code}-${index}`}><div className="order-position-header"><div><span>Pozíció</span><strong>{position.code}</strong></div><span>{position.name} · {position.quantity} db</span></div>
        <div className="order-position-grid"><label className="order-field"><span>Ajtótípus <b>*</b></span><input value={position.productType ?? ""} onChange={(e) => patch(index, { productType: e.target.value || null })} disabled={!ready} /></label><label className="order-field"><span>Nyitásirány <b>*</b></span><input value={position.openingDirection ?? ""} onChange={(e) => patch(index, { openingDirection: e.target.value || null })} disabled={!ready} placeholder="Bal be" /></label><label className="order-field"><span>Felület <b>*</b></span><input value={position.surface ?? ""} onChange={(e) => patch(index, { surface: e.target.value || null })} disabled={!ready} placeholder="Pl. RAL 9016 / tölgy" /></label><label className="order-field"><span>Falmegoldás <b>*</b></span><select value={position.wallTreatment ?? ""} onChange={(e) => patch(index, { wallTreatment: (e.target.value || null) as SurveyPosition["wallTreatment"] })} disabled={!ready}><option value="">Választás…</option>{Object.entries(wallLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="order-field"><span>Üvegezés <b>*</b></span><select value={position.glazing ?? ""} onChange={(e) => patch(index, { glazing: (e.target.value || null) as SurveyPosition["glazing"], glazingSpecification: e.target.value === "GLAZED" ? position.glazingSpecification : null })} disabled={!ready}><option value="">Választás…</option><option value="NONE">Nem üveges</option><option value="GLAZED">Üveges</option></select></label>{position.glazing === "GLAZED" && <label className="order-field"><span>Üveg specifikáció <b>*</b></span><input value={position.glazingSpecification ?? ""} onChange={(e) => patch(index, { glazingSpecification: e.target.value || null })} disabled={!ready} placeholder="Pl. savmart 4 mm" /></label>}</div>
        <div className="order-dimensions"><p>Falnyílás <span>szélesség × magasság × falvastagság</span></p>{([ ["openingWidthMm", "Szélesség"], ["openingHeightMm", "Magasság"], ["openingDepthMm", "Falvastagság"] ] as const).map(([field, label]) => <label className="order-field" key={field}><span>{label} <b>*</b></span><div className="order-unit-input"><input inputMode="decimal" value={textNumber(position[field])} onChange={(e) => patch(index, { [field]: e.target.value ? Number(e.target.value) : null })} disabled={!ready} /><i>mm</i></div></label>)}</div>
        <div className="order-dimensions"><p>Ajtólap <span>szélesség × magasság × vastagság</span></p>{([ ["doorWidthMm", "Szélesség"], ["doorHeightMm", "Magasság"], ["doorThicknessMm", "Vastagság"] ] as const).map(([field, label]) => <label className="order-field" key={field}><span>{label}{field === "doorThicknessMm" && <b> *</b>}</span><div className="order-unit-input"><input inputMode="decimal" value={textNumber(position[field])} onChange={(e) => patch(index, { [field]: e.target.value ? Number(e.target.value) : null })} disabled={!ready} /><i>mm</i></div></label>)}</div>
      </article>)}</div>
    </section>
    {message && <div className="order-intake-message" role="alert"><strong>!</strong>{message}</div>}
    <footer className="order-intake-footer"><p>A véglegesítés után a pozíciók műszaki előkészítésre adhatók; az üzembe még ekkor sem kerülnek kiadásra.</p><button className="order-button order-button-primary" disabled={!ready || update.isPending || advance.isPending} onClick={saveSurvey}>{update.isPending || advance.isPending ? "Véglegesítés…" : "Felmérés véglegesítése"}</button></footer>
  </div></main>;
}
