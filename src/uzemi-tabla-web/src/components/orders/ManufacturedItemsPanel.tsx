import { useState } from "react";
import type { ManufacturedItem, ManufacturedItemKind, ManufacturedItemState, ManufacturedItemWorkKind } from "@/services/production/types";

const kindLabel: Record<ManufacturedItemKind, string> = {
  WALL_PANEL: "Falpanel",
  FURNITURE_FRONT: "Bútorfront",
};
const stateLabel: Record<ManufacturedItemState, string> = {
  CANDIDATE: "Jelölt",
  REVIEW: "Ellenőrzendő",
  VERIFIED: "Ellenőrizve",
  REJECTED: "Elutasítva",
};
const workLabel: Record<ManufacturedItemWorkKind, string> = {
  STANDARD: "Normál gyártás",
  REWORK: "Javítás",
  REMANUFACTURE: "Újragyártás",
  REPLACEMENT: "Csere",
};

interface Props {
  items: ManufacturedItem[];
  canReview: boolean;
  pending: boolean;
  onReview: (itemId: string, state: "VERIFIED" | "REJECTED", resolution: string) => Promise<unknown>;
}

function dimensions(item: ManufacturedItem) {
  return [item.widthMm, item.heightMm, item.thicknessMm].map((value) => value ?? "—").join(" × ");
}

/** Standalone non-door items stay visually distinct from door positions while
 * retaining the same paper-led Doorstar review language. */
export function ManufacturedItemsPanel({ items, canReview, pending, onReview }: Props) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (items.length === 0) return null;

  return <section className="manufactured-items-panel">
    <header>
      <div><span>Külön gyártási tételek</span><h3>Falpanelek és bútorfrontok</h3><p>Nem ajtópozíciók: saját méretük, anyaguk és forrásbizonyítékuk van.</p></div>
      <b>{items.length} tétel</b>
    </header>
    <div className="manufactured-item-grid">{items.map((item) => {
      const note = notes[item.id] ?? "";
      const open = item.state === "CANDIDATE" || item.state === "REVIEW";
      const source = item.evidence[0];
      const locator = source ? [
        source.orderDocument?.displayName ?? source.relativePath,
        source.sheet,
        source.row ? `${source.row}. sor` : null,
      ].filter(Boolean).join(" · ") : "Nincs forrás";
      return <article className={`manufactured-item manufactured-item-${item.state.toLowerCase()}`} key={item.id}>
        <div className="manufactured-item-head"><span>{kindLabel[item.kind]}</span><b>{item.code}</b><i>{stateLabel[item.state]}</i></div>
        <h4>{item.name}</h4>
        {(item.itemType || item.componentName) && <p>{[item.itemType, item.componentName].filter(Boolean).join(" · ")}</p>}
        <div className="manufactured-item-dimension"><strong>{dimensions(item)} mm</strong><span>{item.quantity} db</span></div>
        <dl>
          <div><dt>Anyag</dt><dd>{item.material ?? "—"}</dd></div>
          <div><dt>Felület</dt><dd>{[item.surface, item.colour, item.pattern].filter(Boolean).join(" · ") || "—"}</dd></div>
          <div><dt>Munkajelleg</dt><dd>{workLabel[item.workKind]}</dd></div>
          {item.relatedOrderPosition && <div><dt>Kapcsolt ajtó</dt><dd>{item.relatedOrderPosition.code} · {item.relatedOrderPosition.name}</dd></div>}
        </dl>
        <code>{locator}</code>
        {item.resolution && <blockquote>{item.resolution}</blockquote>}
        {canReview && open && <div className="manufactured-item-review">
          <input value={note} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Ellenőrzési megjegyzés *" />
          <button disabled={pending || note.trim().length < 3} onClick={() => void onReview(item.id, "VERIFIED", note.trim())}>Tétel elfogadása</button>
          <button disabled={pending || note.trim().length < 3} onClick={() => void onReview(item.id, "REJECTED", note.trim())}>Elutasítás</button>
        </div>}
      </article>;
    })}</div>
  </section>;
}
