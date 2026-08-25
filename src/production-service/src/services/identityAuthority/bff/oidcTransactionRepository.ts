import {
  compareCanonicalUtcInstants,
  parseCanonicalUtcInstant,
  type CanonicalUtcInstant,
} from "../contract.js";
import type { Prisma, PrismaClient } from "@prisma/client";
import { readExactOwnDataFields, snapshotCanonicalUtcInstant } from "../safeSnapshot.js";
import type { DoorstarOidcLoginTransaction, DoorstarOidcTransactionRepository } from "./pkceTransaction.js";

const TRANSACTION_FIELDS = Object.freeze([
  "selector",
  "keyVersion",
  "stateMacKeyVersion",
  "stateMac",
  "issuer",
  "clientId",
  "redirectUri",
  "profileDigest",
  "issuedAt",
  "expiresAt",
] as const);
const STORED_TRANSACTION_FIELDS = Object.freeze([
  "selector",
  "keyVersion",
  "stateMacKeyVersion",
  "stateMac",
  "issuer",
  "clientId",
  "redirectUri",
  "profileDigest",
  "issuedAtWire",
  "issuedAtEpochSeconds",
  "issuedAtNanoseconds",
  "expiresAtWire",
  "expiresAtEpochSeconds",
  "expiresAtNanoseconds",
] as const);
const CLAIM_FIELDS = Object.freeze([
  "selector",
  "stateMacKeyVersion",
  "stateMac",
  "profileDigest",
  "now",
] as const);
const CANONICAL_OPAQUE_SECRET = /^[A-Za-z0-9_-]{43}$/u;
const CANONICAL_CLIENT_ID = /^[A-Za-z0-9._-]{1,128}$/u;
const MAXIMUM_TRANSACTION_LIFETIME_SECONDS = 600;
const CONSUMPTION_TRANSITION_SENTINEL = new Date(0);

/**
 * Narrow structural view of the generated Prisma delegate. The later BFF
 * composition owns the real Prisma client; this source-only adapter neither
 * creates one nor exposes a generic query surface.
 */
export interface DoorstarOidcTransactionPrisma {
  readonly doorstarOidcLoginTransaction: {
    create(input: { readonly data: DoorstarOidcTransactionCreateData }): Promise<unknown>;
    findFirst(input: {
      readonly where: { readonly selector: string; readonly consumedAt: null };
      readonly select: Record<string, true>;
    }): Promise<unknown>;
    updateMany(input: {
      readonly where: DoorstarOidcTransactionClaimWhere;
      readonly data: { readonly consumedAt: Date };
    }): Promise<unknown>;
  };
}

/** The one concrete repository adapter for the PKCE start/find/CAS port. */
export function createDoorstarOidcTransactionRepository(
  prisma: DoorstarOidcTransactionPrisma,
): DoorstarOidcTransactionRepository {
  return Object.freeze({
    async begin(value: DoorstarOidcLoginTransaction): Promise<"started" | "not_started"> {
      const transaction = snapshotTransaction(value);
      if (transaction === undefined) return "not_started";
      try {
        await prisma.doorstarOidcLoginTransaction.create({ data: toCreateData(transaction) });
        return "started";
      } catch (error) {
        if (isUniqueConstraintError(error)) return "not_started";
        throw error;
      }
    },

    async findUnconsumedBySelector(selector: string): Promise<DoorstarOidcLoginTransaction | undefined> {
      if (!isCanonicalOpaqueSecret(selector)) return undefined;
      const row = await prisma.doorstarOidcLoginTransaction.findFirst({
        where: Object.freeze({ selector, consumedAt: null }),
        select: SELECT_UNCONSUMED_TRANSACTION,
      });
      return snapshotStoredTransaction(row);
    },

    async claimMatching(value: Parameters<DoorstarOidcTransactionRepository["claimMatching"]>[0]): Promise<"claimed" | "not_claimed"> {
      const claim = snapshotClaim(value);
      if (claim === undefined) return "not_claimed";
      const result = await prisma.doorstarOidcLoginTransaction.updateMany({
        where: toClaimWhere(claim),
        // The trigger overwrites this sentinel with database-owned time. It is
        // merely the required non-null lifecycle transition request.
        data: Object.freeze({ consumedAt: CONSUMPTION_TRANSITION_SENTINEL }),
      });
      return snapshotUpdateCount(result) === 1 ? "claimed" : "not_claimed";
    },
  });
}

