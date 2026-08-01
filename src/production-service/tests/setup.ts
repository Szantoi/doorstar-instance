import "dotenv/config";
import { getVitestDatabaseUrl } from "./testSchema.js";

/**
 * Tests must never touch the local/demo production schema. Prisma's Postgres
 * schema query parameter gives the suite an isolated namespace in the same
 * development database; `db push` creates/updates only that schema.
 */
process.env.DATABASE_URL = getVitestDatabaseUrl();
process.env.LOG_LEVEL = "silent";
