import type { PilotBffConfig } from "../config/pilotBffConfig.js";
import type {
  ActiveOpaqueSession,
  ActivePilotBinding,
  NewAuthorizationTransaction,
} from "../domain/model.js";
import type { Clock } from "../ports/clock.js";
import type { PilotCrypto } from "../ports/crypto.js";
import type { PilotAuthLogger } from "../ports/logger.js";
import type { OidcAuthorizationClient } from "../ports/oidc.js";
import type {
  AuthorizationTransactionRepository,
  OpaqueSessionRepository,
  PilotBindingRepository,
} from "../ports/repositories.js";
import { PilotAuthError } from "./errors.js";

const opaqueValuePattern = /^[A-Za-z0-9_-]{32,512}$/;

export type PilotAuthServiceDependencies = Readonly<{
  config: PilotBffConfig;
  fixedScope: Readonly<{ id: string; scopeKey: string }>;
  clock: Clock;
  crypto: PilotCrypto;
  oidc: OidcAuthorizationClient;
  transactions: AuthorizationTransactionRepository;
  bindings: PilotBindingRepository;
  sessions: OpaqueSessionRepository;
  logger: PilotAuthLogger;
}>;

export type LoginStart = Readonly<{
  authorizationUrl: string;
  state: string;
  browserBinding: string;
  issueBrowserBindingCookie: boolean;
}>;

export type LoginCompletion = Readonly<{
  sessionToken: string;
  sessionExpiresAt: Date;
  redirectPath: string;
}>;

export class PilotAuthService {
  public constructor(private readonly dependencies: PilotAuthServiceDependencies) {}

  public async startLogin(existingBrowserBinding: string | undefined): Promise<LoginStart> {
    const issueBrowserBindingCookie = !isOpaqueValue(existingBrowserBinding);
    const browserBinding = issueBrowserBindingCookie
      ? this.createOpaque("browser_binding")
      : existingBrowserBinding;
    const state = this.createOpaque("state");
    const nonce = this.createOpaque("nonce");
    const pkceVerifier = this.createOpaque("pkce_verifier");
    const createdAt = this.now();
    const transaction: NewAuthorizationTransaction = {
      stateHash: this.requireSha256Hash(this.dependencies.crypto.hash(state)),
      browserBindingHash: this.requireSha256Hash(this.dependencies.crypto.hash(browserBinding)),
      nonceHash: this.requireSha256Hash(this.dependencies.crypto.hash(nonce)),
      codeVerifierCiphertext: this.requireCiphertext(this.dependencies.crypto.encrypt(pkceVerifier)),
      expiresAt: addSeconds(createdAt, this.dependencies.config.transactionTtlSeconds),
    };

    const authorizationRequest = {
      clientId: this.dependencies.config.oidc.clientId,
      redirectUri: this.dependencies.config.oidc.redirectUri,
      requestedScopes: this.dependencies.config.oidc.requestedScopes,
      state,
      nonce,
      pkceChallenge: this.requireProtectedValue(
        this.dependencies.crypto.derivePkceS256(pkceVerifier),
      ),
    } as const;
    const authorizationUrl = await this.dependencies.oidc.createAuthorizationUrl(authorizationRequest);

    this.assertConfiguredAuthorizationEndpoint(authorizationUrl, authorizationRequest);
    await this.dependencies.transactions.create(transaction);
    this.dependencies.logger.info("pilot_auth_login_started", {
      scopeKey: this.dependencies.fixedScope.scopeKey,
    });
    return { authorizationUrl, state, browserBinding, issueBrowserBindingCookie };
  }

