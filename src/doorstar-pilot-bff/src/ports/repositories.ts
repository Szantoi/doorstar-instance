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
} from "../domain/model.js";

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