interface DoorstarOidcTransactionCreateData {
  readonly selector: string;
  readonly keyVersion: number;
  readonly stateMacKeyVersion: number;
  readonly stateMac: Prisma.Bytes;
  readonly issuer: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly profileDigest: string;
  readonly issuedAtWire: string;
  readonly issuedAtEpochSeconds: bigint;
  readonly issuedAtNanoseconds: number;
  readonly expiresAtWire: string;
  readonly expiresAtEpochSeconds: bigint;
  readonly expiresAtNanoseconds: number;
}

interface DoorstarOidcTransactionClaimWhere {
  readonly selector: string;
  readonly stateMacKeyVersion: number;
  readonly stateMac: Prisma.Bytes;
  readonly profileDigest: string;
  readonly consumedAt: null;
  readonly OR: [
    { readonly expiresAtEpochSeconds: { readonly gt: bigint } },
    {
      readonly expiresAtEpochSeconds: bigint;
      readonly expiresAtNanoseconds: { readonly gt: number };
    },
  ];
}

const SELECT_UNCONSUMED_TRANSACTION: Record<string, true> = Object.freeze({
  selector: true,
  keyVersion: true,
  stateMacKeyVersion: true,
  stateMac: true,
  issuer: true,
  clientId: true,
  redirectUri: true,
  profileDigest: true,
  issuedAtWire: true,
  issuedAtEpochSeconds: true,
  issuedAtNanoseconds: true,
  expiresAtWire: true,
  expiresAtEpochSeconds: true,
  expiresAtNanoseconds: true,
});

type Assert<T extends true> = T;
type GeneratedPrismaClientIsCompatible = Assert<
  PrismaClient extends DoorstarOidcTransactionPrisma ? true : false
>;
type GeneratedPrismaTransactionClientIsCompatible = Assert<
  Prisma.TransactionClient extends DoorstarOidcTransactionPrisma ? true : false
>;

function toCreateData(transaction: DoorstarOidcLoginTransaction): DoorstarOidcTransactionCreateData {
  return Object.freeze({
    selector: transaction.selector,
    keyVersion: transaction.keyVersion,
    stateMacKeyVersion: transaction.stateMacKeyVersion,
    stateMac: toPrismaBytes(transaction.stateMac),
    issuer: transaction.issuer,
    clientId: transaction.clientId,
    redirectUri: transaction.redirectUri,
    profileDigest: transaction.profileDigest,
    issuedAtWire: transaction.issuedAt.wireValue,
    issuedAtEpochSeconds: BigInt(transaction.issuedAt.epochSeconds),
    issuedAtNanoseconds: transaction.issuedAt.nanoseconds,
    expiresAtWire: transaction.expiresAt.wireValue,
    expiresAtEpochSeconds: BigInt(transaction.expiresAt.epochSeconds),
    expiresAtNanoseconds: transaction.expiresAt.nanoseconds,
  });
}

function toClaimWhere(claim: DoorstarOidcTransactionClaim): DoorstarOidcTransactionClaimWhere {
  const nowSeconds = BigInt(claim.now.epochSeconds);
  const expiryAfterNow: DoorstarOidcTransactionClaimWhere["OR"] = [
    Object.freeze({ expiresAtEpochSeconds: Object.freeze({ gt: nowSeconds }) }),
    Object.freeze({
      expiresAtEpochSeconds: nowSeconds,
      expiresAtNanoseconds: Object.freeze({ gt: claim.now.nanoseconds }),
    }),
  ];
  Object.freeze(expiryAfterNow);
  return Object.freeze({
    selector: claim.selector,
    stateMacKeyVersion: claim.stateMacKeyVersion,
    stateMac: toPrismaBytes(claim.stateMac),
    profileDigest: claim.profileDigest,
    consumedAt: null,
    OR: expiryAfterNow,
  });
}

