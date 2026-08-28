import { Buffer } from "node:buffer";

/** Only asymmetric ID-token algorithms accepted by this OIDC BFF. */
export const approvedOidcIdTokenAlgorithms = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
] as const;

export type ApprovedOidcIdTokenAlgorithm = typeof approvedOidcIdTokenAlgorithms[number];

/**
 * Configuration is deliberately complete: no security-relevant default is
 * supplied by this module. A composition root must fail before opening a
 * listener when a value is absent or malformed.
 *
 * The named runtime DSN is parsed once into a complete, structured connection
 * value. The PostgreSQL adapter receives that value rather than a URI, so it
 * cannot fill omitted settings from `PG*` variables or a `.pgpass` fallback.
 * The bootstrap identity is deliberately a separate executable/configuration
 * boundary and cannot be selected as a fallback here.
 */
export type PilotRuntimeDatabaseConnection = Readonly<{
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}>;

export type PilotBffConfig = Readonly<{
  publicOrigin: string;
  fixedScopeKey: string;
  runtimeDatabase: PilotRuntimeDatabaseConnection;
  crypto: Readonly<{
    encryptionKey: Uint8Array;
    subjectDigestKey: Uint8Array;
  }>;
  oidc: Readonly<{
    issuer: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    jwksUrl: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    requestedScopes: readonly string[];
    idTokenAlgorithms: readonly ApprovedOidcIdTokenAlgorithm[];
  }>;
  /**
   * Separate, server-only Keycloak service account for named-user creation
   * and invitation delivery. It is never an OIDC browser client.
   */
  keycloakAdmin: Readonly<{
    realmAdminBaseUrl: string;
    clientId: string;
    clientSecret: string;
  }>;
  transactionTtlSeconds: number;
  sessionTtlSeconds: number;
  browserBindingTtlSeconds: number;
  postLoginRedirectPath: string;
}>;

export class PilotBffConfigurationError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "PilotBffConfigurationError";
  }
}

const scopeKeyPattern = /^[a-z][a-z0-9-]{2,79}$/;
const scopeNamePattern = /^[A-Za-z0-9._:-]{1,80}$/;
const approvedAlgorithmSet = new Set<string>(approvedOidcIdTokenAlgorithms);
const forbiddenRuntimeDsnVariables = [
  "PILOT_BOOTSTRAP_DATABASE_URL",
  "DOORSTAR_PILOT_BOOTSTRAP_DATABASE_URL",
  "DOORSTAR_PILOT_DATABASE_URL",
  "DATABASE_URL",
  "DB_URL",
  "POSTGRES_URL",
  "POSTGRESQL_URL",
] as const;
const databaseNamePattern = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,62}$/;
const databaseUserPattern = /^[a-z][a-z0-9_]{0,62}$/;
const controlCharacterPattern = /[\u0000\r\n]/;

export function loadPilotBffConfig(environment: NodeJS.ProcessEnv): PilotBffConfig {
  rejectBootstrapAndAmbientPostgresVariables(environment);

  return validatePilotBffConfig({
    publicOrigin: requiredEnvironment(environment, "DOORSTAR_PILOT_PUBLIC_ORIGIN"),
    fixedScopeKey: requiredEnvironment(environment, "DOORSTAR_PILOT_SCOPE_KEY"),
    runtimeDatabase: requireRuntimeDatabaseConnection(
      requiredEnvironment(environment, "DOORSTAR_PILOT_RUNTIME_DATABASE_URL"),
      "runtime_database_url_invalid",
    ),
    crypto: {
      encryptionKey: requiredBase64UrlKey(
        environment,
        "DOORSTAR_PILOT_ENCRYPTION_KEY_BASE64URL",
      ),
      subjectDigestKey: requiredBase64UrlKey(
        environment,
        "DOORSTAR_PILOT_SUBJECT_DIGEST_KEY_BASE64URL",
      ),
    },
    oidc: {
      issuer: requiredEnvironment(environment, "DOORSTAR_PILOT_OIDC_ISSUER"),
      authorizationEndpoint: requiredEnvironment(
        environment,
        "DOORSTAR_PILOT_OIDC_AUTHORIZATION_ENDPOINT",
      ),
      tokenEndpoint: requiredEnvironment(environment, "DOORSTAR_PILOT_OIDC_TOKEN_ENDPOINT"),
      jwksUrl: requiredEnvironment(environment, "DOORSTAR_PILOT_OIDC_JWKS_URL"),
      clientId: requiredEnvironment(environment, "DOORSTAR_PILOT_OIDC_CLIENT_ID"),
      clientSecret: requiredEnvironment(environment, "DOORSTAR_PILOT_OIDC_CLIENT_SECRET"),
      redirectUri: requiredEnvironment(environment, "DOORSTAR_PILOT_OIDC_REDIRECT_URI"),
      requestedScopes: requiredEnvironment(environment, "DOORSTAR_PILOT_OIDC_SCOPES")
        .split(",")
        .map((scope) => scope.trim()),
      idTokenAlgorithms: requiredEnvironment(environment, "DOORSTAR_PILOT_OIDC_ID_TOKEN_ALGORITHMS")
        .split(",")
        .map((algorithm) => algorithm.trim()) as ApprovedOidcIdTokenAlgorithm[],
    },
    keycloakAdmin: {
      realmAdminBaseUrl: requiredEnvironment(
        environment,
        "DOORSTAR_PILOT_KEYCLOAK_ADMIN_REALM_BASE_URL",
      ),
      clientId: requiredEnvironment(environment, "DOORSTAR_PILOT_KEYCLOAK_ADMIN_CLIENT_ID"),
      clientSecret: requiredEnvironment(
        environment,
        "DOORSTAR_PILOT_KEYCLOAK_ADMIN_CLIENT_SECRET",
      ),
    },
    transactionTtlSeconds: requiredInteger(
      environment,
      "DOORSTAR_PILOT_TRANSACTION_TTL_SECONDS",
    ),
    sessionTtlSeconds: requiredInteger(environment, "DOORSTAR_PILOT_SESSION_TTL_SECONDS"),
    browserBindingTtlSeconds: requiredInteger(
      environment,
      "DOORSTAR_PILOT_BROWSER_BINDING_TTL_SECONDS",
    ),
    postLoginRedirectPath: requiredEnvironment(environment, "DOORSTAR_PILOT_POST_LOGIN_PATH"),
  });
}

