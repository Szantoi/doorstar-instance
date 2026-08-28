import type {
  ActiveOpaqueSession,
  ActivePilotBinding,
  BootstrapBindingProvision,
  BootstrapBindingRevocation,
  ConsumedAuthorizationTransaction,
  DirectBindingProvision,
  DirectBindingRevocation,
  NewAuthorizationTransaction,
  NewOpaqueSession,
  OidcBindingLookup,
  ResolvedPilotScope,
  DirectRosterBindingProvision,
  DirectRosterBindingUpdate,
} from "../domain/model.js";
import type { EffectivePilotRosterManager, PilotRosterUser } from "../domain/roster.js";

/** Resolves exactly one configured production scope during BFF startup. */
export interface PilotScopeRepository {
  requireSingleConfiguredScope(input: Readonly<{ scopeKey: string }>): Promise<ResolvedPilotScope>;
}

/** `consumeMatching` must atomically match, expire-check and single-consume the transaction. */
export interface AuthorizationTransactionRepository {
  create(input: NewAuthorizationTransaction): Promise<void>;
  consumeMatching(input: Readonly<{
    stateHash: string;
    browserBindingHash: string;
  }>): Promise<ConsumedAuthorizationTransaction | null>;
}

/** Read-only from the BFF: an absent binding is authorization denial, never provisioning. */
export interface PilotBindingRepository {
  findActiveByOidcIdentity(input: OidcBindingLookup): Promise<ActivePilotBinding | null>;
}

/**
 * The implementation creates a session only while the binding is still active
 * in the supplied scope, closing the lookup-to-session race.
 */
export interface OpaqueSessionRepository {
  createForActiveBinding(input: NewOpaqueSession): Promise<boolean>;
  findActiveByTokenHash(input: Readonly<{
    pilotScopeId: string;
    sessionTokenHash: string;
    observedAt: Date;
  }>): Promise<ActiveOpaqueSession | null>;
  revokeByTokenHash(input: Readonly<{
    pilotScopeId: string;
    sessionTokenHash: string;
    revokedAt: Date;
  }>): Promise<void>;
}

/**
 * Server-side roster reads. The implementation must obtain authority from the
 * same live opaque session hash that backs the BFF cookie; it must not accept
 * browser-supplied actor, scope, role or capability data.
 */
export interface PilotRosterReader {
  findEffectiveManagerBySessionTokenHash(input: Readonly<{
    pilotScopeId: string;
    sessionTokenHash: string;
    observedAt: Date;
  }>): Promise<EffectivePilotRosterManager | null>;
  listDirectAdminBindings(input: Readonly<{
    pilotScopeId: string;
    actorSessionTokenHash: string;
  }>): Promise<readonly PilotRosterUser[]>;
}

/**
 * DB-owned direct-admin writes. A stored routine derives the actor from the
 * live opaque session and creates immutable audit evidence.
 */
export interface PilotRosterWriter {
  provisionDirectAdminBinding(input: DirectRosterBindingProvision): Promise<PilotRosterUser>;
  updateDirectAdminBinding(input: DirectRosterBindingUpdate): Promise<PilotRosterUser>;
}

/**
 * A separately authorized server workflow may call this boundary. The BFF
 * deliberately does not receive an implementation and cannot invoke it.
 */
export interface DirectPilotWriter {
  provisionBinding(input: DirectBindingProvision): Promise<ActivePilotBinding>;
  revokeBinding(input: DirectBindingRevocation): Promise<void>;
}

/**
 * Only the approved first-provision/revoke operations belong here. The DB
 * routine, not this request shape, determines the bootstrap audit identity.
 */
export interface BootstrapPilotWriter {
  provisionInitialBinding(input: BootstrapBindingProvision): Promise<ActivePilotBinding>;
  revokeBootstrapBinding(input: BootstrapBindingRevocation): Promise<void>;
}
