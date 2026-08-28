import pg from "pg";
import { createPilotBff, type PilotBff } from "../../application/pilotBff.js";
import {
  loadPilotBffConfig,
  validatePilotRuntimeDatabaseConnection,
  type PilotRuntimeDatabaseConnection,
} from "../../config/pilotBffConfig.js";
import type { Clock } from "../../ports/clock.js";
import type { PilotAuthLogger } from "../../ports/logger.js";
import { NodePilotCrypto } from "../crypto/nodePilotCrypto.js";
import {
  NodeKeycloakDirectoryAdmin,
  type NodeKeycloakDirectoryAdminOptions,
} from "../keycloak/nodeKeycloakDirectoryAdmin.js";
import {
  NodeOidcAuthorizationClient,
  type NodeOidcAuthorizationClientOptions,
} from "../oidc/nodeOidcAuthorizationClient.js";
import type { PilotPgPool } from "../postgres/pilotPostgresContracts.js";
import { PostgresPilotRepositories } from "../postgres/postgresPilotRepositories.js";
import { consolePilotAuthLogger, systemClock } from "./nodeRuntimeSupport.js";

export type PilotBffRuntime = PilotBff & Readonly<{
  /** Close the owned pg pool during a separately managed process shutdown. */
  close(): Promise<void>;
}>;

export type CreatePilotBffRuntimeOptions = Readonly<{
  environment?: NodeJS.ProcessEnv;
  pool?: PilotPgPool;
  clock?: Clock;
  logger?: PilotAuthLogger;
  oidc?: NodeOidcAuthorizationClientOptions;
  directory?: NodeKeycloakDirectoryAdminOptions;
}>;

/**
 * Complete node-postgres inputs. The connection string is intentionally not
 * part of this shape: a validated runtime identity must be explicit and TLS
 * must verify the server certificate.
 */
export type RuntimePilotPgPoolOptions = Readonly<{
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: Readonly<{
    rejectUnauthorized: true;
  }>;
}>;

/**
 * Production composition only: it constructs adapters and verifies the fixed
 * scope, but deliberately does not bind a port or start an HTTP listener.
 */
export async function createPilotBffRuntime(
  options: CreatePilotBffRuntimeOptions = {},
): Promise<PilotBffRuntime> {
  const config = loadPilotBffConfig(options.environment ?? process.env);
  const pool = options.pool ?? createRuntimePilotPgPool(config.runtimeDatabase);
  const repositories = new PostgresPilotRepositories(pool);
  try {
    const bff = await createPilotBff({
      config,
      clock: options.clock ?? systemClock,
      crypto: new NodePilotCrypto(config.crypto),
      oidc: new NodeOidcAuthorizationClient(config, options.oidc),
      transactions: repositories,
      bindings: repositories,
      sessions: repositories,
      scopes: repositories,
      rosterReader: repositories,
      rosterWriter: repositories,
      directory: new NodeKeycloakDirectoryAdmin(config, options.directory),
      logger: options.logger ?? consolePilotAuthLogger,
    });
    return withClose(bff, repositories);
  } catch (error) {
    try {
      await repositories.close();
    } catch {
      // The startup failure remains the actionable error.
    }
    throw error;
  }
}

/**
 * Converts the already validated runtime database identity into the only Pool
 * configuration the production composition root may use. Supplying every
 * connection field prevents node-postgres from inheriting PG* defaults; the
 * explicit TLS object also prevents PGSSLMODE from weakening verification.
 */
export function createRuntimePilotPgPool(
  connection: PilotRuntimeDatabaseConnection,
  createPool: (options: RuntimePilotPgPoolOptions) => PilotPgPool = createNodePgPool,
): PilotPgPool {
  const validatedConnection = validatePilotRuntimeDatabaseConnection(connection);
  return createPool(Object.freeze({
    host: validatedConnection.host,
    port: validatedConnection.port,
    database: validatedConnection.database,
    user: validatedConnection.user,
    password: validatedConnection.password,
    ssl: Object.freeze({ rejectUnauthorized: true as const }),
  }));
}

function createNodePgPool(options: RuntimePilotPgPoolOptions): PilotPgPool {
  return new pg.Pool({
    host: options.host,
    port: options.port,
    database: options.database,
    user: options.user,
    password: options.password,
    ssl: { rejectUnauthorized: options.ssl.rejectUnauthorized },
  });
}

function withClose(bff: PilotBff, repositories: PostgresPilotRepositories): PilotBffRuntime {
  let closed = false;
  return Object.freeze({
    ...bff,
    close: async () => {
      if (closed) {
        return;
      }
      await repositories.close();
      closed = true;
    },
  });
}
