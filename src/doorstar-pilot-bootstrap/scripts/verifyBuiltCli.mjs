import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.execPath, ["dist/cli.js"], {
  cwd: packageRoot,
  encoding: "utf8",
  // Do not inherit an operator's DSN or PG* variables. The CLI must fail at
  // local configuration before it can construct a pool or contact PostgreSQL.
  env: {
    PATH: process.env.PATH ?? "",
    SYSTEMROOT: process.env.SYSTEMROOT ?? "",
  },
});

if (result.error) {
  throw result.error;
}

const stdout = result.stdout.trim();
const stderr = result.stderr.trim();
if (
  result.status !== 1
  || stdout !== ""
  || stderr !== "bootstrap_command_failed code=missing_pilot_bootstrap_database_url"
) {
  throw new Error("pilot_bootstrap_built_cli_smoke_failed");
}

process.stdout.write("pilot_bootstrap_built_cli_smoke=passed\n");
