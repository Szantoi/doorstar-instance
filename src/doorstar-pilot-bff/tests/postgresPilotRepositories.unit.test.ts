import { describe, expect, it } from "vitest";
import {
  PostgresPilotRepositories,
  type NewAuthorizationTransaction,
  type NewOpaqueSession,
  type DirectRosterBindingProvision,
  type DirectRosterBindingUpdate,
  type PilotPgClient,
  type PilotPgPool,
  type PilotPgQueryResult,
  type PilotPgRow,
} from "../src/index.js";

const scopeId = "00000000-0000-4000-8000-000000000001";
const bindingId = "00000000-0000-4000-8000-000000000002";
const sessionId = "00000000-0000-4000-8000-000000000003";
const transactionId = "00000000-0000-4000-8000-000000000004";
const digest = "a".repeat(64);
const now = new Date("2026-08-27T10:00:00.000Z");

describe("PostgresPilotRepositories", () => {
  it("uses one serializable checkout with local scope GUC and preflight for each BFF database boundary", async () => {
    const pool = new ScriptedPool();
    const repositories = new PostgresPilotRepositories(pool);

    await repositories.requireSingleConfiguredScope({ scopeKey: "doorstar-pilot" });
    await repositories.create(newAuthorizationTransaction());
    await repositories.consumeMatching({
      stateHash: digest,
      browserBindingHash: "b".repeat(64),
    });
    await repositories.findActiveByOidcIdentity({
      pilotScopeId: scopeId,
      issuer: "https://identity.example.invalid/realms/doorstar",
      subjectDigest: digest,
    });
    await repositories.createForActiveBinding(newOpaqueSession());
    await repositories.findActiveByTokenHash({
      pilotScopeId: scopeId,
      sessionTokenHash: "c".repeat(64),
      observedAt: now,
    });
    await repositories.revokeByTokenHash({
      pilotScopeId: scopeId,
      sessionTokenHash: "c".repeat(64),
      revokedAt: now,
    });

    expect(pool.clients).toHaveLength(7);
    for (const client of pool.clients) {
      expect(client.calls[0].text).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE");
      expect(client.calls).toContainEqual(expect.objectContaining({ text: "COMMIT" }));
      expect(client.released).toBe(true);
    }
    for (const client of pool.clients.slice(1)) {
      expect(client.calls).toContainEqual(expect.objectContaining({
        text: "SELECT pg_catalog.set_config('app.current_pilot_scope_id', $1, true)",
        values: [scopeId],
      }));
      expect(client.calls).toContainEqual(expect.objectContaining({
        text: "SELECT pilot.pilot_runtime_preflight_v1()",
      }));
    }
  });

  it("uses only stored routines for authorization transaction and opaque-session mutations", async () => {
    const pool = new ScriptedPool();
    const repositories = new PostgresPilotRepositories(pool);
    await repositories.requireSingleConfiguredScope({ scopeKey: "doorstar-pilot" });
    await repositories.create(newAuthorizationTransaction());
    await repositories.consumeMatching({
      stateHash: digest,
      browserBindingHash: "b".repeat(64),
    });
    await repositories.createForActiveBinding(newOpaqueSession());
    await repositories.revokeByTokenHash({
      pilotScopeId: scopeId,
      sessionTokenHash: "c".repeat(64),
      revokedAt: now,
    });

    const sql = pool.clients.flatMap((client) => client.calls.map((call) => call.text)).join("\n");
    expect(sql).toContain("pilot.pilot_create_authorization_transaction_v1");
    expect(sql).toContain("pilot.pilot_consume_authorization_transaction_v1");
    expect(sql).toContain("pilot.pilot_issue_opaque_session_v1");
    expect(sql).toContain("pilot.pilot_revoke_opaque_session_v1");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+INTO?\s+pilot\."(?:AuthorizationTransaction|OpaqueSession|PrincipalBinding|BindingAudit)"/i);
  });

  it("reads a session only with matching scope, active binding and binding epoch predicates", async () => {
    const pool = new ScriptedPool();
    const repositories = new PostgresPilotRepositories(pool);
    await repositories.requireSingleConfiguredScope({ scopeKey: "doorstar-pilot" });

    const session = await repositories.findActiveByTokenHash({
      pilotScopeId: scopeId,
      sessionTokenHash: "c".repeat(64),
      observedAt: now,
    });

    const query = pool.clients[1].calls.find((call) => call.text.includes('FROM pilot."OpaqueSession"'));
    expect(query?.text).toContain('session_row."pilotScopeId" = $1');
    expect(query?.text).toContain('binding."pilotScopeId" = $1');
    expect(query?.text).toContain('session_row."bindingEpoch" = binding."auditVersion"');
    expect(query?.text).toContain('binding."active" = true');
    expect(session).toMatchObject({ id: sessionId, bindingId, pilotScopeId: scopeId });
  });

  it("never turns a Plant-only SHOP_FLOOR database row into a BFF session principal", async () => {
    const pool = new ScriptedPool({ sessionRole: "SHOP_FLOOR" });
    const repositories = new PostgresPilotRepositories(pool);
    await repositories.requireSingleConfiguredScope({ scopeKey: "doorstar-pilot" });

    await expect(repositories.findActiveByTokenHash({
      pilotScopeId: scopeId,
      sessionTokenHash: "c".repeat(64),
      observedAt: now,
    })).rejects.toThrow("pilot_postgres_role_invalid");
  });

  it("rolls back and releases the checkout when policy preflight fails", async () => {
    const pool = new ScriptedPool({ failRuntimePreflight: true });
    const repositories = new PostgresPilotRepositories(pool);

    await expect(repositories.requireSingleConfiguredScope({ scopeKey: "doorstar-pilot" })).rejects.toThrow(
      "runtime_preflight_failed",
    );

    expect(pool.clients[0].calls.map((call) => call.text)).toContain("ROLLBACK");
    expect(pool.clients[0].released).toBe(true);
    expect(pool.clients[0].releaseError).toBeInstanceOf(Error);
  });

  it("uses the guarded list, provision and update stored-routine contracts for admin roster work", async () => {
    const pool = new ScriptedPool();
    const repositories = new PostgresPilotRepositories(pool);
    await repositories.requireSingleConfiguredScope({ scopeKey: "doorstar-pilot" });

    const manager = await repositories.findEffectiveManagerBySessionTokenHash({
      pilotScopeId: scopeId,
      sessionTokenHash: "c".repeat(64),
      observedAt: now,
    });
    const listed = await repositories.listDirectAdminBindings({
      pilotScopeId: scopeId,
      actorSessionTokenHash: "c".repeat(64),
    });
    const provisioned = await repositories.provisionDirectAdminBinding(directProvision());
    const updated = await repositories.updateDirectAdminBinding(directUpdate());

    expect(manager).toEqual({ bindingId, pilotScopeId: scopeId });
    expect(listed).toEqual([expectedRosterUser()]);
    expect(provisioned).toEqual(expectedRosterUser());
    expect(updated).toEqual(expectedRosterUser());
    const sql = pool.clients.flatMap((client) => client.calls.map((call) => call.text)).join("\n");
    expect(sql).toContain("pilot.doorstar_is_effective_pilot_roster_manager(");
    expect(sql).not.toContain("binding.\"role\" = 'ADMINISTRATOR'");
    expect(sql).toContain("pilot.pilot_list_direct_admin_bindings_v1($1::text)");
    expect(sql).toContain("pilot.pilot_direct_provision_binding_v1(");
    expect(sql).toContain("pilot.pilot_direct_update_binding_v1(");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+INTO?\s+pilot\."(?:PrincipalBinding|BindingAudit|OpaqueSession)"/i);
  });
});

