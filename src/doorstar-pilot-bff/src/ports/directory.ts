/**
 * A server-only directory result. `subject` is the immutable OIDC subject
 * that Keycloak will issue, not an e-mail address or browser-visible value.
 */
export type CreatedPilotDirectoryAccount = Readonly<{
  subject: string;
}>;

/**
 * Narrow Keycloak management boundary. Implementations must never expose an
 * access token, client secret, raw directory response, e-mail address or
 * subject in a log or thrown message.
 */
export interface PilotDirectoryAdmin {
  createAccountAndSendInvitation(input: Readonly<{
    email: string;
    displayName: string;
  }>): Promise<CreatedPilotDirectoryAccount>;
  /**
   * Makes a previously created directory account usable. Callers must invoke
   * this only after the database-owned local binding has committed.
   */
  enableCreatedAccount(input: CreatedPilotDirectoryAccount): Promise<void>;
  /** Makes an account unavailable during a failed provisioning workflow. */
  disableCreatedAccount(input: CreatedPilotDirectoryAccount): Promise<void>;
}
