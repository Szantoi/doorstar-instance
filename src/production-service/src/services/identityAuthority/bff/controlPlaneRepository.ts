import type { Prisma, PrismaClient } from "@prisma/client";
import {
  IDENTITY_AUTHORITY_SCHEMA_VERSION,
  isAllowedCanonicalTenantId,
  parseCanonicalUtcInstant,
  type CanonicalUtcInstant,
} from "../contract.js";
import { isCanonicalIdentityAuthorityGrantSequence } from "../evidencePolicy.js";
import { readExactOwnDataFields, snapshotCanonicalStringArray, snapshotCanonicalUtcInstant } from "../safeSnapshot.js";
import { selectDoorstarSessionExpiry } from "./session.js";
import { consumeDoorstarTrustedIdentityAuthorityIssuanceCommit } from "../evidence.js";
import type { DoorstarInstanceTenantBindingSnapshot } from "../controlPlane.js";
import type {
  DoorstarCapability,
  DoorstarIdentityAuthorityControlPlaneRepository,
  DoorstarIdentityAuthorityControlPlaneRepositoryFactory,
  DoorstarTrustedIdentityAuthorityIssuanceCommit,
  DoorstarTrustedIdentityAuthorityIssuanceCommitConsumer,
  DoorstarTrustedIdentityAuthorityIssuanceSnapshot,
} from "../evidence.js";

const BINDING_SELECT: Record<string, true> = Object.freeze({
  id: true,
  tenantId: true,
  status: true,
  bindingVersion: true,
  disabledAt: true,
  disabledReason: true,
});
const CREATED_EVIDENCE_SELECT: Record<string, true> = Object.freeze({ id: true, tenantBindingId: true });
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CANONICAL_OPAQUE_SELECTOR = /^[A-Za-z0-9_-]{43}$/u;
const DOORSTAR_CAPABILITIES = Object.freeze(["view", "edit", "admin"] as const);
const MAXIMUM_SESSION_LIFETIME_SECONDS = 3_600;

/**
 * Narrow structural view of exactly the generated delegates needed for M1B
 * issuance. No global Prisma client is imported or constructed here.
 */
export interface DoorstarIdentityAuthorityControlPlanePrisma {
  readonly doorstarInstanceTenantBinding: {
    findFirst(input: { readonly select: Record<string, true> }): Promise<unknown>;
  };
  $transaction<T>(
    operation: (transaction: DoorstarIdentityAuthorityControlPlaneTransactionPrisma) => Promise<T>,
  ): Promise<T>;
}

/** The interactive transaction never receives an arbitrary query surface. */
export interface DoorstarIdentityAuthorityControlPlaneTransactionPrisma {
  readonly identityAuthorityEvidence: {
    create(input: {
      readonly data: DoorstarIdentityAuthorityEvidenceCreateData;
      readonly select: Record<string, true>;
    }): Promise<unknown>;
  };
  readonly doorstarSession: {
    create(input: { readonly data: DoorstarSessionCreateData }): Promise<unknown>;
  };
}

interface DoorstarIdentityAuthorityEvidenceCreateData {
  readonly id: string;
  readonly tenantBindingId: string;
  readonly tenantId: string;
  readonly bindingVersion: bigint;
  readonly subject: string;
  readonly schemaVersion: typeof IDENTITY_AUTHORITY_SCHEMA_VERSION;
  readonly membershipVersion: bigint;
  readonly projectionVersion: bigint;
  readonly enabledModules: Prisma.InputJsonValue;
  readonly permissions: Prisma.InputJsonValue;
  readonly acceptTokensIssuedAtOrAfterWire: string;
  readonly acceptTokensIssuedAtOrAfterEpochSeconds: bigint;
  readonly acceptTokensIssuedAtOrAfterNanoseconds: number;
  readonly tokenIssuedAtWire: string;
  readonly tokenIssuedAtEpochSeconds: bigint;
  readonly tokenIssuedAtNanoseconds: number;
  readonly tokenExpiresAtWire: string;
  readonly tokenExpiresAtEpochSeconds: bigint;
  readonly tokenExpiresAtNanoseconds: number;
  readonly stateMacKeyVersion: number;
  readonly stateMac: Prisma.Bytes;
  readonly correlationId: string;
}