class ScriptedPool implements PilotPgPool {
  public readonly clients: ScriptedClient[] = [];

  public constructor(private readonly options: Readonly<{
    failRuntimePreflight?: boolean;
    sessionRole?: string;
  }> = {}) {}

  public async connect(): Promise<PilotPgClient> {
    const client = new ScriptedClient(this.options);
    this.clients.push(client);
    return client;
  }

  public async end(): Promise<void> {}
}

class ScriptedClient implements PilotPgClient {
  public readonly calls: Array<Readonly<{ text: string; values: readonly unknown[] | undefined }>> = [];
  public released = false;
  public releaseError: Error | undefined;

  public constructor(private readonly options: Readonly<{
    failRuntimePreflight?: boolean;
    sessionRole?: string;
  }>) {}

  public async query<Row extends PilotPgRow = PilotPgRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PilotPgQueryResult<Row>> {
    this.calls.push({ text, values });
    if (this.options.failRuntimePreflight && text === "SELECT pilot.pilot_runtime_preflight_v1()") {
      throw new Error("runtime_preflight_failed");
    }
    return { rows: scriptedRows(text, this.options) as readonly Row[], rowCount: 1 };
  }

  public release(error?: Error): void {
    this.released = true;
    this.releaseError = error;
  }
}

function scriptedRows(
  text: string,
  options: Readonly<{ sessionRole?: string }>,
): readonly PilotPgRow[] {
  if (text.includes('FROM pilot."PilotScope"')) {
    return [{ id: scopeId, scopeKey: "doorstar-pilot" }];
  }
  if (text.includes("pilot_create_authorization_transaction_v1")) {
    return [{ id: transactionId }];
  }
  if (text.includes("pilot_consume_authorization_transaction_v1")) {
    return [{
      id: transactionId,
      nonceHash: "d".repeat(64),
      codeVerifierCiphertext: Uint8Array.from([1, 2, 3]),
      createdAt: now,
      expiresAt: new Date(now.getTime() + 300_000),
    }];
  }
  if (text.includes("binding.\"canManagePilotRoster\"") && text.includes("AS \"bindingId\"")) {
    return [{ bindingId, pilotScopeId: scopeId }];
  }
  if (text.includes("pilot_list_direct_admin_bindings_v1")) {
    return [expectedRosterUser()];
  }
  if (text.includes("pilot_direct_provision_binding_v1")) {
    return [{ bindingId }];
  }
  if (text.includes("pilot_direct_update_binding_v1")) {
    return [{ bindingId }];
  }
  if (text.includes('FROM pilot."PrincipalBinding"')) {
    return [{
      id: bindingId,
      pilotScopeId: scopeId,
      actorKey: "e".repeat(64),
      displayName: "Pilot User",
      role: "SALES",
      active: true,
    }];
  }
  if (text.includes("pilot_issue_opaque_session_v1")) {
    return [{ id: sessionId }];
  }
  if (text.includes('FROM pilot."OpaqueSession"')) {
    return [{
      id: sessionId,
      pilotScopeId: scopeId,
      bindingId,
      actorKey: "e".repeat(64),
      displayName: "Pilot User",
      role: options.sessionRole ?? "SALES",
      expiresAt: new Date(now.getTime() + 28_800_000),
    }];
  }
  return [];
}

