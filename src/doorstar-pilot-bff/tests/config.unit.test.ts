import { describe, expect, it } from "vitest";
import {
  loadPilotBffConfig,
  PilotBffConfigurationError,
  validatePilotBffConfig,
} from "../src/index.js";
import { testConfig, testRuntimeDatabaseUrl } from "./testDoubles.js";

describe("pilot BFF configuration", () => {
  it("fails closed when a required setting is missing", () => {
    expect(() => loadPilotBffConfig({})).toThrow(PilotBffConfigurationError);
  });

  it("rejects a callback that is not the configured host-only auth callback", () => {
    expect(() => validatePilotBffConfig({
      ...testConfig,
      oidc: { ...testConfig.oidc, redirectUri: "https://attacker.example.invalid/auth/callback" },
    })).toThrow("oidc_redirect_uri_not_auth_callback");
  });

  it("requires HTTPS and the openid scope", () => {
    expect(() => validatePilotBffConfig({
      ...testConfig,
      publicOrigin: "http://doorstar.example.invalid",
    })).toThrow("public_origin_invalid");
    expect(() => validatePilotBffConfig({
      ...testConfig,
      oidc: { ...testConfig.oidc, requestedScopes: ["profile"] },
    })).toThrow("oidc_scopes_invalid");
  });

  it("parses only the named complete runtime DSN into an explicit connection", () => {
    const environment = validEnvironment();

    expect(loadPilotBffConfig(environment).runtimeDatabase).toEqual(
      testConfig.runtimeDatabase,
    );
    expect(loadPilotBffConfig(environment)).not.toHaveProperty("runtimeDatabaseUrl");
  });

  it("rejects bootstrap and generic DSN variables in the BFF process", () => {
    const environment = validEnvironment();

    expect(() => loadPilotBffConfig({
      ...environment,
      DOORSTAR_PILOT_BOOTSTRAP_DATABASE_URL: "postgresql://bootstrap:password@127.0.0.1:5432/doorstar_pilot",
    })).toThrow("forbidden_runtime_database_variable_doorstar_pilot_bootstrap_database_url");
    expect(() => loadPilotBffConfig({
      ...environment,
      PILOT_BOOTSTRAP_DATABASE_URL: "postgresql://bootstrap:password@127.0.0.1:5432/doorstar_pilot",
    })).toThrow("forbidden_runtime_database_variable_pilot_bootstrap_database_url");
    expect(() => loadPilotBffConfig({
      ...environment,
      DATABASE_URL: testRuntimeDatabaseUrl,
    })).toThrow("forbidden_runtime_database_variable_database_url");
  });

  it("rejects every ambient PG* variable so node-postgres cannot inherit it", () => {
    expect(() => loadPilotBffConfig({
      ...validEnvironment(),
      PGSSLMODE: "disable",
    })).toThrow("forbidden_ambient_postgres_variable");
    expect(() => loadPilotBffConfig({
      ...validEnvironment(),
      pgpassfile: "C:\\not-used\\.pgpass",
    })).toThrow("forbidden_ambient_postgres_variable");
  });

  it.each([
    ["missing port", "postgresql://runtime:password@127.0.0.1/doorstar_pilot"],
    ["missing database", "postgresql://runtime:password@127.0.0.1:5432"],
    ["missing user", "postgresql://:password@127.0.0.1:5432/doorstar_pilot"],
    ["missing password", "postgresql://runtime@127.0.0.1:5432/doorstar_pilot"],
  ])("rejects a runtime DSN with %s", (_description, runtimeDatabaseUrl) => {
    expect(() => loadPilotBffConfig({
      ...validEnvironment(),
      DOORSTAR_PILOT_RUNTIME_DATABASE_URL: runtimeDatabaseUrl,
    })).toThrow("runtime_database_url_invalid");
  });

  it.each([
    ["query", `${testRuntimeDatabaseUrl}?sslmode=disable`],
    ["fragment", `${testRuntimeDatabaseUrl}#ignored`],
  ])("rejects a runtime DSN %s", (_description, runtimeDatabaseUrl) => {
    expect(() => loadPilotBffConfig({
      ...validEnvironment(),
      DOORSTAR_PILOT_RUNTIME_DATABASE_URL: runtimeDatabaseUrl,
    })).toThrow("runtime_database_url_invalid");
  });

  it("requires independently supplied 32-byte base64url keys and an explicit ID-token allowlist", () => {
    const environment = validEnvironment();

    expect(() => loadPilotBffConfig({
      ...environment,
      DOORSTAR_PILOT_ENCRYPTION_KEY_BASE64URL: "short",
    })).toThrow("invalid_doorstar_pilot_encryption_key_base64url");
    expect(() => validatePilotBffConfig({
      ...testConfig,
      oidc: { ...testConfig.oidc, idTokenAlgorithms: ["HS256" as never] },
    })).toThrow("oidc_id_token_algorithms_invalid");
  });
});

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    DOORSTAR_PILOT_PUBLIC_ORIGIN: testConfig.publicOrigin,
    DOORSTAR_PILOT_SCOPE_KEY: testConfig.fixedScopeKey,
    DOORSTAR_PILOT_RUNTIME_DATABASE_URL: testRuntimeDatabaseUrl,
    DOORSTAR_PILOT_ENCRYPTION_KEY_BASE64URL: Buffer.from(testConfig.crypto.encryptionKey).toString("base64url"),
    DOORSTAR_PILOT_SUBJECT_DIGEST_KEY_BASE64URL: Buffer.from(testConfig.crypto.subjectDigestKey).toString("base64url"),
    DOORSTAR_PILOT_OIDC_ISSUER: testConfig.oidc.issuer,
    DOORSTAR_PILOT_OIDC_AUTHORIZATION_ENDPOINT: testConfig.oidc.authorizationEndpoint,
    DOORSTAR_PILOT_OIDC_TOKEN_ENDPOINT: testConfig.oidc.tokenEndpoint,
    DOORSTAR_PILOT_OIDC_JWKS_URL: testConfig.oidc.jwksUrl,
    DOORSTAR_PILOT_OIDC_CLIENT_ID: testConfig.oidc.clientId,
    DOORSTAR_PILOT_OIDC_CLIENT_SECRET: testConfig.oidc.clientSecret,
    DOORSTAR_PILOT_OIDC_REDIRECT_URI: testConfig.oidc.redirectUri,
    DOORSTAR_PILOT_OIDC_SCOPES: testConfig.oidc.requestedScopes.join(","),
    DOORSTAR_PILOT_OIDC_ID_TOKEN_ALGORITHMS: testConfig.oidc.idTokenAlgorithms.join(","),
    DOORSTAR_PILOT_TRANSACTION_TTL_SECONDS: String(testConfig.transactionTtlSeconds),
    DOORSTAR_PILOT_SESSION_TTL_SECONDS: String(testConfig.sessionTtlSeconds),
    DOORSTAR_PILOT_BROWSER_BINDING_TTL_SECONDS: String(testConfig.browserBindingTtlSeconds),
    DOORSTAR_PILOT_POST_LOGIN_PATH: testConfig.postLoginRedirectPath,
  };
}
