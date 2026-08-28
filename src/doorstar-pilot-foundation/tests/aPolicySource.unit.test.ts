import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  verifyAPolicySource,
  verifyAdminRosterPolicySource,
} from "../scripts/verifyAPolicySource.js";

const policyMigrationPath = fileURLToPath(
  new URL("../prisma/migrations/20260827120000_pilot_a_phase_authorization_policy/migration.sql", import.meta.url),
);
const adminRosterMigrationPath = fileURLToPath(
  new URL("../prisma/migrations/20260828140000_pilot_admin_roster/migration.sql", import.meta.url),
);

async function policySource(): Promise<string> {
  return readFile(policyMigrationPath, "utf8");
}

async function adminRosterSource(): Promise<string> {
  return readFile(adminRosterMigrationPath, "utf8");
}

function violationCodes(source: string): string[] {
  return [...new Set(verifyAPolicySource(source).map((violation) => violation.code))];
}

function adminRosterViolationCodes(source: string): string[] {
  return [...new Set(verifyAdminRosterPolicySource(source).map((violation) => violation.code))];
}

describe("A/P1 authorization policy source verifier", () => {
  it("accepts the reviewed isolated A migration without connecting to a database", async () => {
    expect(verifyAPolicySource(await policySource())).toEqual([]);
  });

  it("rejects a missing pilot-schema relocation", async () => {
    const source = (await policySource()).replace("CREATE SCHEMA IF NOT EXISTS pilot;", "");
    expect(violationCodes(source)).toContain("pilot-schema-relocation");
  });

  it("rejects A application when any F table has not been fenced as empty", async () => {
    const source = (await policySource()).replace(
      'OR EXISTS (SELECT 1 FROM pilot."OpaqueSession")',
      "",
    );
    expect(violationCodes(source)).toContain("empty-foundation-lineage");
  });

  it("rejects a tenant or browser-shaped scope context", async () => {
    const source = (await policySource()).replaceAll("app.current_pilot_scope_id", "app.current_tenant_id");
    expect(violationCodes(source)).toContain("pilot-scope-guc");
  });

  it("rejects missing FORCE RLS on a scope-owned table", async () => {
    const source = (await policySource()).replace(
      'ALTER TABLE pilot."OpaqueSession" FORCE ROW LEVEL SECURITY;',
      "",
    );
    expect(violationCodes(source)).toContain("rls-enable-force");
  });

  it("rejects PUBLIC execute, role/login creation, writer-map seeds and raw audit grants", async () => {
    const source = `${await policySource()}
      GRANT EXECUTE ON FUNCTION pilot.pilot_direct_update_binding_v1() TO PUBLIC;
      CREATE ROLE forbidden_runtime LOGIN;
      INSERT INTO pilot."PilotAuditWriterRole" ("source", "databaseRoleName") VALUES ('DIRECT_ADMIN', 'forbidden_runtime');
      GRANT INSERT ON TABLE pilot."BindingAudit" TO forbidden_runtime;
    `;
    const codes = violationCodes(source);
    expect(codes).toContain("public-execute");
    expect(codes).toContain("role-or-login-creation");
    expect(codes).toContain("writer-role-seed");
    expect(codes).toContain("raw-binding-audit-grant");
  });

  it("rejects non-PUBLIC grants, permissive RLS additions and unreviewed routines", async () => {
    const source = `${await policySource()}
      GRANT UPDATE ON TABLE pilot."PrincipalBinding" TO runtime_login;
      CREATE POLICY "PrincipalBinding_permissive_escape" ON pilot."PrincipalBinding"
        FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
      CREATE FUNCTION pilot.pilot_unreviewed_backdoor_v1()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$ BEGIN UPDATE pilot."PrincipalBinding" SET "active" = true; END; $$;
    `;
    const codes = violationCodes(source);
    expect(codes).toContain("grant-statement");
    expect(codes).toContain("rls-policy-manifest");
    expect(codes).toContain("function-manifest");
  });

  it("rejects mutation of a reviewed scope policy after its manifest is created", async () => {
    const source = `${await policySource()}
      ALTER POLICY "PrincipalBinding_pilot_scope_policy" ON pilot."PrincipalBinding"
        USING (true) WITH CHECK (true);
    `;
    expect(violationCodes(source)).toContain("rls-policy-mutation");
  });

  it("requires original session_user to resolve the writer identity", async () => {
    const source = (await policySource()).replaceAll("session_user::text", "current_user::text");
    const codes = violationCodes(source);
    expect(codes).toContain("session-user-mapping");
  });

  it("requires separate runtime/bootstrap preflights to fence the sole production scope", async () => {
    const source = (await policySource())
      .replaceAll("current_user <> session_user", "current_user = session_user")
      .replaceAll("v_scope_count <> 1", "v_scope_count = 1");
    expect(violationCodes(source)).toContain("production-scope-preflight");
  });

  it("rejects SHOP_FLOOR in the closed roster-manager whitelist", async () => {
    const source = (await policySource()).replace(
      `'READER'::pilot."PilotOfficeRole"`,
      `'READER'::pilot."PilotOfficeRole",\n      'SHOP_FLOOR'::pilot."PilotOfficeRole"`,
    );
    expect(violationCodes(source)).toContain("manager-whitelist");
  });

  it("requires the DB Office boundary and both role writers to reject the historical SHOP_FLOOR enum", async () => {
    const withoutConstraint = (await policySource()).replace(
      'ALTER TABLE pilot."PrincipalBinding"\n  ADD CONSTRAINT "PrincipalBinding_office_role_only"\n  CHECK ("role" <> \'SHOP_FLOOR\'::pilot."PilotOfficeRole");\n',
      "",
    );
    expect(violationCodes(withoutConstraint)).toContain("office-role-boundary");

    const withoutWriterGuard = (await policySource()).replace(
      "     OR p_role = 'SHOP_FLOOR'::pilot.\"PilotOfficeRole\"\n",
      "",
    );
    expect(violationCodes(withoutWriterGuard)).toContain("office-role-boundary");

    const withoutDirectWriterGuard = (await policySource()).replace(
      "     OR p_next_role = 'SHOP_FLOOR'::pilot.\"PilotOfficeRole\"\n",
      "",
    );
    expect(violationCodes(withoutDirectWriterGuard)).toContain("office-role-boundary");
  });

  it("requires serializable, fixed-path SECURITY DEFINER writers", async () => {
    const source = (await policySource())
      .replaceAll("SET search_path = pg_catalog, pilot, pg_temp", "SET search_path = pg_catalog")
      .replaceAll("SECURITY DEFINER", "SECURITY INVOKER")
      .replace("<> 'serializable'", "<> 'read committed'");
    const codes = violationCodes(source);
    expect(codes).toContain("writer-security-definer");
    expect(codes).toContain("serializable-write-context");
  });

  it("requires pg_temp to be explicit and last for helper search paths", async () => {
    const source = (await policySource()).replace(
      "CREATE FUNCTION pilot.doorstar_is_effective_pilot_roster_manager(\n  p_active boolean,\n  p_role pilot.\"PilotOfficeRole\",\n  p_can_manage_pilot_roster boolean\n)\nRETURNS boolean\nLANGUAGE sql\nIMMUTABLE\nSTRICT\nSECURITY INVOKER\nSET search_path = pg_catalog, pilot, pg_temp",
      "CREATE FUNCTION pilot.doorstar_is_effective_pilot_roster_manager(\n  p_active boolean,\n  p_role pilot.\"PilotOfficeRole\",\n  p_can_manage_pilot_roster boolean\n)\nRETURNS boolean\nLANGUAGE sql\nIMMUTABLE\nSTRICT\nSECURITY INVOKER\nSET search_path = pg_catalog, pilot",
    );
    expect(violationCodes(source)).toContain("helper-security-invoker");
  });

  it("requires each writer to enter the source-specific one-scope write guard", async () => {
    const source = (await policySource()).replace(
      "v_scope_id := pilot.doorstar_require_pilot_write_context(\n    'DIRECT_ADMIN'::pilot.\"BindingAuditSource\"\n  );",
      "v_scope_id := pilot.doorstar_require_pilot_write_context(\n    'BOOTSTRAP_CLI'::pilot.\"BindingAuditSource\"\n  );",
    );
    expect(violationCodes(source)).toContain("serializable-write-context");
  });

  it("permits authorization transaction mutation only through its two reviewed routines", async () => {
    const source = `${await policySource()}
      UPDATE pilot."AuthorizationTransaction" SET "consumedAt" = CURRENT_TIMESTAMP;
    `;
    expect(violationCodes(source)).toContain("authorization-transaction-routines");
  });

  it("requires the canonical text nonce return contract when consuming an authorization transaction", async () => {
    const source = await policySource();
    const withoutExplicitTextCast = source.replace(
      'transaction_row."nonceHash"::text,',
      'transaction_row."nonceHash",',
    );
    expect(violationCodes(withoutExplicitTextCast)).toContain("authorization-transaction-routines");

    const withCharacterNonceResult = source.replace(
      '  "nonceHash" text,',
      '  "nonceHash" character(64),',
    );
    expect(violationCodes(withCharacterNonceResult)).toContain("authorization-transaction-routines");
  });

  it("rejects caller-selected scope/source and actorKey on runtime writers", async () => {
    const source = (await policySource()).replace(
      "CREATE FUNCTION pilot.pilot_direct_update_binding_v1(\n  p_actor_session_token_hash text,",
      "CREATE FUNCTION pilot.pilot_direct_update_binding_v1(\n  p_scope_id uuid,\n  p_source pilot.\"BindingAuditSource\",\n  p_actor_key text,\n  p_actor_session_token_hash text,",
    );
    expect(violationCodes(source)).toContain("writer-authority-parameters");
  });

  it("permits actorKey only on server-side bootstrap provision and rejects extra bootstrap mutations", async () => {
    const source = `${await policySource()}
      CREATE FUNCTION pilot.pilot_bootstrap_reactivate_binding_v1()
      RETURNS void
      LANGUAGE sql
      AS $$ SELECT NULL; $$;
    `;
    expect(violationCodes(source)).toContain("bootstrap-surface");
  });

  it("requires advisory locking and the deferred last-manager protection", async () => {
    const source = (await policySource())
      .replaceAll("pg_catalog.pg_advisory_xact_lock", "pg_catalog.pg_advisory_lock")
      .replace("DEFERRABLE INITIALLY DEFERRED", "NOT DEFERRABLE");
    expect(violationCodes(source)).toContain("manager-loss-protection");
  });

  it("requires the advisory roster lock before the direct writer locks an actor row", async () => {
    const source = (await policySource()).replace(
      "PERFORM pg_catalog.pg_advisory_xact_lock(\n    pilot.doorstar_pilot_roster_lock_key(v_scope_id)\n  );\n\n  IF p_actor_session_token_hash",
      "IF p_actor_session_token_hash",
    );
    expect(violationCodes(source)).toContain("manager-lock-order");
  });

  it("rejects removal of the append-only audit relocation or a direct audit rewrite", async () => {
    const source = `${(await policySource()).replace(
      'ALTER FUNCTION public."doorstar_pilot_reject_binding_audit_mutation"() SET SCHEMA pilot;',
      "",
    )}
      UPDATE pilot."BindingAudit" SET "reason" = 'rewritten';
    `;
    expect(violationCodes(source)).toContain("append-only-audit");
  });

  it("requires the audited NULL-to-1 and n-to-n-plus-1 version transition", async () => {
    const source = (await policySource()).replace(
      '"nextAuditVersion" = "previousAuditVersion" + 1',
      '"nextAuditVersion" = "previousAuditVersion"',
    );
    expect(violationCodes(source)).toContain("append-only-audit");
  });
});