function newAuthorizationTransaction(): NewAuthorizationTransaction {
  return {
    stateHash: digest,
    browserBindingHash: "b".repeat(64),
    nonceHash: "d".repeat(64),
    codeVerifierCiphertext: Uint8Array.from([1, 2, 3]),
    expiresAt: new Date(now.getTime() + 300_000),
  };
}

function newOpaqueSession(): NewOpaqueSession {
  return {
    pilotScopeId: scopeId,
    bindingId,
    sessionTokenHash: "c".repeat(64),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + 28_800_000),
  };
}

function directProvision(): DirectRosterBindingProvision {
  return {
    pilotScopeId: scopeId,
    actorSessionTokenHash: "c".repeat(64),
    issuer: "https://identity.example.invalid/realms/doorstar",
    subjectDigest: digest,
    actorKey: "e".repeat(64),
    displayName: "Pilot User",
    role: "SALES",
    canManagePilotRoster: false,
    correlationId: transactionId,
  };
}

function directUpdate(): DirectRosterBindingUpdate {
  return {
    pilotScopeId: scopeId,
    actorSessionTokenHash: "c".repeat(64),
    targetBindingId: bindingId,
    expectedAuditVersion: 1,
    role: "SALES",
    active: true,
    canManagePilotRoster: false,
    reason: "admin-roster-policy-update",
    correlationId: transactionId,
  };
}

function expectedRosterUser(): PilotPgRow {
  return {
    bindingId,
    displayName: "Pilot User",
    role: "SALES",
    active: true,
    canManagePilotRoster: false,
    auditVersion: 1,
  };
}
