import { Prisma } from "@prisma/client";
import {
  componentCalculatorProfiles,
} from "../config/componentCalculatorProfiles.js";
import { prisma } from "../db/client.js";
import type { DoorstarRole } from "../middleware/requester.js";
import {
  loadComponentAuthority,
  loadRevisionAuthority,
  type DatabaseClient,
} from "./operationPlanReadiness.js";
import { listOperationPlanSnapshots } from "./operationPlanSnapshots.js";
import {
  documentVersionReadiness,
  revisionReviewReadinessError,
  surveyCompletionReadiness,
} from "./orderReviewReadiness.js";
import {
  CURRENT_ORDER_CONTENT_HASH_SCHEMA_VERSION,
  revisionContentHash,
  type OrderContentHashSchemaVersion,
} from "./orderRevisionHash.js";
import {
  positionEvidenceRevisionIsReady,
  summarizePositionEvidence,
} from "./positionEvidenceGate.js";
import { findActiveProject } from "./projects.js";
import {
  sourceEvidenceIsReady,
  summarizeSourceDerivedRevision,
} from "./sourceEvidenceGate.js";

export const orderRevisionReadinessSchemaVersion = "doorstar.order-revision-readiness/v1";
export const projectWorkflowSchemaVersion = "doorstar.project-workflow/v1";

export type ReadinessGateState = "READY" | "BLOCKED" | "NOT_AVAILABLE";
export type WorkflowGateState = ReadinessGateState | "CONTRACT_REQUIRED";

export type ReadinessEntity = {
  kind: string;
  id: string;
  href: string;
};

export type ReadinessBlocker = {
  code: string;
  message: string;
  ownerRole: DoorstarRole;
  entity: ReadinessEntity | null;
  detail: Record<string, unknown>;
};

export type AllowedAction = {
  code: string;
  method: "POST" | "PATCH";
  href: string;
  ownerRoles: DoorstarRole[];
  targetEntityId: string;
};

export type ReadinessGate = {
  key: string;
  state: ReadinessGateState;
  ready: boolean;
  ownerRole: DoorstarRole;
  detailsHref: string | null;
  blockers: ReadinessBlocker[];
  allowedActions: AllowedAction[];
  details: Record<string, unknown> & { kind: string };
};

type ProjectWorkflowGate = {
  key: string;
  state: WorkflowGateState;
  ownerRole: DoorstarRole;
  source: {
    kind: string;
    id: string;
    revision: number;
    contentHash: string;
    href: string;
  };
  blockers: ReadinessBlocker[];
  allowedActions: AllowedAction[];
  detailsHref: string | null;
};

export class OrderRevisionReadinessError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 404 | 409,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const readinessInclude = {
  order: { include: { project: { select: { id: true, key: true } } } },
  audit: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }] },
  feedback: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  positions: {
    orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
    include: {
      evidence: {
        orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
        include: { orderDocument: true },
      },
      documentLinks: {
        orderBy: [{ orderDocumentId: "asc" as const }, { id: "asc" as const }],
        include: { orderDocument: true },
      },
    },
  },
  documents: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  manufacturedItems: {
    orderBy: [{ kind: "asc" as const }, { code: "asc" as const }],
    include: { evidence: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] } },
  },
  supplementaryItems: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: { evidence: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] } },
  },
} satisfies Prisma.OrderRevisionInclude;

type ReadinessRevision = Prisma.OrderRevisionGetPayload<{ include: typeof readinessInclude }>;

const actionRoles = {
  REQUEST_ORDER_REVIEW: ["technical_preparation", "order_approver", "administrator"],
  APPROVE_ORDER_REVISION: ["order_approver", "administrator"],
  CREATE_COMPONENT_SNAPSHOT: ["technical_preparation", "order_approver", "production_planner", "administrator"],
  VERIFY_COMPONENT_SNAPSHOT: ["order_approver", "production_planner", "administrator"],
  REJECT_COMPONENT_SNAPSHOT: ["order_approver", "production_planner", "administrator"],
  CREATE_OPERATION_PLAN_SNAPSHOT: ["technical_preparation", "production_planner", "administrator"],
  VERIFY_OPERATION_PLAN: ["order_approver", "production_planner", "administrator"],
  REJECT_OPERATION_PLAN: ["order_approver", "production_planner", "administrator"],
} as const satisfies Record<string, readonly DoorstarRole[]>;

