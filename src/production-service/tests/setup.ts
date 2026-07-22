import "dotenv/config";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Tests must never touch the local/demo production schema. Prisma's Postgres
 * schema query parameter gives the suite an isolated namespace in the same
 * development database; `db push` creates/updates only that schema.
 */
const sourceUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for tests");
const testUrl = new URL(sourceUrl);
testUrl.searchParams.set("schema", "doorstar_test");
process.env.DATABASE_URL = testUrl.toString();
process.env.LOG_LEVEL = "silent";

execFileSync(process.execPath, [resolve(process.cwd(), "node_modules/prisma/build/index.js"), "db", "push", "--skip-generate", "--accept-data-loss"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
