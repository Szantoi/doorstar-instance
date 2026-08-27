import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Static, source-only assertions for the approved A/P1 PostgreSQL policy.
 *
 * This verifier deliberately parses no connection string and never starts a
 * PostgreSQL client. A successful result is source evidence only; the
 * separately approved disposable staging proof remains required to establish
 * real ACL, RLS, transaction and concurrency behaviour.
 */
export type APolicyViolation = Readonly<{
  code: string;
  message: string;
}>;

const pilotSchema = "pilot";
const scopeSetting = "app.current_pilot_scope_id";
const scopeOwnedTables = ["PrincipalBinding", "OpaqueSession", "BindingAudit"] as const;
const relocatedFoundationTables = [
  "PilotScope",
  "AuthorizationTransaction",
  ...scopeOwnedTables,
] as const;
const writerRoutineNames = [
  "pilot_create_authorization_transaction_v1",
  "pilot_consume_authorization_transaction_v1",
  "pilot_direct_update_binding_v1",
  "pilot_bootstrap_provision_binding_v1",
  "pilot_bootstrap_revoke_binding_v1",
  "pilot_issue_opaque_session_v1",
  "pilot_revoke_opaque_session_v1",
] as const;
const bootstrapRoutineNames = [
  "pilot_bootstrap_preflight_v1",
  "pilot_bootstrap_provision_binding_v1",
  "pilot_bootstrap_revoke_binding_v1",
] as const;
const allowedPilotFunctionNames = [
  "doorstar_current_pilot_scope_id",
  "doorstar_guard_binding_audit_insert",
  "doorstar_is_effective_pilot_roster_manager",
  "doorstar_lock_pilot_manager_loss",
  "doorstar_pilot_roster_lock_key",
  "doorstar_require_effective_pilot_roster_manager",
  "doorstar_require_pilot_audit_writer",
  "doorstar_require_pilot_manager_after_change",
  "doorstar_require_pilot_write_context",
  "pilot_bootstrap_preflight_v1",
  "pilot_bootstrap_provision_binding_v1",
  "pilot_bootstrap_revoke_binding_v1",
  "pilot_consume_authorization_transaction_v1",
  "pilot_create_authorization_transaction_v1",
  "pilot_direct_update_binding_v1",
  "pilot_issue_opaque_session_v1",
  "pilot_revoke_opaque_session_v1",
  "pilot_runtime_preflight_v1",
].sort();
const expectedPolicyTargets = [
  ["BindingAudit_pilot_scope_policy", "BindingAudit"],
  ["OpaqueSession_pilot_scope_policy", "OpaqueSession"],
  ["PrincipalBinding_pilot_scope_policy", "PrincipalBinding"],
] as const;
const expectedTriggerNames = [
  "BindingAudit_write_guard",
  "PrincipalBinding_effective_manager_required",
  "PrincipalBinding_lock_manager_loss",
].sort();
const effectiveManagerRoles = [
  "SALES",
  "TECHNICAL_PREPARATION",
  "ORDER_APPROVER",
  "PRODUCTION_PLANNER",
  "INSTALLER",
  "WAREHOUSE_DISPATCH",
  "ADMINISTRATOR",
  "READER",
] as const;

function sqlWithoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\r\n]*/g, "");
}