describe("append-only direct-admin roster policy source verifier", () => {
  it("accepts the reviewed admin roster migration without connecting to a database", async () => {
    expect(verifyAdminRosterPolicySource(await adminRosterSource())).toEqual([]);
  });

  it("requires the committed audit action and the two narrow public-execute revocations", async () => {
    const withoutEnum = (await adminRosterSource()).replace(
      "ALTER TYPE pilot.\"BindingAuditAction\" ADD VALUE 'DIRECT_ADMIN_PROVISION';",
      "",
    );
    expect(adminRosterViolationCodes(withoutEnum)).toContain("admin-roster-enum");

    const withoutRevoke = (await adminRosterSource()).replace(
      "REVOKE ALL ON FUNCTION pilot.pilot_list_direct_admin_bindings_v1(text) FROM PUBLIC;",
      "",
    );
    expect(adminRosterViolationCodes(withoutRevoke)).toContain("admin-roster-public-execute");
  });

  it("rejects provision authority selected by a caller or a missing effective-manager session check", async () => {
    const withCallerAuthority = (await adminRosterSource()).replace(
      "CREATE FUNCTION pilot.pilot_direct_provision_binding_v1(\n  p_actor_session_token_hash text,",
      "CREATE FUNCTION pilot.pilot_direct_provision_binding_v1(\n  p_scope_id uuid,\n  p_actor_binding_id uuid,\n  p_source pilot.\"BindingAuditSource\",\n  p_actor_session_token_hash text,",
    );
    expect(adminRosterViolationCodes(withCallerAuthority)).toContain("admin-roster-authority-parameters");

    const withoutLiveSession = (await adminRosterSource()).replace(
      'AND session_row."bindingEpoch" = binding."auditVersion"',
      "",
    );
    expect(adminRosterViolationCodes(withoutLiveSession)).toContain("admin-roster-provision-guards");
  });

  it("rejects a provision writer that admits SHOP_FLOOR, omits duplicate protection or makes the audit reason caller-owned", async () => {
    const withoutOfficeGuard = (await adminRosterSource()).replace(
      "     OR p_role = 'SHOP_FLOOR'::pilot.\"PilotOfficeRole\"\n",
      "",
    );
    expect(adminRosterViolationCodes(withoutOfficeGuard)).toContain("admin-roster-provision-guards");

    const withoutDuplicateProtection = (await adminRosterSource()).replace(
      "direct roster provision cannot create a duplicate binding",
      "duplicate protection removed",
    );
    expect(adminRosterViolationCodes(withoutDuplicateProtection)).toContain("admin-roster-provision-guards");

    const callerOwnedReason = (await adminRosterSource()).replace(
      "  p_correlation_id uuid\n)",
      "  p_reason text,\n  p_correlation_id uuid\n)",
    );
    expect(adminRosterViolationCodes(callerOwnedReason)).toContain("admin-roster-provision-contract");
  });

  it("requires a privacy-minimal manager-only roster list and preserves the append-only audit guard", async () => {
    const listLeaksIdentity = (await adminRosterSource()).replace(
      '    binding."displayName"::text,',
      '    binding."issuer",',
    );
    expect(adminRosterViolationCodes(listLeaksIdentity)).toContain("admin-roster-list-privacy");

    const auditRewrite = `${await adminRosterSource()}\nUPDATE pilot."BindingAudit" SET "reason" = 'rewritten';`;
    expect(adminRosterViolationCodes(auditRewrite)).toContain("admin-roster-append-only");

    const weakAuditGuard = (await adminRosterSource()).replace(
      "NEW.\"reason\" IS DISTINCT FROM 'direct-admin-provision'",
      "false",
    );
    expect(adminRosterViolationCodes(weakAuditGuard)).toContain("admin-roster-audit-guard");
  });
});
