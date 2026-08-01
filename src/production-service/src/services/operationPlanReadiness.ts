import { Prisma } from "@prisma/client";
import {
  findActiveComponentCalculatorProfile,
  componentCalculatorProfileFingerprint,
  componentSnapshotSchemaVersion,
} from "../config/componentCalculatorProfiles.js";
import {
  findActiveOperationGeneratorProfile,
  operationAuthority,
  operationGeneratorProfileFingerprint,
  operationPlanSnapshotSchemaVersion,
  resourceMappingFingerprint,
  standardCatalogFingerprint,
} from "../config/operationAuthority.js";
import { technicalCatalog, technicalCatalogFingerprint } from "../config/technicalCatalog.js";
import { prisma } from "../db/client.js";
import { persistedOperationCandidatesSchema } from "../domain/operationSchemas.js";
import { revisionContentHash, type OrderContentHashSchemaVersion } from "./orderRevisionHash.js";
import { sourceDerivedRevisionIsReady, summarizeSourceDerivedRevision } from "./sourceEvidenceGate.js";
import { positionEvidenceRevisionIsReady } from "./positionEvidenceGate.js";
import {
  canonicalHash,
  normalizeOperations,
  validateOperationCandidates,
  type OperationPlanBlocker,
} from "./operationPlanValidation.js";

export type DatabaseClient = typeof prisma | Prisma.TransactionClient;

export class OperationPlanError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 404 | 409,
    public readonly details?: unknown,
  ) {
    super(code);
  }
}

export function operationPlanBlocker(
  code: string,
  message: string,
  entityId?: string,
): OperationPlanBlocker {
  return { code, message, ...(entityId ? { entityId } : {}) };
}