interface DoorstarSessionCreateData {
  readonly sessionSelector: string;
  readonly verifierMacKeyVersion: number;
  readonly verifierMac: Prisma.Bytes;
  readonly csrfMacKeyVersion: number;
  readonly csrfMac: Prisma.Bytes;
  readonly stateMacKeyVersion: number;
  readonly stateMac: Prisma.Bytes;
  readonly tenantBindingId: string;
  readonly evidenceId: string;
  readonly subject: string;
  readonly capability: DoorstarCapability;
  readonly bindingVersion: bigint;
  readonly issuedAtWire: string;
  readonly issuedAtEpochSeconds: bigint;
  readonly issuedAtNanoseconds: number;
  readonly expiresAtWire: string;
  readonly expiresAtEpochSeconds: bigint;
  readonly expiresAtNanoseconds: number;
}

const BINDING_ROW_FIELDS = Object.freeze([
  "id",
  "tenantId",
  "status",
  "bindingVersion",
  "disabledAt",
  "disabledReason",
] as const);

type Assert<T extends true> = T;
type GeneratedPrismaClientIsCompatible = Assert<
  PrismaClient extends DoorstarIdentityAuthorityControlPlanePrisma ? true : false
>;
type GeneratedPrismaTransactionClientIsCompatible = Assert<
  Prisma.TransactionClient extends DoorstarIdentityAuthorityControlPlaneTransactionPrisma ? true : false
>;

/**
 * Builds an adapter factory, not a generic write API. The evidence boundary
 * supplies its per-boundary opaque commit consumer only when it constructs the
 * repository; callers cannot manufacture a persistence DTO.
 */
export function createDoorstarIdentityAuthorityControlPlaneRepositoryFactory(
  prisma: DoorstarIdentityAuthorityControlPlanePrisma,
): DoorstarIdentityAuthorityControlPlaneRepositoryFactory {
  return Object.freeze({
    create(commitConsumer: DoorstarTrustedIdentityAuthorityIssuanceCommitConsumer): DoorstarIdentityAuthorityControlPlaneRepository {
      return Object.freeze({
        async loadIdentityAuthorityBinding(): Promise<DoorstarInstanceTenantBindingSnapshot | null> {
          const row = await prisma.doorstarInstanceTenantBinding.findFirst({ select: BINDING_SELECT });
          if (row === null) return null;
          const binding = snapshotBindingRow(row);
          if (binding === undefined) throw new Error("doorstar_identity_binding_row_invalid");
          return binding;
        },

        async persistAcceptedEvidenceAndSession(
          commit: DoorstarTrustedIdentityAuthorityIssuanceCommit,
        ): Promise<"persisted" | "not_persisted"> {
          let persisted = false;
          const consumed = await consumeDoorstarTrustedIdentityAuthorityIssuanceCommit(commitConsumer, commit, async (candidate) => {
            const snapshot = snapshotIssuanceSnapshot(candidate);
            if (snapshot === undefined) throw new Error("doorstar_identity_issuance_commit_invalid");
            await prisma.$transaction(async (transaction) => {
              const evidence = await transaction.identityAuthorityEvidence.create({
                data: toEvidenceCreateData(snapshot),
                select: CREATED_EVIDENCE_SELECT,
              });
              const reference = snapshotCreatedEvidenceReference(evidence);
              if (reference === undefined
                || reference.id !== snapshot.evidence.id
                || reference.tenantBindingId !== snapshot.evidence.tenantBindingId) {
                throw new Error("doorstar_identity_evidence_insert_invalid");
              }
              await transaction.doorstarSession.create({
                data: toSessionCreateData(snapshot, reference.id),
              });
            });
            persisted = true;
          });
          return consumed && persisted ? "persisted" : "not_persisted";
        },
      });
    },
  });
}

function snapshotBindingRow(value: unknown): DoorstarInstanceTenantBindingSnapshot | undefined {
  const fields = readExactOwnDataFields(value, BINDING_ROW_FIELDS);
  if (fields === undefined) return undefined;
  const id = fields.get("id");
  const tenantId = fields.get("tenantId");
  const status = fields.get("status");
  const bindingVersion = fields.get("bindingVersion");
  const disabledAt = fields.get("disabledAt");
  const disabledReason = fields.get("disabledReason");
  const disabledInstant = disabledAt === null ? null : snapshotDatabaseInstant(disabledAt);
  if (!isCanonicalBindingId(id)
    || typeof tenantId !== "string"
    || !isAllowedCanonicalTenantId(tenantId)
    || (status !== "ACTIVE" && status !== "DISABLED")
    || !isPositiveBigInt(bindingVersion)
    || disabledInstant === undefined
    || (disabledReason !== null && typeof disabledReason !== "string")) {
    return undefined;
  }
  if (status === "ACTIVE" && (disabledInstant !== null || disabledReason !== null)) return undefined;
  if (status === "DISABLED" && (disabledInstant === null || !isCanonicalDisableReason(disabledReason))) return undefined;
  return Object.freeze({ id, tenantId, status, bindingVersion, disabledAt: disabledInstant, disabledReason });
}