export function validatePilotBffConfig(input: PilotBffConfig): PilotBffConfig {
  const publicOrigin = requireHttpsOrigin(input.publicOrigin, "public_origin_invalid");
  const fixedScopeKey = input.fixedScopeKey.trim();
  if (!scopeKeyPattern.test(fixedScopeKey)) {
    throw new PilotBffConfigurationError("fixed_scope_key_invalid");
  }
  const runtimeDatabase = validatePilotRuntimeDatabaseConnection(
    input.runtimeDatabase,
    "runtime_database_connection_invalid",
  );

  const issuer = requireHttpsUrl(input.oidc.issuer, "oidc_issuer_invalid");
  const authorizationEndpoint = requireHttpsUrl(
    input.oidc.authorizationEndpoint,
    "oidc_authorization_endpoint_invalid",
  );
  const tokenEndpoint = requireHttpsUrl(input.oidc.tokenEndpoint, "oidc_token_endpoint_invalid");
  const jwksUrl = requireHttpsUrl(input.oidc.jwksUrl, "oidc_jwks_url_invalid");
  const redirectUri = requireHttpsUrl(input.oidc.redirectUri, "oidc_redirect_uri_invalid");
  const redirectUrl = new URL(redirectUri);
  if (
    redirectUrl.origin !== publicOrigin
    || redirectUrl.pathname !== "/auth/callback"
    || redirectUrl.search
    || redirectUrl.hash
  ) {
    throw new PilotBffConfigurationError("oidc_redirect_uri_not_auth_callback");
  }

  const clientId = input.oidc.clientId.trim();
  if (!clientId || clientId.length > 200 || /[\r\n\u0000]/.test(clientId)) {
    throw new PilotBffConfigurationError("oidc_client_id_invalid");
  }
  const clientSecret = input.oidc.clientSecret;
  if (!clientSecret || clientSecret.length > 4_096 || /[\r\n\u0000]/.test(clientSecret)) {
    throw new PilotBffConfigurationError("oidc_client_secret_invalid");
  }

  const keycloakAdmin = validateKeycloakAdminConfiguration(
    input.keycloakAdmin,
    issuer,
    tokenEndpoint,
  );
  if (keycloakAdmin.clientId === clientId) {
    throw new PilotBffConfigurationError("keycloak_admin_client_must_be_distinct");
  }

  const requestedScopes = [...input.oidc.requestedScopes];
  if (
    requestedScopes.length === 0
    || requestedScopes.length > 12
    || requestedScopes.some((scope) => !scopeNamePattern.test(scope))
    || new Set(requestedScopes).size !== requestedScopes.length
    || !requestedScopes.includes("openid")
  ) {
    throw new PilotBffConfigurationError("oidc_scopes_invalid");
  }

  const idTokenAlgorithms = [...input.oidc.idTokenAlgorithms];
  if (
    idTokenAlgorithms.length === 0
    || idTokenAlgorithms.length > 4
    || idTokenAlgorithms.some((algorithm) => !approvedAlgorithmSet.has(algorithm))
    || new Set(idTokenAlgorithms).size !== idTokenAlgorithms.length
  ) {
    throw new PilotBffConfigurationError("oidc_id_token_algorithms_invalid");
  }

  const encryptionKey = requireThirtyTwoByteKey(
    input.crypto.encryptionKey,
    "encryption_key_invalid",
  );
  const subjectDigestKey = requireThirtyTwoByteKey(
    input.crypto.subjectDigestKey,
    "subject_digest_key_invalid",
  );

  const transactionTtlSeconds = requireDuration(
    input.transactionTtlSeconds,
    "transaction_ttl_invalid",
    60,
    900,
  );
  const sessionTtlSeconds = requireDuration(
    input.sessionTtlSeconds,
    "session_ttl_invalid",
    300,
    43_200,
  );
  const browserBindingTtlSeconds = requireDuration(
    input.browserBindingTtlSeconds,
    "browser_binding_ttl_invalid",
    transactionTtlSeconds,
    172_800,
  );

  const postLoginRedirectPath = input.postLoginRedirectPath.trim();
  if (
    !postLoginRedirectPath.startsWith("/")
    || postLoginRedirectPath.startsWith("//")
    || postLoginRedirectPath.includes("\\")
    || postLoginRedirectPath.includes("\r")
    || postLoginRedirectPath.includes("\n")
  ) {
    throw new PilotBffConfigurationError("post_login_redirect_invalid");
  }

  return Object.freeze({
    publicOrigin,
    fixedScopeKey,
    runtimeDatabase,
    crypto: Object.freeze({
      encryptionKey,
      subjectDigestKey,
    }),
    oidc: Object.freeze({
      issuer,
      authorizationEndpoint,
      tokenEndpoint,
      jwksUrl,
      clientId,
      clientSecret,
      redirectUri,
      requestedScopes: Object.freeze(requestedScopes),
      idTokenAlgorithms: Object.freeze(idTokenAlgorithms),
    }),
    keycloakAdmin,
    transactionTtlSeconds,
    sessionTtlSeconds,
    browserBindingTtlSeconds,
    postLoginRedirectPath,
  });
}

