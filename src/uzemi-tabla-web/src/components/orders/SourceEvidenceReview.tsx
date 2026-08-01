import { useId, useState } from "react";
import {
  sourceEvidenceDecisionComplete,
  sourceEvidenceDecisionOpen,
  type SourceEvidenceAuditRecord,
} from "@/lib/sourceEvidence";

interface SourceEvidenceReviewProps extends SourceEvidenceAuditRecord {
  label: string;
  createdByRole: string;
  canReview: boolean;
  pending: boolean;
  onReview: (reviewState: "RESOLVED" | "REJECTED", resolution: string) => Promise<unknown>;
}

const reviewStateLabel: Record<SourceEvidenceAuditRecord["reviewState"], string> = {
  UNVERIFIED: "Ellenőrizetlen",
  REVIEW: "Döntésre vár",
  RESOLVED: "Feloldva",
  REJECTED: "Elutasítva",
};

function formatAuditDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** One-way review control for a captured source fact. Captured values stay
 * read-only; only the audited decision is submitted. */
export function SourceEvidenceReview({
  label,
  reviewState,
  resolution,
  createdByRole,
  reviewedByRole,
  reviewedAt,
  canReview,
  pending,
  onReview,
}: SourceEvidenceReviewProps) {
  const fieldId = useId();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const open = sourceEvidenceDecisionOpen({ reviewState });
  const complete = sourceEvidenceDecisionComplete({ reviewState, resolution, reviewedByRole, reviewedAt });
  const formattedReviewedAt = formatAuditDate(reviewedAt);

  async function decide(nextState: "RESOLVED" | "REJECTED") {
    const trimmedNote = note.trim();
    if (trimmedNote.length < 3) return;
    setError(null);
    try {
      await onReview(nextState, trimmedNote);
      setNote("");
    } catch {
      setError("A döntés nem menthető. Frissítsd a tételt; lehet, hogy ezt az evidence-sort már lezárták.");
    }
  }

  return (
    <div className={`source-evidence-audit state-${reviewState.toLowerCase()}`}>
      <div className="source-evidence-audit-summary">
        <span>{reviewStateLabel[reviewState]}</span>
        <small>Rögzítette: {createdByRole}</small>
      </div>
      {open && canReview ? (
        <div className="source-evidence-review">
          <label htmlFor={fieldId}>{label} döntési indoklása *</label>
          <textarea
            id={fieldId}
            value={note}
            minLength={3}
            maxLength={2000}
            disabled={pending}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Mit ellenőriztél az eredeti forrásban?"
          />
          <div>
            <button type="button" disabled={pending || note.trim().length < 3} onClick={() => void decide("RESOLVED")}>
              Evidence feloldása
            </button>
            <button type="button" disabled={pending || note.trim().length < 3} onClick={() => void decide("REJECTED")}>
              Evidence elutasítása
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </div>
      ) : open ? (
        <p className="source-evidence-waiting">Ez a forrásadat megfelelő műszaki vagy jóváhagyói szerepkör döntésére vár.</p>
      ) : (
        <dl className="source-evidence-decision">
          <div><dt>Döntés</dt><dd>{resolution?.trim() || "Nincs auditált indoklás"}</dd></div>
          <div><dt>Felülvizsgáló</dt><dd>{reviewedByRole || "Nincs rögzítve"}</dd></div>
          <div><dt>Időpont</dt><dd>{formattedReviewedAt || "Nincs rögzítve"}</dd></div>
          {reviewState === "RESOLVED" && !complete && (
            <div className="source-evidence-incomplete">
              <dt>Adatkapu</dt>
              <dd>Hiányos történeti audit — felhasználásra zárolva.</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