function snapshotDatabaseInstant(value: unknown): CanonicalUtcInstant | undefined {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return undefined;
  try {
    return Object.freeze(parseCanonicalUtcInstant(value.toISOString()));
  } catch {
    return undefined;
  }
}

function snapshotIssuanceSnapshot(value: unknown): DoorstarTrustedIdentityAuthorityIssuanceSnapshot | undefined {
  const root = readExactOwnDataFields(value, ["evidence", "session"]);
  if (root === undefined) return undefined;
  const evidence = snapshotEvidence(root.get("evidence"));
  const session = snapshotSession(root.get("session"), evidence);
  return evidence === undefined || session === undefined ? undefined : Object.freeze({ evidence, session });
}

function snapshotEvidence(
  value: unknown,
): DoorstarTrustedIdentityAuthorityIssuanceSnapshot["evidence"] | undefined {
  const fields = readExactOwnDataFields(value, [
    "id",
    "tenantBindingId",
    "tenantId",
    "bindingVersion",
    "subject",
    "schemaVersion",
    "membershipVersion",
    "projectionVersion",
    "enabledModules",
    "permissions",
    "acceptTokensIssuedAtOrAfter",
    "tokenIssuedAt",
    "tokenExpiresAt",
    "stateMacKeyVersion",
    "stateMac",
    "correlationId",
    "capability",
  ]);
  if (fields === undefined) return undefined;
  const id = fields.get("id");
  const tenantBindingId = fields.get("tenantBindingId");
  const tenantId = fields.get("tenantId");
  const bindingVersion = fields.get("bindingVersion");
  const subject = fields.get("subject");
  const schemaVersion = fields.get("schemaVersion");
  const membershipVersion = fields.get("membershipVersion");
  const projectionVersion = fields.get("projectionVersion");
  const enabledModules = snapshotCanonicalStringArray(fields.get("enabledModules"), 10);
  const permissions = snapshotCanonicalStringArray(fields.get("permissions"), 10);
  const acceptTokensIssuedAtOrAfter = snapshotCanonicalUtcInstant(fields.get("acceptTokensIssuedAtOrAfter"));
  const tokenIssuedAt = snapshotCanonicalUtcInstant(fields.get("tokenIssuedAt"));
  const tokenExpiresAt = snapshotCanonicalUtcInstant(fields.get("tokenExpiresAt"));
  const stateMacKeyVersion = fields.get("stateMacKeyVersion");
  const stateMac = snapshotMac(fields.get("stateMac"));
  const correlationId = fields.get("correlationId");
  const capability = fields.get("capability");
  if (!isCanonicalUuid(id)
    || !isCanonicalBindingId(tenantBindingId)
    || typeof tenantId !== "string"
    || !isAllowedCanonicalTenantId(tenantId)
    || !isPositiveBigInt(bindingVersion)
    || !isCanonicalSubject(subject)
    || schemaVersion !== IDENTITY_AUTHORITY_SCHEMA_VERSION
    || !isPositiveBigInt(membershipVersion)
    || !isPositiveBigInt(projectionVersion)
    || enabledModules === undefined
    || permissions === undefined
    || !isCanonicalIdentityAuthorityGrantSequence(enabledModules, permissions)
    || acceptTokensIssuedAtOrAfter === undefined
    || tokenIssuedAt === undefined
    || tokenExpiresAt === undefined
    || compareInstant(tokenIssuedAt, acceptTokensIssuedAtOrAfter) < 0
    || compareInstant(tokenExpiresAt, tokenIssuedAt) <= 0
    || !isMacKeyVersion(stateMacKeyVersion)
    || stateMac === undefined
    || !isCanonicalUuid(correlationId)
    || !isDoorstarCapability(capability)
    || deriveCapability(enabledModules, permissions) !== capability) {
    return undefined;
  }
  return Object.freeze({
    id,
    tenantBindingId,
    tenantId,
    bindingVersion,
    subject,
    schemaVersion,
    membershipVersion,
    projectionVersion,
    enabledModules,
    permissions,
    acceptTokensIssuedAtOrAfter,
    tokenIssuedAt,
    tokenExpiresAt,
    stateMacKeyVersion,
    stateMac,
    correlationId,
    capability,
  });
}

