import { randomUUID } from "node:crypto";

const testSchemaPrefix = "doorstar_test_vitest_";
const testSchemaPattern = /^doorstar_test_vitest_[a-z0-9_]+$/;

/**
 * Generates a PostgreSQL-safe, per-Vitest-run schema name. The prefix keeps
 * the namespace visibly separate from both `public` and the reviewable
 * `doorstar_test` schema used by explicit import demonstrations.
 */
export function getVitestSchemaName(): string {
  const configured = process.env.DOORSTAR_VITEST_SCHEMA;
  if (configured) {
    if (!testSchemaPattern.test(configured)) {
      throw new Error("DOORSTAR_VITEST_SCHEMA must be a generated Vitest schema name");
    }
    return configured;
  }

  const schema = `${testSchemaPrefix}${process.pid}_${randomUUID().replaceAll("-", "")}`;
  process.env.DOORSTAR_VITEST_SCHEMA = schema;
  return schema;
}

export function getVitestDatabaseUrl(): string {
  const sourceUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for tests");

  const testUrl = new URL(sourceUrl);
  testUrl.searchParams.set("schema", getVitestSchemaName());
  return testUrl.toString();
}

export function isVitestSchemaName(schema: string | null | undefined): boolean {
  return Boolean(schema && testSchemaPattern.test(schema));
}
