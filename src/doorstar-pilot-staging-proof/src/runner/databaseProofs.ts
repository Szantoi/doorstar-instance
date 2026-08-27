import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { DisposableProofPlan } from "./a03Config.js";
import { A03ProofError } from "./a03Config.js";
import type { ProofPools } from "./databaseSetup.js";
import { querySingle } from "./databaseSetup.js";
import { ProofLedger } from "./proofLedger.js";
import {
  backendPid,
  expectPostgresFailure,
  postgresErrorCode,
  withScopedSerializableTransaction,
} from "./transactions.js";

type Binding = Readonly<{
  id: string;
  auditVersion: number;
}>;

type SeededProofData = Readonly<{
  alphaManagerOne: Binding;
  alphaManagerTwo: Binding;
  betaManager: Binding;
  alphaManagerOneSessionHash: string;
  alphaManagerOneSessionId: string;
  alphaManagerTwoSessionHash: string;
  directAuditId: string;
}>;

export async function executeDatabaseProofs(
  plan: DisposableProofPlan,
  pools: ProofPools,
  ledger: ProofLedger,
): Promise<void> {
  await proveRuntimeAclAndSourceBoundaries(plan, pools, ledger);
  const seeded = await seedManagerAndAuditProof(plan, pools, ledger);
  await proveForcedRlsForMigratorWithoutScope(pools, ledger);
  await proveAuthorizationTransactionSingleConsumption(plan, pools, ledger);
  await proveTransactionScopedContextReset(plan, pools, ledger);
  await proveTwoScopeRlsIsolation(plan, pools, seeded, ledger);
  await proveAppendOnlyAuditAndLastManagerRevoke(plan, pools, seeded, ledger);
  await proveSerializableManagerWriteSkewProtection(plan, pools, seeded, ledger);
}

/**
 * The migrator owns the proof tables but is NOBYPASSRLS. FORCE ROW LEVEL
 * SECURITY is therefore essential: an owner without a scope must see no rows.
 */
async function proveForcedRlsForMigratorWithoutScope(
  pools: ProofPools,
  ledger: ProofLedger,
): Promise<void> {
  const policyTables = await pools.migrator.query<{
    relname: string;
    row_security: boolean;
    force_row_security: boolean;
  }>(
    `SELECT
       c.relname,
       c.relrowsecurity AS row_security,
       c.relforcerowsecurity AS force_row_security
     FROM pg_catalog.pg_class AS c
     JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'pilot'
       AND c.relname = ANY(ARRAY['PrincipalBinding', 'OpaqueSession', 'BindingAudit']::text[])
     ORDER BY c.relname`,
  );
  if (
    policyTables.rows.length !== 3
    || policyTables.rows.some((table) => !table.row_security || !table.force_row_security)
  ) {
    throw new A03ProofError("a03_force_rls_catalog_boundary_invalid");
  }
  const setting = await pools.migrator.query<{ scope_value: string | null }>(
    "SELECT pg_catalog.current_setting('app.current_pilot_scope_id', true) AS scope_value",
  );
  if (setting.rows[0]?.scope_value !== null && setting.rows[0]?.scope_value !== "") {
    throw new A03ProofError("a03_migrator_scope_context_unexpectedly_present");
  }
  const protectedRowCounts = await pools.migrator.query<{
    binding_count: number;
    session_count: number;
    audit_count: number;
  }>(
    `SELECT
       (SELECT count(*)::integer FROM pilot."PrincipalBinding") AS binding_count,
       (SELECT count(*)::integer FROM pilot."OpaqueSession") AS session_count,
       (SELECT count(*)::integer FROM pilot."BindingAudit") AS audit_count`,
  );
  const counts = protectedRowCounts.rows[0];
  if (
    counts === undefined
    || counts.binding_count !== 0
    || counts.session_count !== 0
    || counts.audit_count !== 0
  ) {
    throw new A03ProofError("a03_force_rls_owner_scope_less_read_not_denied");
  }
  ledger.pass("FORCE_RLS_OWNER_SCOPELESS_DENIAL");
}

