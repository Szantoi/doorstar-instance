// `pg` is CommonJS. A named ESM import type-checks under some test transforms
// but fails when Node evaluates the built ESM CLI; default interop is the
// portable NodeNext boundary.
import pg from "pg";

import type {
  BootstrapProvisionInvocation,
  BootstrapRevokeInvocation,
  PilotBootstrapDatabase,
} from "../application/bootstrapService.js";
import type { BootstrapDatabaseConnection } from "../config/bootstrapConfig.js";
import { normalizeUuid } from "../domain/bootstrapCommand.js";

const { Pool } = pg;

type QueryResult<Row extends Record<string, unknown>> = Readonly<{
  rows: readonly Row[];
}>;

/** Minimal port makes the PostgreSQL transaction ordering unit-testable without a database. */
export interface BootstrapPgClient {
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
  release(error?: Error): void;
}

export interface BootstrapPgPool {
  connect(): Promise<BootstrapPgClient>;
  end(): Promise<void>;
}

export class PilotBootstrapDatabaseError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "PilotBootstrapDatabaseError";
  }
}

/**
 * All methods use exactly one checked-out connection and one serializable
 * transaction. Scope lookup is a fixed parameterized query; mutable state is
 * reached only through the reviewed bootstrap stored routines.
 */
export class PgPilotBootstrapDatabase implements PilotBootstrapDatabase {
  public constructor(
    private readonly pool: BootstrapPgPool,
    private readonly fixedScopeKey: string,
  ) {}

  public async preflight(): Promise<void> {
    await this.withScopedPreflight(async () => undefined);
  }

  public async provision(input: BootstrapProvisionInvocation): Promise<string> {
    return this.withScopedPreflight(async (client) => {
      const result = await client.query<{ bindingId: string }>(
        `SELECT pilot.pilot_bootstrap_provision_binding_v1(
           $1::text,
           $2::text,
           $3::text,
           $4::text,
           $5::pilot."PilotOfficeRole",
           $6::boolean,
           $7::text,
           $8::uuid
         ) AS "bindingId"`,
        [
          input.issuer,
          input.subjectDigest,
          input.actorKey,
          input.displayName,
          input.role,
          input.canManagePilotRoster,
          input.approvalReference,
          input.correlationId,
        ],
      );
      return requireSingleBindingId(result.rows, "bootstrap_provision_result_invalid");
    });
  }

  public async revoke(input: BootstrapRevokeInvocation): Promise<string> {
    return this.withScopedPreflight(async (client) => {
      const result = await client.query<{ bindingId: string }>(
        `SELECT pilot.pilot_bootstrap_revoke_binding_v1(
           $1::uuid,
           $2::integer,
           $3::text,
           $4::uuid
         ) AS "bindingId"`,
        [
          input.bindingId,
          input.expectedAuditVersion,
          input.approvalReference,
          input.correlationId,
        ],
      );
      return requireSingleBindingId(result.rows, "bootstrap_revoke_result_invalid");
    });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  private async withScopedPreflight<Result>(
    operation: (client: BootstrapPgClient) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.pool.connect();
    let transactionStarted = false;
    let discardClient: Error | undefined;
    try {
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        transactionStarted = true;
      } catch (error) {
        // A failed BEGIN leaves the connection state unknown (for example a
        // broken proxy or transport failure). Never return that checkout to
        // node-postgres' pool for a later privileged bootstrap command.
        discardClient = error instanceof Error
          ? error
          : new Error("pilot_bootstrap_begin_failed");
        throw error;
      }

      const scopeResult = await client.query<{ id: string }>(
        'SELECT "id" FROM pilot."PilotScope" WHERE "scopeKey" = $1',
        [this.fixedScopeKey],
      );
      const scopeId = requireSingleScopeId(scopeResult.rows);

      await client.query("SELECT set_config('app.current_pilot_scope_id', $1, true)", [scopeId]);
      await client.query("SELECT pilot.pilot_bootstrap_preflight_v1()");

      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Do not return a connection with an uncertain/open transaction to
          // node-postgres. `release(error)` makes the pool discard it.
          discardClient = new Error("pilot_bootstrap_rollback_failed");
        }
      }
      throw error;
    } finally {
      client.release(discardClient);
    }
  }
}

/** Builds the sole production pg adapter; callers cannot provide a query surface. */
export function createPgPilotBootstrapDatabase(input: Readonly<{
  connection: BootstrapDatabaseConnection;
  fixedScopeKey: string;
}>): PilotBootstrapDatabase {
  const pool = new Pool({
    host: input.connection.host,
    port: input.connection.port,
    database: input.connection.database,
    user: input.connection.user,
    password: input.connection.password,
    // This privileged bootstrap path always uses verified TLS. URL query
    // options are rejected by config, so no caller can downgrade this setting.
    ssl: { rejectUnauthorized: true },
  });
  const adaptedPool: BootstrapPgPool = {
    connect: async () => {
      const client = await pool.connect();
      return {
        query: async <Row extends Record<string, unknown>>(
          text: string,
          values: readonly unknown[] = [],
        ): Promise<QueryResult<Row>> => {
          const result = await client.query<Row>(text, [...values]);
          return { rows: result.rows };
        },
        release: (error?: Error) => client.release(error),
      };
    },
    end: async () => pool.end(),
  };
  return new PgPilotBootstrapDatabase(adaptedPool, input.fixedScopeKey);
}

function requireSingleScopeId(rows: readonly { id: string }[]): string {
  if (rows.length !== 1) {
    throw new PilotBootstrapDatabaseError("configured_scope_not_resolved_exactly_once");
  }
  return normalizeUuid(rows[0].id, "configured_scope_id_invalid");
}

function requireSingleBindingId(
  rows: readonly { bindingId: string }[],
  code: string,
): string {
  if (rows.length !== 1) {
    throw new PilotBootstrapDatabaseError(code);
  }
  return normalizeUuid(rows[0].bindingId, code);
}