function normalizedSql(source: string): string {
  return sqlWithoutComments(source).replace(/\r\n/g, "\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPattern(source: string, pattern: RegExp): boolean {
  return pattern.test(source);
}

function functionDefinition(source: string, name: string): string | undefined {
  const expression = new RegExp(
    `CREATE\\s+FUNCTION\\s+${escapeRegExp(pilotSchema)}\\.${escapeRegExp(name)}\\s*\\([\\s\\S]*?\\)\\s*RETURNS[\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$\\s*;`,
    "i",
  );
  return source.match(expression)?.[0];
}

function createdFunctionNames(source: string): string[] {
  return Array.from(
    source.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+pilot\.([A-Za-z0-9_]+)\s*\(/gi),
    (match) => match[1],
  ).sort();
}

function normalizedStatement(statement: string): string {
  return statement.replace(/\s+/g, " ").trim().replace(/;$/, "");
}

function functionParameters(definition: string): string {
  const match = definition.match(/CREATE\s+FUNCTION\s+pilot\.[A-Za-z0-9_]+\s*\(([\s\S]*?)\)\s*RETURNS/i);
  return match?.[1] ?? "";
}

function addMissing(
  violations: APolicyViolation[],
  code: string,
  message: string,
  condition: boolean,
): void {
  if (!condition) violations.push({ code, message });
}

function addForbidden(
  violations: APolicyViolation[],
  code: string,
  message: string,
  condition: boolean,
): void {
  if (condition) violations.push({ code, message });
}

function verifyRelocation(source: string, violations: APolicyViolation[]): void {
  addMissing(
    violations,
    "pilot-schema-relocation",
    "A policy must create the dedicated pilot schema before relocating the F lineage",
    hasPattern(source, /CREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS\s+pilot\s*;/i),
  );
  for (const table of relocatedFoundationTables) {
    addMissing(
      violations,
      "pilot-schema-relocation",
      `A policy must relocate public.${table} into pilot`,
      hasPattern(
        source,
        new RegExp(`ALTER\\s+TABLE\\s+public\\."${escapeRegExp(table)}"\\s+SET\\s+SCHEMA\\s+pilot\\s*;`, "i"),
      ),
    );
  }
  for (const typeName of ["PilotOfficeRole", "BindingAuditAction", "BindingAuditSource"]) {
    addMissing(
      violations,
      "pilot-schema-relocation",
      `A policy must relocate public.${typeName} into pilot`,
      hasPattern(
        source,
        new RegExp(`ALTER\\s+TYPE\\s+public\\."${escapeRegExp(typeName)}"\\s+SET\\s+SCHEMA\\s+pilot\\s*;`, "i"),
      ),
    );
  }
  for (const functionName of [
    "doorstar_pilot_reject_scope_mutation",
    "doorstar_pilot_reject_binding_audit_mutation",
  ]) {
    addMissing(
      violations,
      "pilot-schema-relocation",
      `A policy must relocate public.${functionName} into pilot`,
      hasPattern(
        source,
        new RegExp(`ALTER\\s+FUNCTION\\s+public\\."${escapeRegExp(functionName)}"\\s*\\(\\)\\s+SET\\s+SCHEMA\\s+pilot\\s*;`, "i"),
      ),
    );
  }
}

function verifyEmptyFoundationLineage(source: string, violations: APolicyViolation[]): void {
  for (const table of relocatedFoundationTables) {
    addMissing(
      violations,
      "empty-foundation-lineage",
      `A policy must reject a non-empty pilot.${table} before F-lineage relocation`,
      hasPattern(source, new RegExp(`EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+pilot\\."${escapeRegExp(table)}"\\s*\\)`, "i")),
    );
  }
}

function verifyScopeContext(source: string, violations: APolicyViolation[]): void {
  const currentScopeFunction = functionDefinition(source, "doorstar_current_pilot_scope_id");
  addMissing(
    violations,
    "pilot-scope-guc",
    `A policy must resolve only ${scopeSetting} through current_setting`,
    currentScopeFunction !== undefined
      && hasPattern(
        currentScopeFunction,
        /current_setting\s*\(\s*'app\.current_pilot_scope_id'\s*,\s*true\s*\)/i,
      ),
  );
  addForbidden(
    violations,
    "pilot-scope-guc",
    "A policy must not inherit a tenant or another app.current_* context",
    hasPattern(source, /app\.current_(?!pilot_scope_id\b)[a-z0-9_]+/i)
      || hasPattern(source, /app\.current_tenant_id/i),
  );
}

function verifyRls(source: string, violations: APolicyViolation[]): void {
  for (const table of scopeOwnedTables) {
    addMissing(
      violations,
      "rls-enable-force",
      `pilot.${table} must ENABLE ROW LEVEL SECURITY`,
      hasPattern(
        source,
        new RegExp(`ALTER\\s+TABLE\\s+pilot\\."${escapeRegExp(table)}"\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY\\s*;`, "i"),
      ),
    );
    addMissing(
      violations,
      "rls-enable-force",
      `pilot.${table} must FORCE ROW LEVEL SECURITY`,
      hasPattern(
        source,
        new RegExp(`ALTER\\s+TABLE\\s+pilot\\."${escapeRegExp(table)}"\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY\\s*;`, "i"),
      ),
    );
    addMissing(
      violations,
      "rls-scope-policy",
      `pilot.${table} must have an RLS policy bound to ${scopeSetting}`,
      hasPattern(
        source,
        new RegExp(
          `CREATE\\s+POLICY[\\s\\S]*?ON\\s+pilot\\."${escapeRegExp(table)}"[\\s\\S]*?doorstar_current_pilot_scope_id`,
          "i",
        ),
      ),
    );
    addForbidden(
      violations,
      "rls-enable-force",
      `pilot.${table} must not disable or remove forced RLS later in the migration`,
      hasPattern(
        source,
        new RegExp(`ALTER\\s+TABLE\\s+pilot\\."${escapeRegExp(table)}"\\s+(?:DISABLE|NO\\s+FORCE)\\s+ROW\\s+LEVEL\\s+SECURITY`, "i"),
      ),
    );
  }

  const discoveredPolicies = Array.from(
    source.matchAll(/CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+pilot\."([^"]+)"/gi),
    (match) => [match[1], match[2]],
  ).sort(([leftName, leftTarget], [rightName, rightTarget]) => (
    `${leftName}:${leftTarget}`.localeCompare(`${rightName}:${rightTarget}`)
  ));
  const expectedPolicies = [...expectedPolicyTargets].sort(([leftName, leftTarget], [rightName, rightTarget]) => (
    `${leftName}:${leftTarget}`.localeCompare(`${rightName}:${rightTarget}`)
  ));
  addMissing(
    violations,
    "rls-policy-manifest",
    "A policy may define exactly the three reviewed scope-bound RLS policies",
    JSON.stringify(discoveredPolicies) === JSON.stringify(expectedPolicies)
      && (source.match(/CREATE\s+POLICY\b/gi)?.length ?? 0) === expectedPolicies.length,
  );
  for (const [policyName, table] of expectedPolicyTargets) {
    const definition = source.match(
      new RegExp(
        `CREATE\\s+POLICY\\s+"${escapeRegExp(policyName)}"[\\s\\S]*?ON\\s+pilot\\."${escapeRegExp(table)}"[\\s\\S]*?;`,
        "i",
      ),
    )?.[0];
    addMissing(
      violations,
      "rls-policy-manifest",
      `${policyName} must retain a sole GUC-bound FOR ALL policy with matching USING and WITH CHECK`,
      definition !== undefined
        && hasPattern(definition, /FOR\s+ALL\s+TO\s+PUBLIC/i)
        && hasPattern(definition, /USING\s*\(\s*"pilotScopeId"\s*=\s*pilot\.doorstar_current_pilot_scope_id\s*\(\s*\)\s*\)/i)
        && hasPattern(definition, /WITH\s+CHECK\s*\(\s*"pilotScopeId"\s*=\s*pilot\.doorstar_current_pilot_scope_id\s*\(\s*\)\s*\)/i),
    );
  }
  addForbidden(
    violations,
    "rls-policy-mutation",
    "A policy must not alter an RLS policy after creating the reviewed three-policy manifest",
    hasPattern(source, /\bALTER\s+POLICY\b/i),
  );
}