async function proveRuntimeAclAndSourceBoundaries(
  plan: DisposableProofPlan,
  pools: ProofPools,
  ledger: ProofLedger,
): Promise<void> {
  const [runtimeIdentity, bootstrapIdentity] = await Promise.all([
    pools.runtime.query<{ current_user_name: string; session_user_name: string }>(
      "SELECT current_user::text AS current_user_name, session_user::text AS session_user_name",
    ),
    pools.bootstrap.query<{ current_user_name: string; session_user_name: string }>(
      "SELECT current_user::text AS current_user_name, session_user::text AS session_user_name",
    ),
  ]);
  if (
    runtimeIdentity.rows[0]?.current_user_name !== plan.runtime.username
    || runtimeIdentity.rows[0]?.session_user_name !== plan.runtime.username
    || bootstrapIdentity.rows[0]?.current_user_name !== plan.bootstrap.username
    || bootstrapIdentity.rows[0]?.session_user_name !== plan.bootstrap.username
  ) {
    throw new A03ProofError("a03_writer_session_identity_or_set_role_invalid");
  }
  const acl = await pools.migrator.query<{
    runtime_create_schema: boolean;
    bootstrap_create_schema: boolean;
    runtime_create_database: boolean;
    bootstrap_create_database: boolean;
    runtime_create_public_schema: boolean;
    bootstrap_create_public_schema: boolean;
    runtime_insert_binding: boolean;
    runtime_update_binding: boolean;
    runtime_delete_binding: boolean;
    bootstrap_insert_binding: boolean;
    bootstrap_update_binding: boolean;
    bootstrap_delete_binding: boolean;
    runtime_bootstrap_preflight: boolean;
    bootstrap_runtime_preflight: boolean;
    runtime_current_scope_helper: boolean;
    bootstrap_current_scope_helper: boolean;
    runtime_temporary: boolean;
    bootstrap_temporary: boolean;
  }>(
    `SELECT
       pg_catalog.has_schema_privilege($1, 'pilot', 'CREATE') AS runtime_create_schema,
       pg_catalog.has_schema_privilege($2, 'pilot', 'CREATE') AS bootstrap_create_schema,
       pg_catalog.has_database_privilege($1, pg_catalog.current_database(), 'CREATE') AS runtime_create_database,
       pg_catalog.has_database_privilege($2, pg_catalog.current_database(), 'CREATE') AS bootstrap_create_database,
       pg_catalog.has_schema_privilege($1, 'public', 'CREATE') AS runtime_create_public_schema,
       pg_catalog.has_schema_privilege($2, 'public', 'CREATE') AS bootstrap_create_public_schema,
       pg_catalog.has_table_privilege($1, 'pilot."PrincipalBinding"'::pg_catalog.regclass, 'INSERT') AS runtime_insert_binding,
       pg_catalog.has_table_privilege($1, 'pilot."PrincipalBinding"'::pg_catalog.regclass, 'UPDATE') AS runtime_update_binding,
       pg_catalog.has_table_privilege($1, 'pilot."PrincipalBinding"'::pg_catalog.regclass, 'DELETE') AS runtime_delete_binding,
       pg_catalog.has_table_privilege($2, 'pilot."PrincipalBinding"'::pg_catalog.regclass, 'INSERT') AS bootstrap_insert_binding,
       pg_catalog.has_table_privilege($2, 'pilot."PrincipalBinding"'::pg_catalog.regclass, 'UPDATE') AS bootstrap_update_binding,
       pg_catalog.has_table_privilege($2, 'pilot."PrincipalBinding"'::pg_catalog.regclass, 'DELETE') AS bootstrap_delete_binding,
       pg_catalog.has_function_privilege($1, 'pilot.pilot_bootstrap_preflight_v1()'::pg_catalog.regprocedure, 'EXECUTE') AS runtime_bootstrap_preflight,
       pg_catalog.has_function_privilege($2, 'pilot.pilot_runtime_preflight_v1()'::pg_catalog.regprocedure, 'EXECUTE') AS bootstrap_runtime_preflight,
       pg_catalog.has_function_privilege($1, 'pilot.doorstar_current_pilot_scope_id()'::pg_catalog.regprocedure, 'EXECUTE') AS runtime_current_scope_helper,
       pg_catalog.has_function_privilege($2, 'pilot.doorstar_current_pilot_scope_id()'::pg_catalog.regprocedure, 'EXECUTE') AS bootstrap_current_scope_helper,
       pg_catalog.has_database_privilege($1, pg_catalog.current_database(), 'TEMPORARY') AS runtime_temporary,
       pg_catalog.has_database_privilege($2, pg_catalog.current_database(), 'TEMPORARY') AS bootstrap_temporary`,
    [plan.runtime.username, plan.bootstrap.username],
  );
  const row = acl.rows[0];
  if (
    row === undefined
    || row.runtime_current_scope_helper !== true
    || row.bootstrap_current_scope_helper !== false
    || Object.entries(row).some(([key, value]) => (
      key !== "runtime_current_scope_helper" && value !== false
    ))
  ) {
    throw new A03ProofError("a03_acl_boundary_not_deny_by_default");
  }

  await expectPostgresFailure(
    async () => pools.runtime.query("SELECT pilot.pilot_bootstrap_preflight_v1()"),
    ["42501"],
    "a03_runtime_cross_source_routine_not_denied",
  );
  await expectPostgresFailure(
    async () => pools.bootstrap.query("SELECT pilot.pilot_runtime_preflight_v1()"),
    ["42501"],
    "a03_bootstrap_cross_source_routine_not_denied",
  );
  await expectPostgresFailure(
    async () => pools.bootstrap.query("SELECT pilot.doorstar_current_pilot_scope_id()"),
    ["42501"],
    "a03_bootstrap_current_scope_helper_not_denied",
  );
  await assertAllCrossSourceRoutineGrantsDenied(plan, pools.migrator);
  for (const pool of [pools.runtime, pools.bootstrap]) {
    await assertAllRawDmlDenied(pool);
  }
  await expectPostgresFailure(
    async () => pools.runtime.query(`SET ROLE "${plan.migrator.username}"`),
    ["42501"],
    "a03_runtime_set_role_not_denied",
  );
  await expectPostgresFailure(
    async () => pools.bootstrap.query(`SET ROLE "${plan.migrator.username}"`),
    ["42501"],
    "a03_bootstrap_set_role_not_denied",
  );
  ledger.pass("ACL_SOURCE_AND_RAW_DML_DENIAL");

  const client = await pools.runtime.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await expectPostgresFailure(
      async () => client.query("SELECT pilot.pilot_runtime_preflight_v1()"),
      ["22023"],
      "a03_absent_scope_preflight_not_denied",
    );
    await client.query("ROLLBACK");

    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query(
      "SELECT pg_catalog.set_config('app.current_pilot_scope_id', $1, true)",
      [randomUUID()],
    );
    await expectPostgresFailure(
      async () => client.query("SELECT pilot.pilot_runtime_preflight_v1()"),
      ["23514"],
      "a03_wrong_scope_preflight_not_denied",
    );
    await client.query("ROLLBACK");

    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    await client.query(
      "SELECT pg_catalog.set_config('app.current_pilot_scope_id', $1, true)",
      [plan.fixture.scopeA.id],
    );
    await expectPostgresFailure(
      async () => client.query(
        "SELECT pilot.pilot_revoke_opaque_session_v1($1::text)",
        [hashHex("read-committed")],
      ),
      ["25001"],
      "a03_nonserializable_writer_not_denied",
    );
    await client.query("ROLLBACK");
  } finally {
    await safeRollback(client);
    client.release();
  }
  ledger.pass("ABSENT_WRONG_SCOPE_AND_SERIALIZABLE_DENIAL");
}

