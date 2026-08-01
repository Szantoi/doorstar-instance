import type { ComponentRequirementDraft, ComponentSourceOption } from "@/lib/componentWorkspace";
import type { TechnicalCatalog } from "@/services/production/types";

interface ComponentRequirementEditorProps {
  row: ComponentRequirementDraft;
  index: number;
  source: ComponentSourceOption;
  catalog: TechnicalCatalog;
  errors: string[];
  disabled: boolean;
  onChange: (next: ComponentRequirementDraft) => void;
  onRemove: () => void;
}

function DimensionFields({
  label,
  value,
  required,
  disabled,
  onChange,
}: {
  label: string;
  value: ComponentRequirementDraft["finishedDimensionsMm"];
  required: boolean;
  disabled: boolean;
  onChange: (next: ComponentRequirementDraft["finishedDimensionsMm"]) => void;
}) {
  return (
    <fieldset className="component-dimension-set">
      <legend>{label}{required && " *"}</legend>
      {([
        ["width", "Szélesség"],
        ["height", "Magasság"],
        ["thickness", "Vastagság"],
      ] as const).map(([key, fieldLabel]) => (
        <label key={key}>
          <span>{fieldLabel}</span>
          <div>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={value[key]}
              disabled={disabled}
              required={required}
              onChange={(event) => onChange({ ...value, [key]: event.target.value })}
            />
            <i>mm</i>
          </div>
        </label>
      ))}
    </fieldset>
  );
}

/** One explicit component-output row. It renders user-entered values only:
 * no order dimension, source quantity, or catalog choice is copied in. */
export function ComponentRequirementEditor({
  row,
  index,
  source,
  catalog,
  errors,
  disabled,
  onChange,
  onRemove,
}: ComponentRequirementEditorProps) {
  const patch = (values: Partial<ComponentRequirementDraft>) => onChange({ ...row, ...values });
  const isCutPart = row.requirementKind === "CUT_PART";
  const dimensions = (
    <div className="component-dimensions-pair">
      <DimensionFields
        label="Készméret"
        value={row.finishedDimensionsMm}
        required={isCutPart}
        disabled={disabled}
        onChange={(finishedDimensionsMm) => patch({ finishedDimensionsMm })}
      />
      <DimensionFields
        label="Szabászati méret"
        value={row.cuttingDimensionsMm}
        required={isCutPart}
        disabled={disabled}
        onChange={(cuttingDimensionsMm) => patch({ cuttingDimensionsMm })}
      />
    </div>
  );

  return (
    <article className={`component-draft-row${errors.length ? " has-errors" : ""}`}>
      <header>
        <div>
          <span>Alkatrészsor {String(index + 1).padStart(2, "0")}</span>
          <h3>{row.name || "Új explicit alkatrész"}</h3>
          <p>{source.label} · {source.detail}</p>
        </div>
        <button type="button" disabled={disabled} onClick={onRemove} aria-label={`${index + 1}. alkatrészsor eltávolítása`}>
          Sor eltávolítása
        </button>
      </header>

      {errors.length > 0 && (
        <div className="component-draft-errors" role="alert">
          <strong>A sor még nem materializálható</strong>
          <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      )}

      <div className="component-draft-fields">
        <label>
          <span>Alkatrész jellege *</span>
          <select value={row.requirementKind} disabled={disabled} onChange={(event) => patch({ requirementKind: event.target.value as ComponentRequirementDraft["requirementKind"] })}>
            <option value="">Válassz…</option>
            <option value="CUT_PART">Gyártott / szabandó alkatrész</option>
            <option value="PURCHASED_PART">Vásárolt alkatrész</option>
          </select>
        </label>
        <label>
          <span>Alkatrész neve *</span>
          <input value={row.name} maxLength={240} disabled={disabled} onChange={(event) => patch({ name: event.target.value })} />
        </label>
        <label>
          <span>Forráskomponens-kulcs *</span>
          <input value={row.sourceComponentKey} maxLength={160} disabled={disabled} placeholder="pl. P01:door-leaf-1" onChange={(event) => patch({ sourceComponentKey: event.target.value })} />
          <small>Egyedi sorazonosító ebben a snapshotban.</small>
        </label>
        <label>
          <span>Komponenskulcs *</span>
          <input value={row.componentKey} maxLength={160} disabled={disabled} placeholder="pl. door-leaf" onChange={(event) => patch({ componentKey: event.target.value })} />
          <small>Stabil alkatrésztípus-kulcs, ASCII karakterekkel.</small>
        </label>
        <label>
          <span>Mennyiség *</span>
          <input type="number" inputMode="decimal" min="0" step="any" value={row.quantity} disabled={disabled} onChange={(event) => patch({ quantity: event.target.value })} />
        </label>
        <label>
          <span>Egység *</span>
          <input value={row.quantityUnit} maxLength={32} disabled={disabled} placeholder="pl. db" onChange={(event) => patch({ quantityUnit: event.target.value })} />
        </label>
        <label>
          <span>Anyag{isCutPart && " *"}</span>
          <select value={row.materialKey} disabled={disabled} onChange={(event) => patch({ materialKey: event.target.value })}>
            <option value="">Nincs kiválasztva</option>
            {catalog.materials.map((choice) => <option value={choice.key} key={choice.key}>{choice.label}</option>)}
          </select>
        </label>
        <label>
          <span>Felület</span>
          <select value={row.finishKey} disabled={disabled} onChange={(event) => patch({ finishKey: event.target.value })}>
            <option value="">Nincs kiválasztva</option>
            {catalog.finishes.map((choice) => <option value={choice.key} key={choice.key}>{choice.label}</option>)}
          </select>
        </label>
        <label className="wide">
          <span>Szálirány</span>
          <input value={row.grainDirection} maxLength={80} disabled={disabled} placeholder="Explicit adapterérték, ha alkalmazandó" onChange={(event) => patch({ grainDirection: event.target.value })} />
        </label>
      </div>

      {!row.requirementKind ? (
        <p className="component-draft-dimension-hint">A méretmezők az alkatrész jellegének kiválasztása után nyílnak meg.</p>
      ) : isCutPart ? dimensions : (
        <details className="component-optional-dimensions">
          <summary>Opcionális kész- és szabászati méretek</summary>
          {dimensions}
        </details>
      )}

      <label className="component-draft-notes">
        <span>Sormegjegyzés</span>
        <textarea value={row.notes} maxLength={10_000} disabled={disabled} onChange={(event) => patch({ notes: event.target.value })} />
      </label>
    </article>
  );
}
