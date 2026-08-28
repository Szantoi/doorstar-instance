import { describe, expect, it } from "vitest";
import {
  createPilotBffRuntime,
  createRuntimePilotPgPool,
  type PilotAuthLogger,
  type PilotPgClient,
  type PilotPgPool,
  type PilotPgQueryResult,
  type PilotPgRow,
} from "../src/index.js";
import { testConfig, testRuntimeDatabaseUrl } from "./testDoubles.js";

const scopeId = "00000000-0000-4000-8000-000000000001";

describe("createPilotBffRuntime", () => {
  it("constructs a complete structured pool config with certificate verification", () => {
    const pool = new RuntimePool();
    let receivedOptions: unknown;

    const result = createRuntimePilotPgPool(testConfig.runtimeDatabase, (options) => {
      receivedOptions = options;
      return pool;
    });

    expect(result).toBe(pool);
    expect(receivedOptions).toEqual({
      host: "127.0.0.1",
      port: 5432,
      database: "doorstar_pilot",
      user: "runtime",
      password: "password",
      ssl: { rejectUnauthorized: true },
    });
    expect(receivedOptions).not.toHaveProperty("connectionString");

    expect(() => createRuntimePilotPgPool({
      ...testConfig.runtimeDatabase,
      port: 0,
    })).toThrow("runtime_database_connection_invalid");
  });

  it("composes real source adapters, performs scope preflight and exposes an idempotent close without listening", async () => {
    const pool = new RuntimePool();
    const runtime = await createPilotBffRuntime({
      environment: runtimeEnvironment(),
      pool,
      logger: noOpLogger,
      oidc: {
        fetch: async () => {
          throw new Error("OIDC must not be called during composition");
        },
      },
      directory: {
        fetch: async () => {
          throw new Error("Keycloak management must not be called during composition");
        },
      },
    });

    expect(runtime.config.fixedScopeKey).toBe("doorstar-pilot");
    expect(pool.calls).toContain("SELECT pilot.pilot_runtime_preflight_v1()");
    expect(pool.endCalls).toBe(0);

    await runtime.close();
    await runtime.close();

    expect(pool.endCalls).toBe(1);
  });
});

class RuntimePool implements PilotPgPool {
  public readonly calls: string[] = [];
  public endCalls = 0;

  public async connect(): Promise<PilotPgClient> {
    return new RuntimeClient(this.calls);
  }

  public async end(): Promise<void> {
    this.endCalls += 1;
  }
}

class RuntimeClient implements PilotPgClient {
  public constructor(private readonly calls: string[]) {}

  public async query<Row extends PilotPgRow = PilotPgRow>(
    text: string,
    _values?: readonly unknown[],
  ): Promise<PilotPgQueryResult<Row>> {
    this.calls.push(text);
    const rows: readonly PilotPgRow[] = text.includes('FROM pilot."PilotScope"')
      ? [{ id: scopeId, scopeKey: "doorstar-pilot" }]
      : [];
    return { rows: rows as readonly Row[], rowCount: rows.length };
  }

  public release(_error?: Error): void {}
}

const noOpLogger: PilotAuthLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function runtimeEnvironment(): NodeJS.ProcessEnv {
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
    DOORSTAR_PILOT_KEYCLOAK_ADMIN_REALM_BASE_URL: testConfig.keycloakAdmin.realmAdminBaseUrl,
    DOORSTAR_PILOT_KEYCLOAK_ADMIN_CLIENT_ID: testConfig.keycloakAdmin.clientId,
    DOORSTAR_PILOT_KEYCLOAK_ADMIN_CLIENT_SECRET: testConfig.keycloakAdmin.clientSecret,
    DOORSTAR_PILOT_TRANSACTION_TTL_SECONDS: String(testConfig.transactionTtlSeconds),
    DOORSTAR_PILOT_SESSION_TTL_SECONDS: String(testConfig.sessionTtlSeconds),
    DOORSTAR_PILOT_BROWSER_BINDING_TTL_SECONDS: String(testConfig.browserBindingTtlSeconds),
    DOORSTAR_PILOT_POST_LOGIN_PATH: testConfig.postLoginRedirectPath,
  };
}