async function assertAllCrossSourceRoutineGrantsDenied(plan: DisposableProofPlan, migrator: Pool): Promise<void> {
  const forbidden: ReadonlyArray<readonly [string, string]> = [
    [plan.runtime.username, "pilot.pilot_bootstrap_preflight_v1()"],
    [plan.runtime.username, 'pilot.pilot_bootstrap_provision_binding_v1(text,text,text,text,pilot."PilotOfficeRole",boolean,text,uuid)'],
    [plan.runtime.username, "pilot.pilot_bootstrap_revoke_binding_v1(uuid,integer,text,uuid)"],
    [plan.bootstrap.username, "pilot.pilot_runtime_preflight_v1()"],
    [plan.bootstrap.username, "pilot.doorstar_current_pilot_scope_id()"],
    [plan.bootstrap.username, "pilot.pilot_create_authorization_transaction_v1(text,text,text,bytea,timestamp without time zone)"],
    [plan.bootstrap.username, "pilot.pilot_consume_authorization_transaction_v1(text,text)"],
    [plan.bootstrap.username, 'pilot.pilot_direct_update_binding_v1(text,uuid,integer,pilot."PilotOfficeRole",boolean,boolean,text,uuid)'],
    [plan.bootstrap.username, "pilot.pilot_issue_opaque_session_v1(uuid,text,bytea,timestamp without time zone)"],
    [plan.bootstrap.username, "pilot.pilot_revoke_opaque_session_v1(text)"],
  ];
  for (const [roleName, signature] of forbidden) {
    const result = await migrator.query<{ allowed: boolean }>(
      "SELECT pg_catalog.has_function_privilege($1, $2::pg_catalog.regprocedure, 'EXECUTE') AS allowed",
      [roleName, signature],
    );
    if (result.rows.length !== 1 || result.rows[0]?.allowed !== false) {
      throw new A03ProofError("a03_cross_source_function_acl_granted");
    }
  }
}

async function assertAllRawDmlDenied(pool: Pool): Promise<void> {
  const protectedTables = [
    {
      table: 'pilot."PilotScope"',
      update: 'UPDATE pilot."PilotScope" SET "scopeKey" = "scopeKey" WHERE false',
    },
    {
      table: 'pilot."AuthorizationTransaction"',
      update: 'UPDATE pilot."AuthorizationTransaction" SET "stateHash" = "stateHash" WHERE false',
    },
    {
      table: 'pilot."PrincipalBinding"',
      update: 'UPDATE pilot."PrincipalBinding" SET "active" = "active" WHERE false',
    },
    {
      table: 'pilot."OpaqueSession"',
      update: 'UPDATE pilot."OpaqueSession" SET "revokedAt" = "revokedAt" WHERE false',
    },
    {
      table: 'pilot."BindingAudit"',
      update: 'UPDATE pilot."BindingAudit" SET "reason" = "reason" WHERE false',
    },
    {
      table: 'pilot."PilotAuditWriterRole"',
      update: 'UPDATE pilot."PilotAuditWriterRole" SET "databaseRoleName" = "databaseRoleName" WHERE false',
    },
  ] as const;
  for (const target of protectedTables) {
    await expectPostgresFailure(
      async () => pool.query(`INSERT INTO ${target.table} DEFAULT VALUES`),
      ["42501"],
      "a03_raw_insert_not_denied",
    );
    await expectPostgresFailure(
      async () => pool.query(target.update),
      ["42501"],
      "a03_raw_update_not_denied",
    );
    await expectPostgresFailure(
      async () => pool.query(`DELETE FROM ${target.table} WHERE false`),
      ["42501"],
      "a03_raw_delete_not_denied",
    );
  }
}

/** Uses an actual max:1 pg.Pool checkout twice to prove the local GUC resets. */
async function proveTransactionScopedContextReset(
  plan: DisposableProofPlan,
  pools: ProofPools,
  ledger: ProofLedger,
): Promise<void> {
  const firstClient = await pools.runtimeContextReset.connect();
  let reusedPid: number | undefined;
  try {
    await firstClient.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await firstClient.query(
      "SELECT pg_catalog.set_config('app.current_pilot_scope_id', $1, true)",
      [plan.fixture.scopeA.id],
    );
    const configuredScope = await querySingle<{ scope_value: string | null }>(
      firstClient,
      "SELECT pg_catalog.current_setting('app.current_pilot_scope_id', true) AS scope_value",
    );
    const resolvedScope = await querySingle<{ scope_id: string | null }>(
      firstClient,
      "SELECT pilot.doorstar_current_pilot_scope_id()::text AS scope_id",
    );
    if (configuredScope.scope_value !== plan.fixture.scopeA.id || resolvedScope.scope_id !== plan.fixture.scopeA.id) {
      throw new A03ProofError("a03_transaction_local_scope_not_visible_before_commit");
    }
    reusedPid = await backendPid(firstClient);
    await firstClient.query("COMMIT");
  } finally {
    await safeRollback(firstClient);
    firstClient.release();
  }

  const secondClient = await pools.runtimeContextReset.connect();
  try {
    const secondPid = await backendPid(secondClient);
    if (secondPid !== reusedPid) throw new A03ProofError("a03_max_one_pool_did_not_reuse_connection");
    await assertRuntimeScopeContextCleared(secondClient);

    // Exercise the second transaction outcome on the same actual max:1
    // runtime connection. Both the raw GUC and the RLS read helper must reset.
    await secondClient.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await secondClient.query(
      "SELECT pg_catalog.set_config('app.current_pilot_scope_id', $1, true)",
      [plan.fixture.scopeB.id],
    );
    const rollbackScope = await querySingle<{ scope_id: string | null }>(
      secondClient,
      "SELECT pilot.doorstar_current_pilot_scope_id()::text AS scope_id",
    );
    if (rollbackScope.scope_id !== plan.fixture.scopeB.id) {
      throw new A03ProofError("a03_transaction_local_scope_not_visible_before_rollback");
    }
    await secondClient.query("ROLLBACK");
  } finally {
    await safeRollback(secondClient);
    secondClient.release();
  }

  const thirdClient = await pools.runtimeContextReset.connect();
  try {
    const thirdPid = await backendPid(thirdClient);
    if (thirdPid !== reusedPid) throw new A03ProofError("a03_max_one_pool_did_not_reuse_connection");
    await assertRuntimeScopeContextCleared(thirdClient);
  } finally {
    await safeRollback(thirdClient);
    thirdClient.release();
  }
  ledger.pass("PG_POOL_MAX_ONE_TRANSACTION_LOCAL_CONTEXT_RESET");
}

