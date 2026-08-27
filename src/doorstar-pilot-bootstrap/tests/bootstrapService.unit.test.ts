import { describe, expect, it } from "vitest";

import {
  PilotBootstrapService,
  type BootstrapRandom,
} from "../src/application/bootstrapService.js";
import { FakeBootstrapDatabase, provisionedBindingId, revokedBindingId } from "./testDoubles.js";

const fixedRandom: BootstrapRandom = {
  hex64: () => "b".repeat(64),
  uuid: () => "44444444-4444-4444-8444-444444444444",
};

describe("PilotBootstrapService", () => {
  it("generates but never returns the provision actor key", async () => {
    const database = new FakeBootstrapDatabase();
    const service = new PilotBootstrapService(database, fixedRandom);

    const result = await service.execute({
      kind: "provision",
      issuer: "https://login.example.test/tenant",
      subjectDigest: "a".repeat(64),
      displayName: "Pilot admin",
      role: "ADMINISTRATOR",
      canManagePilotRoster: true,
      approvalReference: "CHG-1234",
    });

    expect(database.provisions).toHaveLength(1);
    expect(database.provisions[0].actorKey).toBe("b".repeat(64));
    expect(database.provisions[0].correlationId).toBe("44444444-4444-4444-8444-444444444444");
    expect(result).toEqual({
      kind: "provision",
      bindingId: provisionedBindingId,
      correlationId: "44444444-4444-4444-8444-444444444444",
    });
    expect(JSON.stringify(result)).not.toContain("b".repeat(64));
  });

  it("sends only the narrow revoke shape to the database", async () => {
    const database = new FakeBootstrapDatabase();
    const service = new PilotBootstrapService(database, fixedRandom);

    const result = await service.execute({
      kind: "revoke",
      bindingId: revokedBindingId,
      expectedAuditVersion: 2,
      approvalReference: "CHG-1235",
    });

    expect(database.revocations).toEqual([
      {
        bindingId: revokedBindingId,
        expectedAuditVersion: 2,
        approvalReference: "CHG-1235",
        correlationId: "44444444-4444-4444-8444-444444444444",
      },
    ]);
    expect(result).toEqual({
      kind: "revoke",
      bindingId: revokedBindingId,
      correlationId: "44444444-4444-4444-8444-444444444444",
    });
  });
});