function validateKeycloakAdminConfiguration(
  input: PilotBffConfig["keycloakAdmin"],
  issuer: string,
  tokenEndpoint: string,
): PilotBffConfig["keycloakAdmin"] {
  const issuerUrl = new URL(issuer);
  // Keycloak deployments commonly publish OIDC below a relative path such as
  // `/auth/realms/{realm}` while reverse-proxying administration separately at
  // `/admin/realms/{realm}`. Preserve the same-origin, realm-specific binding
  // instead of requiring one accidental path layout.
  const realmMatch = /^((?:\/[A-Za-z0-9._-]+)*)\/realms\/([A-Za-z0-9._-]{1,120})$/.exec(
    issuerUrl.pathname,
  );
  if (!realmMatch) {
    throw new PilotBffConfigurationError("oidc_issuer_not_keycloak_realm");
  }
  const issuerPrefix = realmMatch[1];
  const realmName = realmMatch[2];
  const expectedTokenEndpoint = `${issuer}/protocol/openid-connect/token`;
  if (tokenEndpoint !== expectedTokenEndpoint) {
    throw new PilotBffConfigurationError("keycloak_admin_token_endpoint_mismatch");
  }
  const realmAdminBaseUrl = requireHttpsUrl(
    input?.realmAdminBaseUrl,
    "keycloak_admin_realm_base_url_invalid",
  );
  const realmAdminUrl = new URL(realmAdminBaseUrl);
  const permittedAdminPaths = new Set([
    `/admin/realms/${realmName}`,
    `${issuerPrefix}/admin/realms/${realmName}`,
  ]);
  if (
    realmAdminUrl.origin !== issuerUrl.origin
    || !permittedAdminPaths.has(realmAdminUrl.pathname)
  ) {
    throw new PilotBffConfigurationError("keycloak_admin_realm_base_url_mismatch");
  }
  const clientId = requireClientId(
    input?.clientId,
    "keycloak_admin_client_id_invalid",
  );
  const clientSecret = requireClientSecret(
    input?.clientSecret,
    "keycloak_admin_client_secret_invalid",
  );
  return Object.freeze({ realmAdminBaseUrl, clientId, clientSecret });
}

function rejectBootstrapAndAmbientPostgresVariables(environment: NodeJS.ProcessEnv): void {
  for (const variableName of forbiddenRuntimeDsnVariables) {
    if (environment[variableName] !== undefined) {
      throw new PilotBffConfigurationError(
        `forbidden_runtime_database_variable_${variableName.toLowerCase()}`,
      );
    }
  }
  for (const variableName of Object.keys(environment)) {
    if (variableName.toUpperCase().startsWith("PG")) {
      throw new PilotBffConfigurationError("forbidden_ambient_postgres_variable");
    }
  }
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new PilotBffConfigurationError(`missing_${name.toLowerCase()}`);
  }
  return value;
}