/**
 * `doorstar_current_pilot_scope_id()` derives the same transaction-local GUC
 * used by the RLS policies. The runtime has this narrow read-support EXECUTE
 * grant, but no helper grants any writer authority.
 */
async function assertRuntimeScopeContextCleared(client: PoolClient): Promise<void> {
  const setting = await querySingle<{ scope_value: string | null }>(
    client,
    "SELECT pg_catalog.current_setting('app.current_pilot_scope_id', true) AS scope_value",
  );
  if (setting.scope_value !== null && setting.scope_value !== "") {
    throw new A03ProofError("a03_transaction_local_scope_leaked_across_pool_checkout");
  }
  const resolvedScope = await querySingle<{ scope_id: string | null }>(
    client,
    "SELECT pilot.doorstar_current_pilot_scope_id()::text AS scope_id",
  );
  if (resolvedScope.scope_id !== null) {
    throw new A03ProofError("a03_current_scope_helper_leaked_across_pool_checkout");
  }
  const scopeLessRows = await querySingle<{ visible_count: number }>(
    client,
    "SELECT count(*)::integer AS visible_count FROM pilot.\"PrincipalBinding\"",
  );
  if (scopeLessRows.visible_count !== 0) {
    throw new A03ProofError("a03_scope_less_rls_select_not_denied");
  }
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  await expectPostgresFailure(
    async () => client.query("SELECT pilot.pilot_runtime_preflight_v1()"),
    ["22023"],
    "a03_pool_reuse_preflight_not_denied",
  );
  await client.query("ROLLBACK");
}

async function proveAuthorizationTransactionSingleConsumption(
  plan: DisposableProofPlan,
  pools: ProofPools,
  ledger: ProofLedger,
): Promise<void> {
  const stateHash = hashHex("a03-auth-state");
  const browserBindingHash = hashHex("a03-auth-browser-binding");
  const nonceHash = hashHex("a03-auth-nonce");
  const createdId = await withScopedSerializableTransaction(
    pools.runtime,
    plan.fixture.scopeA.id,
    "runtime",
    async (client) => {
      const row = await querySingle<{ id: string }>(
        client,
        `SELECT pilot.pilot_create_authorization_transaction_v1(
           $1, $2, $3, $4::bytea, (CURRENT_TIMESTAMP + INTERVAL '5 minutes')::timestamp(3)
         ) AS id`,
        [stateHash, browserBindingHash, nonceHash, Buffer.from([0x01, 0x02, 0x03])],
      );
      return requireUuid(row.id);
    },
  );
  const firstConsumption = await withScopedSerializableTransaction(
    pools.runtime,
    plan.fixture.scopeA.id,
    "runtime",
    async (client) => client.query<{
      id: string;
      nonce_hash: string;
      verifier_ciphertext: Buffer;
    }>(
      `SELECT "id"::text AS id, "nonceHash" AS nonce_hash, "codeVerifierCiphertext" AS verifier_ciphertext
         FROM pilot.pilot_consume_authorization_transaction_v1($1, $2)`,
      [stateHash, browserBindingHash],
    ),
  );
  if (
    firstConsumption.rows.length !== 1
    || firstConsumption.rows[0]?.id !== createdId
    || firstConsumption.rows[0]?.nonce_hash !== nonceHash
    || !Buffer.isBuffer(firstConsumption.rows[0]?.verifier_ciphertext)
  ) {
    throw new A03ProofError("a03_authorization_transaction_first_consume_invalid");
  }
  const secondConsumption = await withScopedSerializableTransaction(
    pools.runtime,
    plan.fixture.scopeA.id,
    "runtime",
    async (client) => client.query(
      "SELECT * FROM pilot.pilot_consume_authorization_transaction_v1($1, $2)",
      [stateHash, browserBindingHash],
    ),
  );
  if (secondConsumption.rows.length !== 0) {
    throw new A03ProofError("a03_authorization_transaction_consumed_more_than_once");
  }
  ledger.pass("AUTHORIZATION_TRANSACTION_SINGLE_CONSUMPTION");
}

async function proveAppendOnlyAuditAndLastManagerRevoke(
  plan: DisposableProofPlan,
  pools: ProofPools,
  seeded: SeededProofData,
  ledger: ProofLedger,
): Promise<void> {
  await expectPostgresFailure(
    async () => bootstrapRevoke(
      pools.bootstrap,
      plan.fixture.scopeB.id,
      seeded.betaManager.id,
      seeded.betaManager.auditVersion,
    ),
    ["23514"],
    "a03_last_manager_bootstrap_revoke_not_denied",
  );
  const betaState = await withMigratorScopedRead(pools.migrator, plan.fixture.scopeB.id, async (client) => querySingle<{
    active: boolean;
    audit_version: number;
  }>(
    client,
    `SELECT "active" AS active, "auditVersion" AS audit_version
       FROM pilot."PrincipalBinding"
      WHERE "id" = $1::uuid`,
    [seeded.betaManager.id],
  ));
  if (!betaState.active || betaState.audit_version !== seeded.betaManager.auditVersion) {
    throw new A03ProofError("a03_last_manager_revoke_changed_durable_state");
  }
  ledger.pass("LAST_MANAGER_REVOKE_DENIAL");

  await expectPostgresFailure(
    async () => withMigratorScopedRead(pools.migrator, plan.fixture.scopeA.id, async (client) => client.query(
      `UPDATE pilot."BindingAudit"
          SET "reason" = "reason"
        WHERE "id" = $1::uuid`,
      [seeded.directAuditId],
    )),
    ["23514"],
    "a03_binding_audit_update_not_append_only",
  );
  await expectPostgresFailure(
    async () => withMigratorScopedRead(pools.migrator, plan.fixture.scopeA.id, async (client) => client.query(
      `DELETE FROM pilot."BindingAudit"
        WHERE "id" = $1::uuid`,
      [seeded.directAuditId],
    )),
    ["23514"],
    "a03_binding_audit_delete_not_append_only",
  );
  ledger.pass("APPEND_ONLY_AUDIT_AND_WITNESS_FIELDS");
}

