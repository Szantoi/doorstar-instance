import { isForbiddenEnvironmentName as isGate0ForbiddenEnvironmentName } from "../../doorstar-pilot-gate0/lib/environment.mjs";
import { fail } from "./errors.mjs";

/**
 * This verifier does not call Docker, but it must not inherit endpoint or
 * runtime-routing variables while binding the future Docker executable.
 */
export function isForbiddenGate1EnvironmentName(name) {
  const normalized = name.toUpperCase();
  return isGate0ForbiddenEnvironmentName(name)
    || normalized.startsWith("DOCKER_")
    || normalized === "CONTAINER_HOST"
    || normalized === "CONTAINER_CONNECTION"
    || normalized === "PODMAN_HOST"
    || normalized === "PODMAN_CONNECTION"
    || normalized === "CONTAINERS_CONF";
}

/** Reject ambient source/runtime controls before invoking the Gate 0 verifier. */
export function assertSafeGate1Environment(environment) {
  if (environment === null || typeof environment !== "object"
    || Object.keys(environment).some(isForbiddenGate1EnvironmentName)) {
    fail("gate1_forbidden_environment");
  }
}
