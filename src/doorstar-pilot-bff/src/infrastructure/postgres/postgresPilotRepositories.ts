import {
  pilotOfficeRoles,
  type ActiveOpaqueSession,
  type ActivePilotBinding,
  type ConsumedAuthorizationTransaction,
  type NewAuthorizationTransaction,
  type NewOpaqueSession,
  type PilotOfficeRole,
  type ResolvedPilotScope,
} from "../../domain/model.js";
import type {
  AuthorizationTransactionRepository,
  OpaqueSessionRepository,
  PilotBindingRepository,
  PilotScopeRepository,
} from "../../ports/repositories.js";
import type { PilotPgClient, PilotPgPool, PilotPgRow } from "./pilotPostgresContracts.js";
import { PilotPostgresTransactionRunner } from "./pilotPostgresTransaction.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256HexPattern = /^[a-f0-9]{64}$/;
const officeRoleSet = new Set<string>(pilotOfficeRoles);

/**
 * Runtime-only pg adapter. It has no bootstrap writer and cannot make raw
 * AuthorizationTransaction, PrincipalBinding, OpaqueSession or BindingAudit
 * mutations: every BFF writer is delegated to an A-phase stored routine.
 */
export class PostgresPilotRepositories implements
  PilotScopeRepository,
  AuthorizationTransactionRepository,
  PilotBindingRepository,
  OpaqueSessionRepository {
  private readonly transactionRunner: PilotPostgresTransactionRunner;
  private resolvedRuntimeScopeId: string | undefined;

  public constructor(private readonly pool: PilotPgPool) {
    this.transactionRunner = new PilotPostgresTransactionRunner(pool);
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async requireSingleConfiguredScope(
    input: Readonly<{ scopeKey: string }>,
  ): Promise<ResolvedPilotScope> {
    const scopeKey = requireScopeKey(input.scopeKey);
    const scope = await this.transactionRunner.unscoped(async (client) => {
      const result = await client.query(
        `SELECT "id", "scopeKey"
           FROM pilot."PilotScope"
          WHERE "scopeKey" = $1
          LIMIT 2`,
        [scopeKey],
      );
      if (result.rows.length !== 1) {
        throw new Error("pilot_postgres_configured_scope_not_unique");
      }
      const scope = readScope(result.rows[0]);
      await client.query(
        "SELECT pg_catalog.set_config('app.current_pilot_scope_id', $1, true)",
        [scope.id],
      );
      await client.query("SELECT pilot.pilot_runtime_preflight_v1()");
      return scope;
    });
    if (
      this.resolvedRuntimeScopeId !== undefined
      && this.resolvedRuntimeScopeId !== scope.id
    ) {
      throw new Error("pilot_postgres_runtime_scope_changed");
    }
    this.resolvedRuntimeScopeId = scope.id;
    return scope;
  }

  public async create(input: NewAuthorizationTransaction): Promise<void> {
    const transaction = validateNewAuthorizationTransaction(input);
    await this.transactionRunner.scoped(this.requireResolvedRuntimeScopeId(), async (client) => {
      const result = await client.query(
        `SELECT pilot.pilot_create_authorization_transaction_v1($1, $2, $3, $4, $5) AS "id"`,
        [
          transaction.stateHash,
          transaction.browserBindingHash,
          transaction.nonceHash,
          transaction.codeVerifierCiphertext,
          transaction.expiresAt,
        ],
      );
      if (result.rows.length !== 1 || !isUuid(result.rows[0].id)) {
        throw new Error("pilot_postgres_transaction_create_invalid_result");
      }
    });
  }

  public async consumeMatching(input: Readonly<{
    stateHash: string;
    browserBindingHash: string;
  }>): Promise<ConsumedAuthorizationTransaction | null> {
    const stateHash = requireSha256Hex(input.stateHash, "pilot_postgres_state_hash_invalid");
    const browserBindingHash = requireSha256Hex(
      input.browserBindingHash,
      "pilot_postgres_browser_binding_hash_invalid",
    );
    return this.transactionRunner.scoped(this.requireResolvedRuntimeScopeId(), async (client) => {
      const result = await client.query(
        `SELECT "id", "nonceHash", "codeVerifierCiphertext", "createdAt", "expiresAt"
           FROM pilot.pilot_consume_authorization_transaction_v1($1, $2)`,
        [stateHash, browserBindingHash],
      );
      if (result.rows.length === 0) {
        return null;
      }
      if (result.rows.length !== 1) {
        throw new Error("pilot_postgres_transaction_consume_ambiguous");
      }
      return readConsumedAuthorizationTransaction(result.rows[0]);
    });
  }

  public async findActiveByOidcIdentity(input: Readonly<{
    pilotScopeId: string;
    issuer: string;
    subjectDigest: string;
  }>): Promise<ActivePilotBinding | null> {
    const pilotScopeId = this.requireFixedScopeId(input.pilotScopeId);
    const issuer = requireText(input.issuer, 2_048, "pilot_postgres_issuer_invalid");
    const subjectDigest = requireSha256Hex(
      input.subjectDigest,
      "pilot_postgres_subject_digest_invalid",
    );
    return this.transactionRunner.scoped(pilotScopeId, async (client) => {
      const result = await client.query(
        `SELECT "id", "pilotScopeId", "actorKey", "displayName", "role", "active"
           FROM pilot."PrincipalBinding"
          WHERE "pilotScopeId" = $1
            AND "issuer" = $2
            AND "subjectDigest" = $3
            AND "active" = true
          LIMIT 2`,
        [pilotScopeId, issuer, subjectDigest],
      );
      if (result.rows.length === 0) {
        return null;
      }
      if (result.rows.length !== 1) {
        throw new Error("pilot_postgres_binding_lookup_ambiguous");
      }
      return readActiveBinding(result.rows[0], pilotScopeId);
    });
  }

  public async createForActiveBinding(input: NewOpaqueSession): Promise<boolean> {
    const session = validateNewOpaqueSession(input);
    this.assertFixedScopeId(session.pilotScopeId);
    try {
      await this.transactionRunner.scoped(session.pilotScopeId, async (client) => {
        const result = await client.query(
          `SELECT pilot.pilot_issue_opaque_session_v1($1, $2, NULL, $3) AS "id"`,
          [session.bindingId, session.sessionTokenHash, session.expiresAt],
        );
        if (result.rows.length !== 1 || !isUuid(result.rows[0].id)) {
          throw new Error("pilot_postgres_session_issue_invalid_result");
        }
      });
      return true;
    } catch (error) {
      if (isInactiveBindingRejection(error)) {
        return false;
      }
      throw error;
    }
  }

  public async findActiveByTokenHash(input: Readonly<{
    pilotScopeId: string;
    sessionTokenHash: string;
    observedAt: Date;
  }>): Promise<ActiveOpaqueSession | null> {
    const pilotScopeId = this.requireFixedScopeId(input.pilotScopeId);
    const sessionTokenHash = requireSha256Hex(
      input.sessionTokenHash,
      "pilot_postgres_session_token_hash_invalid",
    );
    const observedAt = requireDate(input.observedAt, "pilot_postgres_observed_at_invalid");
    return this.transactionRunner.scoped(pilotScopeId, async (client) => {
      const result = await client.query(
        `SELECT
           session_row."id",
           session_row."pilotScopeId",
           session_row."bindingId",
           binding."actorKey",
           binding."displayName",
           binding."role",
           session_row."expiresAt"
         FROM pilot."OpaqueSession" AS session_row
         JOIN pilot."PrincipalBinding" AS binding
           ON binding."id" = session_row."bindingId"
          AND binding."pilotScopeId" = session_row."pilotScopeId"
        WHERE session_row."pilotScopeId" = $1
          AND session_row."sessionTokenHash" = $2
          AND session_row."revokedAt" IS NULL
          AND session_row."expiresAt" > $3
          AND session_row."bindingEpoch" = binding."auditVersion"
          AND binding."active" = true
          AND binding."pilotScopeId" = $1
        LIMIT 2`,
        [pilotScopeId, sessionTokenHash, observedAt],
      );
      if (result.rows.length === 0) {
        return null;
      }
      if (result.rows.length !== 1) {
        throw new Error("pilot_postgres_session_lookup_ambiguous");
      }
      return readActiveOpaqueSession(result.rows[0], pilotScopeId);
    });
  }

  public async revokeByTokenHash(input: Readonly<{
    pilotScopeId: string;
    sessionTokenHash: string;
    revokedAt: Date;
  }>): Promise<void> {
    const pilotScopeId = this.requireFixedScopeId(input.pilotScopeId);
    const sessionTokenHash = requireSha256Hex(
      input.sessionTokenHash,
      "pilot_postgres_session_token_hash_invalid",
    );
    requireDate(input.revokedAt, "pilot_postgres_revoked_at_invalid");
    await this.transactionRunner.scoped(pilotScopeId, async (client) => {
      await client.query(
        "SELECT pilot.pilot_revoke_opaque_session_v1($1) AS \"revoked\"",
        [sessionTokenHash],
      );
    });
  }

  private requireResolvedRuntimeScopeId(): string {
    if (this.resolvedRuntimeScopeId === undefined) {
      throw new Error("pilot_postgres_runtime_scope_not_resolved");
    }
    return this.resolvedRuntimeScopeId;
  }

  private requireFixedScopeId(value: string): string {
    const scopeId = requireUuid(value, "pilot_postgres_scope_id_invalid");
    this.assertFixedScopeId(scopeId);
    return scopeId;
  }

  private assertFixedScopeId(scopeId: string): void {
    if (scopeId !== this.requireResolvedRuntimeScopeId()) {
      throw new Error("pilot_postgres_scope_mismatch");
    }
  }
}

function validateNewAuthorizationTransaction(input: NewAuthorizationTransaction): NewAuthorizationTransaction {
  const expiresAt = requireDate(input.expiresAt, "pilot_postgres_transaction_expires_at_invalid");
  if (!(input.codeVerifierCiphertext instanceof Uint8Array) || input.codeVerifierCiphertext.byteLength === 0) {
    throw new Error("pilot_postgres_transaction_ciphertext_invalid");
  }
  return {
    stateHash: requireSha256Hex(input.stateHash, "pilot_postgres_state_hash_invalid"),
    browserBindingHash: requireSha256Hex(
      input.browserBindingHash,
      "pilot_postgres_browser_binding_hash_invalid",
    ),
    nonceHash: requireSha256Hex(input.nonceHash, "pilot_postgres_nonce_hash_invalid"),
    codeVerifierCiphertext: Uint8Array.from(input.codeVerifierCiphertext),
    expiresAt,
  };
}

function validateNewOpaqueSession(input: NewOpaqueSession): NewOpaqueSession {
  const issuedAt = requireDate(input.issuedAt, "pilot_postgres_session_issued_at_invalid");
  const expiresAt = requireDate(input.expiresAt, "pilot_postgres_session_expires_at_invalid");
  if (expiresAt.getTime() <= issuedAt.getTime()) {
    throw new Error("pilot_postgres_session_expiry_invalid");
  }
  return {
    pilotScopeId: requireUuid(input.pilotScopeId, "pilot_postgres_scope_id_invalid"),
    bindingId: requireUuid(input.bindingId, "pilot_postgres_binding_id_invalid"),
    sessionTokenHash: requireSha256Hex(
      input.sessionTokenHash,
      "pilot_postgres_session_token_hash_invalid",
    ),
    issuedAt,
    expiresAt,
  };
}

function readScope(row: PilotPgRow): ResolvedPilotScope {
  return {
    id: requireUuid(row.id, "pilot_postgres_scope_id_invalid"),
    scopeKey: requireScopeKey(row.scopeKey),
  };
}

function readConsumedAuthorizationTransaction(row: PilotPgRow): ConsumedAuthorizationTransaction {
  const ciphertext = row.codeVerifierCiphertext;
  if (!(ciphertext instanceof Uint8Array) || ciphertext.byteLength === 0) {
    throw new Error("pilot_postgres_transaction_ciphertext_invalid");
  }
  return {
    id: requireUuid(row.id, "pilot_postgres_transaction_id_invalid"),
    nonceHash: requireSha256Hex(row.nonceHash, "pilot_postgres_nonce_hash_invalid"),
    codeVerifierCiphertext: Uint8Array.from(ciphertext),
    createdAt: requireDate(row.createdAt, "pilot_postgres_transaction_created_at_invalid"),
    expiresAt: requireDate(row.expiresAt, "pilot_postgres_transaction_expires_at_invalid"),
  };
}

function readActiveBinding(row: PilotPgRow, expectedScopeId: string): ActivePilotBinding {
  const pilotScopeId = requireUuid(row.pilotScopeId, "pilot_postgres_scope_id_invalid");
  if (pilotScopeId !== expectedScopeId || row.active !== true) {
    throw new Error("pilot_postgres_binding_scope_or_active_invalid");
  }
  return {
    id: requireUuid(row.id, "pilot_postgres_binding_id_invalid"),
    pilotScopeId,
    actorKey: requireSha256Hex(row.actorKey, "pilot_postgres_actor_key_invalid"),
    displayName: requireText(row.displayName, 160, "pilot_postgres_display_name_invalid"),
    role: requireOfficeRole(row.role),
    active: true,
  };
}

function readActiveOpaqueSession(row: PilotPgRow, expectedScopeId: string): ActiveOpaqueSession {
  const pilotScopeId = requireUuid(row.pilotScopeId, "pilot_postgres_scope_id_invalid");
  if (pilotScopeId !== expectedScopeId) {
    throw new Error("pilot_postgres_session_scope_invalid");
  }
  return {
    id: requireUuid(row.id, "pilot_postgres_session_id_invalid"),
    pilotScopeId,
    bindingId: requireUuid(row.bindingId, "pilot_postgres_binding_id_invalid"),
    actorKey: requireSha256Hex(row.actorKey, "pilot_postgres_actor_key_invalid"),
    displayName: requireText(row.displayName, 160, "pilot_postgres_display_name_invalid"),
    role: requireOfficeRole(row.role),
    expiresAt: requireDate(row.expiresAt, "pilot_postgres_session_expires_at_invalid"),
  };
}

function requireScopeKey(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{2,79}$/.test(value)) {
    throw new Error("pilot_postgres_scope_key_invalid");
  }
  return value;
}

function requireUuid(value: unknown, errorCode: string): string {
  if (!isUuid(value)) {
    throw new Error(errorCode);
  }
  return value;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function requireSha256Hex(value: unknown, errorCode: string): string {
  if (typeof value !== "string" || !sha256HexPattern.test(value)) {
    throw new Error(errorCode);
  }
  return value;
}

function requireText(value: unknown, maximumLength: number, errorCode: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumLength || /[\r\n\u0000]/.test(value)) {
    throw new Error(errorCode);
  }
  return value;
}

function requireDate(value: unknown, errorCode: string): Date {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(errorCode);
  }
  return parsed;
}

function requireOfficeRole(value: unknown): PilotOfficeRole {
  if (typeof value !== "string" || !officeRoleSet.has(value)) {
    throw new Error("pilot_postgres_role_invalid");
  }
  return value as PilotOfficeRole;
}

function isInactiveBindingRejection(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && "message" in error
    && error.code === "42501"
    && error.message === "opaque session requires an active binding in the current scope"
  );
}
