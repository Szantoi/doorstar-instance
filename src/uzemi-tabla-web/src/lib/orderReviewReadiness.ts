import { buildRevisionSourceReadiness, type SourceEvidenceAuditRecord } from "./sourceEvidence";

interface ManufacturedItemReadiness {
  state: "CANDIDATE" | "REVIEW" | "VERIFIED" | "REJECTED";
  evidence: SourceEvidenceAuditRecord[];
}

interface SupplementaryItemReadiness {
  state: "REVIEW" | "VERIFIED" | "REJECTED";
  entryMode: "MANUAL" | "SOURCE_REVIEW";
  evidence: SourceEvidenceAuditRecord[];
}

export interface ReviewReadinessInput {
  documentCount: number;
  positionCount: number;
  feedbackStates: Array<"OPEN" | "ACKNOWLEDGED" | "RESOLVED">;
  evidenceStates: Array<"UNVERIFIED" | "REVIEW" | "RESOLVED" | "REJECTED">;
  manufacturedItems: ManufacturedItemReadiness[];
  supplementaryItems?: SupplementaryItemReadiness[];
}

export interface ReviewReadiness {
  documentCount: number;
  positionCount: number;
  openFeedbackCount: number;
  unresolvedEvidenceCount: number;
  pendingManufacturedItemCount: number;
  pendingSupplementaryItemCount: number;
  blockers: string[];
  ready: boolean;
}

/** Review is intentionally conservative: incomplete review work never becomes
 * an approval candidate merely because its stored API payload is valid. */
export function buildOrderReviewReadiness(input: ReviewReadinessInput): ReviewReadiness {
  const openFeedbackCount = input.feedbackStates.filter((state) => state !== "RESOLVED").length;
  const unresolvedEvidenceCount = input.evidenceStates.filter((state) => state === "UNVERIFIED" || state === "REVIEW").length;
  const sourceReadiness = buildRevisionSourceReadiness({
    manufacturedItems: input.manufacturedItems,
    supplementaryItems: input.supplementaryItems ?? [],
  });
  const pendingManufacturedItemCount = sourceReadiness.manufacturedItems.unresolved;
  const pendingSupplementaryItemCount = sourceReadiness.supplementaryItems.unresolved;
  const blockers = [
    ...(input.documentCount === 0 ? ["Nincs dokumentumhivatkozás a revízióhoz."] : []),
    ...(input.positionCount === 0 ? ["Nincs rögzített ajtópozíció."] : []),
    ...(openFeedbackCount ? [`${openFeedbackCount} nyitott vagy nyugtázott jelzés van.`] : []),
    ...(unresolvedEvidenceCount ? [`${unresolvedEvidenceCount} mezőszintű bizonyíték vár review-ra.`] : []),
    ...(pendingManufacturedItemCount ? [`${pendingManufacturedItemCount} gyártási tétel vagy evidence-audit vár lezárásra.`] : []),
    ...(pendingSupplementaryItemCount ? [`${pendingSupplementaryItemCount} rendelési tartozék vagy evidence-audit vár lezárásra.`] : []),
  ];
  return { documentCount: input.documentCount, positionCount: input.positionCount, openFeedbackCount, unresolvedEvidenceCount, pendingManufacturedItemCount, pendingSupplementaryItemCount, blockers, ready: blockers.length === 0 };
}
