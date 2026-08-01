import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  componentCalculatorProfileFingerprint,
  componentSnapshotSchemaVersion,
  findActiveComponentCalculatorProfile,
} from "../config/componentCalculatorProfiles.js";
import { technicalCatalog, technicalCatalogFingerprint, validateTechnicalSelection } from "../config/technicalCatalog.js";
import { prisma } from "../db/client.js";
import { createComponentSnapshotSchema } from "../domain/schemas.js";
import {
  revisionContentHash,
  type OrderContentHashSchemaVersion,
} from "./orderRevisionHash.js";
import {
  sourceDerivedRevisionIsReady,
  sourceEvidenceIsReady,
  summarizeSourceDerivedRevision,
  summarizeSourceEvidence,
} from "./sourceEvidenceGate.js";
import {
  positionEvidenceRevisionIsReady,
  summarizePositionEvidence,
} from "./positionEvidenceGate.js";

type CreateComponentSnapshotInput = ReturnType<typeof createComponentSnapshotSchema.parse>;
type ComponentRequirementInput = CreateComponentSnapshotInput["requirements"][number];

const snapshotInclude = {
  requirements: { orderBy: { sourceComponentKey: "asc" as const } },
} satisfies Prisma.ComponentSnapshotInclude;

export class ComponentSnapshotError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 404 | 409,
    public readonly details?: unknown,
  ) {
    super(code);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function canonicalHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function normalizeRequirement(requirement: ComponentRequirementInput) {
  return {
    sourceKind: requirement.source.kind,
    sourceId: requirement.source.id,
    requirementKind: requirement.requirementKind,
    sourceComponentKey: requirement.sourceComponentKey,
    componentKey: requirement.componentKey,
    name: requirement.name,
    quantity: requirement.quantity,
    quantityUnit: requirement.quantityUnit,
    materialKey: requirement.materialKey ?? null,
    finishKey: requirement.finishKey ?? null,
    finishedWidthMm: requirement.finishedDimensionsMm?.width ?? null,
    finishedHeightMm: requirement.finishedDimensionsMm?.height ?? null,
    finishedThicknessMm: requirement.finishedDimensionsMm?.thickness ?? null,
    cuttingWidthMm: requirement.cuttingDimensionsMm?.width ?? null,
    cuttingHeightMm: requirement.cuttingDimensionsMm?.height ?? null,
    cuttingThicknessMm: requirement.cuttingDimensionsMm?.thickness ?? null,
    grainDirection: requirement.grainDirection ?? null,
    notes: requirement.notes ?? "",
  };
}

async function assertSourcesBelongToRevision(
  orderRevisionId: string,
  requirements: ReturnType<typeof normalizeRequirement>[],
) {
  const ids = {
    ORDER_POSITION: [...new Set(requirements.filter((item) => item.sourceKind === "ORDER_POSITION").map((item) => item.sourceId))],
    MANUFACTURED_ITEM: [...new Set(requirements.filter((item) => item.sourceKind === "MANUFACTURED_ITEM").map((item) => item.sourceId))],
    SUPPLEMENTARY_ITEM: [...new Set(requirements.filter((item) => item.sourceKind === "SUPPLEMENTARY_ITEM").map((item) => item.sourceId))],
  };
  const [positions, manufacturedItems, supplementaryItems] = await Promise.all([
    prisma.orderPosition.findMany({ where: { id: { in: ids.ORDER_POSITION }, orderRevisionId }, select: { id: true } }),
    prisma.manufacturedItem.findMany({
      where: { id: { in: ids.MANUFACTURED_ITEM }, orderRevisionId },
      select: {
        id: true,
        state: true,
        evidence: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            reviewState: true,
            resolution: true,
            reviewedByRole: true,
            reviewedAt: true,
          },
        },
      },
    }),
    prisma.orderSupplementaryItem.findMany({
      where: { id: { in: ids.SUPPLEMENTARY_ITEM }, orderRevisionId },
      select: {
        id: true,
        entryMode: true,
        state: true,
        evidence: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            reviewState: true,
            resolution: true,
            reviewedByRole: true,
            reviewedAt: true,
          },
        },
      },
    }),
  ]);
  const positionIds = new Set(positions.map((item) => item.id));
  const manufacturedById = new Map(manufacturedItems.map((item) => [item.id, item]));
  const supplementaryById = new Map(supplementaryItems.map((item) => [item.id, item]));

  for (const requirement of requirements) {
    if (requirement.sourceKind === "ORDER_POSITION" && !positionIds.has(requirement.sourceId)) {
      throw new ComponentSnapshotError("component_source_not_from_revision", 409, { sourceKind: requirement.sourceKind, sourceId: requirement.sourceId });
    }
    if (requirement.sourceKind === "MANUFACTURED_ITEM") {
      const source = manufacturedById.get(requirement.sourceId);
      if (!source) throw new ComponentSnapshotError("component_source_not_from_revision", 409, { sourceKind: requirement.sourceKind, sourceId: requirement.sourceId });
      if (source.state !== "VERIFIED") throw new ComponentSnapshotError("component_source_not_verified", 409, { sourceKind: requirement.sourceKind, sourceId: requirement.sourceId, state: source.state });
      if (!sourceEvidenceIsReady(source.evidence)) {
        throw new ComponentSnapshotError("component_source_evidence_unresolved", 409, {
          sourceKind: requirement.sourceKind,
          sourceId: requirement.sourceId,
          ...summarizeSourceEvidence(source.evidence),
        });
      }
    }
    if (requirement.sourceKind === "SUPPLEMENTARY_ITEM") {
      const source = supplementaryById.get(requirement.sourceId);
      if (!source) throw new ComponentSnapshotError("component_source_not_from_revision", 409, { sourceKind: requirement.sourceKind, sourceId: requirement.sourceId });
      if (source.state !== "VERIFIED") throw new ComponentSnapshotError("component_source_not_verified", 409, { sourceKind: requirement.sourceKind, sourceId: requirement.sourceId, state: source.state });
      if (source.entryMode === "SOURCE_REVIEW" && !sourceEvidenceIsReady(source.evidence)) {
        throw new ComponentSnapshotError("component_source_evidence_unresolved", 409, {
          sourceKind: requirement.sourceKind,
          sourceId: requirement.sourceId,
          ...summarizeSourceEvidence(source.evidence),
        });
      }
    }
  }
}

