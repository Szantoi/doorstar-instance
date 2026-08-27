import { describe, expect, it } from "vitest";

import {
  executeBootstrapCli,
  formatBootstrapFailure,
  formatBootstrapResult,
} from "../src/cli.js";
import { FakeBootstrapDatabase, provisionedBindingId } from "./testDoubles.js";

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    PILOT_BOOTSTRAP_DATABASE_URL: "postgresql://bootstrap_user:secret@db.internal:5432/pilot",
    DOORSTAR_PILOT_SCOPE_KEY: "doorstar-pilot",
  };
}

describe("executeBootstrapCli", () => {
  it("closes the pool after the only allowed preflight operation", async () => {
    const database = new FakeBootstrapDatabase();
    const result = await executeBootstrapCli(
      ["preflight"],
      validEnvironment(),
      () => database,
    );

    expect(result).toEqual({ kind: "preflight" });
    expect(database.preflightCalls).toBe(1);
    expect(database.closed).toBe(true);
  });

  it("closes the pool when the selected operation fails", async () => {
    const database = new FakeBootstrapDatabase();
    database.failOnPreflight = true;

    await expect(
      executeBootstrapCli(["preflight"], validEnvironment(), () => database),
    ).rejects.toThrow("fake_bootstrap_preflight_failure");

    expect(database.closed).toBe(true);
  });

  it("formats operational output without a subject digest, actor key or DSN", () => {
    const message = formatBootstrapResult({
      kind: "provision",
      bindingId: provisionedBindingId,
      correlationId: "44444444-4444-4444-8444-444444444444",
    });

    expect(message).toContain(provisionedBindingId);
    expect(message).not.toContain("postgresql:");
    expect(message).not.toContain("actor");
  });

  it("does not echo a database or actor value from an unknown failure", () => {
    const leakedError = new Error(
      "postgresql://bootstrap_user:secret@db.internal/pilot actorKey=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );

    expect(formatBootstrapFailure(leakedError)).toBe(
      "bootstrap_command_failed code=bootstrap_command_failed",
    );
  });
});
