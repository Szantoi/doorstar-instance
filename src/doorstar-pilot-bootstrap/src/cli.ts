import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  PilotBootstrapService,
  type PilotBootstrapDatabase,
} from "./application/bootstrapService.js";
import {
  loadPilotBootstrapConfig,
  PilotBootstrapConfigurationError,
} from "./config/bootstrapConfig.js";
import {
  BootstrapCommandInputError,
  parseBootstrapCommand,
  type BootstrapCommandResult,
} from "./domain/bootstrapCommand.js";
import {
  createPgPilotBootstrapDatabase,
  PilotBootstrapDatabaseError,
} from "./infrastructure/pgBootstrapDatabase.js";

export type BootstrapDatabaseFactory = (input: Readonly<{
  connection: import("./config/bootstrapConfig.js").BootstrapDatabaseConnection;
  fixedScopeKey: string;
}>) => PilotBootstrapDatabase;

/** Executes one command and always closes the dedicated bootstrap pool. */
export async function executeBootstrapCli(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
  databaseFactory: BootstrapDatabaseFactory = createPgPilotBootstrapDatabase,
): Promise<BootstrapCommandResult> {
  const config = loadPilotBootstrapConfig(environment);
  const command = parseBootstrapCommand(argv);
  const database = databaseFactory({
    connection: config.bootstrapDatabase,
    fixedScopeKey: config.fixedScopeKey,
  });
  try {
    return await new PilotBootstrapService(database).execute(command);
  } finally {
    await database.close();
  }
}

/** Sanitized operational output deliberately excludes DSNs, digests and actor keys. */
export function formatBootstrapResult(result: BootstrapCommandResult): string {
  if (result.kind === "preflight") {
    return "bootstrap_preflight_completed";
  }
  return `bootstrap_${result.kind}_completed binding_id=${result.bindingId} correlation_id=${result.correlationId}`;
}

/** Converts only known local errors to output-safe codes; DB messages stay private. */
export function formatBootstrapFailure(error: unknown): string {
  return `bootstrap_command_failed code=${sanitizeErrorCode(error)}`;
}

export async function main(): Promise<void> {
  const result = await executeBootstrapCli(process.argv.slice(2), process.env);
  process.stdout.write(`${formatBootstrapResult(result)}\n`);
}

function sanitizeErrorCode(error: unknown): string {
  if (
    error instanceof PilotBootstrapConfigurationError
    || error instanceof BootstrapCommandInputError
    || error instanceof PilotBootstrapDatabaseError
  ) {
    return error.code;
  }
  return "bootstrap_command_failed";
}

const invokedDirectly = process.argv[1] !== undefined
  && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (invokedDirectly) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${formatBootstrapFailure(error)}\n`);
    process.exitCode = 1;
  });
}
