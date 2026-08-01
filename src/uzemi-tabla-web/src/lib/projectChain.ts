import type {
  OrderRevisionReadiness,
  OrderRevisionReadinessGate,
  OrderRevisionReadinessGateKey,
  ProjectWorkflow,
  ProjectWorkflowGate,
  ProjectWorkflowGateKey,
  ReadinessAllowedAction,
  ReadinessBlocker,
  ReadinessNextAction,
} from "@/services/production/types";

const readinessGateOrder: OrderRevisionReadinessGateKey[] = [
  "SURVEY",
  "POSITION_EVIDENCE",
  "DOCUMENTS",
  "MANUFACTURED_ITEMS",
  "SUPPLEMENTARY_ITEMS",
  "ORDER_REVIEW",
  "COMPONENT_SNAPSHOT",
  "OPERATION_PLAN",
  "PRODUCTION_RELEASE",
];

export const workflowGateOrder: ProjectWorkflowGateKey[] = [
  "ORDER",
  "COMPONENTS",
  "OPERATIONS",
  "PLANNING",
  "WORK_PACKAGE",
  "PRODUCTION_6_STAGE",
  "HANDOVER",
];

export const workflowGateLabel: Record<ProjectWorkflowGateKey, string> = {
  ORDER: "Rendelés és felmérés",
  COMPONENTS: "Alkatrészképzés",
  OPERATIONS: "Műveletterv",
  PLANNING: "Tervezés",
  WORK_PACKAGE: "Munkacsomag",
  PRODUCTION_6_STAGE: "6 üzemi szakasz",
  HANDOVER: "Kiszállítás és beépítés",
};

export const readinessGateLabel: Record<OrderRevisionReadinessGateKey, string> = {
  SURVEY: "Felmérés",
  POSITION_EVIDENCE: "Pozícióforrások",
  DOCUMENTS: "Dokumentumok",
  MANUFACTURED_ITEMS: "Gyártandó kiegészítők",
  SUPPLEMENTARY_ITEMS: "Tartozékok",
  ORDER_REVIEW: "Rendelési review",
  COMPONENT_SNAPSHOT: "Alkatrészsnapshot",
  OPERATION_PLAN: "Műveletterv",
  PRODUCTION_RELEASE: "Üzemi kiadás",
};

const roleLabels: Record<string, string> = {
  sales: "Értékesítés",
  technical_preparation: "Műszaki előkészítő",
  order_approver: "Rendelési jóváhagyó",
  production_planner: "Termeléstervező",
  shop_floor: "Üzemi végrehajtó",
  installer: "Beépítő",
  warehouse_dispatch: "Raktár és kiszállítás",
  administrator: "Adminisztrátor",
  reader: "Olvasó",
};

