import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg, { type Pool, type PoolClient, type QueryResultRow } from "pg";
import type { DisposableProofPlan } from "./a03Config.js";
import { A03ProofError } from "./a03Config.js";
import type { CommandRunner } from "./commandRunner.js";
import { runProgram } from "./commandRunner.js";

// `pg` is CommonJS. Node's ESM loader exposes its default export reliably,
// whereas a named runtime import of Pool is not portable to Node 24.
const PgPool = pg.Pool;

const expectedMigrationHashes: Readonly<Record<string, string>> = {
  "20260827000000_pilot_foundation/migration.sql": "b0408b3caba4d868cae2fcbcec39fb0442897ca17f877b7b09f0dd54809ba382",
  "20260827120000_pilot_a_phase_authorization_policy/migration.sql": "94d3c2e993802f440daf684038f8b39a97febf97da097ee9df5c63341964b348",
};

const fixtureFunctionRegprocedures = [
  'pilot.doorstar_require_pilot_write_context(pilot."BindingAuditSource")',
  "pilot.pilot_runtime_preflight_v1()",
  "pilot.pilot_bootstrap_preflight_v1()",
] as const;

export type SourceMigrationEvidence = Readonly<{
  migrationHashes: Readonly<Record<string, string>>;
  prismaMigrationChecksums: Readonly<Record<string, string>>;
}>;

export type PolicyFunctionManifest = Readonly<Record<string, Readonly<{
  definitionSha256: string;
  ownerSha256: string;
  aclSha256: string;
  securityDefiner: boolean;
  configurationSha256: string;
}>>>;

export type ProofPools = Readonly<{
  administrator: Pool;
  migrator: Pool;
  runtime: Pool;
  runtimeContextReset: Pool;
  bootstrap: Pool;
}>;

export function createPoolForIdentity(
  identity: Readonly<{ username: string; password: string }>,
  port: number,
  databaseName: string,
  max: number,
): Pool {
  return new PgPool({
    connectionString: connectionString(identity, port, databaseName),
    ssl: false,
    max,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });
}