const revisionInclude = {
  order: { include: { project: { select: { key: true } } } },
  audit: {
    where: { action: "APPROVED" as const },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
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

export const componentAuthorityInclude = {
  requirements: { orderBy: { sourceComponentKey: "asc" as const } },
} satisfies Prisma.ComponentSnapshotInclude;

type RevisionAuthority = Prisma.OrderRevisionGetPayload<{ include: typeof revisionInclude }>;
type ComponentAuthority = Prisma.ComponentSnapshotGetPayload<{ include: typeof componentAuthorityInclude }>;
type StoredOperationPlan = Prisma.OperationPlanSnapshotGetPayload<Record<string, never>>;

function contentHashSchemaVersion(value: number): value is OrderContentHashSchemaVersion {
  return value === 1 || value === 2 || value === 3;
}

export async function loadRevisionAuthority(db: DatabaseClient, orderRevisionId: string) {
  const revision = await db.orderRevision.findUnique({ where: { id: orderRevisionId }, include: revisionInclude });
  if (!revision) throw new OperationPlanError("order_revision_not_found", 404);
  const blockers: OperationPlanBlocker[] = [];
  if (await db.orderRevision.count({ where: { orderId: revision.orderId, revision: { gt: revision.revision } } })) {
    blockers.push(operationPlanBlocker("operation_revision_stale", "Only the latest order revision may create or verify an operation plan.", revision.id));
  }
  if (revision.status !== "APPROVED") {
    blockers.push(operationPlanBlocker("operation_revision_not_approved", "The exact order revision is not APPROVED.", revision.id));
  }
  if (!positionEvidenceRevisionIsReady(revision)) {
    blockers.push(operationPlanBlocker("operation_position_evidence_unresolved", "Order-position evidence is not fully resolved.", revision.id));
  }
  if (!sourceDerivedRevisionIsReady(revision)) {
    const summary = summarizeSourceDerivedRevision(revision);
    const unresolved = summary.manufacturedItems.unresolved + summary.supplementaryItems.unresolved;
    blockers.push(operationPlanBlocker("operation_source_evidence_unresolved", `Source-derived order evidence is not ready (${unresolved} item(s)).`, revision.id));
  }
  const approvalAudit = revision.audit[0];
  if (!approvalAudit) {
    blockers.push(operationPlanBlocker("operation_approval_audit_missing", "The APPROVED revision has no approval audit.", revision.id));
  } else if (!contentHashSchemaVersion(approvalAudit.contentHashSchemaVersion)) {
    blockers.push(operationPlanBlocker("operation_content_hash_schema_unsupported", "The approval hash schema is not supported.", revision.id));
  } else if (revisionContentHash(revision, approvalAudit.contentHashSchemaVersion) !== approvalAudit.contentHash) {
    blockers.push(operationPlanBlocker("operation_order_hash_stale", "Approved order content no longer matches its audit hash.", revision.id));
  }
  return { revision, approvalAudit, blockers };
}

function persistedComponentRequirementHashPayload(requirement: ComponentAuthority["requirements"][number]) {
  return {
    sourceKind: requirement.sourceKind,
    sourceId: requirement.sourceRecordId,
    requirementKind: requirement.requirementKind,
    sourceComponentKey: requirement.sourceComponentKey,
    componentKey: requirement.componentKey,
    name: requirement.name,
    quantity: requirement.quantity,
    quantityUnit: requirement.quantityUnit,
    materialKey: requirement.materialKey,
    finishKey: requirement.finishKey,
    finishedWidthMm: requirement.finishedWidthMm,
    finishedHeightMm: requirement.finishedHeightMm,
    finishedThicknessMm: requirement.finishedThicknessMm,
    cuttingWidthMm: requirement.cuttingWidthMm,
    cuttingHeightMm: requirement.cuttingHeightMm,
    cuttingThicknessMm: requirement.cuttingThicknessMm,
    grainDirection: requirement.grainDirection,
    notes: requirement.notes,
  };
}

export async function loadComponentAuthority(
  db: DatabaseClient,
  orderRevisionId: string,
  componentSnapshotId: string,
  approvalAuditId: string | undefined,
  orderContentHash: string | undefined,
) {
  const component = await db.componentSnapshot.findFirst({
    where: { id: componentSnapshotId, orderRevisionId },
    include: componentAuthorityInclude,
  });
  const blockers: OperationPlanBlocker[] = [];
  if (!component) {
    blockers.push(operationPlanBlocker("operation_component_snapshot_not_current", "Component snapshot is not part of the exact order revision.", componentSnapshotId));
    return { component: undefined, blockers };
  }
  if (component.state !== "VERIFIED") {
    blockers.push(operationPlanBlocker("operation_component_snapshot_not_verified", "Component snapshot is not VERIFIED.", component.id));
  }
  if (approvalAuditId && component.approvalAuditId !== approvalAuditId) {
    blockers.push(operationPlanBlocker("operation_component_snapshot_not_current", "Component snapshot does not reference the current order approval.", component.id));
  }
  if (orderContentHash && component.orderContentHash !== orderContentHash) {
    blockers.push(operationPlanBlocker("operation_component_snapshot_not_current", "Component snapshot order hash is stale.", component.id));
  }
  const activeProfile = findActiveComponentCalculatorProfile(component.calculatorProfileVersion);
  if (!activeProfile || component.calculatorProfileFingerprint !== componentCalculatorProfileFingerprint(activeProfile)) {
    blockers.push(operationPlanBlocker("operation_component_profile_stale", "Component snapshot calculator profile is no longer active or fingerprint-identical.", component.id));
  }
  if (component.snapshotSchemaVersion !== componentSnapshotSchemaVersion) {
    blockers.push(operationPlanBlocker("operation_component_schema_stale", "Component snapshot schema version is stale.", component.id));
  }
  if (
    component.technicalCatalogVersion !== technicalCatalog.version
    || component.technicalCatalogFingerprint !== technicalCatalogFingerprint
  ) blockers.push(operationPlanBlocker("operation_technical_catalog_stale", "Component snapshot technical catalog is stale.", component.id));

  const requirements = component.requirements
    .map(persistedComponentRequirementHashPayload)
    .sort((left, right) => left.sourceComponentKey.localeCompare(right.sourceComponentKey));
  if (
    component.requirements.some((requirement) => requirement.lineHash !== canonicalHash(persistedComponentRequirementHashPayload(requirement)))
    || component.outputHash !== canonicalHash(requirements)
  ) blockers.push(operationPlanBlocker("operation_component_hash_mismatch", "Component snapshot output or line hash has changed.", component.id));
  return { component, blockers };
}

export function operationGeneratorBlockers(version: string, fingerprint?: string) {
  const profile = findActiveOperationGeneratorProfile(version);
  if (!profile) return {
    profile: undefined,
    blockers: [operationPlanBlocker("operation_generator_profile_not_active", "Operation generator profile is not active.")],
  };
  const currentFingerprint = operationGeneratorProfileFingerprint(profile);
  return {
    profile,
    blockers: fingerprint && fingerprint !== currentFingerprint
      ? [operationPlanBlocker("operation_generator_profile_stale", "Operation generator profile fingerprint is stale.")]
      : [],
  };
}

function storedAuthorityBlockers(snapshot: StoredOperationPlan) {
  const blockers: OperationPlanBlocker[] = [];
  if (snapshot.schemaVersion !== operationPlanSnapshotSchemaVersion) blockers.push(operationPlanBlocker("operation_snapshot_schema_stale", "Operation plan snapshot schema is stale.", snapshot.id));
  if (
    snapshot.standardCatalogVersion !== operationAuthority.standardCatalog.version
    || snapshot.standardCatalogFingerprint !== standardCatalogFingerprint
  ) blockers.push(operationPlanBlocker("operation_standard_catalog_stale", "Operation standard catalog fingerprint is stale.", snapshot.id));
  if (
    snapshot.resourceMappingVersion !== operationAuthority.resourceMapping.version
    || snapshot.resourceMappingFingerprint !== resourceMappingFingerprint
  ) blockers.push(operationPlanBlocker("operation_resource_mapping_stale", "Operation resource mapping fingerprint is stale.", snapshot.id));
  return blockers;
}

export function throwOperationPlanBlockers(blockers: OperationPlanBlocker[]): never {
  const first = blockers[0]!;
  throw new OperationPlanError(first.code, 409, { blockers });
}

export async function evaluateOperationPlanSnapshot(db: DatabaseClient, snapshot: StoredOperationPlan) {
  const revisionAuthority = await loadRevisionAuthority(db, snapshot.orderRevisionId);
  const componentAuthority = await loadComponentAuthority(
    db,
    snapshot.orderRevisionId,
    snapshot.componentSnapshotId,
    revisionAuthority.approvalAudit?.id,
    revisionAuthority.approvalAudit?.contentHash,
  );
  const parsed = persistedOperationCandidatesSchema.safeParse(snapshot.operations);
  const blockers = [
    ...revisionAuthority.blockers,
    ...componentAuthority.blockers,
    ...operationGeneratorBlockers(snapshot.generatorProfileVersion, snapshot.generatorProfileFingerprint).blockers,
    ...storedAuthorityBlockers(snapshot),
  ];
  if (snapshot.orderContentHash !== revisionAuthority.approvalAudit?.contentHash) {
    blockers.push(operationPlanBlocker("operation_order_hash_mismatch", "Operation plan order hash is stale.", snapshot.id));
  }
  if (snapshot.componentOutputHash !== componentAuthority.component?.outputHash) {
    blockers.push(operationPlanBlocker("operation_component_hash_mismatch", "Operation plan component output hash is stale.", snapshot.id));
  }
  if (!parsed.success) {
    blockers.push(operationPlanBlocker("operation_snapshot_content_changed", "Persisted operation payload is not schema-valid.", snapshot.id));
    return { blockers, operations: [] };
  }
  const operations = normalizeOperations(parsed.data);
  if (snapshot.outputHash !== canonicalHash(operations)) {
    blockers.push(operationPlanBlocker("operation_snapshot_content_changed", "Persisted operation payload no longer matches its output hash.", snapshot.id));
  }
  if (componentAuthority.component) {
    blockers.push(...validateOperationCandidates(
      operations,
      componentAuthority.component.requirements,
      revisionAuthority.revision.documents,
    ));
  }
  const expectedInputHash = canonicalHash({
    schemaVersion: snapshot.schemaVersion,
    orderRevisionId: snapshot.orderRevisionId,
    orderContentHash: snapshot.orderContentHash,
    componentSnapshotId: snapshot.componentSnapshotId,
    componentOutputHash: snapshot.componentOutputHash,
    generatorProfileVersion: snapshot.generatorProfileVersion,
    generatorProfileFingerprint: snapshot.generatorProfileFingerprint,
    standardCatalogVersion: snapshot.standardCatalogVersion,
    standardCatalogFingerprint: snapshot.standardCatalogFingerprint,
    resourceMappingVersion: snapshot.resourceMappingVersion,
    resourceMappingFingerprint: snapshot.resourceMappingFingerprint,
  });
  if (snapshot.inputHash !== expectedInputHash) blockers.push(operationPlanBlocker("operation_snapshot_content_changed", "Operation plan input authority hash has changed.", snapshot.id));
  return { blockers, operations };
}

export async function projectOperationPlanSnapshot(db: DatabaseClient, snapshot: StoredOperationPlan) {
  const evaluation = await evaluateOperationPlanSnapshot(db, snapshot);
  const perOperation = new Map<string, OperationPlanBlocker[]>();
  for (const entry of evaluation.blockers) {
    if (!entry.entityId) continue;
    const current = perOperation.get(entry.entityId) ?? [];
    current.push(entry);
    perOperation.set(entry.entityId, current);
  }
  const ready = evaluation.blockers.length === 0;
  return {
    ...snapshot,
    operations: evaluation.operations.map((operation) => ({
      ...operation,
      state: perOperation.has(operation.id) ? "QUARANTINED" as const : "READY" as const,
      quarantineReasons: (perOperation.get(operation.id) ?? []).map(({ code, message }) => ({ code, message })),
    })),
    readiness: {
      ready,
      blockers: evaluation.blockers,
      allowedActions: snapshot.state === "REVIEW"
        ? [...(ready ? ["VERIFY_OPERATION_PLAN"] : []), "REJECT_OPERATION_PLAN"]
        : [],
    },
  };
}
