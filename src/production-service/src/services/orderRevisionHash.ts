import { createHash } from "node:crypto";

export const CURRENT_ORDER_CONTENT_HASH_SCHEMA_VERSION = 3;
export type OrderContentHashSchemaVersion = 1 | 2 | 3;

function supplementaryEvidenceForV2Hash(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const {
    id: _id,
    supplementaryItemId: _supplementaryItemId,
    createdAt: _createdAt,
    ...auditedEvidence
  } = value as Record<string, unknown>;
  return auditedEvidence;
}

function manufacturedEvidenceForV2Hash(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const {
    id: _id,
    manufacturedItemId: _manufacturedItemId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...auditedEvidence
  } = value as Record<string, unknown>;
  return auditedEvidence;
}

function documentReferenceForV3Hash(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const {
    id: _id,
    orderRevisionId: _orderRevisionId,
    createdAt: _createdAt,
    positionEvidence: _positionEvidence,
    manufacturedItemEvidence: _manufacturedItemEvidence,
    supplementaryItemEvidence: _supplementaryItemEvidence,
    positionLinks: _positionLinks,
    releaseReferences: _releaseReferences,
    nextVersion: _nextVersion,
    supersedesDocument: _supersedesDocument,
    ...document
  } = value as Record<string, unknown>;
  return document;
}

function positionEvidenceForV3Hash(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const {
    id: _id,
    orderPositionId: _orderPositionId,
    orderDocumentId: _orderDocumentId,
    orderDocument,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...evidence
  } = value as Record<string, unknown>;
  return {
    ...evidence,
    orderDocument: orderDocument
      ? documentReferenceForV3Hash(orderDocument)
      : null,
  };
}

function documentPositionLinkForV3Hash(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { orderDocument, document, ...link } = value as Record<string, unknown>;
  return documentReferenceForV3Hash(orderDocument ?? document ?? link);
}

function positionForHash(value: Record<string, unknown>, schemaVersion: OrderContentHashSchemaVersion) {
  const {
    id: _id,
    orderRevisionId: _orderRevisionId,
    evidence,
    documentLinks,
    ...position
  } = value;
  if (schemaVersion !== 3) return position;
  return {
    ...position,
    evidence: Array.isArray(evidence)
      ? evidence.map(positionEvidenceForV3Hash)
      : evidence,
    documentLinks: Array.isArray(documentLinks)
      ? documentLinks.map(documentPositionLinkForV3Hash)
      : documentLinks,
  };
}

/** Canonical approval payload shared by review, approval and every downstream
 * materialization gate. Database identity/timestamp fields are excluded. */
export function revisionContentHash(revision: {
  revision: number; customerName: string; customerAddress: string | null; contactName: string | null;
  contactPhone: string | null; contactEmail: string | null; deliveryAddress: string | null;
  expectedDelivery: Date | null; plannedStart: Date | null; priority: number; notes: string;
  intakeStage: string; positions: Array<Record<string, unknown>>; documents: Array<Record<string, unknown>>;
  manufacturedItems: Array<Record<string, unknown>>;
  supplementaryItems: Array<Record<string, unknown>>;
}, schemaVersion: OrderContentHashSchemaVersion = CURRENT_ORDER_CONTENT_HASH_SCHEMA_VERSION) {
  const baseSnapshot = {
    revision: revision.revision, customerName: revision.customerName, customerAddress: revision.customerAddress,
    contactName: revision.contactName, contactPhone: revision.contactPhone, contactEmail: revision.contactEmail,
    deliveryAddress: revision.deliveryAddress, expectedDelivery: revision.expectedDelivery?.toISOString() ?? null,
    plannedStart: revision.plannedStart?.toISOString() ?? null, priority: revision.priority, notes: revision.notes,
    intakeStage: revision.intakeStage,
    positions: revision.positions.map((position) => positionForHash(position, schemaVersion)),
    documents: revision.documents.map(({ id: _id, orderRevisionId: _orderRevisionId, createdAt: _createdAt, ...document }) => document),
    manufacturedItems: revision.manufacturedItems.map(({
      id: _id,
      orderRevisionId: _orderRevisionId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      reviewedAt: _reviewedAt,
      evidence,
      ...item
    }) => schemaVersion === 1
      // Historical v1 review/approval queries did not load this relation.
      // Omitting it is required to verify already-issued hashes exactly.
      ? item
      : {
        ...item,
        evidence: Array.isArray(evidence)
          ? evidence.map(manufacturedEvidenceForV2Hash)
          : evidence,
      }),
  };
  const snapshot = schemaVersion === 1
    // The deployed legacy envelope predates supplementary items entirely.
    // Even an empty key would change every historical v1 digest.
    ? baseSnapshot
    : {
      contentHashSchemaVersion: schemaVersion,
      ...baseSnapshot,
      supplementaryItems: revision.supplementaryItems.map(({
        id: _id,
        orderRevisionId: _orderRevisionId,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        reviewedAt: _reviewedAt,
        evidence,
        ...item
      }) => ({
        ...item,
        evidence: Array.isArray(evidence)
          ? evidence.map(supplementaryEvidenceForV2Hash)
          : evidence,
      })),
    };
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