async function loadApprovedLatestRevision(orderRevisionId: string) {
  const revision = await prisma.orderRevision.findUnique({
    where: { id: orderRevisionId },
    include: {
      order: { include: { project: { select: { key: true } } } },
      audit: {
        where: { action: "APPROVED" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
      },
      positions: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          evidence: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: { orderDocument: true },
          },
          documentLinks: {
            orderBy: [{ orderDocumentId: "asc" }, { id: "asc" }],
            include: { orderDocument: true },
          },
        },
      },
      documents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      manufacturedItems: {
        orderBy: [{ kind: "asc" }, { code: "asc" }],
        include: {
          evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        },
      },
      supplementaryItems: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          evidence: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        },
      },
    },
  });
  if (!revision) throw new ComponentSnapshotError("order_revision_not_found", 404);
  if (await prisma.orderRevision.count({ where: { orderId: revision.orderId, revision: { gt: revision.revision } } })) {
    throw new ComponentSnapshotError("component_snapshot_requires_latest_revision", 409);
  }
  if (revision.status !== "APPROVED") throw new ComponentSnapshotError("component_snapshot_requires_approved_revision", 409);
  if (!positionEvidenceRevisionIsReady(revision)) {
    throw new ComponentSnapshotError(
      "component_position_evidence_unresolved",
      409,
      summarizePositionEvidence(revision),
    );
  }
  if (!sourceDerivedRevisionIsReady(revision)) {
    throw new ComponentSnapshotError(
      "component_source_evidence_unresolved",
      409,
      summarizeSourceDerivedRevision(revision),
    );
  }
  const approvalAudit = revision.audit[0];
  if (!approvalAudit) throw new ComponentSnapshotError("approved_order_audit_required", 409);
  if (
    approvalAudit.contentHashSchemaVersion !== 1
    && approvalAudit.contentHashSchemaVersion !== 2
    && approvalAudit.contentHashSchemaVersion !== 3
  ) {
    throw new ComponentSnapshotError("content_hash_schema_version_unsupported", 409);
  }
  if (
    revisionContentHash(
      revision,
      approvalAudit.contentHashSchemaVersion as OrderContentHashSchemaVersion,
    ) !== approvalAudit.contentHash
  ) {
    throw new ComponentSnapshotError("approved_order_content_changed", 409);
  }
  return { revision, approvalAudit };
}