function verifyGrantsAndLogins(source: string, violations: APolicyViolation[]): void {
  addForbidden(
    violations,
    "grant-statement",
    "A policy must contain no GRANT statement; later DBA ACL evidence is a separate human-gated operation",
    hasPattern(source, /^\s*GRANT\s+/im),
  );
  addForbidden(
    violations,
    "public-execute",
    "A policy must not grant EXECUTE (including ALL) to PUBLIC",
    hasPattern(source, /\bGRANT\s+(?:EXECUTE|ALL(?:\s+PRIVILEGES)?)\b[\s\S]*?\bTO\s+PUBLIC\s*;/i),
  );
  addForbidden(
    violations,
    "role-or-login-creation",
    "A policy must not create a PostgreSQL role, user or login",
    hasPattern(source, /\bCREATE\s+(?:ROLE|USER|LOGIN)\b/i)
      || hasPattern(source, /\bALTER\s+(?:ROLE|USER)\b/i),
  );
  addForbidden(
    violations,
    "writer-role-seed",
    "A policy must not seed a concrete runtime/bootstrap login mapping",
    hasPattern(source, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|COPY)\s+pilot\."PilotAuditWriterRole"/i),
  );
  addForbidden(
    violations,
    "raw-binding-audit-grant",
    "A policy must not grant raw BindingAudit table access",
    hasPattern(source, /\bGRANT\s+[\s\S]*?\bON\s+(?:TABLE\s+)?pilot\."BindingAudit"[\s\S]*?\bTO\b/i),
  );
  addMissing(
    violations,
    "public-deny-default",
    "A policy must revoke PUBLIC table and function access in the pilot schema",
    hasPattern(source, /REVOKE\s+ALL\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+pilot\s+FROM\s+PUBLIC\s*;/i)
      && hasPattern(source, /REVOKE\s+ALL\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+pilot\s+FROM\s+PUBLIC\s*;/i),
  );
  const expectedRevokes = [
    "REVOKE ALL ON SCHEMA pilot FROM PUBLIC",
    "REVOKE ALL ON ALL TABLES IN SCHEMA pilot FROM PUBLIC",
    "REVOKE ALL ON ALL SEQUENCES IN SCHEMA pilot FROM PUBLIC",
    "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pilot FROM PUBLIC",
  ].sort();
  const actualRevokes = Array.from(source.matchAll(/^\s*REVOKE\s+[^;]*;/gim), (match) => normalizedStatement(match[0])).sort();
  addMissing(
    violations,
    "revoke-manifest",
    "A policy may contain only the reviewed final PUBLIC deny-default revocations",
    JSON.stringify(actualRevokes) === JSON.stringify(expectedRevokes),
  );
}

