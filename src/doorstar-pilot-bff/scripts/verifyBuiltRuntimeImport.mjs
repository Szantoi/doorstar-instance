import { createRuntimePilotPgPool } from "../dist/index.js";

// Node executes this built ESM module, so it proves the CJS `pg` dependency is
// imported through its default export before any database connection is made.
const pool = createRuntimePilotPgPool({
  host: "127.0.0.1",
  port: 5432,
  database: "doorstar_pilot",
  user: "runtime",
  password: "test-only-password",
});

if (typeof pool.connect !== "function" || typeof pool.end !== "function") {
  throw new Error("built_runtime_pg_pool_invalid");
}

await pool.end();