export async function createComponentSnapshot(
  orderRevisionId: string,
  input: CreateComponentSnapshotInput,
  actorRole: string,
) {
  const { revision, approvalAudit } = await loadApprovedLatestRevision(orderRevisionId);
  if (approvalAudit.contentHash.toLowerCase() !== input.expectedOrderContentHash.toLowerCase()) {
    throw new ComponentSnapshotError("approved_order_hash_mismatch", 409);
  }
  const profile = findActiveComponentCalculatorProfile(input.calculatorProfileVersion);
  if (!profile) throw new ComponentSnapshotError("component_calculator_profile_not_active", 409);

  const requirements = input.requirements
    .map(normalizeRequirement)
    .sort((left, right) => left.sourceComponentKey.localeCompare(right.sourceComponentKey));
  const catalogErrors = requirements.flatMap((requirement, index) =>
    validateTechnicalSelection({ materialKey: requirement.materialKey, finishKey: requirement.finishKey })
      .map((error) => `requirements.${index}.${error}`),
  );
  if (catalogErrors.length) throw new ComponentSnapshotError("component_catalog_value_invalid", 400, catalogErrors);
  await assertSourcesBelongToRevision(orderRevisionId, requirements);

  const calculatorProfileFingerprint = componentCalculatorProfileFingerprint(profile);
  const inputHash = canonicalHash({
    snapshotSchemaVersion: componentSnapshotSchemaVersion,
    orderRevisionId,
    orderContentHash: approvalAudit.contentHash,
    calculatorProfileVersion: profile.version,
    calculatorProfileFingerprint,
    technicalCatalogVersion: technicalCatalog.version,
    technicalCatalogFingerprint,
  });
  const outputHash = canonicalHash(requirements);
  const materializationKey = canonicalHash({ orderRevisionId, calculatorProfileVersion: profile.version });
  const sourceOrderRevision = `${revision.id}:${approvalAudit.contentHash}`;
  const sourceCalculatorRevision = `${profile.version}:${outputHash}`;

  const existing = await prisma.componentSnapshot.findUnique({
    where: { orderRevisionId_calculatorProfileVersion: { orderRevisionId, calculatorProfileVersion: profile.version } },
    include: snapshotInclude,
  });
  if (existing) {
    if (existing.inputHash !== inputHash || existing.outputHash !== outputHash) {
      throw new ComponentSnapshotError("component_snapshot_profile_conflict", 409, { snapshotId: existing.id });
    }
    return { created: false, snapshot: existing };
  }

  const createData: Prisma.ComponentSnapshotCreateInput = {
    orderRevision: { connect: { id: orderRevisionId } },
    approvalAudit: { connect: { id: approvalAudit.id } },
    snapshotSchemaVersion: componentSnapshotSchemaVersion,
    calculatorProfileVersion: profile.version,
    calculatorProfileFingerprint,
    technicalCatalogVersion: technicalCatalog.version,
    technicalCatalogFingerprint,
    sourceWorkOrderKey: revision.order.project.key,
    sourceOrderRevision,
    sourceCalculatorRevision,
    orderContentHash: approvalAudit.contentHash,
    inputHash,
    outputHash,
    materializationKey,
    reviewNote: input.reviewNote,
    createdByRole: actorRole,
    requirements: {
      create: requirements.map((requirement) => ({
        sourceKind: requirement.sourceKind,
        sourceRecordId: requirement.sourceId,
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
        lineHash: canonicalHash(requirement),
      })),
    },
  };

  try {
    const snapshot = await prisma.componentSnapshot.create({ data: createData, include: snapshotInclude });
    return { created: true, snapshot };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const replay = await prisma.componentSnapshot.findUnique({
      where: { orderRevisionId_calculatorProfileVersion: { orderRevisionId, calculatorProfileVersion: profile.version } },
      include: snapshotInclude,
    });
    if (replay?.inputHash === inputHash && replay.outputHash === outputHash) return { created: false, snapshot: replay };
    throw new ComponentSnapshotError(
      "component_snapshot_profile_conflict",
      409,
      replay ? { snapshotId: replay.id } : undefined,
    );
  }
}

