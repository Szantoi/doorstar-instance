import { z } from "zod";
import { parseStrictJsonObject } from "./strictJson.js";

export const IDENTITY_AUTHORITY_SCHEMA_VERSION = "spaceos.online-identity-authority/v1";
const LOWERCASE_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const MAXIMUM_GRANT_COUNT = 10;
const V1_GRANTED_ACTIONS = Object.freeze(["view", "edit", "admin"] as const);
const RESERVED_TENANT_IDS = Object.freeze(new Set([
  "00000000-0000-0000-0000-000000000000",
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
]));

/**
 * Version-pinned consumer copy of the public v1 wire grammar. A newer module
 * catalog requires a new schema version or an explicit contract update; unknown
 * module grants must never become authorization by accident.
 */
const V1_AUTHORITY_MODULES = Object.freeze(new Set([
  "spaceos.crm",
  "spaceos.controlling",
  "spaceos.hr",
  "spaceos.maintenance",
  "spaceos.qa",
  "spaceos.ehs",
  "spaceos.dms",
  "joinerytech.door",
  "joinerytech.plant",
]));

export interface CanonicalUtcInstant {
  readonly wireValue: string;
  readonly epochSeconds: number;
  readonly nanoseconds: number;
}

export interface IdentityAuthorityResolveRequest {
  readonly subject: string;
  readonly tenantId: string;
}

export interface IdentityAuthorityState {
  readonly schemaVersion: typeof IDENTITY_AUTHORITY_SCHEMA_VERSION;
  readonly subject: string;
  readonly tenantId: string;
  readonly tenantStatus: "active" | "deactivated";
  readonly membershipStatus: "active" | "deactivated" | "revoked";
  readonly membershipVersion: number;
  readonly projectionVersion: number;
  readonly acceptTokensIssuedAtOrAfter: CanonicalUtcInstant;
  readonly permissions: readonly string[];
  readonly enabledModules: readonly string[];
}

const canonicalSubject = z.string().min(1).max(256).refine(isCanonicalSubject, "invalid subject");
const canonicalTenantId = z.string()
  .regex(LOWERCASE_GUID, "tenantId must be a lowercase D GUID")
  .refine((value) => !RESERVED_TENANT_IDS.has(value), "tenantId must not be reserved");
const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const grantList = z.array(z.string().min(1).max(128)).min(1).max(MAXIMUM_GRANT_COUNT);

const resolveRequestSchema = z.object({ subject: canonicalSubject, tenantId: canonicalTenantId }).strict();
const stateSchema = z.object({
  schemaVersion: z.literal(IDENTITY_AUTHORITY_SCHEMA_VERSION),
  subject: canonicalSubject,
  tenantId: canonicalTenantId,
  tenantStatus: z.enum(["active", "deactivated"]),
  membershipStatus: z.enum(["active", "deactivated", "revoked"]),
  membershipVersion: version,
  projectionVersion: version,
  acceptTokensIssuedAtOrAfter: z.string(),
  permissions: grantList,
  enabledModules: grantList,
}).strict();

/** Rejects any untrusted request shape, including a raw bearer-token field. */
export function parseIdentityAuthorityResolveRequest(value: unknown): IdentityAuthorityResolveRequest {
  const parsed = resolveRequestSchema.safeParse(value);
  if (!parsed.success) throw new Error("identity_authority_resolve_request_invalid");
  return parsed.data;
}

/** Shared v1 tenant grammar for trusted M1 control-plane snapshots. */
export function isAllowedCanonicalTenantId(value: string): boolean {
  return LOWERCASE_GUID.test(value) && !RESERVED_TENANT_IDS.has(value);
}

/** Parses the exact ten-field Kernel response without normalising an invalid value. */
export function parseIdentityAuthorityState(text: string): IdentityAuthorityState {
  const parsed = stateSchema.safeParse(parseStrictJsonObject(text));
  if (!parsed.success) throw new Error("identity_authority_state_contract_invalid");

  requireCanonicalGrantSequence(parsed.data.enabledModules, parsed.data.permissions);
  return {
    ...parsed.data,
    acceptTokensIssuedAtOrAfter: parseCanonicalUtcInstant(parsed.data.acceptTokensIssuedAtOrAfter),
    permissions: Object.freeze([...parsed.data.permissions]),
    enabledModules: Object.freeze([...parsed.data.enabledModules]),
  };
}

/** Preserves fractional seconds so a later BFF can compare a human token iat without rounding. */
export function parseCanonicalUtcInstant(value: string): CanonicalUtcInstant {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/u.exec(value);
  if (match === null) throw new Error("identity_authority_cutoff_invalid");

  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  if (year === 0) throw new Error("identity_authority_cutoff_invalid");

  // Date.UTC maps 0000–0099 to 1900–1999; setUTCFullYear preserves the .NET wire range.
  const date = new Date(0);
  date.setUTCFullYear(year!, month! - 1, day!);
  date.setUTCHours(hour!, minute!, second!, 0);
  if (date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month! - 1
    || date.getUTCDate() !== day
    || date.getUTCHours() !== hour
    || date.getUTCMinutes() !== minute
    || date.getUTCSeconds() !== second) {
    throw new Error("identity_authority_cutoff_invalid");
  }

  const fraction = (match[7] ?? "").padEnd(9, "0");
  return {
    wireValue: value,
    epochSeconds: Math.floor(date.getTime() / 1_000),
    nanoseconds: fraction === "" ? 0 : Number(fraction),
  };
}

/** Compares exact UTC instants without losing sub-millisecond precision. */
export function compareCanonicalUtcInstants(left: CanonicalUtcInstant, right: CanonicalUtcInstant): -1 | 0 | 1 {
  if (left.epochSeconds !== right.epochSeconds) return left.epochSeconds < right.epochSeconds ? -1 : 1;
  if (left.nanoseconds !== right.nanoseconds) return left.nanoseconds < right.nanoseconds ? -1 : 1;
  return 0;
}

function isCanonicalSubject(value: string): boolean {
  return !/[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}

function requireCanonicalGrantSequence(enabledModules: readonly string[], permissions: readonly string[]): void {
  if (enabledModules.length !== permissions.length
    || !isStrictlySortedUnique(enabledModules)
    || !isStrictlySortedUnique(permissions)) {
    throw new Error("identity_authority_grant_sequence_invalid");
  }

  for (let index = 0; index < enabledModules.length; index += 1) {
    const moduleId = enabledModules[index]!;
    const permission = permissions[index]!;
    const action = permission.startsWith(`${moduleId}.`) ? permission.slice(moduleId.length + 1) : "";
    if (!V1_AUTHORITY_MODULES.has(moduleId)
      || !(V1_GRANTED_ACTIONS as readonly string[]).includes(action)) {
      throw new Error("identity_authority_grant_sequence_invalid");
    }
  }
}

function isStrictlySortedUnique(values: readonly string[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1]! >= values[index]!) return false;
  }
  return true;
}
