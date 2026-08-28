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

/**
 * Defensive child environment for Git. Filtering forbidden names alone would
 * still retain HOME/XDG configuration and arbitrary executable-routing state,
 * so this is a small platform launch allowlist instead.
 */
export function sanitizedSourceEnvironment(environment) {
  const allowedNames = process.platform === "win32"
    ? ["PATH", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP"]
    : ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TMP", "TEMP"];
  const childEnvironment = {};
  for (const allowedName of allowedNames) {
    const matchingEntry = Object.entries(environment).find(([name, value]) => (
      name.toUpperCase() === allowedName.toUpperCase() && typeof value === "string"
    ));
    if (matchingEntry !== undefined) childEnvironment[allowedName] = matchingEntry[1];
  }
  // System/global configuration can execute helpers or reinterpret a Git
  // read. This is a fixed child control, never inherited user input.
  childEnvironment.GIT_CONFIG_NOSYSTEM = "1";
  childEnvironment.GIT_TERMINAL_PROMPT = "0";
  return Object.freeze(childEnvironment);
}
