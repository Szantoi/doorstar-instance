/**
 * Liveness and readiness stay separate: a running Node process can be alive
 * while its production database is unavailable. This service has no business
 * policy and never exposes a database error to callers.
 */
export async function isServiceReady(runDatabaseProbe: () => Promise<unknown>): Promise<boolean> {
  try {
    await runDatabaseProbe();
    return true;
  } catch {
    return false;
  }
}