export function listComponentSnapshots(orderRevisionId: string) {
  return prisma.componentSnapshot.findMany({
    where: { orderRevisionId },
    orderBy: { createdAt: "asc" },
    include: snapshotInclude,
  });
}

function persistedRequirementHashPayload(requirement: Prisma.ComponentRequirementGetPayload<Record<string, never>>) {
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

export async function reviewComponentSnapshot(
  orderRevisionId: string,
  snapshotId: string,
  decision: { state: "VERIFIED" | "REJECTED"; resolution: string },
  actorRole: string,
) {
  const snapshot = await prisma.componentSnapshot.findFirst({
    where: { id: snapshotId, orderRevisionId },
    include: snapshotInclude,
  });
  if (!snapshot) throw new ComponentSnapshotError("component_snapshot_not_found", 404);
  if (snapshot.state !== "REVIEW") {
    throw new ComponentSnapshotError("component_snapshot_review_final", 409, { state: snapshot.state });
  }
  if (decision.state === "VERIFIED") {
    const { approvalAudit } = await loadApprovedLatestRevision(orderRevisionId);
    const requirements = snapshot.requirements
      .map(persistedRequirementHashPayload)
      .sort((left, right) => left.sourceComponentKey.localeCompare(right.sourceComponentKey));
    const lineHashesMatch = snapshot.requirements.every((requirement) =>
      requirement.lineHash === canonicalHash(persistedRequirementHashPayload(requirement)),
    );
    const expectedInputHash = canonicalHash({
      snapshotSchemaVersion: snapshot.snapshotSchemaVersion,
      orderRevisionId,
      orderContentHash: snapshot.orderContentHash,
      calculatorProfileVersion: snapshot.calculatorProfileVersion,
      calculatorProfileFingerprint: snapshot.calculatorProfileFingerprint,
      technicalCatalogVersion: snapshot.technicalCatalogVersion,
      technicalCatalogFingerprint: snapshot.technicalCatalogFingerprint,
    });
    if (
      !lineHashesMatch
      || snapshot.outputHash !== canonicalHash(requirements)
      || snapshot.inputHash !== expectedInputHash
      || snapshot.approvalAuditId !== approvalAudit.id
      || snapshot.orderContentHash !== approvalAudit.contentHash
      || snapshot.materializationKey !== canonicalHash({ orderRevisionId, calculatorProfileVersion: snapshot.calculatorProfileVersion })
      || snapshot.sourceCalculatorRevision !== `${snapshot.calculatorProfileVersion}:${snapshot.outputHash}`
    ) {
      throw new ComponentSnapshotError("component_snapshot_content_changed", 409);
    }
  }
  const claimed = await prisma.componentSnapshot.updateMany({
    where: { id: snapshot.id, state: "REVIEW" },
    data: {
      state: decision.state,
      reviewResolution: decision.resolution,
      reviewedByRole: actorRole,
      reviewedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    const current = await prisma.componentSnapshot.findUnique({ where: { id: snapshot.id }, select: { state: true } });
    throw new ComponentSnapshotError("component_snapshot_review_final", 409, { state: current?.state });
  }
  return prisma.componentSnapshot.findUniqueOrThrow({ where: { id: snapshot.id }, include: snapshotInclude });
}