async function seedManagerAndAuditProof(
  plan: DisposableProofPlan,
  pools: ProofPools,
  ledger: ProofLedger,
): Promise<SeededProofData> {
  await expectPostgresFailure(
    async () => bootstrapProvision(
      pools.bootstrap,
      plan.fixture.scopeB.id,
      "READER",
      false,
      "A03 rejected first reader",
    ),
    ["23514"],
    "a03_bootstrap_first_manager_guard_not_enforced",
  );

  const alphaManagerOne = await bootstrapProvision(
    pools.bootstrap,
    plan.fixture.scopeA.id,
    "ADMINISTRATOR",
    true,
    "A03 alpha manager one",
  );
  const alphaManagerTwo = await bootstrapProvision(
    pools.bootstrap,
    plan.fixture.scopeA.id,
    "ADMINISTRATOR",
    true,
    "A03 alpha manager two",
  );
  const betaManager = await bootstrapProvision(
    pools.bootstrap,
    plan.fixture.scopeB.id,
    "ADMINISTRATOR",
    true,
    "A03 beta manager",
  );
  await assertBootstrapProvisionAudit(pools.migrator, plan.fixture.scopeA.id, alphaManagerOne, "ADMINISTRATOR", true);
  await assertBootstrapProvisionAudit(pools.migrator, plan.fixture.scopeA.id, alphaManagerTwo, "ADMINISTRATOR", true);
  await assertBootstrapProvisionAudit(pools.migrator, plan.fixture.scopeB.id, betaManager, "ADMINISTRATOR", true);
  ledger.pass("BOOTSTRAP_MANAGER_GUARD_AND_AUDIT_SEED");

  ledger.beginPostSeedOperation("POST_SEED_SESSION_EXECUTE_CATALOG_ASSERTION");
  await assertSessionIssueExecuteCatalogPrivilege(pools.migrator, plan.runtime.username);
  ledger.completePostSeedOperation(
    "POST_SEED_SESSION_EXECUTE_CATALOG_ASSERTION",
    "POST_SEED_SESSION_EXECUTE_CATALOG_CONFIRMED",
  );

  const alphaManagerOneSessionHash = hashHex("alpha-manager-one-session");
  ledger.beginPostSeedOperation("POST_SEED_FIRST_SESSION_ISSUE");
  const alphaManagerOneSessionId = await issueOpaqueSession(
    pools.runtime,
    plan.fixture.scopeA.id,
    alphaManagerOne.id,
    alphaManagerOneSessionHash,
  );
  ledger.completePostSeedOperation("POST_SEED_FIRST_SESSION_ISSUE", "POST_SEED_FIRST_SESSION_ISSUED");

  ledger.beginPostSeedOperation("POST_SEED_SECOND_SESSION_ISSUE");
  await issueOpaqueSession(
    pools.runtime,
    plan.fixture.scopeB.id,
    betaManager.id,
    hashHex("beta-manager-session"),
  );
  ledger.completePostSeedOperation("POST_SEED_SECOND_SESSION_ISSUE", "POST_SEED_SECOND_SESSION_ISSUED");

  ledger.beginPostSeedOperation("POST_SEED_DIRECT_BINDING_UPDATE");
  const changedManagerTwo = await directUpdateBinding(
    pools.runtime,
    plan.fixture.scopeA.id,
    alphaManagerOneSessionHash,
    alphaManagerTwo.id,
    alphaManagerTwo.auditVersion,
    "SALES",
    true,
    true,
    "A03 audited role transition",
  );
  ledger.completePostSeedOperation("POST_SEED_DIRECT_BINDING_UPDATE", "POST_SEED_DIRECT_BINDING_UPDATED");

  const alphaManagerTwoSessionHash = hashHex("alpha-manager-two-session-after-transition");
  ledger.beginPostSeedOperation("POST_SEED_TRANSITIONED_SESSION_ISSUE");
  await issueOpaqueSession(
    pools.runtime,
    plan.fixture.scopeA.id,
    changedManagerTwo.id,
    alphaManagerTwoSessionHash,
  );
  ledger.completePostSeedOperation(
    "POST_SEED_TRANSITIONED_SESSION_ISSUE",
    "POST_SEED_TRANSITIONED_SESSION_ISSUED",
  );

  ledger.beginPostSeedOperation("POST_SEED_DIRECT_AUDIT_ASSERTION");
  const directAuditId = await assertAuditedDirectTransition(pools.migrator, plan.fixture.scopeA.id, changedManagerTwo.id);
  ledger.completePostSeedOperation("POST_SEED_DIRECT_AUDIT_ASSERTION", "DIRECT_MANAGER_AUDIT_TRANSITION");

  return {
    alphaManagerOne,
    alphaManagerTwo: changedManagerTwo,
    betaManager,
    alphaManagerOneSessionHash,
    alphaManagerOneSessionId,
    alphaManagerTwoSessionHash,
    directAuditId,
  };
}

/**
 * Checks only the catalog ACL before the first writer call. The principal name
 * is a generated in-memory value and is never emitted into evidence.
 */
async function assertSessionIssueExecuteCatalogPrivilege(migrator: Pool, principalName: string): Promise<void> {
  const result = await migrator.query<{ is_granted: boolean }>(
    `SELECT pg_catalog.has_function_privilege(
       $1,
       'pilot.pilot_issue_opaque_session_v1(uuid, text, bytea, timestamp without time zone)'::pg_catalog.regprocedure,
       'EXECUTE'
     ) AS is_granted`,
    [principalName],
  );
  if (result.rows.length !== 1 || result.rows[0]?.is_granted !== true) {
    throw new A03ProofError("a03_session_issue_execute_catalog_missing");
  }
}

