import { fail } from "./errors.mjs";

/**
 * Source verification must not inherit a runtime connection, pilot secret, or
 * Node preload option. Only names are examined; values are never logged.
 */
export function isForbiddenEnvironmentName(name) {
  const normalized = name.toUpperCase();
  return normalized === "DATABASE_URL"
    || normalized === "NODE_OPTIONS"
    || normalized.startsWith("PG")
    || normalized.startsWith("GIT_")
    || normalized.startsWith("DOORSTAR_PILOT_")
    || normalized.startsWith("PILOT_BOOTSTRAP_");
}

export function assertSafeSourceEnvironment(environment) {
  if (Object.keys(environment).some(isForbiddenEnvironmentName)) {
    fail("gate0_forbidden_environment");
  }
}

/** Defensive copy used by child processes after the fail-closed assertion. */
export function sanitizedSourceEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !isForbiddenEnvironmentName(name)),
  );
}
