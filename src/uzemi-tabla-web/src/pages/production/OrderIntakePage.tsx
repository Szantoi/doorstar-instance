import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, apiFetch } from "@/services/apiClient";
import { PRODUCTION_API_BASE } from "@/services/production/config";
import { useUiStore } from "@/store/uiStore";
import { canCreateSalesOrder } from "@/lib/roles";

type PositionDraft = {
  code: string; name: string; quantity: number; productType: string; openingDirection: string;
  openingWidthMm: string; openingHeightMm: string; openingDepthMm: string;
};

const blankPosition = (index: number): PositionDraft => ({
  code: String(index).padStart(2, "0"), name: "", quantity: 1, productType: "", openingDirection: "",
  openingWidthMm: "", openingHeightMm: "", openingDepthMm: "",
});

/** Sales-owned starting point. It intentionally creates a new Project for
 * every customer order, instead of allowing an old installation to be reused. */
export function OrderIntakePage() {
  const role = useUiStore((s) => s.role);
  const navigate = useNavigate();
  const [projectKey, setProjectKey] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectNum, setProjectNum] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [priority, setPriority] = useState(0);
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [positions, setPositions] = useState<PositionDraft[]>([blankPosition(1)]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canManage = canCreateSalesOrder(role);

  function changePosition(index: number, patch: Partial<PositionDraft>) {
    setPositions((items) => items.map((item, current) => current === index ? { ...item, ...patch } : item));
  }

  async function submit() {
    if (!canManage || !projectKey.trim() || !projectName.trim() || !customerName.trim() || positions.some((position) => !position.name.trim())) {
      setMessage("Add meg az új projektet, a megrendelőt és minden pozíció nevét.");
      return;
    }
    setSaving(true); setMessage(null);
    try {
      await apiFetch(`${PRODUCTION_API_BASE}/production-orders/sales-intake`, {
        method: "POST",
        body: {
          projectKey: projectKey.trim(), projectName: projectName.trim(), projectNum: projectNum.trim() || undefined,
          customerName: customerName.trim(), priority,
          expectedDelivery: expectedDelivery ? new Date(`${expectedDelivery}T00:00:00.000Z`).toISOString() : null,
          positions: positions.map((position) => ({
            code: position.code, name: position.name.trim(), quantity: position.quantity,
            productType: position.productType || null, openingDirection: position.openingDirection || null,
            openingWidthMm: position.openingWidthMm ? Number(position.openingWidthMm) : null,
            openingHeightMm: position.openingHeightMm ? Number(position.openingHeightMm) : null,
            openingDepthMm: position.openingDepthMm ? Number(position.openingDepthMm) : null,
          })),
        },
      });
      navigate(`/orders/${encodeURIComponent(projectKey.trim())}`);
    } catch (error) {
      setMessage(error instanceof ApiError ? "A sales piszkozat mentése nem sikerült. Ellenőrizd a projektazonosítót." : "Váratlan hiba történt.");
    } finally { setSaving(false); }
  }

  return <main className="order-intake-page"><div className="order-intake-content">
    <div className="order-intake-breadcrumb">Sales / Új megrendelés</div>
    <header className="order-intake-hero"><div><p className="order-intake-eyebrow">Sales munkatér</p><h1>Új megrendelés</h1><p className="order-intake-lede">Minden rendelés külön projektet nyit. A felmérés a későbbi, kötelező véglegesítési lépés.</p></div><div className="order-intake-status"><span />Sales piszkozat</div></header>

    <section className="order-intake-section"><div className="order-intake-section-heading"><div><p className="order-intake-section-number">01</p><h2>Projekt és megrendelés</h2></div><p>Új projekt: új megrendelés és új beépítés, ismétlődő vevőnél is.</p></div>
      <div className="order-intake-form-grid">
        <label className="order-field"><span>Projektazonosító <b>*</b></span><input value={projectKey} onChange={(e) => setProjectKey(e.target.value)} disabled={!canManage} placeholder="DSMR-24181" /></label>
        <label className="order-field"><span>Munkaszám</span><input value={projectNum} onChange={(e) => setProjectNum(e.target.value)} disabled={!canManage} placeholder="24181" /></label>
        <label className="order-field order-field-wide"><span>Projekt neve <b>*</b></span><input value={projectName} onChange={(e) => setProjectName(e.target.value)} disabled={!canManage} placeholder="Aktív és Passzívház Kft." /></label>
        <label className="order-field order-field-wide"><span>Megrendelő <b>*</b></span><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={!canManage} /></label>
        <label className="order-field"><span>Prioritás</span><select value={priority} onChange={(e) => setPriority(Number(e.target.value))} disabled={!canManage}>{[0, 1, 2, 3].map((value) => <option key={value} value={value}>{value === 0 ? "Normál" : `${value}. prioritás`}</option>)}</select></label>
        <label className="order-field"><span>Várható szállítás</span><input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} disabled={!canManage} /></label>
      </div>
    </section>

    <section className="order-intake-section"><div className="order-intake-section-heading order-intake-positions-heading"><div><p className="order-intake-section-number">02</p><h2>Ajtópozíciók</h2></div><div className="order-intake-section-actions"><p>A sales csak az ismert alapadatokat rögzíti; a végleges műszaki mezők a felmérésé.</p>{canManage && <button className="order-button order-button-secondary" onClick={() => setPositions((items) => [...items, blankPosition(items.length + 1)])}>Új pozíció</button>}</div></div>
      <div className="order-position-list">{positions.map((position, index) => <article className="order-position-card" key={`${position.code}-${index}`}><div className="order-position-header"><div><span>Pozíció</span><strong>{position.code}</strong></div>{canManage && positions.length > 1 && <button className="order-button order-button-danger" onClick={() => setPositions((items) => items.filter((_, current) => current !== index))}>Eltávolítás</button>}</div>
        <div className="order-position-grid"><label className="order-field"><span>Pozíciókód</span><input value={position.code} onChange={(e) => changePosition(index, { code: e.target.value })} disabled={!canManage} /></label><label className="order-field order-field-name"><span>Megnevezés <b>*</b></span><input value={position.name} onChange={(e) => changePosition(index, { name: e.target.value })} disabled={!canManage} placeholder="Szoba 1. F.04" /></label><label className="order-field"><span>Darabszám</span><input type="number" min="1" value={position.quantity} onChange={(e) => changePosition(index, { quantity: Number(e.target.value) })} disabled={!canManage} /></label><label className="order-field"><span>Ajtótípus</span><input value={position.productType} onChange={(e) => changePosition(index, { productType: e.target.value })} disabled={!canManage} /></label><label className="order-field"><span>Nyitásirány</span><input value={position.openingDirection} onChange={(e) => changePosition(index, { openingDirection: e.target.value })} disabled={!canManage} placeholder="Bal be" /></label></div>
        <div className="order-dimensions"><p>Falnyílás <span>szélesség × magasság × falvastagság</span></p><label className="order-field"><span>Szélesség</span><div className="order-unit-input"><input inputMode="decimal" value={position.openingWidthMm} onChange={(e) => changePosition(index, { openingWidthMm: e.target.value })} disabled={!canManage} /><i>mm</i></div></label><label className="order-field"><span>Magasság</span><div className="order-unit-input"><input inputMode="decimal" value={position.openingHeightMm} onChange={(e) => changePosition(index, { openingHeightMm: e.target.value })} disabled={!canManage} /><i>mm</i></div></label><label className="order-field"><span>Falvastagság</span><div className="order-unit-input"><input inputMode="decimal" value={position.openingDepthMm} onChange={(e) => changePosition(index, { openingDepthMm: e.target.value })} disabled={!canManage} /><i>mm</i></div></label></div>
      </article>)}</div>
    </section>
    {message && <div className="order-intake-message" role="alert"><strong>!</strong>{message}</div>}
    <footer className="order-intake-footer"><p>A mentés egy új projektet és annak első sales-piszkozatát hozza létre.</p><button className="order-button order-button-primary" disabled={!canManage || saving} onClick={submit}>{saving ? "Mentés…" : "Sales piszkozat mentése"}</button></footer>
  </div></main>;
}