function snapshotSession(
  value: unknown,
  evidence: DoorstarTrustedIdentityAuthorityIssuanceSnapshot["evidence"] | undefined,
): DoorstarTrustedIdentityAuthorityIssuanceSnapshot["session"] | undefined {
  if (evidence === undefined) return undefined;
  const fields = readExactOwnDataFields(value, [
    "selector",
    "verifierMacKeyVersion",
    "verifierMac",
    "csrfMacKeyVersion",
    "csrfMac",
    "stateMacKeyVersion",
    "stateMac",
    "issuedAt",
    "expiresAt",
    "idTokenExpiresAt",
    "maximumLifetimeSeconds",
  ]);
  if (fields === undefined) return undefined;
  const selector = fields.get("selector");
  const verifierMacKeyVersion = fields.get("verifierMacKeyVersion");
  const verifierMac = snapshotMac(fields.get("verifierMac"));
  const csrfMacKeyVersion = fields.get("csrfMacKeyVersion");
  const csrfMac = snapshotMac(fields.get("csrfMac"));
  const stateMacKeyVersion = fields.get("stateMacKeyVersion");
  const stateMac = snapshotMac(fields.get("stateMac"));
  const issuedAt = snapshotCanonicalUtcInstant(fields.get("issuedAt"));
  const expiresAt = snapshotCanonicalUtcInstant(fields.get("expiresAt"));
  const idTokenExpiresAt = snapshotCanonicalUtcInstant(fields.get("idTokenExpiresAt"));
  const maximumLifetimeSeconds = fields.get("maximumLifetimeSeconds");
  if (!isCanonicalSelector(selector)
    || !isMacKeyVersion(verifierMacKeyVersion)
    || verifierMac === undefined
    || !isMacKeyVersion(csrfMacKeyVersion)
    || csrfMac === undefined
    || !isMacKeyVersion(stateMacKeyVersion)
    || stateMac === undefined
    || issuedAt === undefined
    || expiresAt === undefined
    || idTokenExpiresAt === undefined
    || !isMaximumSessionLifetime(maximumLifetimeSeconds)
    || compareInstant(issuedAt, evidence.tokenIssuedAt) < 0) {
    return undefined;
  }
  const expectedExpiry = selectDoorstarSessionExpiry({
    now: issuedAt,
    humanAccessTokenExpiresAt: evidence.tokenExpiresAt,
    humanIdTokenExpiresAt: idTokenExpiresAt,
    maximumLifetimeSeconds,
  });
  if (expectedExpiry.kind !== "accepted" || !sameInstant(expectedExpiry.expiresAt, expiresAt)) return undefined;
  return Object.freeze({
    selector,
    verifierMacKeyVersion,
    verifierMac,
    csrfMacKeyVersion,
    csrfMac,
    stateMacKeyVersion,
    stateMac,
    issuedAt,
    expiresAt,
    idTokenExpiresAt,
    maximumLifetimeSeconds,
  });
}

function toEvidenceCreateData(snapshot: DoorstarTrustedIdentityAuthorityIssuanceSnapshot): DoorstarIdentityAuthorityEvidenceCreateData {
  const evidence = snapshot.evidence;
  return Object.freeze({
    id: evidence.id,
    tenantBindingId: evidence.tenantBindingId,
    tenantId: evidence.tenantId,
    bindingVersion: evidence.bindingVersion,
    subject: evidence.subject,
    schemaVersion: evidence.schemaVersion,
    membershipVersion: evidence.membershipVersion,
    projectionVersion: evidence.projectionVersion,
    enabledModules: [...evidence.enabledModules],
    permissions: [...evidence.permissions],
    acceptTokensIssuedAtOrAfterWire: evidence.acceptTokensIssuedAtOrAfter.wireValue,
    acceptTokensIssuedAtOrAfterEpochSeconds: BigInt(evidence.acceptTokensIssuedAtOrAfter.epochSeconds),
    acceptTokensIssuedAtOrAfterNanoseconds: evidence.acceptTokensIssuedAtOrAfter.nanoseconds,
    tokenIssuedAtWire: evidence.tokenIssuedAt.wireValue,
    tokenIssuedAtEpochSeconds: BigInt(evidence.tokenIssuedAt.epochSeconds),
    tokenIssuedAtNanoseconds: evidence.tokenIssuedAt.nanoseconds,
    tokenExpiresAtWire: evidence.tokenExpiresAt.wireValue,
    tokenExpiresAtEpochSeconds: BigInt(evidence.tokenExpiresAt.epochSeconds),
    tokenExpiresAtNanoseconds: evidence.tokenExpiresAt.nanoseconds,
    stateMacKeyVersion: evidence.stateMacKeyVersion,
    stateMac: Buffer.from(evidence.stateMac),
    correlationId: evidence.correlationId,
  });
}

