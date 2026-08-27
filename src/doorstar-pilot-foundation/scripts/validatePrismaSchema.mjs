import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// `prisma validate` only parses the schema, but it still requires the
// datasource variable to exist. Always override it with an inert loopback
// value so this source-only check cannot read or contact a real database.
const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
if (!existsSync(prismaCli)) {
  throw new Error("doorstar_pilot_prisma_cli_missing_run_npm_ci");
}

const result = spawnSync(process.execPath, [prismaCli, "validate"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: {
    ...process.env,
    DATABASE_URL: "postgresql://pilot_validation:placeholder@127.0.0.1:1/doorstar_pilot_validation",
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
