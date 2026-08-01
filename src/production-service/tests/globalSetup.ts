import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { getVitestDatabaseUrl, getVitestSchemaName } from "./testSchema.js";

/**
 * Vitest's final safety net: even a failing test cannot leave fixtures in the
 * browsable review schema. The schema identifier is generated locally and
 * validated before being quoted into PostgreSQL DDL.
 */
export default async function globalSetup() {
  const schema = getVitestSchemaName();
  const databaseUrl = getVitestDatabaseUrl();

  // `setupFiles` executes per test file, whereas global setup runs once. Keep
  // DDL here so one suite provisions exactly one schema.
  try {
    execFileSync(process.execPath, [resolve(process.cwd(), "node_modules/prisma/build/index.js"), "db", "push", "--skip-generate", "--accept-data-loss"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    });
  } catch (error) {
    await dropVitestSchema(databaseUrl, schema);
    throw error;
  }

  return () => dropVitestSchema(databaseUrl, schema);
}

async function dropVitestSchema(databaseUrl: string, schema: string): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await prisma.$disconnect();
  }
}
