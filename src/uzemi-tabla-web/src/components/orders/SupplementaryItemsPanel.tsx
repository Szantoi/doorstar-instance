import { useState } from "react";
import { sourceEvidenceSetReady } from "@/lib/sourceEvidence";
import type { OrderSupplementaryItem, OrderSupplementaryItemInput } from "@/services/production/types";
import { SourceEvidenceReview } from "./SourceEvidenceReview";

interface SupplementaryItemsPanelProps {
  items: OrderSupplementaryItem[];
  canCreate: boolean;
  canReview: boolean;
  canReviewEvidence: boolean;
  pending: boolean;
  onCreate: (input: OrderSupplementaryItemInput) => Promise<unknown>;
  onReview: (itemId: string, state: "VERIFIED" | "REJECTED", resolution: string) => Promise<unknown>;
  onReviewEvidence: (
    itemId: string,
    evidenceId: string,
    reviewState: "RESOLVED" | "REJECTED",
    resolution: string,
  ) => Promise<unknown>;
}

const stateLabel = { REVIEW: "Ellenőrzendő", VERIFIED: "Ellenőrizve", REJECTED: "Elutasítva" } as const;

/** Sales accessories remain a separate lane; they are never disguised as
 * door positions or manufactured wall-panel/front records. */
export function SupplementaryItemsPanel({
  items,
  canCreate,
  canReview,
  canReviewEvidence,
  pending,
  onCreate,
  onReview,
  onReviewEvidence,
}: SupplementaryItemsPanelProps) {
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("db");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function create() {
    const parsedQuantity = Number(quantity);
    if (!category.trim() || !name.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !unit.trim() || reason.trim().length < 3) return;
    await onCreate({ entryMode: "MANUAL", category: category.trim(), name: name.trim(), quantity: parsedQuantity, unit: unit.trim(), manualReason: reason.trim() });
    setCategory(""); setName(""); setQuantity(""); setReason(""); setAdding(false);
  }

  return (
    <section className="supplementary-items-panel">
      <header>
        <div>
          <span>Rendelési tartozékok</span>
          <h3>Külön értékesített tételek</h3>
          <p>Szegőléc, takaróléc és más tartozék nem ajtópozíció és nem gyártási falpanel/front.</p>
        </div>
        <div>
          <b>{items.length} tétel</b>
          {canCreate && <button type="button" onClick={() => setAdding((value) => !value)}>{adding ? "Bezárás" : "Tartozék hozzáadása"}</button>}
        </div>
      </header>
      {adding && (
        <div className="supplementary-create-form">
          <label><span>Kategória *</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Például: szegőléc" /></label>
          <label><span>Megnevezés *</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label><span>Mennyiség *</span><input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label><span>Egység *</span><input value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
          <label className="wide"><span>Kézi rögzítés indoka *</span><input maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Miért szükséges ez a tétel?" /></label>
          <button type="button" disabled={pending || !category.trim() || !name.trim() || Number(quantity) <= 0 || reason.trim().length < 3} onClick={() => void create()}>
            Tétel rögzítése review-ra
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <p className="supplementary-empty">Nincs külön rendelési tartozék. Ez nem jelenti azt, hogy egy forrásból felismert jelölt automatikusan elutasítható.</p>
      ) : (
        <div className="supplementary-item-list">
          {items.map((item) => {
            const note = notes[item.id] ?? "";
            const sourceReady = item.entryMode === "MANUAL" || sourceEvidenceSetReady(item.evidence);
            return (
              <article className={`supplementary-item state-${item.state.toLowerCase()}`} key={item.id}>
                <div>
                  <span>{item.category}</span>
                  <h4>{item.code ? `${item.code} · ` : ""}{item.name}</h4>
                  <p>
                    {item.quantity == null ? "Forrásmennyiség review alatt" : `${item.quantity} ${item.unit ?? ""}`}
                    {item.calculatedQuantity != null ? ` · számított: ${item.calculatedQuantity} ${item.calculatedUnit ?? ""}` : ""}
                  </p>
                </div>
                <div className="supplementary-source">
                  <b>{item.entryMode === "MANUAL" ? "Kézi" : "Forrásból"}</b>
                  <small>{item.entryMode === "MANUAL" ? item.manualReason ?? "Nincs indoklás" : `${item.evidence.length} evidence rekord`}</small>
                </div>
                <strong>{stateLabel[item.state]}</strong>

                {item.evidence.length > 0 && (
                  <ul className="source-evidence-list">
                    {item.evidence.map((evidence) => (
                      <li key={evidence.id}>
                        <div className="source-evidence-value">
                          <b>{evidence.field}</b>
                          <span>{evidence.rawValue}{evidence.normalizedValue != null ? ` → ${String(evidence.normalizedValue)}` : ""}</span>
                        </div>
                        <small>{[evidence.relativePath, evidence.page ? `${evidence.page}. oldal` : null, evidence.row ? `${evidence.row}. sor` : null].filter(Boolean).join(" · ")}</small>
                        <strong className={`state-${evidence.reviewState.toLowerCase()}`}>
                          {evidence.reviewState}{evidence.confidence != null ? ` · ${Math.round(evidence.confidence * 100)}%` : ""}
                        </strong>
                        <SourceEvidenceReview
                          label={`${item.code ?? item.name} · ${evidence.field}`}
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

                {item.state === "REVIEW" && canReview && (
                  <div className="supplementary-review">
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
                      Elfogadom
                    </button>
                    <button disabled={pending || note.trim().length < 3} onClick={() => void onReview(item.id, "REJECTED", note.trim())}>
                      Elutasítom
                    </button>
                  </div>
                )}
                {item.reviewResolution && (
                  <blockquote>
                    {item.reviewResolution}
                    <small>{[item.reviewedByRole, item.reviewedAt ? new Date(item.reviewedAt).toLocaleString("hu-HU") : null].filter(Boolean).join(" · ")}</small>
                  </blockquote>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