async function proveTwoScopeRlsIsolation(
  plan: DisposableProofPlan,
  pools: ProofPools,
  seeded: SeededProofData,
  ledger: ProofLedger,
): Promise<void> {
  const alphaClient = await pools.runtime.connect();
  const betaClient = await pools.runtime.connect();
  try {
    const alphaPid = await backendPid(alphaClient);
    const betaPid = await backendPid(betaClient);
    if (alphaPid === betaPid) throw new A03ProofError("a03_rls_proof_requires_distinct_database_sessions");
    await startScopedRead(alphaClient, plan.fixture.scopeA.id);
    await startScopedRead(betaClient, plan.fixture.scopeB.id);
    const alphaBindings = await scopedIds(alphaClient, "pilot.\"PrincipalBinding\"");
    const betaBindings = await scopedIds(betaClient, "pilot.\"PrincipalBinding\"");
    const alphaSessions = await scopedIds(alphaClient, "pilot.\"OpaqueSession\"");
    const betaSessions = await scopedIds(betaClient, "pilot.\"OpaqueSession\"");
    assertOnlyScope(alphaBindings, plan.fixture.scopeA.id, "a03_alpha_binding_rls_isolation_failed");
    assertOnlyScope(betaBindings, plan.fixture.scopeB.id, "a03_beta_binding_rls_isolation_failed");
    assertOnlyScope(alphaSessions, plan.fixture.scopeA.id, "a03_alpha_session_rls_isolation_failed");
    assertOnlyScope(betaSessions, plan.fixture.scopeB.id, "a03_beta_session_rls_isolation_failed");
    const crossScopeBinding = await betaClient.query(
      `SELECT "id" FROM pilot."PrincipalBinding"
        WHERE "id" = $1::uuid`,
      [seeded.alphaManagerOne.id],
    );
    const crossScopeSession = await betaClient.query(
      `SELECT "id" FROM pilot."OpaqueSession"
        WHERE "id" = $1::uuid`,
      [seeded.alphaManagerOneSessionId],
    );
    if (crossScopeBinding.rows.length !== 0 || crossScopeSession.rows.length !== 0) {
      throw new A03ProofError("a03_cross_scope_concrete_id_visible_through_rls");
    }
    await alphaClient.query("ROLLBACK");
    await betaClient.query("ROLLBACK");
  } finally {
    await safeRollback(alphaClient);
    await safeRollback(betaClient);
    alphaClient.release();
    betaClient.release();
  }
  ledger.pass("TWO_SCOPE_RLS_ISOLATION_SEPARATE_PIDS");
}

async function proveSerializableManagerWriteSkewProtection(
  plan: DisposableProofPlan,
  pools: ProofPools,
  seeded: SeededProofData,
  ledger: ProofLedger,
): Promise<void> {
  const first = await pools.runtime.connect();
  const second = await pools.runtime.connect();
  const firstReason = "A03 concurrent demotion one";
  const secondReason = "A03 concurrent demotion two";
  try {
    await startScopedRead(first, plan.fixture.scopeA.id);
    await startScopedRead(second, plan.fixture.scopeA.id);
    const firstPid = await backendPid(first);
    const secondPid = await backendPid(second);
    if (firstPid === secondPid) throw new A03ProofError("a03_write_skew_proof_requires_distinct_database_sessions");

    const outcomes = await Promise.all([
      attemptConcurrentDemotion(
        first,
        seeded.alphaManagerTwoSessionHash,
        seeded.alphaManagerOne,
        firstReason,
      ),
      attemptConcurrentDemotion(
        second,
        seeded.alphaManagerOneSessionHash,
        seeded.alphaManagerTwo,
        secondReason,
      ),
    ]);
    const successes = outcomes.filter((outcome) => outcome === "committed");
    const failures = outcomes.filter((outcome) => outcome !== "committed");
    if (successes.length !== 1 || failures.length !== 1) {
      throw new A03ProofError("a03_serializable_manager_write_skew_not_prevented");
    }
    await assertExactlyOneCommittedRaceAudit(
      pools.migrator,
      plan.fixture.scopeA.id,
      [firstReason, secondReason],
      outcomes,
    );
    await assertAtLeastOneEffectiveManager(pools.migrator, plan.fixture.scopeA.id);
  } finally {
    await safeRollback(first);
    await safeRollback(second);
    first.release();
    second.release();
  }
  ledger.pass("SERIALIZABLE_MANAGER_WRITE_SKEW_PROTECTION");
}

