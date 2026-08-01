import type { Role } from "@/store/uiStore";

const includes = (roles: readonly Role[], role: Role) => roles.includes(role);

/** UI mirrors the temporary backend X-Role guard. Real login must replace
 * this selector, but business capabilities stay centralised and testable. */
export function canCreateSalesOrder(role: Role) {
  return includes(["sales", "technical_preparation", "order_approver", "administrator", "vezeto"], role);
}

export function canCompleteSurvey(role: Role) {
  return includes(["technical_preparation", "order_approver", "administrator", "vezeto"], role);
}

export function canSendToTechnicalPreparation(role: Role) {
  return canCompleteSurvey(role);
}

export function canRequestOrderReview(role: Role) {
  return canCompleteSurvey(role);
}

export function canApproveOrder(role: Role) {
  return includes(["order_approver", "administrator", "vezeto"], role);
}

export function canApplyManufacturedItemImport(role: Role) {
  return includes(["technical_preparation", "order_approver", "administrator", "vezeto"], role);
}

export function canCreateComponentSnapshot(role: Role) {
  return includes(["technical_preparation", "order_approver", "production_planner", "administrator", "vezeto"], role);
}

export function canReviewComponentSnapshot(role: Role) {
  return includes(["order_approver", "production_planner", "administrator", "vezeto"], role);
}

export function canReviewSourceEvidence(role: Role) {
  return includes(["technical_preparation", "order_approver", "administrator", "vezeto"], role);
}