function toSessionCreateData(
  snapshot: DoorstarTrustedIdentityAuthorityIssuanceSnapshot,
  evidenceId: string,
): DoorstarSessionCreateData {
  const { evidence, session } = snapshot;
  return Object.freeze({
    sessionSelector: session.selector,
    verifierMacKeyVersion: session.verifierMacKeyVersion,
    verifierMac: Buffer.from(session.verifierMac),
    csrfMacKeyVersion: session.csrfMacKeyVersion,
    csrfMac: Buffer.from(session.csrfMac),
    stateMacKeyVersion: session.stateMacKeyVersion,
    stateMac: Buffer.from(session.stateMac),
    tenantBindingId: evidence.tenantBindingId,
    evidenceId,
    subject: evidence.subject,
    capability: evidence.capability,
    bindingVersion: evidence.bindingVersion,
    issuedAtWire: session.issuedAt.wireValue,
    issuedAtEpochSeconds: BigInt(session.issuedAt.epochSeconds),
    issuedAtNanoseconds: session.issuedAt.nanoseconds,
    expiresAtWire: session.expiresAt.wireValue,
    expiresAtEpochSeconds: BigInt(session.expiresAt.epochSeconds),
    expiresAtNanoseconds: session.expiresAt.nanoseconds,
  });
}

function snapshotCreatedEvidenceReference(value: unknown): { readonly id: string; readonly tenantBindingId: string } | undefined {
  const fields = readExactOwnDataFields(value, ["id", "tenantBindingId"]);
  const id = fields?.get("id");
  const tenantBindingId = fields?.get("tenantBindingId");
  return isCanonicalUuid(id) && isCanonicalBindingId(tenantBindingId)
    ? Object.freeze({ id, tenantBindingId })
    : undefined;
}

function isCanonicalBindingId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 128 && !/[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}

function isCanonicalDisableReason(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 256 && value.trim() === value;
}

function isCanonicalSubject(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 256 && !/[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID.test(value) && value !== "00000000-0000-0000-0000-000000000000";
}

function isCanonicalSelector(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_OPAQUE_SELECTOR.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === 32 && decoded.toString("base64url") === value;
}

function isPositiveBigInt(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 1n;
}

function isMacKeyVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647;
}

function isMaximumSessionLifetime(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= MAXIMUM_SESSION_LIFETIME_SECONDS;
}

function snapshotMac(value: unknown): Uint8Array | undefined {
  return value instanceof Uint8Array && value.byteLength === 32 ? Buffer.from(value) : undefined;
}

function isDoorstarCapability(value: unknown): value is DoorstarCapability {
  return typeof value === "string" && (DOORSTAR_CAPABILITIES as readonly string[]).includes(value);
}

function deriveCapability(enabledModules: readonly string[], permissions: readonly string[]): DoorstarCapability | undefined {
  const index = enabledModules.indexOf("joinerytech.door");
  if (index < 0 || enabledModules.lastIndexOf("joinerytech.door") !== index) return undefined;
  const permission = permissions[index];
  if (permission === undefined) return undefined;
  const capability = permission.slice("joinerytech.door.".length);
  return isDoorstarCapability(capability) && permission === "joinerytech.door." + capability ? capability : undefined;
}

function compareInstant(left: CanonicalUtcInstant, right: CanonicalUtcInstant): -1 | 0 | 1 {
  if (left.epochSeconds !== right.epochSeconds) return left.epochSeconds < right.epochSeconds ? -1 : 1;
  return left.nanoseconds === right.nanoseconds ? 0 : left.nanoseconds < right.nanoseconds ? -1 : 1;
}

function sameInstant(left: CanonicalUtcInstant, right: CanonicalUtcInstant): boolean {
  return left.wireValue === right.wireValue
    && left.epochSeconds === right.epochSeconds
    && left.nanoseconds === right.nanoseconds;
}