const blockerLabels: Record<string, string> = {
  survey_positions_required: "Legalább egy rendelési pozíció szükséges.",
  survey_fields_missing: "Kötelező felmérési mezők hiányoznak.",
  survey_document_required: "Felmérési dokumentumverzió szükséges.",
  survey_document_link_required: "Minden pozícióhoz exact felmérési dokumentumverziót kell kapcsolni.",
  position_evidence_unresolved: "A pozíció forrásbizonyítéka nincs teljesen és auditálhatóan lezárva.",
  stale_document_version_linked: "Legalább egy pozíció leváltott dokumentumverzióra hivatkozik.",
  manufactured_item_review_unresolved: "Gyártandó kiegészítő vagy annak bizonyítéka nincs lezárva.",
  supplementary_item_review_unresolved: "Tartozék vagy annak bizonyítéka nincs lezárva.",
  latest_revision_required: "A folytatás csak a legfrissebb rendelési revízión engedélyezett.",
  technical_preparation_stage_required: "A rendelési review-hoz műszaki előkészítési szakasz szükséges.",
  order_content_hash_mismatch: "A revízió tartalma már nem egyezik a review vagy approval audit hashével.",
  order_content_hash_audit_missing: "A revízióhoz nincs támogatott review vagy approval hash-audit.",
  current_verified_component_snapshot_required: "Aktuális, ellenőrzött alkatrészsnapshot szükséges.",
  component_snapshot_required: "Ehhez az exact revízióhoz még nincs alkatrészsnapshot.",
  current_verified_operation_plan_required: "Aktuális, ellenőrzött műveletterv-snapshot szükséges.",
  operation_plan_snapshot_required: "Ehhez az exact revízióhoz még nincs műveletterv-snapshot.",
  approved_current_revision_required: "Az üzemi kiadáshoz a legfrissebb, jóváhagyott és igazolt hashű revízió szükséges.",
  planning_proposal_authority_not_available: "A szerver-authoritatív tervjavaslat még nem érhető el.",
  issued_work_package_authority_not_available: "A megváltoztathatatlan kiadott munkacsomag még nem érhető el.",
  exact_document_release_authority_not_available: "A munkacsomag exact dokumentumkiadási szerződése még nem érhető el.",
  production_state_machine_authority_not_available: "A szerver-authoritatív 6 szakaszos üzemi állapotgép még nem érhető el.",
  handover_authority_not_available: "A kiszállítási és beépítési átadás szerver-authorityje még nem érhető el.",
};

const actionLabels: Record<string, string> = {
  REQUEST_ORDER_REVIEW: "Rendelési review kérése",
  APPROVE_ORDER_REVISION: "Rendelési revízió jóváhagyása",
  CREATE_COMPONENT_SNAPSHOT: "Alkatrészsnapshot létrehozása",
  VERIFY_COMPONENT_SNAPSHOT: "Alkatrészsnapshot ellenőrzése",
  REJECT_COMPONENT_SNAPSHOT: "Alkatrészsnapshot elutasítása",
  CREATE_OPERATION_PLAN_SNAPSHOT: "Műveletterv-snapshot létrehozása",
  VERIFY_OPERATION_PLAN: "Műveletterv ellenőrzése",
  REJECT_OPERATION_PLAN: "Műveletterv elutasítása",
};

const canonicalRoles = new Set(Object.keys(roleLabels));
const allowedActionCodes = new Set(Object.keys(actionLabels));

function isCanonicalRole(value: unknown): value is ReadinessBlocker["ownerRole"] {
  return typeof value === "string" && canonicalRoles.has(value);
}

export function projectRoleLabel(role: string) {
  return roleLabels[role] ?? role;
}

export function readinessBlockerLabel(blocker: ReadinessBlocker) {
  return blockerLabels[blocker.code] ?? blocker.message;
}

export type ProjectChainStageState = "COMPLETED" | "CURRENT" | "BLOCKED" | "NOT_AVAILABLE";

export interface ProjectChainStage {
  key: ProjectWorkflowGateKey;
  label: string;
  state: ProjectChainStageState;
  ownerRole: string;
  blockers: ReadinessBlocker[];
  detailsHref: string | null;
}

export interface ProjectChainNextAction {
  kind: ReadinessNextAction["kind"];
  title: string;
  detail: string;
  ownerRole: string;
  href: string | null;
  code: string | null;
}

export interface ProjectChainReadyView {
  status: "READY";
  revisionNumber: number;
  stages: ProjectChainStage[];
  currentGate: ProjectWorkflowGateKey | null;
  nextAction: ProjectChainNextAction;
  readinessGates: OrderRevisionReadinessGate[];
}

