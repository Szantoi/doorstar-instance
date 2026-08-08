export const UX_REFERENCE_PROJECT_KEY = "UX-REFERENCE-RETROFIT-001";
export const UX_REFERENCE_SCHEMA = "doorstar_ux_reference";
/** Dedicated synthetic Flow Lab demo schema. This is intentionally a fixed
 * allowlist entry, not a caller-selected schema. */
export const FLOW_LAB_DEMO_SCHEMA = "doorstar_flow_lab_demo";
export const UX_REFERENCE_DATABASE_NAME = "doorstar_production";

const generatedVitestSchema = /^doorstar_test_vitest_[a-z0-9_]+$/;
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const postgresProtocols = new Set(["postgres:", "postgresql:"]);

export interface UxReferenceTarget {
  databaseUrl: string;
  databaseName: string;
  schema: string;
}

/**
 * The UX fixture is destructive only for its own stable project key. Even so,
 * connecting it to a remote database or an arbitrary schema would make a
 * typo unnecessarily dangerous, so the command fails before Prisma loads.
 */
export function assertUxReferenceTarget(input: {
  databaseUrl?: string;
  arguments: string[];
  nodeEnv?: string;
}): UxReferenceTarget {
  if (!input.databaseUrl) {
    throw new Error("DATABASE_URL is required for the UX reference seed");
  }
  if (!input.arguments.includes("--confirm-ux-reference-seed")) {
    throw new Error("Explicit confirmation required: --confirm-ux-reference-seed");
  }

  let parsed: URL;
  try {
    parsed = new URL(input.databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!postgresProtocols.has(parsed.protocol)) {
    throw new Error("The UX reference seed requires a PostgreSQL DATABASE_URL");
  }
  if (!localHosts.has(parsed.hostname)) {
    throw new Error("The UX reference seed is allowed only on a loopback database host");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (databaseName !== UX_REFERENCE_DATABASE_NAME) {
    throw new Error(
      `UX reference seed refused database '${databaseName || "(missing)"}'; only the explicit local development database '${UX_REFERENCE_DATABASE_NAME}' is allowed`,
    );
  }

  const schema = parsed.searchParams.get("schema");
  if (!schema) {
    throw new Error("DATABASE_URL must select an explicit schema");
  }
  const isolatedDemoSchema = schema === UX_REFERENCE_SCHEMA || schema === FLOW_LAB_DEMO_SCHEMA;
  const localPublic = schema === "public"
    && input.arguments.includes("--confirm-local-development-database");
  const vitestSchema = input.nodeEnv === "test" && generatedVitestSchema.test(schema);
  if (!isolatedDemoSchema && !localPublic && !vitestSchema) {
    throw new Error(
      `UX reference seed refused schema '${schema}'; use ${UX_REFERENCE_SCHEMA}, ${FLOW_LAB_DEMO_SCHEMA}, a generated Vitest schema, or explicitly confirm the local public development schema`,
    );
  }

  return { databaseUrl: parsed.toString(), databaseName, schema };
}
