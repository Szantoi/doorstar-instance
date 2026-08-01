import { buildOrderReviewReadiness, type ReviewReadiness } from "@/lib/orderReviewReadiness";
import type { OrderFeedback, ProductionOrderRevision } from "@/services/production/types";

interface Props {
  revision: ProductionOrderRevision;
  feedback: OrderFeedback[];
  feedbackLoading: boolean;
}

export function getOrderReviewReadiness(revision: ProductionOrderRevision, feedback: OrderFeedback[]) {
  return buildOrderReviewReadiness({
    documentCount: revision.documents.length,
    positionCount: revision.positions.length,
    feedbackStates: feedback.map((item) => item.status),
    evidenceStates: revision.positions.flatMap((position) => position.evidence.map((item) => item.reviewState)),
    manufacturedItemStates: revision.manufacturedItems.map((item) => item.state),
  });
}

export function OrderReviewReadiness({ revision, feedback, feedbackLoading }: Props) {
  const readiness = getOrderReviewReadiness(revision, feedback);
  const checks: Array<[string, number]> = [["Dokumentum", readiness.documentCount], ["Pozíció", readiness.positionCount], ["Nyitott jelzés", readiness.openFeedbackCount], ["Review evidence", readiness.unresolvedEvidenceCount], ["Review tétel", readiness.pendingManufacturedItemCount]];
  return <section className={`order-review-readiness${readiness.ready && !feedbackLoading ? " is-ready" : ""}`} aria-label="Jóváhagyás előtti összegzés">
    <header><div><span>Jóváhagyás előtti összegzés</span><h2>{feedbackLoading ? "Review állapot betöltése…" : readiness.ready ? "A review lezárható" : "Még van lezárandó review-feladat"}</h2><p>A jóváhagyó ebből a pillanatképből dönt; jóváhagyás után ez a revízió nem szerkeszthető.</p></div><b>{feedbackLoading ? "…" : readiness.ready ? "KIADÁS ELŐTT ELLENŐRIZVE" : "REVIEW SZÜKSÉGES"}</b></header>
    <div className="order-review-checks">{checks.map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
    {!feedbackLoading && readiness.blockers.length > 0 && <ul>{readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
  </section>;
}

export function canApproveReadiness(readiness: ReviewReadiness, feedbackLoading: boolean) {
  return !feedbackLoading && readiness.ready;
}