async function assertBootstrapProvisionAudit(
  migrator: Pool,
  scopeId: string,
  binding: Binding,
  expectedRole: "ADMINISTRATOR" | "READER",
  expectedCanManagePilotRoster: boolean,
): Promise<void> {
  const audit = await withMigratorScopedRead(migrator, scopeId, async (client) => querySingle<{
    scope_id: string;
    binding_id: string;
    actor_binding_id: string | null;
    action: string;
    source: string;
    previous_role: string | null;
    next_role: string | null;
    previous_active: boolean | null;
    next_active: boolean | null;
    previous_can_manage: boolean | null;
    next_can_manage: boolean | null;
    reason: string | null;
    approval_reference: string | null;
    previous_version: number | null;
    next_version: number;
    correlation_id: string;
    witness_transaction_id: string;
    correlation_count: number;
  }>(
    client,
    `SELECT
       "pilotScopeId"::text AS scope_id,
       "bindingId"::text AS binding_id,
       "actorBindingId"::text AS actor_binding_id,
       "action"::text AS action,
       "source"::text AS source,
       "previousRole"::text AS previous_role,
       "nextRole"::text AS next_role,
       "previousActive" AS previous_active,
       "nextActive" AS next_active,
       "previousCanManagePilotRoster" AS previous_can_manage,
       "nextCanManagePilotRoster" AS next_can_manage,
       "reason" AS reason,
       "approvalReference" AS approval_reference,
       "previousAuditVersion" AS previous_version,
       "nextAuditVersion" AS next_version,
       "correlationId"::text AS correlation_id,
       "witnessTransactionId"::text AS witness_transaction_id,
       (
         SELECT count(*)::integer
           FROM pilot."BindingAudit" AS matching_correlation
          WHERE matching_correlation."pilotScopeId" = audit."pilotScopeId"
            AND matching_correlation."correlationId" = audit."correlationId"
       ) AS correlation_count
     FROM pilot."BindingAudit" AS audit
     WHERE "bindingId" = $1::uuid
       AND "source" = 'BOOTSTRAP_CLI'::pilot."BindingAuditSource"
       AND "action" = 'BOOTSTRAP_PROVISION'::pilot."BindingAuditAction"
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [binding.id],
  ));
  if (
    audit.scope_id !== scopeId
    || audit.binding_id !== binding.id
    || audit.actor_binding_id !== null
    || audit.action !== "BOOTSTRAP_PROVISION"
    || audit.source !== "BOOTSTRAP_CLI"
    || audit.previous_role !== null
    || audit.next_role !== expectedRole
    || audit.previous_active !== null
    || audit.next_active !== true
    || audit.previous_can_manage !== null
    || audit.next_can_manage !== expectedCanManagePilotRoster
    || audit.reason !== "bootstrap-provision"
    || audit.approval_reference !== "A03-DISPOSABLE-PROOF"
    || audit.previous_version !== null
    || audit.next_version !== 1
    || !/^[0-9a-f-]{36}$/i.test(audit.correlation_id)
    || !/^\d+$/.test(audit.witness_transaction_id)
    || audit.correlation_count !== 1
  ) {
    throw new A03ProofError("a03_bootstrap_provision_audit_not_db_witnessed");
  }
}

async function assertExactlyOneCommittedRaceAudit(
  migrator: Pool,
  scopeId: string,
  reasons: readonly [string, string],
  outcomes: readonly ("committed" | "rejected")[],
): Promise<void> {
  const committedIndex = outcomes.findIndex((outcome) => outcome === "committed");
  if (committedIndex < 0) throw new A03ProofError("a03_serializable_race_missing_committed_outcome");
  const result = await withMigratorScopedRead(migrator, scopeId, async (client) => client.query<{
    reason: string;
    action: string;
    source: string;
    actor_binding_id: string | null;
    previous_active: boolean | null;
    next_active: boolean | null;
    previous_version: number | null;
    next_version: number;
    correlation_id: string;
    witness_transaction_id: string;
    correlation_count: number;
  }>(
    `SELECT
       audit."reason" AS reason,
       audit."action"::text AS action,
       audit."source"::text AS source,
       audit."actorBindingId"::text AS actor_binding_id,
       audit."previousActive" AS previous_active,
       audit."nextActive" AS next_active,
       audit."previousAuditVersion" AS previous_version,
       audit."nextAuditVersion" AS next_version,
       audit."correlationId"::text AS correlation_id,
       audit."witnessTransactionId"::text AS witness_transaction_id,
       (
         SELECT count(*)::integer
           FROM pilot."BindingAudit" AS matching_correlation
          WHERE matching_correlation."pilotScopeId" = audit."pilotScopeId"
            AND matching_correlation."correlationId" = audit."correlationId"
       ) AS correlation_count
     FROM pilot."BindingAudit" AS audit
     WHERE audit."pilotScopeId" = $1::uuid
       AND audit."source" = 'DIRECT_ADMIN'::pilot."BindingAuditSource"
       AND audit."reason" = ANY($2::text[])
     ORDER BY audit."createdAt", audit."id"`,
    [scopeId, reasons],
  ));
  const audit = result.rows[0];
  if (
    result.rows.length !== 1
    || audit === undefined
    || audit.reason !== reasons[committedIndex]
    || audit.action !== "BINDING_DEACTIVATED"
    || audit.source !== "DIRECT_ADMIN"
    || audit.actor_binding_id === null
    || audit.previous_active !== true
    || audit.next_active !== false
    || audit.previous_version === null
    || audit.next_version !== audit.previous_version + 1
    || !/^[0-9a-f-]{36}$/i.test(audit.correlation_id)
    || !/^\d+$/.test(audit.witness_transaction_id)
    || audit.correlation_count !== 1
  ) {
    throw new A03ProofError("a03_serializable_race_audit_boundary_invalid");
  }
}

async function bootstrapProvision(
  pool: Pool,
  scopeId: string,
  role: "ADMINISTRATOR" | "READER",
  canManagePilotRoster: boolean,
  displayName: string,
): Promise<Binding> {
  return withScopedSerializableTransaction(pool, scopeId, "bootstrap", async (client) => {
    const row = await querySingle<{ id: string }>(
      client,
      `SELECT pilot.pilot_bootstrap_provision_binding_v1(
         $1, $2, $3, $4, $5::pilot."PilotOfficeRole", $6, $7, $8
       ) AS id`,
      [
        "https://a03.invalid/issuer",
        hashHex(`subject:${displayName}`),
        hashHex(`actor:${displayName}`),
        displayName,
        role,
        canManagePilotRoster,
        "A03-DISPOSABLE-PROOF",
        randomUUID(),
      ],
    );
    return { id: requireUuid(row.id), auditVersion: 1 };
  });
}

async function bootstrapRevoke(
  pool: Pool,
  scopeId: string,
  bindingId: string,
  expectedAuditVersion: number,
): Promise<void> {
  await withScopedSerializableTransaction(pool, scopeId, "bootstrap", async (client) => {
    await querySingle<{ id: string }>(
      client,
      `SELECT pilot.pilot_bootstrap_revoke_binding_v1(
         $1::uuid, $2, $3, $4::uuid
       ) AS id`,
      [bindingId, expectedAuditVersion, "A03-DISPOSABLE-PROOF", randomUUID()],
    );
  });
}

async function issueOpaqueSession(
  pool: Pool,
  scopeId: string,
  bindingId: string,
  sessionTokenHash: string,
): Promise<string> {
  return withScopedSerializableTransaction(pool, scopeId, "runtime", async (client) => {
    const row = await querySingle<{ id: string }>(
      client,
      `SELECT pilot.pilot_issue_opaque_session_v1(
         $1::uuid, $2, NULL, (CURRENT_TIMESTAMP + INTERVAL '30 minutes')::timestamp(3)
       ) AS id`,
      [bindingId, sessionTokenHash],
    );
    return requireUuid(row.id);
  });
}

async function directUpdateBinding(
  pool: Pool,
  scopeId: string,
  actorSessionTokenHash: string,
  targetId: string,
  expectedAuditVersion: number,
  nextRole: "SALES" | "ADMINISTRATOR",
  nextActive: boolean,
  nextCanManagePilotRoster: boolean,
  reason: string,
): Promise<Binding> {
  return withScopedSerializableTransaction(pool, scopeId, "runtime", async (client) => directUpdateBindingWithClient(
    client,
    actorSessionTokenHash,
    targetId,
    expectedAuditVersion,
    nextRole,
    nextActive,
    nextCanManagePilotRoster,
    reason,
  ));
}

async function directUpdateBindingWithClient(
  client: PoolClient,
  actorSessionTokenHash: string,
  targetId: string,
  expectedAuditVersion: number,
  nextRole: "SALES" | "ADMINISTRATOR",
  nextActive: boolean,
  nextCanManagePilotRoster: boolean,
  reason: string,
): Promise<Binding> {
  const row = await querySingle<{ id: string }>(
    client,
    `SELECT pilot.pilot_direct_update_binding_v1(
       $1, $2::uuid, $3, $4::pilot."PilotOfficeRole", $5, $6, $7, $8::uuid
     ) AS id`,
    [
      actorSessionTokenHash,
      targetId,
      expectedAuditVersion,
      nextRole,
      nextActive,
      nextCanManagePilotRoster,
      reason,
      randomUUID(),
    ],
  );
  return { id: requireUuid(row.id), auditVersion: expectedAuditVersion + 1 };
}

async function assertAuditedDirectTransition(migrator: Pool, scopeId: string, targetId: string): Promise<string> {
  const audit = await withMigratorScopedRead(migrator, scopeId, async (client) => querySingle<{
    id: string;
    source: string;
    previous_version: number;
    next_version: number;
    actor_binding_id: string | null;
    correlation_id: string;
    witness_transaction_id: string;
    correlation_count: number;
  }>(
    client,
    `SELECT
       "id"::text AS id,
       "source"::text AS source,
       "previousAuditVersion" AS previous_version,
       "nextAuditVersion" AS next_version,
       "actorBindingId"::text AS actor_binding_id,
       "correlationId"::text AS correlation_id,
       "witnessTransactionId"::text AS witness_transaction_id,
       count(*) OVER (PARTITION BY "pilotScopeId", "correlationId")::integer AS correlation_count
     FROM pilot."BindingAudit"
     WHERE "bindingId" = $1::uuid
       AND "source" = 'DIRECT_ADMIN'::pilot."BindingAuditSource"
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [targetId],
  ));
  if (
    audit.source !== "DIRECT_ADMIN"
    || audit.previous_version !== 1
    || audit.next_version !== 2
    || audit.actor_binding_id === null
    || !/^[0-9a-f-]{36}$/i.test(audit.correlation_id)
    || !/^\d+$/.test(audit.witness_transaction_id)
    || audit.correlation_count !== 1
  ) {
    throw new A03ProofError("a03_direct_manager_audit_not_db_witnessed");
  }
  return requireUuid(audit.id);
}

