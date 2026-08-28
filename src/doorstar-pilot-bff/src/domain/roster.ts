import type { PilotOfficeRole } from "./model.js";

/**
 * Safe roster projection returned to an authorised Office administrator.
 * It intentionally omits e-mail, the OIDC subject/digest, actor keys and
 * opaque-session data: those values are never needed by the browser roster.
 */
export type PilotRosterUser = Readonly<{
  bindingId: string;
  displayName: string;
  role: PilotOfficeRole;
  active: boolean;
  canManagePilotRoster: boolean;
  auditVersion: number;
}>;

/**
 * This is an internal, current authorisation witness. It is never serialised
 * into an HTTP response. A repository must derive it from the live opaque
 * session and the protected binding state in the fixed pilot scope.
 */
export type EffectivePilotRosterManager = Readonly<{
  bindingId: string;
  pilotScopeId: string;
}>;

/** Browser-provided display and requested Office policy for a new colleague. */
export type NewPilotRosterUserRequest = Readonly<{
  displayName: string;
  email: string;
  role: PilotOfficeRole;
  canManagePilotRoster: boolean;
}>;

/** Browser-provided replacement policy for an existing local binding. */
export type UpdatePilotRosterUserRequest = Readonly<{
  expectedAuditVersion: number;
  role: PilotOfficeRole;
  active: boolean;
  canManagePilotRoster: boolean;
}>;