function snapshotTransaction(value: unknown): DoorstarOidcLoginTransaction | undefined {
  const fields = readExactOwnDataFields(value, TRANSACTION_FIELDS);
  if (fields === undefined) return undefined;
  const selector = fields.get("selector");
  const keyVersion = fields.get("keyVersion");
  const stateMacKeyVersion = fields.get("stateMacKeyVersion");
  const stateMac = fields.get("stateMac");
  const issuer = fields.get("issuer");
  const clientId = fields.get("clientId");
  const redirectUri = fields.get("redirectUri");
  const profileDigest = fields.get("profileDigest");
  const issuedAt = snapshotCanonicalUtcInstant(fields.get("issuedAt"));
  const expiresAt = snapshotCanonicalUtcInstant(fields.get("expiresAt"));
  if (!isCanonicalOpaqueSecret(selector)
    || !isKeyVersion(keyVersion)
    || !isKeyVersion(stateMacKeyVersion)
    || !(stateMac instanceof Uint8Array)
    || stateMac.byteLength !== 32
    || typeof issuer !== "string"
    || typeof clientId !== "string"
    || typeof redirectUri !== "string"
    || !isCanonicalIssuer(issuer)
    || !CANONICAL_CLIENT_ID.test(clientId)
    || !isCanonicalCallbackUri(redirectUri)
    || !isCanonicalOpaqueSecret(profileDigest)
    || issuedAt === undefined
    || expiresAt === undefined
    || !isAllowedTransactionLifetime(issuedAt, expiresAt)) {
    return undefined;
  }
  return Object.freeze({
    selector,
    keyVersion,
    stateMacKeyVersion,
    stateMac: Buffer.from(stateMac),
    issuer,
    clientId,
    redirectUri,
    profileDigest,
    issuedAt: freezeInstant(issuedAt),
    expiresAt: freezeInstant(expiresAt),
  });
}

function snapshotStoredTransaction(value: unknown): DoorstarOidcLoginTransaction | undefined {
  const fields = readExactOwnDataFields(value, STORED_TRANSACTION_FIELDS);
  if (fields === undefined) return undefined;
  const issuedAt = snapshotStoredInstant(
    fields.get("issuedAtWire"),
    fields.get("issuedAtEpochSeconds"),
    fields.get("issuedAtNanoseconds"),
  );
  const expiresAt = snapshotStoredInstant(
    fields.get("expiresAtWire"),
    fields.get("expiresAtEpochSeconds"),
    fields.get("expiresAtNanoseconds"),
  );
  return snapshotTransaction(Object.freeze({
    selector: fields.get("selector"),
    keyVersion: fields.get("keyVersion"),
    stateMacKeyVersion: fields.get("stateMacKeyVersion"),
    stateMac: fields.get("stateMac"),
    issuer: fields.get("issuer"),
    clientId: fields.get("clientId"),
    redirectUri: fields.get("redirectUri"),
    profileDigest: fields.get("profileDigest"),
    issuedAt,
    expiresAt,
  }));
}

function snapshotStoredInstant(
  wireValue: unknown,
  epochSeconds: unknown,
  nanoseconds: unknown,
): CanonicalUtcInstant | undefined {
  if (typeof wireValue !== "string"
    || typeof epochSeconds !== "bigint"
    || typeof nanoseconds !== "number"
    || epochSeconds < BigInt(Number.MIN_SAFE_INTEGER)
    || epochSeconds > BigInt(Number.MAX_SAFE_INTEGER)
    || !Number.isSafeInteger(nanoseconds)) {
    return undefined;
  }
  try {
    const parsed = parseCanonicalUtcInstant(wireValue);
    return parsed.epochSeconds === Number(epochSeconds) && parsed.nanoseconds === nanoseconds
      ? freezeInstant(parsed)
      : undefined;
  } catch {
    return undefined;
  }
}

interface DoorstarOidcTransactionClaim {
  readonly selector: string;
  readonly stateMacKeyVersion: number;
  readonly stateMac: Uint8Array;
  readonly profileDigest: string;
  readonly now: CanonicalUtcInstant;
}

