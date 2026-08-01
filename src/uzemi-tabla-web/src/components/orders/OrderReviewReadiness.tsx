import { buildOrderReviewReadiness, type ReviewReadiness } from "@/lib/orderReviewReadiness";
import type { OrderFeedback, ProductionOrderRevision } from "@/services/production/types";

interface OrderReviewReadinessProps {
  revision: ProductionOrderRevision;
  feedback: OrderFeedback[];
  reviewStatePending: boolean;
  additionalBlockers?: string[];
}

export function getOrderReviewReadiness(revision: ProductionOrderRevision, feedback: OrderFeedback[]): ReviewReadiness {
  return buildOrderReviewReadiness({
    documentCount: revision.documents.length,
    positionCount: revision.positions.length,
    feedbackStates: feedback.map((item) => item.status),
    evidenceStates: revision.positions.flatMap((position) => position.evidence.map((evidence) => evidence.reviewState)),
    manufacturedItems: revision.manufacturedItems.map((item) => ({ state: item.state, evidence: item.evidence })),
    supplementaryItems: revision.supplementaryItems.map((item) => ({
      state: item.state,
      entryMode: item.entryMode,
      evidence: item.evidence,
    })),
  });
}

/** A visible human checkpoint before the immutable approval action. */
export function OrderReviewReadiness({ revision, feedback, reviewStatePending, additionalBlockers = [] }: OrderReviewReadinessProps) {
  const readiness = getOrderReviewReadiness(revision, feedback);
  const canApprove = !reviewStatePending && readiness.ready && additionalBlockers.length === 0;
  const blockerCount = readiness.blockers.length + additionalBlockers.length;

  return <section className={`order-review-readiness ${canApprove ? "is-ready" : "is-blocked"}`}>
    <header>
      <div>
        <span>Jóváhagyás előtti ellenőrzés</span>
        <h2>{canApprove ? "A review lezárható" : "Még nem jóváhagyható"}</h2>
        <p>A döntés előtt az eredeti források változatlanok maradnak; a jóváhagyás ezt a revíziót rögzíti, nem pótolja a hiányzó review-t.</p>
      </div>
      <b>{canApprove ? "Rendben" : reviewStatePending ? "Ellenőrzés alatt" : `${blockerCount} teendő`}</b>
    </header>
    <div className="order-review-checks" aria-label="Review összesítő">
      <span><b>{readiness.documentCount}</b> dokumentum</span>
      <span><b>{readiness.positionCount}</b> ajtópozíció</span>
      <span><b>{readiness.openFeedbackCount}</b> nyitott jelzés</span>
      <span><b>{readiness.unresolvedEvidenceCount}</b> nyitott bizonyíték</span>
      <span><b>{readiness.pendingManufacturedItemCount}</b> gyártási tétel review</span>
      <span><b>{readiness.pendingSupplementaryItemCount}</b> tartozék review</span>
    </div>
    {!canApprove && <ul className="order-review-blockers">
      {reviewStatePending && <li>A visszajelzések állapota még nem érhető el; a jóváhagyás biztonságból zárolva marad.</li>}
      {readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
      {additionalBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
    </ul>}
  </section>;
}

export function canApproveReadiness(readiness: ReviewReadiness, reviewStatePending: boolean) {
  return !reviewStatePending && readiness.ready;
}
