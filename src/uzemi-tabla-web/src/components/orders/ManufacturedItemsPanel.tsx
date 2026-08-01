import { useState } from "react";
import { sourceEvidenceSetReady } from "@/lib/sourceEvidence";
import type {
  ManufacturedItem,
  ManufacturedItemEvidence,
  ManufacturedItemKind,
  ManufacturedItemState,
  ManufacturedItemWorkKind,
} from "@/services/production/types";
import { SourceEvidenceReview } from "./SourceEvidenceReview";

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
  canReviewEvidence: boolean;
  pending: boolean;
  onReview: (itemId: string, state: "VERIFIED" | "REJECTED", resolution: string) => Promise<unknown>;
  onReviewEvidence: (
    itemId: string,
    evidenceId: string,
    reviewState: "RESOLVED" | "REJECTED",
    resolution: string,
  ) => Promise<unknown>;
}

function dimensions(item: ManufacturedItem) {
  return [item.widthMm, item.heightMm, item.thicknessMm].map((value) => value ?? "—").join(" × ");
}

function normalizedValue(evidence: ManufacturedItemEvidence) {
  return evidence.normalizedValue == null ? null : String(evidence.normalizedValue);
}

function evidenceLocator(evidence: ManufacturedItemEvidence) {
  return [
    evidence.orderDocument?.displayName ?? evidence.relativePath,
    evidence.sheet,
    evidence.page ? `${evidence.page}. oldal` : null,
    evidence.row ? `${evidence.row}. sor` : null,
  ].filter(Boolean).join(" · ");
}

/** Standalone non-door items stay visually distinct from door positions while
 * retaining a full, human-audited source lineage. */
export function ManufacturedItemsPanel({
  items,
  canReview,
  canReviewEvidence,
  pending,
  onReview,
  onReviewEvidence,
}: Props) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (items.length === 0) return null;

  return (
    <section className="manufactured-items-panel">
      <header>
        <div>
          <span>Külön gyártási tételek</span>
          <h3>Falpanelek és bútorfrontok</h3>
          <p>Nem ajtópozíciók: saját méretük, anyaguk és külön ellenőrzött forrásbizonyítékuk van.</p>
        </div>
        <b>{items.length} tétel</b>
      </header>
      <div className="manufactured-item-grid">
        {items.map((item) => {
          const note = notes[item.id] ?? "";
          const open = item.state === "CANDIDATE" || item.state === "REVIEW";
          const sourceReady = sourceEvidenceSetReady(item.evidence);
          return (
            <article className={`manufactured-item manufactured-item-${item.state.toLowerCase()}`} key={item.id}>
              <div className="manufactured-item-head">
                <span>{kindLabel[item.kind]}</span><b>{item.code}</b><i>{stateLabel[item.state]}</i>
              </div>
              <h4>{item.name}</h4>
              {(item.itemType || item.componentName) && <p>{[item.itemType, item.componentName].filter(Boolean).join(" · ")}</p>}
              <div className="manufactured-item-dimension"><strong>{dimensions(item)} mm</strong><span>{item.quantity} db</span></div>
              <dl>
                <div><dt>Anyag</dt><dd>{item.material ?? "—"}</dd></div>
                <div><dt>Felület</dt><dd>{[item.surface, item.colour, item.pattern].filter(Boolean).join(" · ") || "—"}</dd></div>
                <div><dt>Munkajelleg</dt><dd>{workLabel[item.workKind]}</dd></div>
                {item.relatedOrderPosition && <div><dt>Kapcsolt ajtó</dt><dd>{item.relatedOrderPosition.code} · {item.relatedOrderPosition.name}</dd></div>}
              </dl>

              <section className="source-evidence-section" aria-label={`${item.code} forrásbizonyítékai`}>
                <header>
                  <div><span>Forrásbizonyíték</span><strong>{sourceReady ? "Teljes audit" : "Lezárás szükséges"}</strong></div>
                  <b>{item.evidence.length} sor</b>
                </header>
                {item.evidence.length === 0 ? (
                  <p className="source-evidence-empty">Nincs bizonyíték. A tétel nem fogadható el és nem használható alkatrészforrásként.</p>
                ) : (
                  <ul className="source-evidence-list">
                    {item.evidence.map((evidence) => (
                      <li key={evidence.id}>
                        <div className="source-evidence-value">
                          <b>{evidence.field}</b>
                          <span>{evidence.rawValue}{normalizedValue(evidence) != null ? ` → ${normalizedValue(evidence)}` : ""}</span>
                        </div>
                        <small>{evidenceLocator(evidence)}</small>
                        <strong className={`state-${evidence.reviewState.toLowerCase()}`}>
                          {evidence.reviewState}{evidence.confidence != null ? ` · ${Math.round(evidence.confidence * 100)}%` : ""}
                        </strong>
                        <SourceEvidenceReview
                          label={`${item.code} · ${evidence.field}`}
                          reviewState={evidence.reviewState}
                          resolution={evidence.resolution}
                          createdByRole={evidence.createdByRole}
                          reviewedByRole={evidence.reviewedByRole}
                          reviewedAt={evidence.reviewedAt}
                          canReview={canReviewEvidence}
                          pending={pending}
                          onReview={(reviewState, resolution) => onReviewEvidence(item.id, evidence.id, reviewState, resolution)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {item.resolution && (
                <blockquote>
                  {item.resolution}
                  <small>{[item.reviewedByRole, item.reviewedAt ? new Date(item.reviewedAt).toLocaleString("hu-HU") : null].filter(Boolean).join(" · ")}</small>
                </blockquote>
              )}
              {canReview && open && (
                <div className="manufactured-item-review">
                  <input
                    value={note}
                    maxLength={2000}
                    onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                    placeholder="Tétel-review indoklása *"
                  />
                  <button
                    disabled={pending || note.trim().length < 3 || !sourceReady}
                    title={!sourceReady ? "Elfogadás előtt minden evidence-sorhoz teljes, auditált RESOLVED döntés szükséges." : undefined}
                    onClick={() => void onReview(item.id, "VERIFIED", note.trim())}
                  >
                    Tétel elfogadása
                  </button>
                  <button disabled={pending || note.trim().length < 3} onClick={() => void onReview(item.id, "REJECTED", note.trim())}>
                    Elutasítás
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
