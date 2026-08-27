import { describe, expect, it } from "vitest";

import {
  PgPilotBootstrapDatabase,
  PilotBootstrapDatabaseError,
} from "../src/infrastructure/pgBootstrapDatabase.js";
import {
  FakePgPool,
  provisionedBindingId,
  revokedBindingId,
  scopeId,
} from "./testDoubles.js";

const correlationId = "44444444-4444-4444-8444-444444444444";

describe("PgPilotBootstrapDatabase", () => {
  it("keeps preflight read-only after establishing the required scoped transaction", async () => {
    const pool = new FakePgPool();
    const database = new PgPilotBootstrapDatabase(pool, "doorstar-pilot");

    await database.preflight();

    expect(pool.client.calls.map((call) => call.text)).toEqual([
      "BEGIN ISOLATION LEVEL SERIALIZABLE",
      'SELECT "id" FROM pilot."PilotScope" WHERE "scopeKey" = $1',
      "SELECT set_config('app.current_pilot_scope_id', $1, true)",
      "SELECT pilot.pilot_bootstrap_preflight_v1()",
      "COMMIT",
    ]);
  });

  it("uses one checkout and the mandatory serializable scope/preflight/routine sequence", async () => {
    const pool = new FakePgPool();
    const database = new PgPilotBootstrapDatabase(pool, "doorstar-pilot");

    const bindingId = await database.provision({
      issuer: "https://login.example.test/tenant",
      subjectDigest: "a".repeat(64),
      actorKey: "b".repeat(64),
      displayName: "Pilot admin",
      role: "ADMINISTRATOR",
      canManagePilotRoster: true,
      approvalReference: "CHG-1234",
      correlationId,
    });

    expect(bindingId).toBe(provisionedBindingId);
    expect(pool.connectCount).toBe(1);
    expect(pool.client.released).toBe(true);
    expect(pool.client.calls.map((call) => call.text)).toEqual([
      "BEGIN ISOLATION LEVEL SERIALIZABLE",
      'SELECT "id" FROM pilot."PilotScope" WHERE "scopeKey" = $1',
      "SELECT set_config('app.current_pilot_scope_id', $1, true)",
      "SELECT pilot.pilot_bootstrap_preflight_v1()",
      expect.stringContaining("pilot.pilot_bootstrap_provision_binding_v1"),
      "COMMIT",
    ]);
    expect(pool.client.calls[1].values).toEqual(["doorstar-pilot"]);
    expect(pool.client.calls[2].values).toEqual([scopeId]);
    expect(pool.client.calls[4].values).toEqual([
      "https://login.example.test/tenant",
      "a".repeat(64),
      "b".repeat(64),
      "Pilot admin",
      "ADMINISTRATOR",
      true,
      "CHG-1234",
      correlationId,
    ]);
    for (const call of pool.client.calls) {
      expect(call.text).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
    }
  });

  it("rolls back and releases the checkout when the bootstrap preflight rejects", async () => {
    const pool = new FakePgPool();
    pool.client.failOnPreflight = true;
    const database = new PgPilotBootstrapDatabase(pool, "doorstar-pilot");

    await expect(database.preflight()).rejects.toThrow("bootstrap_preflight_rejected_by_fake");

    expect(pool.client.calls.map((call) => call.text)).toContain("ROLLBACK");
    expect(pool.client.calls.map((call) => call.text)).not.toContain("COMMIT");
    expect(pool.client.released).toBe(true);
    expect(pool.client.releaseError).toBeUndefined();
  });

  it("discards the checkout when BEGIN itself rejects before a transaction starts", async () => {
    const pool = new FakePgPool();
    pool.client.failOnBegin = true;
    const database = new PgPilotBootstrapDatabase(pool, "doorstar-pilot");

    await expect(database.preflight()).rejects.toThrow("bootstrap_begin_rejected_by_fake");

    expect(pool.client.calls.map((call) => call.text)).toEqual([
      "BEGIN ISOLATION LEVEL SERIALIZABLE",
    ]);
    expect(pool.client.released).toBe(true);
    expect(pool.client.releaseError?.message).toBe("bootstrap_begin_rejected_by_fake");
  });

  it("rolls back a failing bootstrap routine before releasing a healthy checkout", async () => {
    const pool = new FakePgPool();
    pool.client.failOnProvision = true;
    const database = new PgPilotBootstrapDatabase(pool, "doorstar-pilot");

    await expect(database.provision({
      issuer: "https://login.example.test/tenant",
      subjectDigest: "a".repeat(64),
      actorKey: "b".repeat(64),
      displayName: "Pilot admin",
      role: "ADMINISTRATOR",
      canManagePilotRoster: true,
      approvalReference: "CHG-1234",
      correlationId,
    })).rejects.toThrow("bootstrap_provision_rejected_by_fake");

    expect(pool.client.calls.map((call) => call.text)).toContain("ROLLBACK");
    expect(pool.client.releaseError).toBeUndefined();
  });

  it("discards a checkout when rollback itself fails", async () => {
    const pool = new FakePgPool();
    pool.client.failOnPreflight = true;
    pool.client.failOnRollback = true;
    const database = new PgPilotBootstrapDatabase(pool, "doorstar-pilot");

    await expect(database.preflight()).rejects.toThrow("bootstrap_preflight_rejected_by_fake");

    expect(pool.client.released).toBe(true);
    expect(pool.client.releaseError?.message).toBe("pilot_bootstrap_rollback_failed");
  });

  it("fails before setting the GUC when the configured scope does not resolve exactly once", async () => {
    const pool = new FakePgPool();
    pool.client.scopeRows = [];
    const database = new PgPilotBootstrapDatabase(pool, "doorstar-pilot");

    await expect(database.preflight()).rejects.toThrow(
      new PilotBootstrapDatabaseError("configured_scope_not_resolved_exactly_once"),
    );

    expect(pool.client.calls.map((call) => call.text)).toEqual([
      "BEGIN ISOLATION LEVEL SERIALIZABLE",
      'SELECT "id" FROM pilot."PilotScope" WHERE "scopeKey" = $1',
      "ROLLBACK",
    ]);
  });

  it("calls the reviewed revoke routine with no direct mutation query", async () => {
    const pool = new FakePgPool();
    const database = new PgPilotBootstrapDatabase(pool, "doorstar-pilot");

    const bindingId = await database.revoke({
      bindingId: revokedBindingId,
      expectedAuditVersion: 7,
      approvalReference: "CHG-1235",
      correlationId,
    });

    expect(bindingId).toBe(revokedBindingId);
    expect(pool.client.calls.map((call) => call.text)).toEqual([
      "BEGIN ISOLATION LEVEL SERIALIZABLE",
      'SELECT "id" FROM pilot."PilotScope" WHERE "scopeKey" = $1',
      "SELECT set_config('app.current_pilot_scope_id', $1, true)",
      "SELECT pilot.pilot_bootstrap_preflight_v1()",
      expect.stringContaining("pilot.pilot_bootstrap_revoke_binding_v1"),
      "COMMIT",
    ]);
    expect(pool.client.calls[4].values).toEqual([
      revokedBindingId,
      7,
      "CHG-1235",
      correlationId,
    ]);
  });
});