function connectionString(
  identity: Readonly<{ username: string; password: string }>,
  port: number,
  databaseName: string,
): string {
  const url = new URL("postgresql://127.0.0.1/");
  url.username = identity.username;
  url.password = identity.password;
  url.port = String(port);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

/** Waits using a new query only; no migration or role mutation occurs here. */
export async function waitForDisposablePostgres(administrator: Pool, timeoutMilliseconds = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      await administrator.query("SELECT 1");
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new A03ProofError("a03_disposable_postgres_not_ready");
}

/**
 * The Docker bootstrap user is only a disposable cluster administrator. The
 * migration, runtime and bootstrap roles are distinct NOINHERIT identities.
 */
export async function createDisposableDatabaseAndRoles(
  administrator: Pool,
  plan: DisposableProofPlan,
): Promise<void> {
  await administrator.query(createRoleSql(plan.migrator));
  await administrator.query(createRoleSql(plan.runtime));
  await administrator.query(createRoleSql(plan.bootstrap));
  await administrator.query(
    `CREATE DATABASE ${quoteIdentifier(plan.databaseName)} OWNER ${quoteIdentifier(plan.migrator.username)} TEMPLATE template0`,
  );
}

export async function openProofPools(plan: DisposableProofPlan, port: number): Promise<ProofPools> {
  return {
    administrator: createPoolForIdentity(plan.administrator, port, "postgres", 1),
    migrator: createPoolForIdentity(plan.migrator, port, plan.databaseName, 1),
    runtime: createPoolForIdentity(plan.runtime, port, plan.databaseName, 4),
    runtimeContextReset: createPoolForIdentity(plan.runtime, port, plan.databaseName, 1),
    bootstrap: createPoolForIdentity(plan.bootstrap, port, plan.databaseName, 2),
  };
}

export async function closePools(pools: Partial<ProofPools>): Promise<void> {
  await Promise.allSettled(Object.values(pools).filter((pool): pool is Pool => pool !== undefined).map((pool) => pool.end()));
}

export async function deployImmutablePilotMigrationsThroughPrisma(
  commandRunner: CommandRunner,
  plan: DisposableProofPlan,
  port: number,
): Promise<SourceMigrationEvidence> {
  const migrations = await readVerifiedSourceMigrations();
  const foundation = foundationPackagePaths();
  if (!existsSync(foundation.prismaCli) || !existsSync(foundation.schema)) {
    throw new A03ProofError("a03_prisma_cli_or_schema_missing_run_foundation_npm_ci");
  }
  const migratorConnection = connectionString(plan.migrator, port, plan.databaseName);
  await runProgram(
    commandRunner,
    process.execPath,
    [foundation.prismaCli, "migrate", "deploy", "--schema", foundation.schema],
    { ...process.env, DATABASE_URL: migratorConnection },
    120_000,
    "a03_prisma_migrate_deploy_failed",
  );
  return {
    migrationHashes: Object.fromEntries(migrations.map((migration) => [migration.name, migration.hash])),
    prismaMigrationChecksums: Object.fromEntries(migrations.map((migration) => [migration.prismaMigrationName, migration.prismaChecksum])),
  };
}

/**
 * Applies the rendered fixture, creates only the two generated PilotScope
 * rows, installs the reviewed writer map, and issues an intentionally narrow
 * ACL set. This is the sole raw setup DML and runs as the disposable migrator.
 */
export async function applyRenderedTwoScopeFixture(
  migrator: Pool,
  renderedFixture: string,
): Promise<void> {
  await migrator.query(renderedFixture);
}

export async function configureDisposableProofDatabase(
  migrator: Pool,
  plan: DisposableProofPlan,
): Promise<void> {
  const client = await migrator.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO pilot."PilotScope" ("id", "scopeKey") VALUES ($1, $2), ($3, $4)`,
      [plan.fixture.scopeA.id, plan.fixture.scopeA.scopeKey, plan.fixture.scopeB.id, plan.fixture.scopeB.scopeKey],
    );
    await client.query(
      `INSERT INTO pilot."PilotAuditWriterRole" ("source", "databaseRoleName") VALUES
        ('DIRECT_ADMIN'::pilot."BindingAuditSource", $1),
        ('BOOTSTRAP_CLI'::pilot."BindingAuditSource", $2)`,
      [plan.runtime.username, plan.bootstrap.username],
    );
    await grantDisposableProofPrivileges(client, plan);
    await client.query("COMMIT");
  } catch (error) {
    await safeRollback(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function readAndVerifyPrismaMigrationLedger(
  migrator: Pool,
  expectedChecksums: Readonly<Record<string, string>>,
): Promise<void> {
  const result = await migrator.query<{
    migration_name: string;
    checksum: string;
    finished_at: Date | null;
    rolled_back_at: Date | null;
  }>(
    `SELECT migration_name, checksum, finished_at, rolled_back_at
       FROM public."_prisma_migrations"
      ORDER BY started_at, migration_name`,
  );
  const expectedEntries = Object.entries(expectedChecksums).sort(([left], [right]) => left.localeCompare(right));
  const actualEntries = result.rows.map((row) => [row.migration_name, row.checksum] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)
    || result.rows.some((row) => row.finished_at === null || row.rolled_back_at !== null)) {
    throw new A03ProofError("a03_prisma_migration_ledger_invalid");
  }
}

export async function capturePolicyFunctionManifest(migrator: Pool): Promise<PolicyFunctionManifest> {
  const result = await migrator.query<{
    signature: string;
    definition: string;
    owner_name: string;
    acl: string | null;
    security_definer: boolean;
    configuration: string[] | null;
  }>(
    `SELECT
       p.oid::pg_catalog.regprocedure::text AS signature,
       pg_catalog.pg_get_functiondef(p.oid) AS definition,
       pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
       COALESCE(pg_catalog.array_to_string(p.proacl, ','), '') AS acl,
       p.prosecdef AS security_definer,
       p.proconfig AS configuration
     FROM pg_catalog.pg_proc AS p
     JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'pilot'
     ORDER BY p.oid::pg_catalog.regprocedure::text`,
  );
  if (result.rows.length < fixtureFunctionRegprocedures.length) {
    throw new A03ProofError("a03_policy_function_manifest_incomplete");
  }
  return Object.fromEntries(result.rows.map((row) => [row.signature, {
    definitionSha256: sha256(row.definition),
    ownerSha256: sha256(row.owner_name),
    aclSha256: sha256(row.acl ?? ""),
    securityDefiner: row.security_definer,
    configurationSha256: sha256(JSON.stringify(row.configuration ?? [])),
  }]));
}

export function assertFixtureChangedExactlyThreeDefinitions(
  beforeFixture: PolicyFunctionManifest,
  afterFixture: PolicyFunctionManifest,
): void {
  const beforeKeys = Object.keys(beforeFixture).sort();
  const afterKeys = Object.keys(afterFixture).sort();
  if (JSON.stringify(beforeKeys) !== JSON.stringify(afterKeys)) {
    throw new A03ProofError("a03_fixture_function_manifest_key_drift");
  }
  const changedDefinitions = beforeKeys.filter((key) => beforeFixture[key].definitionSha256 !== afterFixture[key].definitionSha256);
  if (JSON.stringify(changedDefinitions.sort()) !== JSON.stringify([...fixtureFunctionRegprocedures].sort())) {
    throw new A03ProofError("a03_fixture_did_not_change_exactly_three_definitions");
  }
  for (const key of beforeKeys) {
    const before = beforeFixture[key];
    const after = afterFixture[key];
    if (before.ownerSha256 !== after.ownerSha256
      || before.aclSha256 !== after.aclSha256
      || before.securityDefiner !== after.securityDefiner
      || before.configurationSha256 !== after.configurationSha256) {
      throw new A03ProofError("a03_fixture_changed_function_security_manifest");
    }
  }
}

export async function verifyDisposableRoleAttributes(administrator: Pool, plan: DisposableProofPlan): Promise<void> {
  const result = await administrator.query<{
    rolname: string;
    rolsuper: boolean;
    rolinherit: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolbypassrls: boolean;
  }>(
    `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolbypassrls
       FROM pg_catalog.pg_roles
      WHERE rolname = ANY($1::text[])`,
    [[plan.migrator.username, plan.runtime.username, plan.bootstrap.username]],
  );
  if (result.rows.length !== 3) throw new A03ProofError("a03_disposable_role_missing");
  for (const role of result.rows) {
    if (role.rolsuper || role.rolinherit || role.rolcreaterole || role.rolcreatedb || role.rolbypassrls) {
      throw new A03ProofError("a03_disposable_role_attribute_invalid");
    }
  }
  const memberships = await administrator.query<{ membership_count: number }>(
    `SELECT count(*)::integer AS membership_count
       FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.member = ANY(
        ARRAY[
          $1::pg_catalog.regrole,
          $2::pg_catalog.regrole,
          $3::pg_catalog.regrole
        ]::oid[]
      )`,
    [plan.migrator.username, plan.runtime.username, plan.bootstrap.username],
  );
  if ((memberships.rows[0]?.membership_count ?? -1) !== 0) {
    throw new A03ProofError("a03_disposable_role_membership_forbidden");
  }
}

/** Verifies the final ownership and PUBLIC ACL boundary without exposing names in evidence. */
export async function verifyOwnershipAndPublicBoundary(migrator: Pool, plan: DisposableProofPlan): Promise<void> {
  const result = await migrator.query<{
    pilot_schema_owned_by_migrator: boolean;
    protected_table_count: number;
    protected_tables_owned_by_migrator: boolean;
    pilot_functions_owned_by_migrator: boolean;
    proof_functions_security_invoker: boolean;
    public_schema_privileges: number;
    public_table_privileges: number;
    public_function_privileges: number;
    public_database_privileges: number;
  }>(
    `WITH target_functions AS (
       SELECT unnest(ARRAY[
         'pilot.doorstar_require_pilot_write_context(pilot."BindingAuditSource")'::pg_catalog.regprocedure,
         'pilot.pilot_runtime_preflight_v1()'::pg_catalog.regprocedure,
         'pilot.pilot_bootstrap_preflight_v1()'::pg_catalog.regprocedure
       ]::oid[]) AS oid
     ), protected_tables AS (
       SELECT unnest(ARRAY[
         'PilotScope', 'AuthorizationTransaction', 'PrincipalBinding',
         'OpaqueSession', 'BindingAudit', 'PilotAuditWriterRole'
       ]::text[]) AS relname
     )
     SELECT
       (SELECT n.nspowner = $1::pg_catalog.regrole FROM pg_catalog.pg_namespace AS n WHERE n.nspname = 'pilot')
         AS pilot_schema_owned_by_migrator,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_class AS c
          JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
          JOIN protected_tables AS target ON target.relname = c.relname
         WHERE n.nspname = 'pilot' AND c.relkind = 'r') AS protected_table_count,
       NOT EXISTS (
         SELECT 1
           FROM pg_catalog.pg_class AS c
           JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
           JOIN protected_tables AS target ON target.relname = c.relname
          WHERE n.nspname = 'pilot'
            AND c.relkind = 'r'
            AND c.relowner <> $1::pg_catalog.regrole
       ) AS protected_tables_owned_by_migrator,
       NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_proc AS p
          JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
          WHERE n.nspname = 'pilot'
            AND p.proowner <> $1::pg_catalog.regrole
       ) AS pilot_functions_owned_by_migrator,
       NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_proc AS p
          WHERE p.oid IN (SELECT oid FROM target_functions)
            AND p.prosecdef
       ) AS proof_functions_security_invoker,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_namespace AS n
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
          ) AS acl
         WHERE n.nspname = 'pilot' AND acl.grantee = 0) AS public_schema_privileges,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_class AS c
          JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
          JOIN protected_tables AS target ON target.relname = c.relname
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
          ) AS acl
         WHERE n.nspname = 'pilot' AND c.relkind = 'r' AND acl.grantee = 0) AS public_table_privileges,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_proc AS p
          JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
          ) AS acl
         WHERE n.nspname = 'pilot' AND acl.grantee = 0) AS public_function_privileges,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_database AS d
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(d.datacl, pg_catalog.acldefault('d', d.datdba))
          ) AS acl
         WHERE d.datname = pg_catalog.current_database() AND acl.grantee = 0) AS public_database_privileges`,
    [plan.migrator.username],
  );
  const row = result.rows[0];
  if (
    row === undefined
    || !row.pilot_schema_owned_by_migrator
    || row.protected_table_count !== 6
    || !row.protected_tables_owned_by_migrator
    || !row.pilot_functions_owned_by_migrator
    || !row.proof_functions_security_invoker
    || row.public_schema_privileges !== 0
    || row.public_table_privileges !== 0
    || row.public_function_privileges !== 0
    || row.public_database_privileges !== 0
  ) {
    throw new A03ProofError("a03_ownership_or_public_acl_boundary_invalid");
  }
}

export async function querySingle<T extends QueryResultRow>(client: PoolClient, sql: string, values: readonly unknown[] = []): Promise<T> {
  const result = await client.query<T>(sql, [...values]);
  if (result.rows.length !== 1) throw new A03ProofError("a03_expected_exactly_one_database_row");
  return result.rows[0];
}

function sourceMigrationDirectory(): string {
  const sourcePackagesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return resolve(sourcePackagesRoot, "doorstar-pilot-foundation", "prisma", "migrations");
}

function foundationPackagePaths(): Readonly<{ prismaCli: string; schema: string }> {
  const migrationDirectory = sourceMigrationDirectory();
  const foundationRoot = resolve(migrationDirectory, "..", "..");
  return {
    prismaCli: join(foundationRoot, "node_modules", "prisma", "build", "index.js"),
    schema: join(foundationRoot, "prisma", "schema.prisma"),
  };
}

async function readVerifiedSourceMigrations(): Promise<readonly {
  name: string;
  prismaMigrationName: string;
  hash: string;
  prismaChecksum: string;
}[]> {
  const root = sourceMigrationDirectory();
  const result: { name: string; prismaMigrationName: string; hash: string; prismaChecksum: string }[] = [];
  for (const [name, expectedHash] of Object.entries(expectedMigrationHashes)) {
    const sql = await readFile(resolve(root, name), "utf8");
    const hash = sha256(sql);
    if (hash !== expectedHash) throw new A03ProofError("a03_immutable_migration_hash_mismatch");
    result.push({
      name,
      prismaMigrationName: name.slice(0, name.indexOf("/")),
      hash,
      prismaChecksum: createHash("sha256").update(sql, "utf8").digest("hex"),
    });
  }
  return result;
}

async function grantDisposableProofPrivileges(client: PoolClient, plan: DisposableProofPlan): Promise<void> {
  const runtime = quoteIdentifier(plan.runtime.username);
  const bootstrap = quoteIdentifier(plan.bootstrap.username);
  const database = quoteIdentifier(plan.databaseName);
  const roles = `${runtime}, ${bootstrap}`;

  await client.query(`REVOKE CONNECT, CREATE, TEMPORARY ON DATABASE ${database} FROM PUBLIC`);
  await client.query(`REVOKE CREATE, TEMPORARY ON DATABASE ${database} FROM ${roles}`);
  await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
  await client.query(`REVOKE CREATE ON SCHEMA public FROM ${roles}`);
  await client.query(`REVOKE ALL ON SCHEMA pilot FROM ${roles}`);
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA pilot FROM ${roles}`);
  await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA pilot FROM ${roles}`);
  await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pilot FROM ${roles}`);
  await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${roles}`);
  await client.query(`GRANT USAGE ON SCHEMA pilot TO ${roles}`);

  await client.query(`GRANT SELECT ("id", "scopeKey") ON pilot."PilotScope" TO ${roles}`);
  await client.query(`GRANT SELECT ("source", "databaseRoleName") ON pilot."PilotAuditWriterRole" TO ${roles}`);
  await client.query(
    `GRANT SELECT ("id", "pilotScopeId", "actorKey", "issuer", "subjectDigest", "displayName", "role", "active", "canManagePilotRoster", "auditVersion")
       ON pilot."PrincipalBinding" TO ${runtime}`,
  );
  await client.query(
    `GRANT SELECT ("id", "pilotScopeId", "bindingId", "sessionTokenHash", "bindingEpoch", "issuedAt", "expiresAt", "revokedAt")
       ON pilot."OpaqueSession" TO ${runtime}`,
  );

  await client.query(`GRANT EXECUTE ON FUNCTION pilot.pilot_runtime_preflight_v1() TO ${runtime}`);
  // The RLS SELECT policies invoke this helper under the runtime login. It is
  // deliberately read support only: no writer routine is reachable through it.
  await client.query(`GRANT EXECUTE ON FUNCTION pilot.doorstar_current_pilot_scope_id() TO ${runtime}`);
  // The direct writer's DB-owned invariant invokes this immutable SECURITY
  // INVOKER predicate under the runtime login. It returns only a boolean and
  // grants neither table DML nor any writer routine.
  await client.query(
    `GRANT EXECUTE ON FUNCTION pilot.doorstar_is_effective_pilot_roster_manager(boolean, pilot."PilotOfficeRole", boolean) TO ${runtime}`,
  );
  // The direct writer's serializable manager-loss trigger derives a per-scope
  // advisory-lock key through this immutable, pure helper. It returns only a
  // deterministic bigint and grants neither table DML nor writer authority.
  await client.query(`GRANT EXECUTE ON FUNCTION pilot.doorstar_pilot_roster_lock_key(uuid) TO ${runtime}`);
  // The direct writer's deferred manager-loss invariant uses this RLS-scoped,
  // non-writing void check. It can only confirm the invariant or raise 23514;
  // it grants neither table DML nor a trigger function entry point.
  await client.query(
    `GRANT EXECUTE ON FUNCTION pilot.doorstar_require_effective_pilot_roster_manager(uuid) TO ${runtime}`,
  );
  await client.query(
    `GRANT EXECUTE ON FUNCTION pilot.pilot_create_authorization_transaction_v1(text, text, text, bytea, timestamp without time zone) TO ${runtime}`,
  );
  await client.query(
    `GRANT EXECUTE ON FUNCTION pilot.pilot_consume_authorization_transaction_v1(text, text) TO ${runtime}`,
  );
  await client.query(
    `GRANT EXECUTE ON FUNCTION pilot.pilot_direct_update_binding_v1(text, uuid, integer, pilot."PilotOfficeRole", boolean, boolean, text, uuid) TO ${runtime}`,
  );
  await client.query(
    `GRANT EXECUTE ON FUNCTION pilot.pilot_issue_opaque_session_v1(uuid, text, bytea, timestamp without time zone) TO ${runtime}`,
  );
  await client.query(`GRANT EXECUTE ON FUNCTION pilot.pilot_revoke_opaque_session_v1(text) TO ${runtime}`);
  await client.query(`GRANT EXECUTE ON FUNCTION pilot.pilot_bootstrap_preflight_v1() TO ${bootstrap}`);
  await client.query(
    `GRANT EXECUTE ON FUNCTION pilot.pilot_bootstrap_provision_binding_v1(text, text, text, text, pilot."PilotOfficeRole", boolean, text, uuid) TO ${bootstrap}`,
  );
  await client.query(
    `GRANT EXECUTE ON FUNCTION pilot.pilot_bootstrap_revoke_binding_v1(uuid, integer, text, uuid) TO ${bootstrap}`,
  );
}

function createRoleSql(identity: Readonly<{ username: string; password: string }>): string {
  return `CREATE ROLE ${quoteIdentifier(identity.username)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD ${quoteLiteral(identity.password)} CONNECTION LIMIT 8`;
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new A03ProofError("a03_identifier_invalid");
  return `"${value}"`;
}

function quoteLiteral(value: string): string {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(value)) throw new A03ProofError("a03_generated_secret_invalid");
  return `'${value}'`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value.replaceAll("\r\n", "\n"), "utf8").digest("hex");
}

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The original setup error is retained and never printed with raw details.
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}