function snapshotClaim(value: unknown): DoorstarOidcTransactionClaim | undefined {
  const fields = readExactOwnDataFields(value, CLAIM_FIELDS);
  if (fields === undefined) return undefined;
  const selector = fields.get("selector");
  const stateMacKeyVersion = fields.get("stateMacKeyVersion");
  const stateMac = fields.get("stateMac");
  const profileDigest = fields.get("profileDigest");
  const now = snapshotCanonicalUtcInstant(fields.get("now"));
  if (!isCanonicalOpaqueSecret(selector)
    || !isKeyVersion(stateMacKeyVersion)
    || !(stateMac instanceof Uint8Array)
    || stateMac.byteLength !== 32
    || !isCanonicalOpaqueSecret(profileDigest)
    || now === undefined) {
    return undefined;
  }
  return Object.freeze({
    selector,
    stateMacKeyVersion,
    stateMac: Buffer.from(stateMac),
    profileDigest,
    now: freezeInstant(now),
  });
}

function snapshotUpdateCount(value: unknown): number | undefined {
  const fields = readExactOwnDataFields(value, ["count"]);
  const count = fields?.get("count");
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}

function isUniqueConstraintError(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  try {
    return Object.getOwnPropertyDescriptor(value, "code")?.value === "P2002";
  } catch {
    return false;
  }
}

function toPrismaBytes(value: Uint8Array): Prisma.Bytes {
  return new Uint8Array(value);
}

function isAllowedTransactionLifetime(issuedAt: CanonicalUtcInstant, expiresAt: CanonicalUtcInstant): boolean {
  if (compareCanonicalUtcInstants(expiresAt, issuedAt) <= 0) return false;
  const minimum = addWholeSeconds(issuedAt, 1);
  const maximum = addWholeSeconds(issuedAt, MAXIMUM_TRANSACTION_LIFETIME_SECONDS);
  return minimum !== undefined
    && maximum !== undefined
    && compareCanonicalUtcInstants(expiresAt, minimum) >= 0
    && compareCanonicalUtcInstants(expiresAt, maximum) <= 0;
}

function addWholeSeconds(value: CanonicalUtcInstant, seconds: number): CanonicalUtcInstant | undefined {
  if (!Number.isSafeInteger(seconds) || seconds < 0 || !Number.isSafeInteger(value.epochSeconds + seconds)) return undefined;
  const epochSeconds = value.epochSeconds + seconds;
  const date = new Date(epochSeconds * 1_000);
  if (!Number.isFinite(date.getTime()) || date.getTime() !== epochSeconds * 1_000) return undefined;
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9_999) return undefined;
  const fraction = value.nanoseconds === 0
    ? ""
    : "." + value.nanoseconds.toString(10).padStart(9, "0").replace(/0+$/u, "");
  try {
    return freezeInstant(parseCanonicalUtcInstant(
      year.toString(10).padStart(4, "0")
      + "-" + (date.getUTCMonth() + 1).toString(10).padStart(2, "0")
      + "-" + date.getUTCDate().toString(10).padStart(2, "0")
      + "T" + date.getUTCHours().toString(10).padStart(2, "0")
      + ":" + date.getUTCMinutes().toString(10).padStart(2, "0")
      + ":" + date.getUTCSeconds().toString(10).padStart(2, "0")
      + fraction + "Z",
    ));
  } catch {
    return undefined;
  }
}

function isCanonicalOpaqueSecret(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_OPAQUE_SECRET.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === 32 && decoded.toString("base64url") === value;
}

function isKeyVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647;
}

function isCanonicalIssuer(value: string): boolean {
  if (value.length === 0 || value.length > 2_048 || value !== value.trim() || value.endsWith("/")) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && parsed.username === ""
      && parsed.password === ""
      && parsed.search === ""
      && parsed.hash === ""
      && parsed.pathname !== "/"
      && !parsed.pathname.includes("//")
      && value === parsed.origin + parsed.pathname;
  } catch {
    return false;
  }
}

function isCanonicalCallbackUri(value: string): boolean {
  if (value.length === 0 || value.length > 2_048 || value !== value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && parsed.username === ""
      && parsed.password === ""
      && parsed.pathname === "/auth/callback"
      && parsed.search === ""
      && parsed.hash === ""
      && value === parsed.origin + "/auth/callback";
  } catch {
    return false;
  }
}

function freezeInstant(value: CanonicalUtcInstant): CanonicalUtcInstant {
  return Object.freeze({ ...value });
}
