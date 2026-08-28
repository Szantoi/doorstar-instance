/** A closed, server-owned role vocabulary. It is never read from a browser request. */
export const pilotOfficeRoles = [
  "SALES",
  "TECHNICAL_PREPARATION",
  "ORDER_APPROVER",
  "PRODUCTION_PLANNER",
  "INSTALLER",
  "WAREHOUSE_DISPATCH",
  "ADMINISTRATOR",
  "READER",
] as const;

export type PilotOfficeRole = typeof pilotOfficeRoles[number];

export type ResolvedPilotScope = Readonly<{
  id: string;
  scopeKey: string;
}>;

/**
 * No raw state, nonce, PKCE verifier, OIDC subject or access/ID token belongs
 * in this record. The nonce is retained only as a SHA-256 hash; the code
 * verifier is the sole encrypted callback secret.
 */
export type NewAuthorizationTransaction = Readonly<{
  stateHash: string;
  browserBindingHash: string;
  nonceHash: string;
  codeVerifierCiphertext: Uint8Array;
  expiresAt: Date;
}>;

export type ConsumedAuthorizationTransaction = Readonly<{
  id: string;
  nonceHash: string;
  codeVerifierCiphertext: Uint8Array;
  createdAt: Date;
  expiresAt: Date;
}>;

export type ActivePilotBinding = Readonly<{
  id: string;
  pilotScopeId: string;
  actorKey: string;
  displayName: string;
  role: PilotOfficeRole;
  active: true;
}>;

export type NewOpaqueSession = Readonly<{
  pilotScopeId: string;
  bindingId: string;
  sessionTokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

export type ActiveOpaqueSession = Readonly<{
  id: string;
  pilotScopeId: string;
  bindingId: string;
  actorKey: string;
  displayName: string;
  role: PilotOfficeRole;
  expiresAt: Date;
}>;

/**
 * Server-owned input to the DB direct-admin provision routine. The actor is
 * derived by the routine from `actorSessionTokenHash`; no browser-supplied
 * binding/actor/scope/audit value can cross this boundary.
 */
export type DirectRosterBindingProvision = Readonly<{
  pilotScopeId: string;
  actorSessionTokenHash: string;
  issuer: string;
  subjectDigest: string;
  actorKey: string;
  displayName: string;
  role: PilotOfficeRole;
  canManagePilotRoster: boolean;
  correlationId: string;
}>;

/** Server-owned input to the DB direct-admin update routine. */
export type DirectRosterBindingUpdate = Readonly<{
  pilotScopeId: string;
  actorSessionTokenHash: string;
  targetBindingId: string;
  expectedAuditVersion: number;
  role: PilotOfficeRole;
  active: boolean;
  canManagePilotRoster: boolean;
  reason: string;
  correlationId: string;
}>;

export type OidcBindingLookup = Readonly<{
  pilotScopeId: string;
  issuer: string;
  subjectDigest: string;
}>;

/** Values explicitly permitted for an internal, direct writer flow. */
export type DirectBindingProvision = Readonly<{
  pilotScopeId: string;
  actorBindingId: string;
  issuer: string;
  subjectDigest: string;
  displayName: string;
  role: PilotOfficeRole;
}>;

export type DirectBindingRevocation = Readonly<{
  pilotScopeId: string;
  actorBindingId: string;
  targetBindingId: string;
}>;

/**
 * Bootstrap intentionally has no caller-supplied audit actor. Its database
 * routine must derive the audit actor from the distinct bootstrap principal.
 */
export type BootstrapBindingProvision = Readonly<{
  pilotScopeId: string;
  issuer: string;
  subjectDigest: string;
  displayName: string;
  role: PilotOfficeRole;
}>;

export type BootstrapBindingRevocation = Readonly<{
  pilotScopeId: string;
  targetBindingId: string;
}>;
