import { useState } from "react";
import { formatEvidenceValue, orderPositionEvidenceFieldLabel, orderPositionEvidenceStateLabel } from "../../lib/orderEvidence";
import type { ProductionOrderPosition } from "@/services/production/types";

interface Props {
  positions: ProductionOrderPosition[];
  canReview: boolean;
  pending: boolean;
  onReview: (positionId: string, evidenceId: string, reviewState: "RESOLVED" | "REJECTED", resolution: string) => Promise<unknown>;
}

/** Compact provenance view for the office workflow. It deliberately shows
 * source location and raw value next to the normalized candidate. */
export function OrderPositionEvidenceList({ positions, canReview, pending, onReview }: Props) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const evidenceCount = positions.reduce((sum, position) => sum + position.evidence.length, 0);
  if (evidenceCount === 0) return null;

  return <section className="position-evidence">
    <header><div><span>Forrásbizonyíték</span><h3>Mezőszintű eredet és ellenőrzés</h3></div><b>{evidenceCount} adat</b></header>
    {positions.filter((position) => position.evidence.length > 0).map((position) =>
      <div className="position-evidence-group" key={position.id}>
        <strong>{position.code} · {position.name}</strong>
        <ul>{position.evidence.map((item) => {
          const locator = [
            item.orderDocument?.displayName ?? item.relativePath,
            item.sheet ? `lap: ${item.sheet}` : null,
            item.page ? `${item.page}. oldal` : null,
            item.row ? `${item.row}. sor` : null,
          ].filter(Boolean).join(" · ");
          const note = notes[item.id] ?? "";
          const open = item.reviewState === "UNVERIFIED" || item.reviewState === "REVIEW";
          return <li key={item.id}>
            <div className="position-evidence-main"><b>{orderPositionEvidenceFieldLabel[item.field]}</b><span>{item.rawValue} → {formatEvidenceValue(item.normalizedValue)}</span><code>{locator}</code></div>
            <span className={`position-evidence-state position-evidence-state-${item.reviewState.toLowerCase()}`}>{orderPositionEvidenceStateLabel[item.reviewState]}</span>
            {item.resolution && <p>{item.resolution}</p>}
            {canReview && open && <div className="position-evidence-review">
              <input value={note} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Ellenőrzési megjegyzés *" />
              <button disabled={pending || note.trim().length < 3} onClick={() => void onReview(position.id, item.id, "RESOLVED", note.trim())}>Elfogadás</button>
              <button disabled={pending || note.trim().length < 3} onClick={() => void onReview(position.id, item.id, "REJECTED", note.trim())}>Elutasítás</button>
            </div>}
          </li>;
        })}</ul>
      </div>
    )}
  </section>;
}