function requireClientId(value: unknown, code: string): string {
  if (typeof value !== "string" || !value || value.length > 200 || /[\r\n\u0000]/.test(value)) {
    throw new PilotBffConfigurationError(code);
  }
  return value.trim();
}

function requireClientSecret(value: unknown, code: string): string {
  if (typeof value !== "string" || !value || value.length > 4_096 || /[\r\n\u0000]/.test(value)) {
    throw new PilotBffConfigurationError(code);
  }
  return value;
}

function requiredInteger(environment: NodeJS.ProcessEnv, name: string): number {
  const raw = requiredEnvironment(environment, name);
  if (!/^[0-9]+$/.test(raw)) {
    throw new PilotBffConfigurationError(`invalid_${name.toLowerCase()}`);
  }
  return Number(raw);
}

function requiredBase64UrlKey(environment: NodeJS.ProcessEnv, name: string): Uint8Array {
  const value = requiredEnvironment(environment, name);
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new PilotBffConfigurationError(`invalid_${name.toLowerCase()}`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== 32 || decoded.toString("base64url") !== value) {
    throw new PilotBffConfigurationError(`invalid_${name.toLowerCase()}`);
  }
  return Uint8Array.from(decoded);
}

function requireThirtyTwoByteKey(value: Uint8Array, code: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
    throw new PilotBffConfigurationError(code);
  }
  return Uint8Array.from(value);
}

function requireHttpsOrigin(value: string, code: string): string {
  const parsed = parseUrl(value, code);
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new PilotBffConfigurationError(code);
  }
  return parsed.origin;
}

function requireHttpsUrl(value: string, code: string): string {
  const parsed = parseUrl(value, code);
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    throw new PilotBffConfigurationError(code);
  }
  return parsed.toString();
}

/**
 * A connection URI is a configuration transport only. It must name every
 * runtime field explicitly, and is immediately reduced to a structured value
 * before node-postgres is constructed.
 */
function requireRuntimeDatabaseConnection(
  value: string,
  code: string,
): PilotRuntimeDatabaseConnection {
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
      || !parsed.hostname
      || !parsed.port
      || parsed.search
      || parsed.hash
    ) {
      throw new PilotBffConfigurationError(code);
    }

    const port = Number(parsed.port);
    const user = decodeUriComponent(parsed.username, code);
    const password = decodeUriComponent(parsed.password, code);
    const database = decodeUriComponent(parsed.pathname.slice(1), code);
    if (
      !Number.isSafeInteger(port)
      || port < 1
      || port > 65_535
      || !databaseNamePattern.test(database)
      || !databaseUserPattern.test(user)
      || !password
      || password.length > 4_096
      || controlCharacterPattern.test(password)
    ) {
      throw new PilotBffConfigurationError(code);
    }

    return Object.freeze({
      host: parsed.hostname,
      port,
      database,
      user,
      password,
    });
  } catch (error) {
    if (error instanceof PilotBffConfigurationError) {
      throw error;
    }
    throw new PilotBffConfigurationError(code);
  }
}

/** Validates a structured connection before it is ever passed to node-postgres. */
export function validatePilotRuntimeDatabaseConnection(
  value: PilotRuntimeDatabaseConnection,
  code = "runtime_database_connection_invalid",
): PilotRuntimeDatabaseConnection {
  const host = requireRuntimeDatabaseText(value?.host, 253, code);
  const database = requireRuntimeDatabaseText(value?.database, 63, code);
  const user = requireRuntimeDatabaseText(value?.user, 63, code);
  const password = requireRuntimeDatabaseText(value?.password, 4_096, code);
  if (
    !databaseNamePattern.test(database)
    || !databaseUserPattern.test(user)
    || !Number.isSafeInteger(value?.port)
    || value.port < 1
    || value.port > 65_535
  ) {
    throw new PilotBffConfigurationError(code);
  }
  return Object.freeze({
    host,
    port: value.port,
    database,
    user,
    password,
  });
}

function requireRuntimeDatabaseText(value: unknown, maximumLength: number, code: string): string {
  if (
    typeof value !== "string"
    || !value
    || value.length > maximumLength
    || value !== value.trim()
    || controlCharacterPattern.test(value)
  ) {
    throw new PilotBffConfigurationError(code);
  }
  return value;
}

function decodeUriComponent(value: string, code: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new PilotBffConfigurationError(code);
  }
}

function requireDuration(value: number, code: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new PilotBffConfigurationError(code);
  }
  return value;
}

function parseUrl(value: string, code: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new PilotBffConfigurationError(code);
  }
}