function verifyDdlManifest(source: string, violations: APolicyViolation[]): void {
  addMissing(
    violations,
    "function-manifest",
    "A policy may create only the reviewed pilot helper, guard, preflight and writer routines",
    JSON.stringify(createdFunctionNames(source)) === JSON.stringify(allowedPilotFunctionNames)
      && (source.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/gi)?.length ?? 0) === allowedPilotFunctionNames.length,
  );
  addForbidden(
    violations,
    "ddl-escalation",
    "A policy must not create or drop unreviewed executable/schema authority",
    hasPattern(
      source,
      /\bCREATE\s+(?!SCHEMA\b|TABLE\b|UNIQUE\s+INDEX\b|FUNCTION\b|POLICY\b|(?:CONSTRAINT\s+)?TRIGGER\b)/i,
    )
      || hasPattern(source, /\bCREATE\s+(?:PROCEDURE|EXTENSION|DOMAIN|EVENT\s+TRIGGER)\b/i)
      || hasPattern(source, /\bALTER\s+DEFAULT\s+PRIVILEGES\b/i)
      || hasPattern(source, /\bDROP\s+(?:SCHEMA|TABLE|TYPE|FUNCTION|POLICY|TRIGGER|INDEX|ROLE|USER|OWNED)\b/i)
      || hasPattern(source, /\bALTER\s+(?:TABLE|FUNCTION|SCHEMA|TYPE)\b[^;]*\bOWNER\s+TO\b/i)
      || hasPattern(source, /\bALTER\s+TABLE\b[^;]*\b(?:DISABLE|ENABLE\s+ALWAYS)\s+TRIGGER\b/i)
      || hasPattern(source, /\bALTER\s+TABLE\b[^;]*\bDROP\s+(?:CONSTRAINT|COLUMN)\b/i),
  );
  addForbidden(
    violations,
    "dynamic-sql",
    "A policy must not use dynamic EXECUTE in a PL/pgSQL body",
    hasPattern(source, /^\s*EXECUTE\s+(?!FUNCTION\b)/im),
  );

  const discoveredTriggers = Array.from(
    source.matchAll(/CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+"([^"]+)"/gi),
    (match) => match[1],
  ).sort();
  addMissing(
    violations,
    "trigger-manifest",
    "A policy may create only the reviewed manager-loss and BindingAudit guards",
    JSON.stringify(discoveredTriggers) === JSON.stringify(expectedTriggerNames)
      && (source.match(/CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\b/gi)?.length ?? 0) === expectedTriggerNames.length,
  );
  const createdTables = Array.from(
    source.matchAll(/CREATE\s+TABLE\s+pilot\."([^"]+)"/gi),
    (match) => match[1],
  ).sort();
  addMissing(
    violations,
    "table-manifest",
    "A policy may create only the empty non-tenant writer-role map",
    JSON.stringify(createdTables) === JSON.stringify(["PilotAuditWriterRole"])
      && (source.match(/CREATE\s+TABLE\b/gi)?.length ?? 0) === 1,
  );
  const createdUniqueIndexes = Array.from(
    source.matchAll(/CREATE\s+UNIQUE\s+INDEX\s+"([^"]+)"\s+ON\s+pilot\."([^"]+)"/gi),
    (match) => `${match[1]}:${match[2]}`,
  ).sort();
  addMissing(
    violations,
    "index-manifest",
    "A policy may create only the reviewed audit correlation unique index",
    JSON.stringify(createdUniqueIndexes) === JSON.stringify(["BindingAudit_scope_correlation_key:BindingAudit"])
      && (source.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\b/gi)?.length ?? 0) === 1,
  );

  const expectedFunctionRelocations = [
    'ALTER FUNCTION public."doorstar_pilot_reject_binding_audit_mutation"() SET SCHEMA pilot',
    'ALTER FUNCTION public."doorstar_pilot_reject_scope_mutation"() SET SCHEMA pilot',
  ].sort();
  const actualFunctionRelocations = Array.from(
    source.matchAll(/^\s*ALTER\s+FUNCTION\s+[^;]*;/gim),
    (match) => normalizedStatement(match[0]),
  ).sort();
  addMissing(
    violations,
    "function-relocation-manifest",
    "A policy may alter only the two immutable F trigger functions into the pilot schema",
    JSON.stringify(actualFunctionRelocations) === JSON.stringify(expectedFunctionRelocations),
  );

  for (const name of allowedPilotFunctionNames.filter((name) => !writerRoutineNames.includes(name as typeof writerRoutineNames[number]))) {
    const definition = functionDefinition(source, name);
    addMissing(
      violations,
      "helper-security-invoker",
      `${name} must remain SECURITY INVOKER with pg_temp searched last; only reviewed writers may be SECURITY DEFINER`,
      definition !== undefined
        && hasPattern(definition, /SECURITY\s+INVOKER/i)
        && !hasPattern(definition, /SECURITY\s+DEFINER/i)
        && hasPattern(
          definition,
          /SET\s+search_path\s*=\s*pg_catalog(?:\s*,\s*pilot)?\s*,\s*pg_temp/i,
        ),
    );
  }
}

function verifySessionUserMapping(source: string, violations: APolicyViolation[]): void {
  const mappingRoutine = functionDefinition(source, "doorstar_require_pilot_audit_writer");
  addMissing(
    violations,
    "session-user-mapping",
    "A policy must resolve writer source through PilotAuditWriterRole and original session_user",
    mappingRoutine !== undefined
      && hasPattern(mappingRoutine, /FROM\s+pilot\."PilotAuditWriterRole"/i)
      && hasPattern(mappingRoutine, /WHERE\s+"source"\s*=\s*p_source/i)
      && hasPattern(mappingRoutine, /v_database_role_name\s*<>\s*session_user\s*::\s*text/i),
  );
  addForbidden(
    violations,
    "session-user-mapping",
    "Writer source mapping must not use current_user in place of original session_user",
    mappingRoutine !== undefined && hasPattern(mappingRoutine, /\bcurrent_user\b/i),
  );
}

