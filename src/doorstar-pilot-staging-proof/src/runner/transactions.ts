import type { Pool, PoolClient } from "pg";
import { A03ProofError } from "./a03Config.js";

export type PreflightKind = "runtime" | "bootstrap";

/**
 * Every writer proof has one checked-out client and one SERIALIZABLE
 * transaction. The scope GUC is always transaction-local, mirroring the BFF
 * and bootstrap adapters rather than relying on a session-level setting.
 */
export async function withScopedSerializableTransaction<T>(
  pool: Pool,
  scopeId: string,
  preflight: PreflightKind,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    transactionOpen = true;
    await client.query(
      "SELECT pg_catalog.set_config('app.current_pilot_scope_id', $1, true)",
      [scopeId],
    );
    await client.query(`SELECT pilot.pilot_${preflight}_preflight_v1()`);
    const result = await work(client);
    await client.query("COMMIT");
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) await safeRollback(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function backendPid(client: PoolClient): Promise<number> {
  const result = await client.query<{ pid: number }>("SELECT pg_catalog.pg_backend_pid() AS pid");
  const pid = result.rows[0]?.pid;
  if (!Number.isInteger(pid) || pid <= 0) throw new A03ProofError("a03_backend_pid_invalid");
  return pid;
}

export async function expectPostgresFailure(
  work: () => Promise<unknown>,
  acceptedCodes: readonly string[],
  failureCode: string,
): Promise<string> {
  try {
    await work();
  } catch (error) {
    const code = postgresErrorCode(error);
    if (code !== undefined && acceptedCodes.includes(code)) return code;
    throw new A03ProofError(failureCode);
  }
  throw new A03ProofError(failureCode);
}

export function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the primary proof failure and release the checked-out client.
  }
}