export type ProjectChainView =
  | ProjectChainReadyView
  | { status: "INVALID"; reason: string }
  | { status: "STALE"; reason: string };

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function string(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function exactKeys<T extends string>(items: unknown, keys: readonly T[]): items is Array<{ key: T }> {
  return Array.isArray(items)
    && items.length === keys.length
    && items.every((item, index) => record(item) && item.key === keys[index]);
}

function isEntity(value: unknown) {
  return record(value) && string(value.kind) && string(value.id) && string(value.href);
}

function isBlocker(value: unknown): value is ReadinessBlocker {
  return record(value)
    && string(value.code)
    && string(value.message)
    && isCanonicalRole(value.ownerRole)
    && (value.entity === null || isEntity(value.entity))
    && record(value.detail);
}

function isAction(value: unknown): value is ReadinessAllowedAction {
  return record(value)
    && typeof value.code === "string"
    && allowedActionCodes.has(value.code)
    && (value.method === "POST" || value.method === "PATCH")
    && string(value.href)
    && Array.isArray(value.ownerRoles)
    && value.ownerRoles.length > 0
    && value.ownerRoles.every(isCanonicalRole)
    && string(value.targetEntityId);
}

function isNextAction(value: unknown): value is ReadinessNextAction {
  if (!record(value)) return false;
  if (value.kind === "ACTION") return isAction(value.action);
  if (value.kind === "BLOCKED") {
    return string(value.blockerCode) && isCanonicalRole(value.ownerRole) && nullableString(value.href);
  }
  return value.kind === "COMPLETE" && string(value.message);
}

function isReadinessGate(value: unknown): value is OrderRevisionReadinessGate {
  return record(value)
    && readinessGateOrder.includes(value.key as OrderRevisionReadinessGateKey)
    && ["READY", "BLOCKED", "NOT_AVAILABLE"].includes(String(value.state))
    && typeof value.ready === "boolean"
    && value.ready === (value.state === "READY")
    && isCanonicalRole(value.ownerRole)
    && nullableString(value.detailsHref)
    && Array.isArray(value.blockers)
    && value.blockers.every(isBlocker)
    && Array.isArray(value.allowedActions)
    && value.allowedActions.every(isAction)
    && record(value.details)
    && value.details.kind === value.key;
}

function isWorkflowGate(value: unknown): value is ProjectWorkflowGate {
  return record(value)
    && workflowGateOrder.includes(value.key as ProjectWorkflowGateKey)
    && ["READY", "BLOCKED", "NOT_AVAILABLE", "CONTRACT_REQUIRED"].includes(String(value.state))
    && isCanonicalRole(value.ownerRole)
    && record(value.source)
    && string(value.source.kind)
    && string(value.source.id)
    && Number.isInteger(value.source.revision)
    && typeof value.source.contentHash === "string"
    && /^[a-f0-9]{64}$/i.test(value.source.contentHash)
    && string(value.source.href)
    && Array.isArray(value.blockers)
    && value.blockers.every(isBlocker)
    && Array.isArray(value.allowedActions)
    && value.allowedActions.every(isAction)
    && nullableString(value.detailsHref);
}

export function isOrderRevisionReadiness(value: unknown): value is OrderRevisionReadiness {
  if (!record(value)
    || value.schemaVersion !== "doorstar.order-revision-readiness/v1"
    || !string(value.projectKey)
    || !record(value.revision)
    || !string(value.revision.id)
    || !Number.isInteger(value.revision.number)
    || typeof value.revision.isLatest !== "boolean"
    || !Number.isInteger(value.revision.latestRevisionNumber)
    || !string(value.revision.status)
    || !string(value.revision.intakeStage)
    || !string(value.revision.updatedAt)
    || !record(value.revision.contentHash)
    || typeof value.revision.contentHash.value !== "string"
    || !/^[a-f0-9]{64}$/i.test(value.revision.contentHash.value)
    || ![1, 2, 3].includes(Number(value.revision.contentHash.schemaVersion))
    || !["UNAPPROVED_CURRENT", "VERIFIED", "MISMATCH", "AUDIT_MISSING"].includes(String(value.revision.contentHash.verification))
    || !(value.revision.contentHash.auditId === null || string(value.revision.contentHash.auditId))
    || !exactKeys(value.gates, readinessGateOrder)
    || !value.gates.every(isReadinessGate)
    || !Array.isArray(value.blockers)
    || !value.blockers.every(isBlocker)
    || !Array.isArray(value.allowedActions)
    || !value.allowedActions.every(isAction)
    || !isNextAction(value.nextAction)) return false;
  return true;
}

export function isProjectWorkflow(value: unknown): value is ProjectWorkflow {
  if (!record(value)
    || value.schemaVersion !== "doorstar.project-workflow/v1"
    || !string(value.projectKey)
    || !record(value.revision)
    || !string(value.revision.id)
    || !Number.isInteger(value.revision.number)
    || typeof value.revision.isLatest !== "boolean"
    || !string(value.revision.href)
    || !(value.currentGate === null || workflowGateOrder.includes(value.currentGate as ProjectWorkflowGateKey))
    || !exactKeys(value.gates, workflowGateOrder)
    || !value.gates.every(isWorkflowGate)
    || !Array.isArray(value.blockers)
    || !value.blockers.every(isBlocker)
    || !Array.isArray(value.allowedActions)
    || !value.allowedActions.every(isAction)
    || !isNextAction(value.nextAction)) return false;
  return true;
}

/** Only application routes that exist in App.tsx become clickable. API
 * mutation hrefs and unknown future routes stay visible as lineage, not links. */
export function safeProjectWorkspaceHref(value: string | null | undefined) {
  if (!value) return null;
  const path = value.split(/[?#]/, 1)[0];
  const knownRoute = path === "/board"
    || /^\/projects\/[^/]+(?:\/work-session)?$/.test(path)
    || /^\/orders\/[^/]+(?:\/survey|\/technical-preparation)?$/.test(path)
    || /^\/orders\/[^/]+\/revisions\/\d+\/(?:components|operations)$/.test(path)
    || /^\/imports(?:\/[^/]+(?:\/[^/]+)?)?$/.test(path);
  return knownRoute ? value : null;
}

function stageState(gate: ProjectWorkflowGate, currentGate: ProjectWorkflowGateKey | null): ProjectChainStageState {
  if (gate.state === "READY") return "COMPLETED";
  if (gate.state === "CONTRACT_REQUIRED" || gate.state === "NOT_AVAILABLE") return "NOT_AVAILABLE";
  return gate.key === currentGate ? "CURRENT" : "BLOCKED";
}

function sameAction(left: ReadinessAllowedAction, right: ReadinessAllowedAction) {
  return left.code === right.code
    && left.method === right.method
    && left.href === right.href
    && left.targetEntityId === right.targetEntityId
    && left.ownerRoles.length === right.ownerRoles.length
    && left.ownerRoles.every((role, index) => role === right.ownerRoles[index]);
}

function sameActionList(left: ReadinessAllowedAction[], right: ReadinessAllowedAction[]) {
  return left.length === right.length
    && left.every((action, index) => sameAction(action, right[index]));
}

/** Compares JSON-shaped contract values recursively while treating object
 * property order as irrelevant and preserving array order. */
function sameStructure(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => sameStructure(item, right[index]));
  }
  if (!record(left) || !record(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameStructure(left[key], right[key]));
}

function uniqueGateBlockers(gates: Array<{ blockers: ReadinessBlocker[] }>) {
  const seen = new Set<string>();
  return gates.flatMap((gate) => gate.blockers).filter((blocker) => {
    const key = `${blocker.code}:${blocker.entity?.kind ?? ""}:${blocker.entity?.id ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function topLevelBlockersMatch(
  blockers: ReadinessBlocker[],
  gates: Array<{ blockers: ReadinessBlocker[] }>,
) {
  return sameStructure(blockers, uniqueGateBlockers(gates));
}

function nextActionMatches(
  nextAction: ReadinessNextAction,
  allowedActions: ReadinessAllowedAction[],
  blockers: ReadinessBlocker[],
) {
  const firstAction = allowedActions[0];
  if (firstAction) return nextAction.kind === "ACTION" && sameAction(nextAction.action, firstAction);

  const firstBlocker = blockers[0];
  if (firstBlocker) {
    return nextAction.kind === "BLOCKED"
      && nextAction.blockerCode === firstBlocker.code
      && nextAction.ownerRole === firstBlocker.ownerRole
      && nextAction.href === (firstBlocker.entity?.href ?? null);
  }

  return nextAction.kind === "COMPLETE";
}

function readinessStructureIsConsistent(readiness: OrderRevisionReadiness) {
  const gateActions = readiness.gates.flatMap((gate) => gate.allowedActions);
  return topLevelBlockersMatch(readiness.blockers, readiness.gates)
    && sameActionList(readiness.allowedActions, gateActions)
    && nextActionMatches(readiness.nextAction, readiness.allowedActions, readiness.blockers);
}

const mirroredGateKeys = [
  ["ORDER", "ORDER_REVIEW"],
  ["COMPONENTS", "COMPONENT_SNAPSHOT"],
  ["OPERATIONS", "OPERATION_PLAN"],
] as const satisfies ReadonlyArray<readonly [ProjectWorkflowGateKey, OrderRevisionReadinessGateKey]>;

function mirroredGatesMatch(workflow: ProjectWorkflow, readiness: OrderRevisionReadiness) {
  return mirroredGateKeys.every(([workflowKey, readinessKey]) => {
    const workflowGate = workflow.gates.find((gate) => gate.key === workflowKey);
    const readinessGate = readiness.gates.find((gate) => gate.key === readinessKey);
    return !!workflowGate
      && !!readinessGate
      && workflowGate.state === readinessGate.state
      && workflowGate.ownerRole === readinessGate.ownerRole
      && workflowGate.detailsHref === readinessGate.detailsHref
      && sameStructure(workflowGate.blockers, readinessGate.blockers)
      && sameActionList(workflowGate.allowedActions, readinessGate.allowedActions);
  });
}

function workflowStructureIsConsistent(workflow: ProjectWorkflow, readiness: OrderRevisionReadiness) {
  const expectedCurrentGate = workflow.gates.find((gate) => gate.state !== "READY")?.key ?? null;
  const gateActions = workflow.gates.flatMap((gate) => gate.allowedActions);
  return workflow.currentGate === expectedCurrentGate
    && topLevelBlockersMatch(workflow.blockers, workflow.gates)
    && sameActionList(workflow.allowedActions, gateActions)
    && nextActionMatches(workflow.nextAction, workflow.allowedActions, workflow.blockers)
    && mirroredGatesMatch(workflow, readiness)
    && workflow.gates.every((gate) => gate.source.kind === "ORDER_REVISION"
      && gate.source.id === workflow.revision.id
      && gate.source.revision === workflow.revision.number
      && gate.source.contentHash === readiness.revision.contentHash.value);
}

function blockerForNextAction(
  nextAction: Extract<ReadinessNextAction, { kind: "BLOCKED" }>,
  workflow: ProjectWorkflow,
  readiness: OrderRevisionReadiness,
) {
  return [...workflow.blockers, ...readiness.blockers]
    .find((blocker) => blocker.code === nextAction.blockerCode) ?? null;
}

function workspaceHrefForGate(key: ProjectWorkflowGateKey, projectKey: string, revision: number) {
  const encodedKey = encodeURIComponent(projectKey);
  if (key === "ORDER") return `/orders/${encodedKey}`;
  if (key === "COMPONENTS") return `/orders/${encodedKey}/revisions/${revision}/components`;
  if (key === "OPERATIONS") return `/orders/${encodedKey}/revisions/${revision}/operations`;
  return null;
}

function actionHref(workflow: ProjectWorkflow, candidate: string | null | undefined) {
  const current = workflow.gates.find((gate) => gate.key === workflow.currentGate);
  return safeProjectWorkspaceHref(candidate)
    ?? safeProjectWorkspaceHref(current?.detailsHref)
    ?? safeProjectWorkspaceHref(current?.source.href)
    ?? safeProjectWorkspaceHref(current?.blockers[0]?.entity?.href)
    ?? (current ? workspaceHrefForGate(current.key, workflow.projectKey, workflow.revision.number) : null);
}

function nextActionView(workflow: ProjectWorkflow, readiness: OrderRevisionReadiness): ProjectChainNextAction {
  const next = workflow.nextAction;
  if (next.kind === "COMPLETE") {
    return { kind: next.kind, title: next.message, detail: "A szerver nem jelöl további nyitott projektkaput.", ownerRole: "—", href: null, code: null };
  }
  if (next.kind === "BLOCKED") {
    const blocker = blockerForNextAction(next, workflow, readiness);
    return {
      kind: next.kind,
      title: blocker ? readinessBlockerLabel(blocker) : "A következő kapu blokkolt.",
      detail: "A hiányt a szerver által megjelölt adatgazda szerepkör munkaterében kell rendezni.",
      ownerRole: projectRoleLabel(next.ownerRole),
      href: safeProjectWorkspaceHref(next.href),
      code: next.blockerCode,
    };
  }
  return {
    kind: next.kind,
    title: actionLabels[next.action.code] ?? next.action.code,
    detail: "A szerver ezt jelölte következő engedélyezett műveletként. A módosítás csak az adatgazda munkatér saját ellenőrzött felületén végezhető el.",
    ownerRole: next.action.ownerRoles.map(projectRoleLabel).join(" · "),
    href: actionHref(workflow, null),
    code: next.action.code,
  };
}

/** Cross-checks the exact revision and the project chain before producing a
 * navigable view. Any partial, mixed-revision or stale response fails closed. */
export function buildProjectChainView(
  readinessValue: unknown,
  workflowValue: unknown,
  expected: { projectKey: string; revisionId: string; revisionNumber: number },
): ProjectChainView {
  if (!isOrderRevisionReadiness(readinessValue) || !isProjectWorkflow(workflowValue)) {
    return { status: "INVALID", reason: "A szerver readiness-szerződése hiányos vagy nem a támogatott verziójú." };
  }
  const readiness = readinessValue;
  const workflow = workflowValue;
  const identityMatches = readiness.projectKey === expected.projectKey
    && workflow.projectKey === expected.projectKey
    && readiness.revision.id === expected.revisionId
    && workflow.revision.id === expected.revisionId
    && readiness.revision.number === expected.revisionNumber
    && workflow.revision.number === expected.revisionNumber;
  if (!identityMatches) {
    return { status: "INVALID", reason: "A két szerverprojekció nem ugyanahhoz az exact rendelési revízióhoz tartozik." };
  }
  if (!readinessStructureIsConsistent(readiness) || !workflowStructureIsConsistent(workflow, readiness)) {
    return { status: "INVALID", reason: "A szerver projektláncának lineage- vagy döntési szerkezete nem konzisztens." };
  }
  if (!readiness.revision.isLatest || !workflow.revision.isLatest) {
    return { status: "STALE", reason: "Ez a readiness már nem a legfrissebb rendelési revízióhoz tartozik. Frissítsd a projektet a folytatás előtt." };
  }
  return {
    status: "READY",
    revisionNumber: readiness.revision.number,
    currentGate: workflow.currentGate,
    stages: workflow.gates.map((gate) => ({
      key: gate.key,
      label: workflowGateLabel[gate.key],
      state: stageState(gate, workflow.currentGate),
      ownerRole: projectRoleLabel(gate.ownerRole),
      blockers: gate.blockers,
      detailsHref: safeProjectWorkspaceHref(gate.detailsHref)
        ?? safeProjectWorkspaceHref(gate.source.href)
        ?? workspaceHrefForGate(gate.key, workflow.projectKey, workflow.revision.number),
    })),
    nextAction: nextActionView(workflow, readiness),
    readinessGates: readiness.gates,
  };
}