function verifyPreflight(source: string, violations: APolicyViolation[]): void {
  for (const [routine, sourceLiteral] of [
    ["pilot_runtime_preflight_v1", "DIRECT_ADMIN"],
    ["pilot_bootstrap_preflight_v1", "BOOTSTRAP_CLI"],
  ] as const) {
    const definition = functionDefinition(source, routine);
    addMissing(
      violations,
      "production-scope-preflight",
      `${routine} must fail closed unless its original login, one configured scope and ${scopeSetting} agree`,
      definition !== undefined
        && hasPattern(definition, /SECURITY\s+INVOKER/i)
        && hasPattern(definition, /SET\s+search_path\s*=\s*pg_catalog\s*,\s*pilot\s*,\s*pg_temp/i)
        && hasPattern(definition, /current_user\s*<>\s*session_user/i)
        && hasPattern(definition, /current_setting\s*\(\s*'app\.current_pilot_scope_id'\s*,\s*true\s*\)/i)
        && hasPattern(definition, /SELECT\s+count\s*\(\s*\*\s*\)\s+INTO\s+v_scope_count\s+FROM\s+pilot\."PilotScope"/i)
        && hasPattern(definition, /v_scope_count\s*<>\s*1/i)
        && hasPattern(definition, new RegExp(`'${sourceLiteral}'\\s*::\\s*pilot\\."BindingAuditSource"`, "i"))
        && hasPattern(definition, /v_database_role_name\s*<>\s*session_user\s*::\s*text/i),
    );
  }
}