  public async completeCallback(input: Readonly<{
    state: string;
    code: string;
    browserBinding: string | undefined;
  }>): Promise<LoginCompletion> {
    if (!isOpaqueValue(input.state) || !isOpaqueValue(input.browserBinding) || !isAuthorizationCode(input.code)) {
      throw new PilotAuthError(400, "invalid_callback_input");
    }

    const now = this.now();
    const transaction = await this.dependencies.transactions.consumeMatching({
      stateHash: this.requireSha256Hash(this.dependencies.crypto.hash(input.state)),
      browserBindingHash: this.requireSha256Hash(
        this.dependencies.crypto.hash(input.browserBinding),
      ),
    });
    if (!transaction || transaction.expiresAt.getTime() <= now.getTime()) {
      this.dependencies.logger.warn("pilot_auth_callback_rejected", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
        reason: "transaction_not_valid",
      });
      throw new PilotAuthError(400, "callback_transaction_not_valid");
    }

    const codeVerifier = this.requireOpaqueDecryption(
      this.dependencies.crypto.decrypt(transaction.codeVerifierCiphertext),
    );

    let identity: Readonly<{ issuer: string; subject: string }>;
    try {
      identity = await this.dependencies.oidc.redeemAuthorizationCode({
        code: input.code,
        redirectUri: this.dependencies.config.oidc.redirectUri,
        codeVerifier,
        expectedNonceHash: this.requireSha256Hash(transaction.nonceHash),
      });
    } catch {
      this.dependencies.logger.warn("pilot_auth_callback_rejected", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
        reason: "oidc_exchange_rejected",
      });
      throw new PilotAuthError(401, "oidc_exchange_rejected");
    }

    if (
      identity.issuer !== this.dependencies.config.oidc.issuer
      || !isVerifiedSubject(identity.subject)
    ) {
      this.dependencies.logger.warn("pilot_auth_callback_rejected", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
        reason: "oidc_identity_invalid",
      });
      throw new PilotAuthError(401, "oidc_identity_invalid");
    }

    const subjectDigest = this.requireSha256Hash(
      this.dependencies.crypto.digestOidcSubject(identity.issuer, identity.subject),
    );
    const binding = await this.dependencies.bindings.findActiveByOidcIdentity({
      pilotScopeId: this.dependencies.fixedScope.id,
      issuer: identity.issuer,
      subjectDigest,
    });
    if (!isBindingWithinScope(binding, this.dependencies.fixedScope.id)) {
      this.dependencies.logger.warn("pilot_auth_callback_rejected", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
        reason: "binding_not_authorized",
      });
      throw new PilotAuthError(403, "binding_not_authorized");
    }

    const sessionToken = this.createOpaque("session");
    const sessionCreated = await this.dependencies.sessions.createForActiveBinding({
      pilotScopeId: this.dependencies.fixedScope.id,
      bindingId: binding.id,
      sessionTokenHash: this.requireSha256Hash(this.dependencies.crypto.hash(sessionToken)),
      issuedAt: now,
      expiresAt: addSeconds(now, this.dependencies.config.sessionTtlSeconds),
    });
    if (!sessionCreated) {
      this.dependencies.logger.warn("pilot_auth_callback_rejected", {
        scopeKey: this.dependencies.fixedScope.scopeKey,
        reason: "binding_not_active_at_session_create",
      });
      throw new PilotAuthError(403, "binding_not_active_at_session_create");
    }

    this.dependencies.logger.info("pilot_auth_session_created", {
      scopeKey: this.dependencies.fixedScope.scopeKey,
      bindingId: binding.id,
    });
    return {
      sessionToken,
      sessionExpiresAt: addSeconds(now, this.dependencies.config.sessionTtlSeconds),
      redirectPath: this.dependencies.config.postLoginRedirectPath,
    };
  }

  public async getSession(sessionToken: string | undefined): Promise<ActiveOpaqueSession | null> {
    if (!isOpaqueValue(sessionToken)) {
      return null;
    }
    const observedAt = this.now();
    const session = await this.dependencies.sessions.findActiveByTokenHash({
      pilotScopeId: this.dependencies.fixedScope.id,
      sessionTokenHash: this.requireSha256Hash(this.dependencies.crypto.hash(sessionToken)),
      observedAt,
    });
    if (
      !session
      || session.pilotScopeId !== this.dependencies.fixedScope.id
      || session.expiresAt.getTime() <= observedAt.getTime()
    ) {
      return null;
    }
    return session;
  }

  public async logout(sessionToken: string | undefined): Promise<void> {
    if (!isOpaqueValue(sessionToken)) {
      return;
    }
    await this.dependencies.sessions.revokeByTokenHash({
      pilotScopeId: this.dependencies.fixedScope.id,
      sessionTokenHash: this.requireSha256Hash(this.dependencies.crypto.hash(sessionToken)),
      revokedAt: this.now(),
    });
    this.dependencies.logger.info("pilot_auth_session_revoked", {
      scopeKey: this.dependencies.fixedScope.scopeKey,
    });
  }

  private now(): Date {
    const value = this.dependencies.clock.now();
    if (Number.isNaN(value.getTime())) {
      throw new Error("pilot_auth_clock_invalid");
    }
    return new Date(value.getTime());
  }

  private createOpaque(
    purpose: "transaction" | "state" | "nonce" | "pkce_verifier" | "browser_binding" | "session",
  ): string {
    const value = this.dependencies.crypto.createOpaqueSecret(purpose);
    if (!isOpaqueValue(value)) {
      throw new Error("pilot_auth_crypto_generated_value_invalid");
    }
    return value;
  }

  private requireProtectedValue(value: string): string {
    if (!value || value.length > 4_096 || /[\r\n]/.test(value)) {
      throw new Error("pilot_auth_crypto_protected_value_invalid");
    }
    return value;
  }

  private requireSha256Hash(value: string): string {
    if (!/^[a-f0-9]{64}$/.test(value)) {
      throw new Error("pilot_auth_crypto_hash_invalid");
    }
    return value;
  }

  private requireCiphertext(value: Uint8Array): Uint8Array {
    if (!(value instanceof Uint8Array) || value.byteLength === 0 || value.byteLength > 4_096) {
      throw new Error("pilot_auth_crypto_ciphertext_invalid");
    }
    return value;
  }

  private requireOpaqueDecryption(value: string): string {
    if (!isOpaqueValue(value)) {
      throw new Error("pilot_auth_crypto_decryption_invalid");
    }
    return value;
  }

  private assertConfiguredAuthorizationEndpoint(
    authorizationUrl: string,
    expected: Readonly<{
      clientId: string;
      redirectUri: string;
      requestedScopes: readonly string[];
      state: string;
      nonce: string;
      pkceChallenge: string;
    }>,
  ): void {
    let received: URL;
    const configured = new URL(this.dependencies.config.oidc.authorizationEndpoint);
    try {
      received = new URL(authorizationUrl);
    } catch {
      throw new Error("pilot_auth_oidc_authorization_url_invalid");
    }
    if (
      received.protocol !== "https:"
      || received.origin !== configured.origin
      || received.pathname !== configured.pathname
      || received.searchParams.get("client_id") !== expected.clientId
      || received.searchParams.get("redirect_uri") !== expected.redirectUri
      || received.searchParams.get("state") !== expected.state
      || received.searchParams.get("nonce") !== expected.nonce
      || received.searchParams.get("code_challenge") !== expected.pkceChallenge
      || received.searchParams.get("code_challenge_method") !== "S256"
      || received.searchParams.get("scope") !== expected.requestedScopes.join(" ")
    ) {
      throw new Error("pilot_auth_oidc_authorization_url_untrusted");
    }
  }
}

function isOpaqueValue(value: string | undefined): value is string {
  return typeof value === "string" && opaqueValuePattern.test(value);
}

function isAuthorizationCode(value: string): boolean {
  return value.length > 0 && value.length <= 4_096 && !/[\r\n\u0000]/.test(value);
}

function isVerifiedSubject(value: string): boolean {
  return value.length > 0 && value.length <= 1_024 && !/[\r\n\u0000]/.test(value);
}

function isBindingWithinScope(
  binding: ActivePilotBinding | null,
  fixedPilotScopeId: string,
): binding is ActivePilotBinding {
  return Boolean(binding && binding.active && binding.pilotScopeId === fixedPilotScopeId);
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1_000);
}
