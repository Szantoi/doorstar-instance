import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@/services/apiClient";
import { canCreateSalesOrder } from "@/lib/roles";
import {
  blankSalesPosition,
  centimetresToMillimetres,
  smallestAvailableSalesPositionCode,
  toSalesIntakeInput,
  type SalesGlazingDraft,
  type SalesIntakeDraft,
  type SalesIntakeErrors,
  type SalesPositionDraft,
} from "@/lib/salesIntake";
import { useCreateSalesIntake } from "@/services/production/hooks";
import { useUiStore } from "@/store/uiStore";

const initialDraft = (): SalesIntakeDraft => ({
  projectKey: "",
  projectName: "",
  projectNum: "",
  customerName: "",
  customerAddress: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  deliveryAddress: "",
  priority: 0,
  deliveryExpectationPrecision: "UNRESOLVED",
  expectedDelivery: "",
  expectedDeliveryMonth: "",
  notes: "",
  positions: [blankSalesPosition("sales-position-1", 1)],
});

const isPhoneViewport = () => typeof window !== "undefined"
  && window.matchMedia?.("(max-width: 620px)").matches === true;

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <small className="order-field-error" id={id}>{message}</small> : null;
}

function MeasurementField({
  draftId,
  field,
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  draftId: string;
  field: "openingWidthCm" | "openingHeightCm" | "openingDepthCm";
  label: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const conversion = centimetresToMillimetres(value);
  const errorId = `${draftId}-${field}-error`;
  return <label className="order-field">
    <span>{label}</span>
    <div className={`order-unit-input${error ? " is-invalid" : ""}`}>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={!!error}
        disabled={disabled}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <i>cm</i>
    </div>
    {conversion.success && conversion.millimetres != null && <small className="order-unit-preview">
      Mentés: {conversion.millimetres} mm
    </small>}
    <FieldError id={errorId} message={error} />
  </label>;
}

/** Sales-owned starting point. Every save opens a fresh project and revision-1
 * draft; documents, accessories and technical output remain later workflows. */
export function OrderIntakePage() {
  const role = useUiStore((state) => state.role);
  const navigate = useNavigate();
  const createSalesIntake = useCreateSalesIntake();
  const [draft, setDraft] = useState<SalesIntakeDraft>(initialDraft);
  const [selectedDraftId, setSelectedDraftId] = useState("sales-position-1");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [errors, setErrors] = useState<SalesIntakeErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const nextDraftSequence = useRef(2);
  const editorRef = useRef<HTMLElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusRef = useRef<string | null>(null);
  const shouldFocusEditorRef = useRef(false);
  const submissionInFlightRef = useRef(false);
  const developmentWriteEnabled = import.meta.env.DEV;
  const roleCanManage = canCreateSalesOrder(role);
  const canManage = developmentWriteEnabled && roleCanManage;
  const disabled = !canManage || createSalesIntake.isPending;
  const selected = draft.positions.find((position) => position.draftId === selectedDraftId) ?? draft.positions[0];

  const setHeader = <K extends keyof Omit<SalesIntakeDraft, "positions">>(key: K, value: SalesIntakeDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const changePosition = (draftId: string, patch: Partial<SalesPositionDraft>) => {
    setDraft((current) => ({
      ...current,
      positions: current.positions.map((position) => position.draftId === draftId ? { ...position, ...patch } : position),
    }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) {
        if (key === "code") {
          for (const errorKey of Object.keys(next)) {
            if (errorKey.startsWith("positions.") && errorKey.endsWith(".code")) delete next[errorKey];
          }
        } else delete next[`positions.${draftId}.${key}`];
      }
      return next;
    });
  };

  const openPosition = (draftId: string) => {
    const openPhoneDetail = isPhoneViewport();
    returnFocusRef.current = openPhoneDetail ? draftId : null;
    shouldFocusEditorRef.current = openPhoneDetail;
    setSelectedDraftId(draftId);
    setMobileDetailOpen(openPhoneDetail);
  };

  const closeMobileDetail = () => {
    shouldFocusEditorRef.current = false;
    setMobileDetailOpen(false);
  };

  useEffect(() => {
    if (mobileDetailOpen && shouldFocusEditorRef.current) {
      shouldFocusEditorRef.current = false;
      editorRef.current?.focus();
      return;
    }
    if (!mobileDetailOpen && returnFocusRef.current) {
      rowRefs.current.get(returnFocusRef.current)?.focus();
      returnFocusRef.current = null;
    }
  }, [mobileDetailOpen, selectedDraftId]);

  useEffect(() => {
    if (!mobileDetailOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileDetail();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileDetailOpen]);

  const addPosition = () => {
    if (disabled) return;
    const code = smallestAvailableSalesPositionCode(draft.positions);
    if (!code) {
      setMessage("Nincs szabad kétjegyű pozíciókód a 01–99 tartományban.");
      return;
    }
    const sequence = nextDraftSequence.current++;
    const position = blankSalesPosition(`sales-position-${sequence}`, code);
    setDraft((current) => ({ ...current, positions: [...current.positions, position] }));
    openPosition(position.draftId);
  };

  const removeSelectedPosition = () => {
    if (disabled || draft.positions.length <= 1 || !selected) return;
    const currentIndex = draft.positions.findIndex((position) => position.draftId === selected.draftId);
    const remaining = draft.positions.filter((position) => position.draftId !== selected.draftId);
    const nextSelected = remaining[Math.min(currentIndex, remaining.length - 1)];
    setDraft((current) => ({ ...current, positions: remaining }));
    setSelectedDraftId(nextSelected.draftId);
    returnFocusRef.current = nextSelected.draftId;
    shouldFocusEditorRef.current = true;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!developmentWriteEnabled || !roleCanManage || createSalesIntake.isPending || submissionInFlightRef.current) return;
    const result = toSalesIntakeInput(draft);
    if (!result.success) {
      setErrors(result.errors);
      setMessage("Ellenőrizd a jelölt Sales-forrásmezőket. A piszkozat nem lett elküldve.");
      const firstPositionError = Object.keys(result.errors).find((key) => key.startsWith("positions."));
      const invalidDraftId = firstPositionError?.split(".")[1];
      if (invalidDraftId) openPosition(invalidDraftId);
      return;
    }

    setErrors({});
    setMessage(null);
    submissionInFlightRef.current = true;
    try {
      await createSalesIntake.mutateAsync(result.input);
      navigate(`/orders/${encodeURIComponent(result.input.projectKey)}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setMessage("A jelenlegi szerepkör nem jogosult Sales piszkozat létrehozására.");
      } else if (error instanceof ApiError && error.status === 409) {
        setMessage("Ez a projektazonosító már foglalt. Adj meg új projektazonosítót.");
      } else {
        setMessage("A Sales piszkozat mentése nem sikerült. Az adatok a lapon megmaradtak.");
      }
    } finally {
      submissionInFlightRef.current = false;
    }
  };

  const positionError = (field: keyof SalesPositionDraft) => errors[`positions.${selected?.draftId}.${field}`];

  return <main className="order-intake-page"><div className="order-intake-content">
    <div className="order-intake-breadcrumb">Sales / Új megrendelés</div>
    <header className="order-intake-hero">
      <div><p className="order-intake-eyebrow">Sales munkatér</p><h1>Új megrendelés</h1><p className="order-intake-lede">Minden rendelés külön projektet nyit. Most a forrásadatokat rögzíted; a felmérés és a műszaki előkészítés külön, későbbi lépés.</p></div>
      <div className="order-intake-status"><span />{developmentWriteEnabled ? "Sales piszkozat" : "Production írás zárolva"}</div>
    </header>

    {!developmentWriteEnabled ? <div className="order-intake-production-blocker" role="alert">
      <strong>AUTHENTICATED_SALES_PRINCIPAL_REQUIRED</strong>
      <p>A nyilvános production build személyes adatot tartalmazó Sales POST művelete kliensoldalon zárolt. Valódi rögzítéshez hitelesített Sales principal backend-contract szükséges; ez a UI-kapu önmagában nem szerveroldali hitelesítés.</p>
    </div> : !roleCanManage && <p className="order-intake-readonly" role="status">A jelenlegi szerepkör csak olvashatja ezt a lapot; mentési művelet nem érhető el.</p>}

    <div className="order-intake-scope-blocker" role="note">
      <strong>Forrás-lineage hatókör</strong>
      <p>Ez a fejlesztői piszkozat csak teljes nap pontosságú várható dátumot és normalizált numerikus mm értéket ment. A csak hónap-pontosságú dátum és a nyers cm-szöveg lineage itt nem őrizhető meg: ilyen forrást nem szabad teljes, veszteségmentes rögzítésként kezelni.</p>
    </div>

    <form noValidate onSubmit={submit}>
      <section className="order-intake-section" aria-labelledby="sales-order-heading">
        <div className="order-intake-section-heading"><div><p className="order-intake-section-number">01</p><h2 id="sales-order-heading">Projekt és megrendelés</h2></div><p>Új projekt: új megrendelés és új beépítés, ismétlődő vevőnél is.</p></div>
        <div className="order-intake-form-grid">
          <label className="order-field"><span>Projektazonosító <b>*</b></span><input aria-describedby={errors.projectKey ? "project-key-error" : undefined} aria-invalid={!!errors.projectKey} disabled={disabled} value={draft.projectKey} onChange={(event) => setHeader("projectKey", event.target.value)} placeholder="DSMR-TEST-001" /><FieldError id="project-key-error" message={errors.projectKey} /></label>
          <label className="order-field"><span>Munkaszám</span><input disabled={disabled} value={draft.projectNum} onChange={(event) => setHeader("projectNum", event.target.value)} placeholder="TEST-001" /></label>
          <label className="order-field order-field-wide"><span>Projekt neve <b>*</b></span><input aria-describedby={errors.projectName ? "project-name-error" : undefined} aria-invalid={!!errors.projectName} disabled={disabled} value={draft.projectName} onChange={(event) => setHeader("projectName", event.target.value)} placeholder="Minta Megrendelő" /><FieldError id="project-name-error" message={errors.projectName} /></label>
          <label className="order-field order-field-wide"><span>Megrendelő <b>*</b></span><input aria-describedby={errors.customerName ? "customer-name-error" : undefined} aria-invalid={!!errors.customerName} disabled={disabled} value={draft.customerName} onChange={(event) => setHeader("customerName", event.target.value)} /><FieldError id="customer-name-error" message={errors.customerName} /></label>
          <label className="order-field order-field-wide"><span>Megrendelő címe</span><input disabled={disabled} value={draft.customerAddress} onChange={(event) => setHeader("customerAddress", event.target.value)} /></label>
          <label className="order-field"><span>Kapcsolattartó</span><input disabled={disabled} value={draft.contactName} onChange={(event) => setHeader("contactName", event.target.value)} /></label>
          <label className="order-field"><span>Telefonszám</span><input disabled={disabled} type="tel" value={draft.contactPhone} onChange={(event) => setHeader("contactPhone", event.target.value)} /></label>
          <label className="order-field order-field-wide"><span>E-mail</span><input aria-describedby={errors.contactEmail ? "contact-email-error" : undefined} aria-invalid={!!errors.contactEmail} disabled={disabled} type="email" value={draft.contactEmail} onChange={(event) => setHeader("contactEmail", event.target.value)} /><FieldError id="contact-email-error" message={errors.contactEmail} /></label>
          <label className="order-field order-field-wide"><span>Szállítási cím</span><input disabled={disabled} value={draft.deliveryAddress} onChange={(event) => setHeader("deliveryAddress", event.target.value)} /></label>
          <label className="order-field"><span>Prioritás</span><select disabled={disabled} value={draft.priority} onChange={(event) => setHeader("priority", Number(event.target.value))}>{[0, 1, 2, 3].map((value) => <option key={value} value={value}>{value === 0 ? "Normál" : `${value}. prioritás`}</option>)}</select></label>
          <label className="order-field"><span>Várható szállítás pontossága</span><select disabled={disabled} value={draft.deliveryExpectationPrecision} onChange={(event) => setHeader("deliveryExpectationPrecision", event.target.value as SalesIntakeDraft["deliveryExpectationPrecision"])}><option value="UNRESOLVED">Nem feloldott</option><option value="DAY">Pontos nap</option><option value="MONTH">Csak hónap</option></select></label>
          {draft.deliveryExpectationPrecision === "DAY" && <label className="order-field order-field-date"><span>Várható szállítás — pontos nap</span><input aria-describedby={errors.expectedDelivery ? "expected-delivery-error" : undefined} aria-invalid={!!errors.expectedDelivery} disabled={disabled} type="date" value={draft.expectedDelivery} onChange={(event) => setHeader("expectedDelivery", event.target.value)} /><FieldError id="expected-delivery-error" message={errors.expectedDelivery} /></label>}
          {draft.deliveryExpectationPrecision === "MONTH" && <label className="order-field order-field-date"><span>Várható szállítás — hónap</span><input aria-describedby="expected-delivery-month-scope expected-delivery-month-error" aria-invalid="true" disabled={disabled} type="month" value={draft.expectedDeliveryMonth} onChange={(event) => setHeader("expectedDeliveryMonth", event.target.value)} /><small id="expected-delivery-month-scope">Helyi draftként megadható, de union backend-contract nélkül nem küldhető el; napot nem találunk ki.</small><FieldError id="expected-delivery-month-error" message={errors.expectedDeliveryMonth} /></label>}
          {draft.deliveryExpectationPrecision === "UNRESOLVED" && <p className="order-intake-unresolved-date">Várható szállítás: nem feloldott, az API-ba <code>null</code> kerül.</p>}
          <label className="order-field order-field-full"><span>Rendelési megjegyzés</span><textarea disabled={disabled} value={draft.notes} onChange={(event) => setHeader("notes", event.target.value)} rows={3} /></label>
        </div>
      </section>

      <section className="order-intake-section" aria-labelledby="sales-positions-heading">
        <div className="order-intake-section-heading order-intake-positions-heading">
          <div><p className="order-intake-section-number">02</p><h2 id="sales-positions-heading">Ajtópozíciók</h2></div>
          <div className="order-intake-section-actions"><p>A Sales csak a forrásból ismert adatokat viszi tovább. A lábazat és accessory tételek nem ajtópozíciók.</p>{canManage && <button className="order-button order-button-secondary" disabled={disabled} type="button" onClick={addPosition}>Új ajtópozíció</button>}</div>
        </div>

        <p className="order-intake-contract-note"><strong>Külön rögzítési folyamat:</strong> a lábazat és egyéb kiegészítők a piszkozat mentése után kezelhetők. A blende és falpanel részletes adataihoz külön strukturált műszaki szerződés szükséges; ezeket ne lapítsd megjegyzésbe.</p>

        <div className={`sales-intake-position-workspace${mobileDetailOpen ? " is-mobile-detail" : ""}`}>
          <div className="sales-intake-position-list" aria-label="Ajtópozíciók listája">
            {draft.positions.map((position) => {
              const isSelected = position.draftId === selected?.draftId;
              const hasErrors = Object.keys(errors).some((key) => key.startsWith(`positions.${position.draftId}.`));
              return <button
                aria-controls={isSelected ? "sales-position-editor" : undefined}
                aria-pressed={isSelected}
                className={`sales-intake-position-row${isSelected ? " is-selected" : ""}${hasErrors ? " is-invalid" : ""}`}
                disabled={createSalesIntake.isPending}
                key={position.draftId}
                onClick={() => openPosition(position.draftId)}
                ref={(element) => {
                  if (element) rowRefs.current.set(position.draftId, element);
                  else rowRefs.current.delete(position.draftId);
                }}
                type="button"
              >
                <span>{position.code || "—"}</span>
                <strong>{position.name || "Névtelen pozíció"}</strong>
                <small>{position.quantity || 0} db · {position.openingWidthCm || "—"} × {position.openingHeightCm || "—"} cm</small>
                <b>{hasErrors ? "Ellenőrzendő" : "Sales forrás"}</b>
              </button>;
            })}
          </div>

          {selected && <article className="sales-intake-position-editor" id="sales-position-editor" ref={editorRef} tabIndex={-1}>
            <header className="order-position-header">
              <button className="sales-intake-mobile-back" type="button" onClick={closeMobileDetail}>← Vissza a pozíciókhoz</button>
              <div><span>Szerkesztett pozíció</span><strong>{selected.code || "—"}</strong></div>
              {canManage && draft.positions.length > 1 && <button className="order-button order-button-danger" disabled={disabled} type="button" onClick={removeSelectedPosition}>Eltávolítás</button>}
            </header>

            <div className="order-position-grid">
              <label className="order-field"><span>Pozíciókód <b>*</b></span><input aria-describedby={positionError("code") ? `${selected.draftId}-code-error` : undefined} aria-invalid={!!positionError("code")} disabled={disabled} value={selected.code} onChange={(event) => changePosition(selected.draftId, { code: event.target.value })} /><FieldError id={`${selected.draftId}-code-error`} message={positionError("code")} /></label>
              <label className="order-field order-field-name"><span>Megnevezés <b>*</b></span><input aria-describedby={positionError("name") ? `${selected.draftId}-name-error` : undefined} aria-invalid={!!positionError("name")} disabled={disabled} value={selected.name} onChange={(event) => changePosition(selected.draftId, { name: event.target.value })} placeholder="Szoba 1. ajtó" /><FieldError id={`${selected.draftId}-name-error`} message={positionError("name")} /></label>
              <label className="order-field"><span>Darabszám</span><input aria-describedby={positionError("quantity") ? `${selected.draftId}-quantity-error` : undefined} aria-invalid={!!positionError("quantity")} disabled={disabled} min="1" step="1" type="number" value={selected.quantity} onChange={(event) => changePosition(selected.draftId, { quantity: Number(event.target.value) })} /><FieldError id={`${selected.draftId}-quantity-error`} message={positionError("quantity")} /></label>
              <label className="order-field"><span>Ajtótípus — forrásszöveg</span><input disabled={disabled} value={selected.productType} onChange={(event) => changePosition(selected.draftId, { productType: event.target.value })} /></label>
              <label className="order-field order-field-wide"><span>Örökölt nyitásmegadás</span><input disabled={disabled} value={selected.openingDirection} onChange={(event) => changePosition(selected.draftId, { openingDirection: event.target.value })} placeholder="Pl. Bal be" /><small>Nyers Sales-forrásérték; nem SIDE_A/SIDE_B, pántoldal vagy strukturált nyitási irány.</small></label>
              <label className="order-field order-field-wide"><span>Örökölt közös felület — forrásszöveg</span><input disabled={disabled} value={selected.surface} onChange={(event) => changePosition(selected.draftId, { surface: event.target.value })} placeholder="Pl. Minta CPL" /><small>Nem teljes felületi modell. Eltérő ajtólap-, tok-, tokborítás- vagy blendefelületeket itt nem szabad összelapítani; ezekhez külön strukturált contract kell.</small></label>
              <label className="order-field order-field-full sales-intake-appearance-flag"><span>Felületstruktúra jelző</span><span className="sales-intake-checkbox"><input checked={selected.hasStructuredAppearanceDifferences} disabled={disabled} type="checkbox" onChange={(event) => changePosition(selected.draftId, { hasStructuredAppearanceDifferences: event.target.checked })} />Külön ajtólap-, tok-, tokborítás- vagy blendefelület van</span><small>Bekapcsolva a Sales submit zárt marad, amíg nincs strukturált appearance-contract.</small><FieldError id={`${selected.draftId}-appearance-error`} message={positionError("hasStructuredAppearanceDifferences")} /></label>
              <label className="order-field"><span>Üvegezés</span><select disabled={disabled} value={selected.glazing} onChange={(event) => {
                const glazing = event.target.value as SalesGlazingDraft;
                changePosition(selected.draftId, { glazing, ...(glazing !== "GLAZED" ? { glazingSpecification: "" } : {}) });
              }}><option value="">Nincs forrásadat</option><option value="NONE">Nem üveges</option><option value="GLAZED">Üveges</option></select></label>
              {selected.glazing === "GLAZED" && <label className="order-field order-field-wide"><span>Üvegezés forrásszövege</span><input disabled={disabled} value={selected.glazingSpecification} onChange={(event) => changePosition(selected.draftId, { glazingSpecification: event.target.value })} /></label>}
            </div>

            <div className="order-dimensions"><p>Sales FNY és kész fal <span>cm bevitel → mm mentés</span></p>
              <small className="sales-intake-lineage-warning">A numerikus érték exact mm-ként menthető, de a nyers cm-formázás (például vessző, pont és szóközök) nem marad meg lineage-ként.</small>
              <MeasurementField draftId={selected.draftId} field="openingWidthCm" label="FNY szélesség" value={selected.openingWidthCm} error={positionError("openingWidthCm")} disabled={disabled} onChange={(value) => changePosition(selected.draftId, { openingWidthCm: value })} />
              <MeasurementField draftId={selected.draftId} field="openingHeightCm" label="FNY magasság" value={selected.openingHeightCm} error={positionError("openingHeightCm")} disabled={disabled} onChange={(value) => changePosition(selected.draftId, { openingHeightCm: value })} />
              <MeasurementField draftId={selected.draftId} field="openingDepthCm" label="Kész falvastagság" value={selected.openingDepthCm} error={positionError("openingDepthCm")} disabled={disabled} onChange={(value) => changePosition(selected.draftId, { openingDepthCm: value })} />
            </div>

            <label className="order-field sales-intake-position-notes"><span>Pozíció megjegyzése</span><textarea disabled={disabled} rows={3} value={selected.notes} onChange={(event) => changePosition(selected.draftId, { notes: event.target.value })} /><small>A forrás adott pozícióhoz tartozó megjegyzése; a műszaki kiegészítő struktúrákat ne itt rögzítsd.</small></label>
          </article>}
        </div>
      </section>

      <p className="order-intake-live" aria-live="polite">{mobileDetailOpen && selected ? `${selected.code || "Névtelen"} pozíció szerkesztése megnyitva.` : "Pozíciólista látható."}</p>
      {message && <div className="order-intake-message" role="alert"><strong>!</strong>{message}</div>}
      <footer className="order-intake-footer"><p>A mentés csak az új projektet és az első Sales piszkozatot hozza létre. A dokumentumok, kiegészítők, felmérés és műszaki adatok külön folyamatban következnek.</p><button className="order-button order-button-primary" disabled={disabled} type="submit">{createSalesIntake.isPending ? "Mentés…" : "Sales piszkozat mentése"}</button></footer>
    </form>
  </div></main>;
}