function verifyManagerWhitelist(source: string, violations: APolicyViolation[]): void {
  const managerRoutine = functionDefinition(source, "doorstar_is_effective_pilot_roster_manager");
  addMissing(
    violations,
    "manager-whitelist",
    "A policy must provide the closed effective roster-manager helper",
    managerRoutine !== undefined
      && hasPattern(managerRoutine, /p_active\s+IS\s+TRUE/i)
      && hasPattern(managerRoutine, /p_can_manage_pilot_roster\s+IS\s+TRUE/i)
      && hasPattern(managerRoutine, /p_role\s+IN\s*\(/i),
  );
  if (managerRoutine === undefined) return;
  for (const role of effectiveManagerRoles) {
    addMissing(
      violations,
      "manager-whitelist",
      `The effective roster-manager helper must explicitly whitelist ${role}`,
      hasPattern(managerRoutine, new RegExp(`'${role}'\\s*::\\s*pilot\\."PilotOfficeRole"`, "i")),
    );
  }
  addForbidden(
    violations,
    "manager-whitelist",
    "SHOP_FLOOR must never be an effective roster manager",
    hasPattern(managerRoutine, /'SHOP_FLOOR'\s*::\s*pilot\."PilotOfficeRole"/i),
  );
}

/**
 * SHOP_FLOOR is retained only in the immutable F enum for historical schema
 * compatibility. A/P1 must nevertheless make it impossible to persist as a
 * Doorstar Office binding, including through its two reviewed role writers.
 */
function verifyOfficeRoleBoundary(source: string, violations: APolicyViolation[]): void {
  addMissing(
    violations,
    "office-role-boundary",
    "PrincipalBinding must reject the historical SHOP_FLOOR enum value at the database boundary",
    hasPattern(
      source,
      /ALTER\s+TABLE\s+pilot\."PrincipalBinding"\s+ADD\s+CONSTRAINT\s+"PrincipalBinding_office_role_only"\s+CHECK\s*\(\s*"role"\s*<>\s*'SHOP_FLOOR'\s*::\s*pilot\."PilotOfficeRole"\s*\)\s*;/i,
    ),
  );

  for (const [routine, roleParameter] of [
    ["pilot_direct_update_binding_v1", "p_next_role"],
    ["pilot_bootstrap_provision_binding_v1", "p_role"],
  ] as const) {
    const definition = functionDefinition(source, routine);
    addMissing(
      violations,
      "office-role-boundary",
      `${routine} must reject SHOP_FLOOR before it can reach an Office binding`,
      definition !== undefined
        && hasPattern(
          definition,
          new RegExp(
            `${roleParameter}\\s*=\\s*'SHOP_FLOOR'\\s*::\\s*pilot\\."PilotOfficeRole"`,
            "i",
          ),
        ),
    );
  }
}

function verifyWriterRoutineShape(source: string, violations: APolicyViolation[]): void {
  const definitions = new Map<string, string>();
  for (const routine of writerRoutineNames) {
    const definition = functionDefinition(source, routine);
    addMissing(
      violations,
      "writer-routine",
      `A policy must contain ${routine}`,
      definition !== undefined,
    );
    if (definition !== undefined) definitions.set(routine, definition);
  }

  const writeContextRoutine = functionDefinition(source, "doorstar_require_pilot_write_context");
  addMissing(
    violations,
    "serializable-write-context",
    "A policy must require SERIALIZABLE isolation, one configured production scope and a session-user source map before every writer",
    writeContextRoutine !== undefined
      && hasPattern(functionParameters(writeContextRoutine), /p_source\s+pilot\."BindingAuditSource"/i)
      && hasPattern(writeContextRoutine, /current_setting\s*\(\s*'transaction_isolation'\s*\)/i)
      && hasPattern(writeContextRoutine, /<>\s*'serializable'/i)
      && hasPattern(writeContextRoutine, /doorstar_current_pilot_scope_id\s*\(\s*\)/i)
      && hasPattern(writeContextRoutine, /SELECT\s+count\s*\(\s*\*\s*\)\s+INTO\s+v_scope_count\s+FROM\s+pilot\."PilotScope"/i)
      && hasPattern(writeContextRoutine, /v_scope_count\s*<>\s*1/i)
      && hasPattern(writeContextRoutine, /FROM\s+pilot\."PilotAuditWriterRole"/i)
      && hasPattern(writeContextRoutine, /v_database_role_name\s*<>\s*session_user\s*::\s*text/i),
  );

  for (const [routine, expectedSource] of [
    ["pilot_create_authorization_transaction_v1", "DIRECT_ADMIN"],
    ["pilot_consume_authorization_transaction_v1", "DIRECT_ADMIN"],
    ["pilot_direct_update_binding_v1", "DIRECT_ADMIN"],
    ["pilot_bootstrap_provision_binding_v1", "BOOTSTRAP_CLI"],
    ["pilot_bootstrap_revoke_binding_v1", "BOOTSTRAP_CLI"],
    ["pilot_issue_opaque_session_v1", "DIRECT_ADMIN"],
    ["pilot_revoke_opaque_session_v1", "DIRECT_ADMIN"],
  ] as const) {
    const definition = definitions.get(routine);
    if (definition === undefined) continue;
    const parameters = functionParameters(definition);
    addMissing(
      violations,
      "writer-security-definer",
      `${routine} must be SECURITY DEFINER with fixed search_path and row_security on`,
      hasPattern(definition, /SECURITY\s+DEFINER/i)
        && hasPattern(definition, /SET\s+search_path\s*=\s*pg_catalog\s*,\s*pilot\s*,\s*pg_temp/i)
        && hasPattern(definition, /SET\s+row_security\s*=\s*on/i),
    );
    addMissing(
      violations,
      "serializable-write-context",
      `${routine} must call the DB-owned source-specific production write-context guard`,
      hasPattern(
        definition,
        new RegExp(
          `doorstar_require_pilot_write_context\\s*\\(\\s*'${expectedSource}'\\s*::\\s*pilot\\."BindingAuditSource"\\s*\\)`,
          "i",
        ),
      ),
    );
    addForbidden(
      violations,
      "writer-authority-parameters",
      `${routine} must not accept a caller-selected scope or audit source`,
      hasPattern(parameters, /\bp_(?:pilot_)?scope(?:_id)?\b/i) || hasPattern(parameters, /\bp_source\b/i),
    );

    const permitsServerGeneratedActorKey = routine === "pilot_bootstrap_provision_binding_v1";
    addForbidden(
      violations,
      "writer-authority-parameters",
      `${routine} must not accept actorKey authority`,
      !permitsServerGeneratedActorKey && hasPattern(parameters, /\bp_actor_?key\b/i),
    );
    if (permitsServerGeneratedActorKey) {
      addMissing(
        violations,
        "bootstrap-server-actor-key",
        "Bootstrap provision must accept its server-generated actor key explicitly",
        hasPattern(parameters, /\bp_actor_key\s+text\b/i),
      );
    }
  }
}

function verifyAuthorizationTransactionSurface(source: string, violations: APolicyViolation[]): void {
  const createRoutine = functionDefinition(source, "pilot_create_authorization_transaction_v1");
  const consumeRoutine = functionDefinition(source, "pilot_consume_authorization_transaction_v1");
  addMissing(
    violations,
    "authorization-transaction-routines",
    "The BFF must create scope-neutral authorization transactions only through the reviewed DB-owned routine",
    createRoutine !== undefined
      && hasPattern(createRoutine, /INSERT\s+INTO\s+pilot\."AuthorizationTransaction"/i)
      && hasPattern(createRoutine, /p_state_hash\s+text/i)
      && hasPattern(createRoutine, /p_browser_binding_hash\s+text/i)
      && hasPattern(createRoutine, /p_nonce_hash\s+text/i)
      && hasPattern(createRoutine, /p_code_verifier_ciphertext\s+bytea/i)
      && hasPattern(createRoutine, /p_expires_at\s+timestamp/i)
      && hasPattern(createRoutine, /p_expires_at\s*>\s*CURRENT_TIMESTAMP/i),
  );
  addMissing(
    violations,
    "authorization-transaction-routines",
    "The BFF must atomically consume authorization transactions only through the reviewed DB-owned routine",
    consumeRoutine !== undefined
      && hasPattern(consumeRoutine, /UPDATE\s+pilot\."AuthorizationTransaction"\s+AS\s+transaction_row/i)
      && hasPattern(consumeRoutine, /"consumedAt"\s+IS\s+NULL/i)
      && hasPattern(consumeRoutine, /"expiresAt"\s*>\s*CURRENT_TIMESTAMP/i)
      && hasPattern(consumeRoutine, /RETURN\s+QUERY/i)
      && hasPattern(
        consumeRoutine,
        /RETURNS\s+TABLE\s*\(\s*"id"\s+uuid\s*,\s*"nonceHash"\s+text\s*,\s*"codeVerifierCiphertext"\s+bytea\s*,\s*"createdAt"\s+timestamp\(3\)\s+without\s+time\s+zone\s*,\s*"expiresAt"\s+timestamp\(3\)\s+without\s+time\s+zone\s*\)/i,
      )
      && hasPattern(
        consumeRoutine,
        /RETURNING\s+transaction_row\."id"\s*,\s*transaction_row\."nonceHash"::text\s*,\s*transaction_row\."codeVerifierCiphertext"\s*,\s*transaction_row\."createdAt"\s*,\s*transaction_row\."expiresAt"/i,
      ),
  );

  const sourceOutsideAuthRoutines = source
    .replace(createRoutine ?? "", "")
    .replace(consumeRoutine ?? "", "");
  addForbidden(
    violations,
    "authorization-transaction-routines",
    "No other migration routine may mutate authorization transactions",
    hasPattern(
      sourceOutsideAuthRoutines,
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+pilot\."AuthorizationTransaction"/i,
    ),
  );
}

function verifyBootstrapSurface(source: string, violations: APolicyViolation[]): void {
  const discoveredBootstrapRoutines = Array.from(
    source.matchAll(/CREATE\s+FUNCTION\s+pilot\.(pilot_bootstrap_[A-Za-z0-9_]+)\s*\(/gi),
    (match) => match[1],
  ).sort();
  const expectedBootstrapRoutines = [...bootstrapRoutineNames].sort();
  addMissing(
    violations,
    "bootstrap-surface",
    "Bootstrap may expose only its read-only preflight plus provision and revoke",
    JSON.stringify(discoveredBootstrapRoutines) === JSON.stringify(expectedBootstrapRoutines),
  );

  const preflight = functionDefinition(source, "pilot_bootstrap_preflight_v1");
  const provision = functionDefinition(source, "pilot_bootstrap_provision_binding_v1");
  const revoke = functionDefinition(source, "pilot_bootstrap_revoke_binding_v1");
  addMissing(
    violations,
    "bootstrap-surface",
    "Bootstrap preflight must stay SECURITY INVOKER and must not mutate pilot state",
    preflight !== undefined
      && hasPattern(preflight, /SECURITY\s+INVOKER/i)
      && !hasPattern(preflight, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+pilot\./i),
  );
  for (const [name, definition] of [
    ["pilot_bootstrap_provision_binding_v1", provision],
    ["pilot_bootstrap_revoke_binding_v1", revoke],
  ] as const) {
    addMissing(
      violations,
      "bootstrap-surface",
      `${name} must use the DB-owned BOOTSTRAP_CLI source`,
      definition !== undefined && hasPattern(definition, /'BOOTSTRAP_CLI'\s*::\s*pilot\."BindingAuditSource"/i),
    );
  }
  addForbidden(
    violations,
    "bootstrap-surface",
    "Bootstrap revoke must not accept role, reactivation or roster-manager changes",
    revoke !== undefined
      && (hasPattern(functionParameters(revoke), /\bp_(?:next_)?role\b/i)
        || hasPattern(functionParameters(revoke), /\bp_(?:next_)?active\b/i)
        || hasPattern(functionParameters(revoke), /\bp_(?:next_)?can_manage_pilot_roster\b/i)
        || hasPattern(revoke, /SET\s+"role"\s*=/i)),
  );
}

function verifyManagerProtection(source: string, violations: APolicyViolation[]): void {
  const required = [
    [/CREATE\s+FUNCTION\s+pilot\.doorstar_pilot_roster_lock_key/i, "A policy must define a scope-specific manager lock key"],
    [/pg_catalog\.pg_advisory_xact_lock\s*\(/i, "A policy must take an advisory transaction lock for manager-loss candidates"],
    [/CREATE\s+CONSTRAINT\s+TRIGGER\s+"PrincipalBinding_effective_manager_required"/i, "A policy must install a deferred effective-manager constraint trigger"],
    [/DEFERRABLE\s+INITIALLY\s+DEFERRED/i, "The last-manager constraint trigger must be deferred"],
    [/doorstar_require_effective_pilot_roster_manager\s*\(/i, "A policy must check that an effective roster manager remains"],
  ] as const;
  for (const [pattern, message] of required) {
    addMissing(violations, "manager-loss-protection", message, hasPattern(source, pattern));
  }

  for (const routine of [
    "pilot_direct_update_binding_v1",
    "pilot_bootstrap_provision_binding_v1",
    "pilot_bootstrap_revoke_binding_v1",
  ]) {
    const definition = functionDefinition(source, routine);
    addMissing(
      violations,
      "manager-loss-protection",
      `${routine} must serialize roster mutation with the advisory lock`,
      definition !== undefined && hasPattern(definition, /pg_catalog\.pg_advisory_xact_lock\s*\(/i),
    );
  }

  const directWriter = functionDefinition(source, "pilot_direct_update_binding_v1");
  const directAdvisoryLock = directWriter?.indexOf("pg_catalog.pg_advisory_xact_lock") ?? -1;
  const directActorRowLock = directWriter?.indexOf("FOR SHARE OF session_row, binding") ?? -1;
  addMissing(
    violations,
    "manager-lock-order",
    "The direct writer must acquire the scope advisory lock before its actor/session row lock",
    directAdvisoryLock >= 0 && directActorRowLock >= 0 && directAdvisoryLock < directActorRowLock,
  );
}

function verifyAppendOnlyAudit(source: string, violations: APolicyViolation[]): void {
  addMissing(
    violations,
    "append-only-audit",
    "A policy must preserve the F append-only BindingAudit trigger function when relocating it",
    hasPattern(
      source,
      /ALTER\s+FUNCTION\s+public\."doorstar_pilot_reject_binding_audit_mutation"\s*\(\s*\)\s+SET\s+SCHEMA\s+pilot\s*;/i,
    ),
  );
  addMissing(
    violations,
    "append-only-audit",
    "A policy must install the DB-owned BindingAudit insert guard",
    hasPattern(source, /CREATE\s+TRIGGER\s+"BindingAudit_write_guard"\s+BEFORE\s+INSERT\s+ON\s+pilot\."BindingAudit"/i)
      && hasPattern(source, /witnessTransactionId"\s+IS\s+DISTINCT\s+FROM\s+pg_catalog\.txid_current\s*\(\s*\)/i),
  );
  addMissing(
    violations,
    "append-only-audit",
    "A policy must make audit versions and correlation IDs DB-checked evidence",
    hasPattern(source, /ADD\s+COLUMN\s+"previousAuditVersion"\s+INTEGER/i)
      && hasPattern(source, /ADD\s+COLUMN\s+"nextAuditVersion"\s+INTEGER\s+NOT\s+NULL/i)
      && hasPattern(source, /ADD\s+COLUMN\s+"correlationId"\s+UUID\s+NOT\s+NULL/i)
      && hasPattern(source, /"nextAuditVersion"\s*=\s*"previousAuditVersion"\s*\+\s*1/i)
      && hasPattern(source, /NEW\."action"\s*=\s*'BOOTSTRAP_PROVISION'/i)
      && hasPattern(source, /NEW\."previousAuditVersion"\s+IS\s+NOT\s+NULL\s+OR\s+NEW\."nextAuditVersion"\s*<>\s*1/i)
      && hasPattern(source, /CREATE\s+UNIQUE\s+INDEX\s+"BindingAudit_scope_correlation_key"[\s\S]*?"correlationId"/i),
  );
  addForbidden(
    violations,
    "append-only-audit",
    "A policy must not remove, disable or directly rewrite BindingAudit evidence",
    hasPattern(source, /DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?"BindingAudit_append_only"/i)
      || hasPattern(source, /ALTER\s+TABLE\s+pilot\."BindingAudit"\s+DISABLE\s+TRIGGER/i)
      || hasPattern(source, /\bUPDATE\s+pilot\."BindingAudit"\b/i)
      || hasPattern(source, /\bDELETE\s+FROM\s+pilot\."BindingAudit"\b/i),
  );
}

function verifyWriterMapDefaults(source: string, violations: APolicyViolation[]): void {
  addMissing(
    violations,
    "writer-map-defaults",
    "The later DBA writer-map insert must not need to fabricate an updatedAt value",
    hasPattern(
      source,
      /"updatedAt"\s+TIMESTAMP\s*\(\s*3\s*\)\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP/i,
    ),
  );
}

/**
 * Runs deterministic checks against migration SQL already present in memory.
 * No I/O and no database connection occur in this function.
 */
export function verifyAPolicySource(policyMigrationSql: string): readonly APolicyViolation[] {
  const source = normalizedSql(policyMigrationSql);
  const violations: APolicyViolation[] = [];

  verifyRelocation(source, violations);
  verifyEmptyFoundationLineage(source, violations);
  verifyScopeContext(source, violations);
  verifyRls(source, violations);
  verifyGrantsAndLogins(source, violations);
  verifyDdlManifest(source, violations);
  verifySessionUserMapping(source, violations);
  verifyPreflight(source, violations);
  verifyManagerWhitelist(source, violations);
  verifyOfficeRoleBoundary(source, violations);
  verifyWriterRoutineShape(source, violations);
  verifyAuthorizationTransactionSurface(source, violations);
  verifyBootstrapSurface(source, violations);
  verifyManagerProtection(source, violations);
  verifyAppendOnlyAudit(source, violations);
  verifyWriterMapDefaults(source, violations);

  return violations;
}

export function assertAPolicySource(policyMigrationSql: string): void {
  const violations = verifyAPolicySource(policyMigrationSql);
  if (violations.length > 0) {
    const detail = violations.map((violation) => `[${violation.code}] ${violation.message}`).join("\n");
    throw new Error(`doorstar_pilot_a_policy_source_invalid\n${detail}`);
  }
}

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const policyMigrationPath = join(
  packageRoot,
  "prisma",
  "migrations",
  "20260827120000_pilot_a_phase_authorization_policy",
  "migration.sql",
);

async function main(): Promise<void> {
  const source = await readFile(policyMigrationPath, "utf8");
  assertAPolicySource(source);
  process.stdout.write(JSON.stringify({
    migration: "20260827120000_pilot_a_phase_authorization_policy",
    databaseConnections: false,
    policySource: "valid",
  }, null, 2) + "\n");
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
