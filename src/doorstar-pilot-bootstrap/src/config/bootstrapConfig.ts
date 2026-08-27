/**
 * The bootstrap process is deliberately a separate DB-identity boundary from
 * the BFF. This module rejects ambiguous DSN variables rather than silently
 * selecting one, because falling back to a runtime identity would collapse
 * the audit-source separation enforced by the P1 database policy.
 */
export type BootstrapDatabaseConnection = Readonly<{
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}>;

export type PilotBootstrapConfig = Readonly<{
  bootstrapDatabase: BootstrapDatabaseConnection;
  fixedScopeKey: string;
}>;

export type PilotBootstrapConfigInput = Readonly<{
  bootstrapDatabaseUrl: string;
  fixedScopeKey: string;
}>;

export class PilotBootstrapConfigurationError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "PilotBootstrapConfigurationError";
  }
}

const scopeKeyPattern = /^[a-z][a-z0-9-]{2,79}$/;
const forbiddenDatabaseVariables = [
  "DOORSTAR_PILOT_RUNTIME_DATABASE_URL",
  "DOORSTAR_PILOT_DATABASE_URL",
  "DATABASE_URL",
] as const;
const ambientPostgresVariablePattern = /^PG[A-Z0-9_]*$/i;
const databaseNamePattern = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,62}$/;
const databaseUserPattern = /^[a-z][a-z0-9_]{0,62}$/;
const controlCharacterPattern = /[\u0000\r\n]/;

/** Loads only the dedicated bootstrap DSN and a fixed server scope key. */
export function loadPilotBootstrapConfig(environment: NodeJS.ProcessEnv): PilotBootstrapConfig {
  for (const variableName of forbiddenDatabaseVariables) {
    if (environment[variableName] !== undefined) {
      throw new PilotBootstrapConfigurationError(
        `forbidden_bootstrap_database_variable_${variableName.toLowerCase()}`,
      );
    }
  }
  for (const variableName of Object.keys(environment)) {
    if (ambientPostgresVariablePattern.test(variableName)) {
      throw new PilotBootstrapConfigurationError("forbidden_ambient_postgres_variable");
    }
  }

  return validatePilotBootstrapConfig({
    bootstrapDatabaseUrl: requiredEnvironment(environment, "PILOT_BOOTSTRAP_DATABASE_URL"),
    fixedScopeKey: requiredEnvironment(environment, "DOORSTAR_PILOT_SCOPE_KEY"),
  });
}

export function validatePilotBootstrapConfig(
  input: PilotBootstrapConfigInput,
): PilotBootstrapConfig {
  const fixedScopeKey = input.fixedScopeKey.trim();
  if (!scopeKeyPattern.test(fixedScopeKey)) {
    throw new PilotBootstrapConfigurationError("fixed_scope_key_invalid");
  }

  return Object.freeze({
    bootstrapDatabase: requireDedicatedBootstrapConnection(
      input.bootstrapDatabaseUrl,
      "bootstrap_database_url_invalid",
    ),
    fixedScopeKey,
  });
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new PilotBootstrapConfigurationError(`missing_${name.toLowerCase()}`);
  }
  return value;
}

/**
 * Parse every connection field ourselves. Passing only a connection string to
 * node-postgres permits omitted URI fields to inherit PG* environment values;
 * the structured result below prevents that ambient identity/config fallback.
 */
function requireDedicatedBootstrapConnection(
  value: string,
  code: string,
): BootstrapDatabaseConnection {
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
      || !parsed.hostname
      || parsed.hash
      || parsed.search
    ) {
      throw new PilotBootstrapConfigurationError(code);
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
      throw new PilotBootstrapConfigurationError(code);
    }

    return Object.freeze({
      host: parsed.hostname,
      port,
      database,
      user,
      password,
    });
  } catch (error) {
    if (error instanceof PilotBootstrapConfigurationError) {
      throw error;
    }
    throw new PilotBootstrapConfigurationError(code);
  }
}

function decodeUriComponent(value: string, code: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new PilotBootstrapConfigurationError(code);
  }
}