function entity(kind: string, id: string, href: string): ReadinessEntity {
  return { kind, id, href };
}

function blocker(
  code: string,
  message: string,
  ownerRole: DoorstarRole,
  target: ReadinessEntity | null,
  detail: Record<string, unknown> = {},
): ReadinessBlocker {
  return { code, message, ownerRole, entity: target, detail };
}

function action(
  code: keyof typeof actionRoles,
  method: AllowedAction["method"],
  href: string,
  targetEntityId: string,
  requesterRole: DoorstarRole,
): AllowedAction[] {
  const ownerRoles = [...actionRoles[code]];
  return (ownerRoles as DoorstarRole[]).includes(requesterRole)
    ? [{ code, method, href, ownerRoles, targetEntityId }]
    : [];
}

function gate(
  key: string,
  ready: boolean,
  ownerRole: DoorstarRole,
  detailsHref: string | null,
  blockers: ReadinessBlocker[],
  allowedActions: AllowedAction[],
  details: Record<string, unknown> & { kind: string },
  state: ReadinessGateState = ready ? "READY" : "BLOCKED",
): ReadinessGate {
  return { key, state, ready, ownerRole, detailsHref, blockers, allowedActions, details };
}

function uniqueBlockers(blockers: ReadinessBlocker[]) {
  const seen = new Set<string>();
  return blockers.filter((item) => {
    const key = `${item.code}:${item.entity?.kind ?? ""}:${item.entity?.id ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function contentHashProjection(revision: ReadinessRevision) {
  const approvedAudit = revision.audit.find((audit) => audit.action === "APPROVED");
  const reviewAudit = revision.audit.find((audit) => audit.action === "REVIEW_REQUESTED");
  const bindingAudit = revision.status === "REVIEW"
    ? reviewAudit
    : revision.status === "APPROVED" || revision.status === "SUPERSEDED"
      ? approvedAudit
      : undefined;
  const schemaVersion = bindingAudit?.contentHashSchemaVersion;
  const supportedSchema = schemaVersion === 1 || schemaVersion === 2 || schemaVersion === 3;
  const currentSchema = supportedSchema
    ? schemaVersion as OrderContentHashSchemaVersion
    : CURRENT_ORDER_CONTENT_HASH_SCHEMA_VERSION;
  const currentValue = revisionContentHash(revision, currentSchema);
  if (revision.status === "DRAFT") {
    return {
      value: currentValue,
      schemaVersion: currentSchema,
      verification: "UNAPPROVED_CURRENT" as const,
      auditId: null,
    };
  }
  if (!bindingAudit || !supportedSchema) {
    return {
      value: currentValue,
      schemaVersion: currentSchema,
      verification: "AUDIT_MISSING" as const,
      auditId: bindingAudit?.id ?? null,
    };
  }
  return {
    value: bindingAudit.contentHash,
    schemaVersion: currentSchema,
    verification: currentValue === bindingAudit.contentHash ? "VERIFIED" as const : "MISMATCH" as const,
    auditId: bindingAudit.id,
  };
}

function sourceItemReady(item: ReadinessRevision["manufacturedItems"][number]) {
  return item.state === "REJECTED" || (item.state === "VERIFIED" && sourceEvidenceIsReady(item.evidence));
}

function supplementaryItemReady(item: ReadinessRevision["supplementaryItems"][number]) {
  return item.state === "REJECTED"
    || (item.state === "VERIFIED" && (item.entryMode !== "SOURCE_REVIEW" || sourceEvidenceIsReady(item.evidence)));
}

function mapAuthorityBlockers(
  entries: Array<{ code: string; message: string; entityId?: string }>,
  ownerRole: DoorstarRole,
  kind: string,
  defaultEntity: ReadinessEntity,
) {
  return entries.map((entry) => blocker(
    entry.code,
    entry.message,
    ownerRole,
    entry.entityId ? entity(kind, entry.entityId, defaultEntity.href) : defaultEntity,
  ));
}

type ReadinessProjectionHooks = {
  /** Test-only coordination seam used to prove MVCC snapshot behavior under concurrent writes. */
  afterExactRevisionRead?: () => Promise<void>;
};

async function loadExactRevision(db: DatabaseClient, projectKey: string, revisionNumber: number) {
  const project = await findActiveProject(projectKey, db);
  if (!project) throw new OrderRevisionReadinessError("project_not_found", 404, { projectKey });
  const revision = await db.orderRevision.findFirst({
    where: { order: { projectId: project.id }, revision: revisionNumber },
    include: readinessInclude,
  });
  if (!revision) {
    throw new OrderRevisionReadinessError("order_revision_not_found", 404, { projectKey, revision: revisionNumber });
  }
  const latest = await db.orderRevision.findFirst({
    where: { orderId: revision.orderId },
    orderBy: [{ revision: "desc" }, { id: "desc" }],
    select: { id: true, revision: true },
  });
  if (!latest) {
    throw new OrderRevisionReadinessError("readiness_projection_conflict", 409, { projectKey, revision: revisionNumber });
  }
  return { revision, latest };
}

async function assertReadSnapshotInvariant(
  db: DatabaseClient,
  projectKey: string,
  revision: ReadinessRevision,
  latest: { id: string; revision: number },
) {
  const [exactAfterProjection, latestAfterProjection] = await Promise.all([
    db.orderRevision.findUnique({
      where: { id: revision.id },
      select: { id: true, revision: true, updatedAt: true },
    }),
    db.orderRevision.findFirst({
      where: { orderId: revision.orderId },
      orderBy: [{ revision: "desc" }, { id: "desc" }],
      select: { id: true, revision: true },
    }),
  ]);
  if (
    !exactAfterProjection
    || exactAfterProjection.revision !== revision.revision
    || exactAfterProjection.updatedAt.getTime() !== revision.updatedAt.getTime()
    || latestAfterProjection?.id !== latest.id
    || latestAfterProjection.revision !== latest.revision
  ) {
    throw new OrderRevisionReadinessError("readiness_projection_conflict", 409, {
      projectKey,
      revision: revision.revision,
    });
  }
}

async function projectOrderRevisionReadiness(
  db: DatabaseClient,
  projectKey: string,
  revisionNumber: number,
  requesterRole: DoorstarRole,
  hooks: ReadinessProjectionHooks = {},
) {
  const { revision, latest } = await loadExactRevision(db, projectKey, revisionNumber);
  await hooks.afterExactRevisionRead?.();
  const revisionHref = `/api/production/production-orders/${projectKey}/revisions/${revisionNumber}`;
  const readinessHref = `${revisionHref}/readiness`;
  const revisionEntity = entity("ORDER_REVISION", revision.id, readinessHref);
  const hash = contentHashProjection(revision);

  const survey = surveyCompletionReadiness(revision.positions, revision.documents);
  const surveyBlockers: ReadinessBlocker[] = [];
  if (survey.details.positionCount === 0) {
    surveyBlockers.push(blocker("survey_positions_required", "At least one order position is required.", "technical_preparation", revisionEntity));
  }
  if (survey.details.positionsMissingFields.length) {
    surveyBlockers.push(blocker("survey_fields_missing", "Required survey fields are missing.", "technical_preparation", revisionEntity, {
      positionsMissingFields: survey.details.positionsMissingFields,
    }));
  }
  if (survey.details.surveyDocumentRequired) {
    surveyBlockers.push(blocker("survey_document_required", "A SURVEY document version is required.", "technical_preparation", revisionEntity));
  }
  if (survey.details.positionIdsMissingSurveyDocumentLink.length) {
    surveyBlockers.push(blocker("survey_document_link_required", "Every position must link an exact SURVEY document version.", "technical_preparation", revisionEntity, {
      orderPositionIds: survey.details.positionIdsMissingSurveyDocumentLink,
    }));
  }
  const positionEvidenceSummary = summarizePositionEvidence(revision);
  const positionEvidenceBlockers = positionEvidenceSummary.blockerEvidenceIds.map((id) => blocker(
    "position_evidence_unresolved",
    "Order-position evidence is not fully and auditably RESOLVED.",
    "technical_preparation",
    entity("ORDER_POSITION_EVIDENCE", id, `${revisionHref}/positions/evidence`),
  ));

  const documentVersions = documentVersionReadiness(revision.positions, revision.documents);
  const documentBlockers = [
    ...surveyBlockers.filter((item) =>
      item.code === "survey_document_required" || item.code === "survey_document_link_required"),
    ...(documentVersions.ready ? [] : [blocker(
      "stale_document_version_linked",
      "One or more positions link a superseded document version.",
      "technical_preparation",
      revisionEntity,
      { documentVersionIds: documentVersions.details.staleLinkedDocumentVersionIds },
    )]),
  ];

  const sourceSummary = summarizeSourceDerivedRevision(revision);
  const manufacturedBlockerIds = revision.manufacturedItems.filter((item) => !sourceItemReady(item)).map((item) => item.id);
  const manufacturedBlockers = manufacturedBlockerIds.map((id) => blocker(
    "manufactured_item_review_unresolved",
    "Manufactured item review or its evidence audit is unresolved.",
    "technical_preparation",
    entity("MANUFACTURED_ITEM", id, `${revisionHref}/manufactured-items/${id}`),
  ));
  const supplementaryBlockerIds = revision.supplementaryItems.filter((item) => !supplementaryItemReady(item)).map((item) => item.id);
  const supplementaryBlockers = supplementaryBlockerIds.map((id) => blocker(
    "supplementary_item_review_unresolved",
    "Supplementary item review or its evidence audit is unresolved.",
    "technical_preparation",
    entity("SUPPLEMENTARY_ITEM", id, `${revisionHref}/supplementary-items/${id}`),
  ));

  const commonOrderReady = revisionReviewReadinessError(revision) === null;
  const isLatest = latest.id === revision.id;
  const orderBlockers = uniqueBlockers([
    ...(isLatest ? [] : [blocker(
      "latest_revision_required",
      "Continuation authority is available only on the latest order revision.",
      "technical_preparation",
      revisionEntity,
      { latestRevisionNumber: latest.revision },
    )]),
    ...(revision.intakeStage === "TECHNICAL_PREPARATION" ? [] : [blocker(
      "technical_preparation_stage_required",
      "Order review requires the TECHNICAL_PREPARATION intake stage.",
      "technical_preparation",
      revisionEntity,
      { intakeStage: revision.intakeStage },
    )]),
    ...surveyBlockers,
    ...documentBlockers,
    ...positionEvidenceBlockers,
    ...manufacturedBlockers,
    ...supplementaryBlockers,
    ...(hash.verification === "MISMATCH" ? [blocker(
      "order_content_hash_mismatch",
      "Current revision content no longer matches its review or approval audit hash.",
      "order_approver",
      revisionEntity,
      { auditId: hash.auditId },
    )] : []),
    ...(hash.verification === "AUDIT_MISSING" ? [blocker(
      "order_content_hash_audit_missing",
      "The revision state has no supported review or approval hash audit.",
      "order_approver",
      revisionEntity,
    )] : []),
  ]);
  const orderReady = isLatest && commonOrderReady && !["MISMATCH", "AUDIT_MISSING"].includes(hash.verification);
  const orderActions = revision.status === "DRAFT" && orderReady
    ? action("REQUEST_ORDER_REVIEW", "POST", `${revisionHref}/review`, revision.id, requesterRole)
    : revision.status === "REVIEW" && orderReady
      ? action("APPROVE_ORDER_REVISION", "POST", `${revisionHref}/approve`, revision.id, requesterRole)
      : [];

  const revisionAuthority = await loadRevisionAuthority(db, revision.id);
  const componentSnapshots = await db.componentSnapshot.findMany({
    where: { orderRevisionId: revision.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const componentEvaluations = await Promise.all(componentSnapshots.map(async (snapshot) => ({
    snapshot,
    authority: await loadComponentAuthority(
      db,
      revision.id,
      snapshot.id,
      revisionAuthority.approvalAudit?.id,
      revisionAuthority.approvalAudit?.contentHash,
    ),
  })));
  const currentVerifiedComponent = componentEvaluations.find(({ snapshot, authority }) =>
    snapshot.state === "VERIFIED" && revisionAuthority.blockers.length === 0 && authority.blockers.length === 0);
  const selectedComponent = currentVerifiedComponent ?? componentEvaluations[0];
  const latestRevisionBlocker = blocker(
    "latest_revision_required",
    "Continuation authority is available only on the latest order revision.",
    "technical_preparation",
    revisionEntity,
    { latestRevisionNumber: latest.revision },
  );
  const componentBlockers = selectedComponent
    ? uniqueBlockers([
      ...(isLatest ? [] : [latestRevisionBlocker]),
      ...mapAuthorityBlockers(revisionAuthority.blockers, "technical_preparation", "ORDER_REVISION", revisionEntity),
      ...mapAuthorityBlockers(
        selectedComponent.authority.blockers,
        "technical_preparation",
        "COMPONENT_SNAPSHOT",
        entity("COMPONENT_SNAPSHOT", selectedComponent.snapshot.id, `${revisionHref}/component-snapshots`),
      ),
      ...(selectedComponent.snapshot.state === "VERIFIED" ? [] : [blocker(
        "current_verified_component_snapshot_required",
        "A current VERIFIED component snapshot is required.",
        "technical_preparation",
        entity("COMPONENT_SNAPSHOT", selectedComponent.snapshot.id, `${revisionHref}/component-snapshots`),
        { state: selectedComponent.snapshot.state },
      )]),
    ])
    : [
      ...(isLatest ? [] : [latestRevisionBlocker]),
      blocker(
      "component_snapshot_required",
      "No component snapshot exists for the exact revision.",
      "technical_preparation",
      revisionEntity,
      ),
    ];
  const componentActions: AllowedAction[] = [];
  if (
    !selectedComponent
    && revisionAuthority.blockers.length === 0
    && componentCalculatorProfiles.profiles.some((profile) => profile.active)
  ) {
    componentActions.push(...action("CREATE_COMPONENT_SNAPSHOT", "POST", `${revisionHref}/component-snapshots`, revision.id, requesterRole));
  }
  if (selectedComponent?.snapshot.state === "REVIEW") {
    if (revisionAuthority.blockers.length === 0 && selectedComponent.authority.blockers.length === 0) {
      componentActions.push(...action("VERIFY_COMPONENT_SNAPSHOT", "PATCH", `${revisionHref}/component-snapshots/${selectedComponent.snapshot.id}/review`, selectedComponent.snapshot.id, requesterRole));
    }
    componentActions.push(...action("REJECT_COMPONENT_SNAPSHOT", "PATCH", `${revisionHref}/component-snapshots/${selectedComponent.snapshot.id}/review`, selectedComponent.snapshot.id, requesterRole));
  }

  const operationProjection = await listOperationPlanSnapshots(revision.id, db);
  const operationSnapshots = [...operationProjection.snapshots].reverse();
  const currentVerifiedOperation = operationSnapshots.find((snapshot) => snapshot.state === "VERIFIED" && snapshot.readiness.ready);
  const selectedOperation = currentVerifiedOperation ?? operationSnapshots[0];
  const operationBlockers = currentVerifiedOperation && isLatest
    ? []
    : selectedOperation
      ? uniqueBlockers([
        ...(isLatest ? [] : [latestRevisionBlocker]),
        ...mapAuthorityBlockers(selectedOperation.readiness.blockers, "production_planner", "OPERATION_PLAN_SNAPSHOT", entity(
          "OPERATION_PLAN_SNAPSHOT",
          selectedOperation.id,
          `${revisionHref}/operation-plan-snapshots`,
        )),
        ...(selectedOperation.state === "VERIFIED" ? [] : [blocker(
          "current_verified_operation_plan_required",
          "A current VERIFIED operation plan snapshot is required.",
          "production_planner",
          entity("OPERATION_PLAN_SNAPSHOT", selectedOperation.id, `${revisionHref}/operation-plan-snapshots`),
          { state: selectedOperation.state },
        )]),
      ])
      : [
        ...(isLatest ? [] : [latestRevisionBlocker]),
        blocker(
        "operation_plan_snapshot_required",
        "No operation plan snapshot exists for the exact revision.",
        "production_planner",
        revisionEntity,
        ),
      ];
  const operationActions: AllowedAction[] = [];
  if (!selectedOperation && operationProjection.readiness.ready) {
    operationActions.push(...action("CREATE_OPERATION_PLAN_SNAPSHOT", "POST", `${revisionHref}/operation-plan-snapshots`, revision.id, requesterRole));
  }
  if (selectedOperation?.state === "REVIEW") {
    if (selectedOperation.readiness.ready) {
      operationActions.push(...action("VERIFY_OPERATION_PLAN", "PATCH", `${revisionHref}/operation-plan-snapshots/${selectedOperation.id}/review`, selectedOperation.id, requesterRole));
    }
    operationActions.push(...action("REJECT_OPERATION_PLAN", "PATCH", `${revisionHref}/operation-plan-snapshots/${selectedOperation.id}/review`, selectedOperation.id, requesterRole));
  }

  const productionReleaseBlockers = uniqueBlockers([
    ...(isLatest ? [] : [latestRevisionBlocker]),
    ...(revision.status === "APPROVED" && isLatest && hash.verification === "VERIFIED" ? [] : [blocker(
      "approved_current_revision_required",
      "Production release requires the latest APPROVED revision with a verified audit hash.",
      "order_approver",
      revisionEntity,
    )]),
    ...(currentVerifiedComponent ? [] : [blocker(
      "current_verified_component_snapshot_required",
      "Production release requires a current VERIFIED component snapshot.",
      "technical_preparation",
      revisionEntity,
    )]),
    ...(currentVerifiedOperation ? [] : [blocker(
      "current_verified_operation_plan_required",
      "Production release requires a current VERIFIED operation plan snapshot.",
      "production_planner",
      revisionEntity,
    )]),
    blocker(
      "planning_proposal_authority_not_available",
      "No authoritative PlanningProposal contract exists.",
      "production_planner",
      revisionEntity,
    ),
    blocker(
      "issued_work_package_authority_not_available",
      "No immutable IssuedWorkPackage authority exists; legacy Task and free-text release keys do not qualify.",
      "production_planner",
      revisionEntity,
    ),
    blocker(
      "exact_document_release_authority_not_available",
      "Exact document versions are stored, but there is no authoritative work-package document release aggregate.",
      "technical_preparation",
      revisionEntity,
    ),
  ]);

  const gates: ReadinessGate[] = [
    gate("SURVEY", survey.ready, "technical_preparation", readinessHref, surveyBlockers, [], { kind: "SURVEY", ...survey.details }),
    gate("POSITION_EVIDENCE", positionEvidenceRevisionIsReady(revision), "technical_preparation", `${revisionHref}/positions/evidence`, positionEvidenceBlockers, [], { kind: "POSITION_EVIDENCE", ...positionEvidenceSummary }),
    gate("DOCUMENTS", documentBlockers.length === 0, "technical_preparation", readinessHref, documentBlockers, [], {
      kind: "DOCUMENTS",
      total: revision.documents.length,
      ...documentVersions.details,
    }),
    gate("MANUFACTURED_ITEMS", sourceSummary.manufacturedItems.unresolved === 0, "technical_preparation", `${revisionHref}/manufactured-items`, manufacturedBlockers, [], {
      kind: "MANUFACTURED_ITEMS",
      ...sourceSummary.manufacturedItems,
      blockerItemIds: manufacturedBlockerIds,
    }),
    gate("SUPPLEMENTARY_ITEMS", sourceSummary.supplementaryItems.unresolved === 0, "technical_preparation", `${revisionHref}/supplementary-items`, supplementaryBlockers, [], {
      kind: "SUPPLEMENTARY_ITEMS",
      ...sourceSummary.supplementaryItems,
      blockerItemIds: supplementaryBlockerIds,
    }),
    gate("ORDER_REVIEW", orderReady, "order_approver", readinessHref, orderBlockers, orderActions, {
      kind: "ORDER_REVIEW",
      status: revision.status,
      intakeStage: revision.intakeStage,
      sharedPredicateReady: commonOrderReady,
      contentHash: hash,
      openFeedbackCount: revision.feedback.filter((item) => item.status !== "RESOLVED").length,
      feedbackIsApprovalBlocker: false,
    }),
    gate("COMPONENT_SNAPSHOT", Boolean(currentVerifiedComponent) && isLatest, "technical_preparation", `${revisionHref}/component-snapshots`, componentBlockers, isLatest ? componentActions : [], {
      kind: "COMPONENT_SNAPSHOT",
      snapshotCount: componentSnapshots.length,
      selectedSnapshotId: selectedComponent?.snapshot.id ?? null,
      selectedState: selectedComponent?.snapshot.state ?? null,
      currentVerifiedSnapshotId: currentVerifiedComponent?.snapshot.id ?? null,
      current: Boolean(currentVerifiedComponent) && isLatest,
      verified: Boolean(currentVerifiedComponent),
    }),
    gate("OPERATION_PLAN", Boolean(currentVerifiedOperation) && isLatest, "production_planner", `${revisionHref}/operation-plan-snapshots`, operationBlockers, isLatest ? operationActions : [], {
      kind: "OPERATION_PLAN",
      snapshotCount: operationSnapshots.length,
      selectedSnapshotId: selectedOperation?.id ?? null,
      selectedState: selectedOperation?.state ?? null,
      currentVerifiedSnapshotId: currentVerifiedOperation?.id ?? null,
      current: Boolean(currentVerifiedOperation) && isLatest,
      verified: Boolean(currentVerifiedOperation),
      createReadiness: operationProjection.readiness,
    }),
    gate("PRODUCTION_RELEASE", false, "production_planner", null, productionReleaseBlockers, [], {
      kind: "PRODUCTION_RELEASE",
      authority: "NOT_AVAILABLE",
      orderApproved: revision.status === "APPROVED" && latest.id === revision.id && hash.verification === "VERIFIED",
      componentVerified: Boolean(currentVerifiedComponent),
      operationVerified: Boolean(currentVerifiedOperation),
      planningProposalAvailable: false,
      issuedWorkPackageAvailable: false,
    }, "NOT_AVAILABLE"),
  ];
  const allowedActions = gates.flatMap((item) => item.allowedActions);
  const blockers = uniqueBlockers(gates.flatMap((item) => item.blockers));
  const nextAction = allowedActions[0]
    ? { kind: "ACTION" as const, action: allowedActions[0] }
    : blockers[0]
      ? {
        kind: "BLOCKED" as const,
        blockerCode: blockers[0].code,
        ownerRole: blockers[0].ownerRole,
        href: blockers[0].entity?.href ?? null,
      }
      : { kind: "COMPLETE" as const, message: "No further backend-authoritative action is available." };

  await assertReadSnapshotInvariant(db, projectKey, revision, latest);

  return {
    schemaVersion: orderRevisionReadinessSchemaVersion,
    projectKey,
    revision: {
      id: revision.id,
      number: revision.revision,
      isLatest,
      latestRevisionNumber: latest.revision,
      status: revision.status,
      intakeStage: revision.intakeStage,
      updatedAt: revision.updatedAt,
      contentHash: hash,
    },
    gates,
    blockers,
    allowedActions,
    nextAction,
  };
}

export function getOrderRevisionReadiness(
  projectKey: string,
  revisionNumber: number,
  requesterRole: DoorstarRole,
  hooks: ReadinessProjectionHooks = {},
) {
  return prisma.$transaction(
    (tx) => projectOrderRevisionReadiness(tx, projectKey, revisionNumber, requesterRole, hooks),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 },
  );
}

function projectWorkflowFromReadiness(projectKey: string, requesterRole: DoorstarRole, readiness: Awaited<ReturnType<typeof projectOrderRevisionReadiness>>) {
  const byKey = new Map(readiness.gates.map((item) => [item.key, item]));
  const revisionSource = {
    kind: "ORDER_REVISION",
    id: readiness.revision.id,
    revision: readiness.revision.number,
    contentHash: readiness.revision.contentHash.value,
    href: `/api/production/production-orders/${projectKey}/revisions/${readiness.revision.number}/readiness`,
  };
  const mapped = [
    ["ORDER", byKey.get("ORDER_REVIEW")],
    ["COMPONENTS", byKey.get("COMPONENT_SNAPSHOT")],
    ["OPERATIONS", byKey.get("OPERATION_PLAN")],
  ] as const;
  const gates: ProjectWorkflowGate[] = mapped.map(([key, sourceGate]) => ({
    key,
    state: sourceGate?.state ?? "BLOCKED",
    ownerRole: sourceGate?.ownerRole ?? "technical_preparation" as DoorstarRole,
    source: revisionSource,
    blockers: sourceGate?.blockers ?? [],
    allowedActions: sourceGate?.allowedActions ?? [],
    detailsHref: sourceGate?.detailsHref ?? revisionSource.href,
  }));
  for (const [key, ownerRole, code, message] of [
    ["PLANNING", "production_planner", "planning_proposal_authority_not_available", "PlanningProposal authority is not implemented."],
    ["WORK_PACKAGE", "production_planner", "issued_work_package_authority_not_available", "Immutable IssuedWorkPackage authority is not implemented."],
    ["PRODUCTION_6_STAGE", "shop_floor", "production_state_machine_authority_not_available", "The authoritative 6-stage runtime state machine is not implemented."],
    ["HANDOVER", "warehouse_dispatch", "handover_authority_not_available", "Delivery and installation handover authority is not implemented."],
  ] as const) {
    gates.push({
      key,
      state: "CONTRACT_REQUIRED" as WorkflowGateState,
      ownerRole,
      source: revisionSource,
      blockers: [blocker(code, message, ownerRole, entity("ORDER_REVISION", readiness.revision.id, revisionSource.href))],
      allowedActions: [],
      detailsHref: null,
    });
  }
  const blockers = uniqueBlockers(gates.flatMap((item) => item.blockers));
  const allowedActions = gates.flatMap((item) => item.allowedActions);
  return {
    schemaVersion: projectWorkflowSchemaVersion,
    projectKey,
    revision: {
      id: readiness.revision.id,
      number: readiness.revision.number,
      isLatest: readiness.revision.isLatest,
      href: revisionSource.href,
    },
    currentGate: gates.find((item) => item.state !== "READY")?.key ?? null,
    gates,
    blockers,
    allowedActions,
    nextAction: allowedActions[0]
      ? { kind: "ACTION" as const, action: allowedActions[0] }
      : blockers[0]
        ? { kind: "BLOCKED" as const, blockerCode: blockers[0].code, ownerRole: blockers[0].ownerRole, href: blockers[0].entity?.href ?? null }
        : { kind: "COMPLETE" as const, message: "All authoritative workflow gates are complete." },
  };
}

export function getProjectWorkflow(projectKey: string, requesterRole: DoorstarRole) {
  return prisma.$transaction(async (tx) => {
    const project = await findActiveProject(projectKey, tx);
    if (!project) throw new OrderRevisionReadinessError("project_not_found", 404, { projectKey });
    const latest = await tx.orderRevision.findFirst({
      where: { order: { projectId: project.id } },
      orderBy: [{ revision: "desc" }, { id: "desc" }],
      select: { revision: true },
    });
    if (!latest) throw new OrderRevisionReadinessError("order_revision_not_found", 404, { projectKey });
    const readiness = await projectOrderRevisionReadiness(tx, projectKey, latest.revision, requesterRole);
    return projectWorkflowFromReadiness(projectKey, requesterRole, readiness);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
}