async function startScopedRead(client: PoolClient, scopeId: string): Promise<void> {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  await client.query("SELECT pg_catalog.set_config('app.current_pilot_scope_id', $1, true)", [scopeId]);
  await client.query("SELECT pilot.pilot_runtime_preflight_v1()");
}

async function scopedIds(client: PoolClient, table: "pilot.\"PrincipalBinding\"" | "pilot.\"OpaqueSession\""): Promise<string[]> {
  const result = await client.query<{ scope_id: string }>(
    `SELECT DISTINCT "pilotScopeId"::text AS scope_id FROM ${table} ORDER BY scope_id`,
  );
  return result.rows.map((row) => row.scope_id);
}

function assertOnlyScope(scopeIds: readonly string[], expectedScopeId: string, failureCode: string): void {
  if (scopeIds.length === 0 || scopeIds.some((scopeId) => scopeId !== expectedScopeId)) {
    throw new A03ProofError(failureCode);
  }
}

async function attemptConcurrentDemotion(
  client: PoolClient,
  actorSessionTokenHash: string,
  target: Binding,
  reason: string,
): Promise<"committed" | "rejected"> {
  try {
    await directUpdateBindingWithClient(
      client,
      actorSessionTokenHash,
      target.id,
      target.auditVersion,
      "ADMINISTRATOR",
      false,
      true,
      reason,
    );
    await client.query("COMMIT");
    return "committed";
  } catch (error) {
    const code = postgresErrorCode(error);
    await safeRollback(client);
    if (code === "40001" || code === "23514") return "rejected";
    throw new A03ProofError("a03_concurrent_manager_demotion_failed_unexpectedly");
  }
}

async function assertAtLeastOneEffectiveManager(migrator: Pool, scopeId: string): Promise<void> {
  const row = await withMigratorScopedRead(migrator, scopeId, async (client) => querySingle<{ manager_count: number }>(
    client,
    `SELECT count(*)::integer AS manager_count
       FROM pilot."PrincipalBinding"
      WHERE "active" IS TRUE
        AND "canManagePilotRoster" IS TRUE
        AND "role" IN (
          'SALES'::pilot."PilotOfficeRole",
          'TECHNICAL_PREPARATION'::pilot."PilotOfficeRole",
          'ORDER_APPROVER'::pilot."PilotOfficeRole",
          'PRODUCTION_PLANNER'::pilot."PilotOfficeRole",
          'INSTALLER'::pilot."PilotOfficeRole",
          'WAREHOUSE_DISPATCH'::pilot."PilotOfficeRole",
          'ADMINISTRATOR'::pilot."PilotOfficeRole",
          'READER'::pilot."PilotOfficeRole"
        )`,
  ));
  if (row.manager_count < 1) throw new A03ProofError("a03_effective_manager_invariant_lost");
}

async function withMigratorScopedRead<T>(
  migrator: Pool,
  scopeId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await migrator.connect();
  let open = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    open = true;
    await client.query("SELECT pg_catalog.set_config('app.current_pilot_scope_id', $1, true)", [scopeId]);
    const result = await work(client);
    await client.query("COMMIT");
    open = false;
    return result;
  } catch (error) {
    if (open) await safeRollback(client);
    throw error;
  } finally {
    client.release();
  }
}

function hashHex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requireUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new A03ProofError("a03_writer_returned_invalid_uuid");
  }
  return value;
}

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The original assertion outcome remains authoritative.
  }
}
