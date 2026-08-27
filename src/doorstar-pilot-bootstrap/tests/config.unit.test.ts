import { describe, expect, it } from "vitest";

import {
  loadPilotBootstrapConfig,
  PilotBootstrapConfigurationError,
} from "../src/config/bootstrapConfig.js";

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    PILOT_BOOTSTRAP_DATABASE_URL:
      "postgresql://bootstrap_user:top-secret@db.internal:5432/doorstar_pilot",
    DOORSTAR_PILOT_SCOPE_KEY: "doorstar-pilot",
  };
}

describe("loadPilotBootstrapConfig", () => {
  it("accepts exactly the dedicated bootstrap DSN and server scope key", () => {
    const config = loadPilotBootstrapConfig(validEnvironment());

    expect(config.fixedScopeKey).toBe("doorstar-pilot");
    expect(config.bootstrapDatabase).toEqual({
      host: "db.internal",
      port: 5432,
      database: "doorstar_pilot",
      user: "bootstrap_user",
      password: "top-secret",
    });
  });

  it("fails closed when the runtime identity is also configured", () => {
    const environment = validEnvironment();
    environment.DOORSTAR_PILOT_RUNTIME_DATABASE_URL = "postgresql://runtime@db.internal/pilot";

    expect(() => loadPilotBootstrapConfig(environment)).toThrow(
      new PilotBootstrapConfigurationError(
        "forbidden_bootstrap_database_variable_doorstar_pilot_runtime_database_url",
      ),
    );
  });

  it.each(["DATABASE_URL", "DOORSTAR_PILOT_DATABASE_URL"])(
    "rejects ambiguous %s database configuration",
    (variableName) => {
      const environment = validEnvironment();
      environment[variableName] = "postgresql://ambiguous@db.internal/pilot";

      expect(() => loadPilotBootstrapConfig(environment)).toThrow(PilotBootstrapConfigurationError);
    },
  );

  it.each(["PGUSER", "PGPASSWORD", "PGOPTIONS", "PGSSLMODE"])(
    "rejects ambient PostgreSQL fallback variable %s",
    (variableName) => {
      const environment = validEnvironment();
      environment[variableName] = "ambient-value";

      expect(() => loadPilotBootstrapConfig(environment)).toThrow(
        new PilotBootstrapConfigurationError("forbidden_ambient_postgres_variable"),
      );
    },
  );

  it("rejects a missing dedicated DSN and a caller-selected scope format", () => {
    const missingDsn = validEnvironment();
    delete missingDsn.PILOT_BOOTSTRAP_DATABASE_URL;
    expect(() => loadPilotBootstrapConfig(missingDsn)).toThrow(
      new PilotBootstrapConfigurationError("missing_pilot_bootstrap_database_url"),
    );

    const invalidScope = validEnvironment();
    invalidScope.DOORSTAR_PILOT_SCOPE_KEY = "../other-scope";
    expect(() => loadPilotBootstrapConfig(invalidScope)).toThrow(
      new PilotBootstrapConfigurationError("fixed_scope_key_invalid"),
    );
  });

  it.each([
    "postgresql://bootstrap_user:top-secret@db.internal/doorstar_pilot",
    "postgresql://bootstrap_user@db.internal:5432/doorstar_pilot",
    "postgresql://bootstrap_user:top-secret@db.internal:5432/doorstar_pilot?sslmode=no-verify",
  ])("rejects incomplete or option-bearing bootstrap URI %s", (databaseUrl) => {
    const environment = validEnvironment();
    environment.PILOT_BOOTSTRAP_DATABASE_URL = databaseUrl;

    expect(() => loadPilotBootstrapConfig(environment)).toThrow(
      new PilotBootstrapConfigurationError("bootstrap_database_url_invalid"),
    );
  });
});
