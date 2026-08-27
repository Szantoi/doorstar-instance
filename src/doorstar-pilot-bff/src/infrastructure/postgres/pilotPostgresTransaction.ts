import type { PilotPgClient, PilotPgPool } from "./pilotPostgresContracts.js";

/**
 * A checkout-owned PostgreSQL transaction. Scope is passed only by the server
 * repository and set with `is_local=true`, so a pooled connection cannot carry
 * a prior request's scope to the next checkout.
 */
export class PilotPostgresTransactionRunner {
  public constructor(private readonly pool: PilotPgPool) {}

  public async unscoped<T>(work: (client: PilotPgClient) => Promise<T>): Promise<T> {
    return this.run(undefined, false, work);
  }

  public async scoped<T>(scopeId: string, work: (client: PilotPgClient) => Promise<T>): Promise<T> {
    return this.run(scopeId, true, work);
  }

  private async run<T>(
    scopeId: string | undefined,
    requireRuntimePreflight: boolean,
    work: (client: PilotPgClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    let started = false;
    let releaseError: Error | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      started = true;
      if (scopeId !== undefined) {
        await client.query(
          "SELECT pg_catalog.set_config('app.current_pilot_scope_id', $1, true)",
          [scopeId],
        );
      }
      if (requireRuntimePreflight) {
        await client.query("SELECT pilot.pilot_runtime_preflight_v1()");
      }
      const result = await work(client);
      await client.query("COMMIT");
      started = false;
      return result;
    } catch (error) {
      releaseError = toPoolReleaseError(error);
      if (started) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The caller receives the original failure; release still happens.
        }
      }
      throw error;
    } finally {
      client.release(releaseError);
    }
  }
}

function toPoolReleaseError(error: unknown): Error {
  return error instanceof Error ? error : new Error("pilot_postgres_transaction_failed");
}
