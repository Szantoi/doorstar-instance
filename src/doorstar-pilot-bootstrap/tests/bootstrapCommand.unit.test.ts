import { describe, expect, it } from "vitest";

import {
  BootstrapCommandInputError,
  parseBootstrapCommand,
  validateBootstrapCommand,
} from "../src/domain/bootstrapCommand.js";

const subjectDigest = "a".repeat(64);

describe("parseBootstrapCommand", () => {
  it("accepts only the reviewed provision fields", () => {
    const command = parseBootstrapCommand([
      "provision",
      "--issuer",
      "https://login.example.test/tenant",
      "--subject-digest",
      subjectDigest,
      "--display-name",
      "Pilot admin",
      "--role",
      "ADMINISTRATOR",
      "--can-manage-pilot-roster",
      "true",
      "--approval-reference",
      "CHG-1234",
    ]);

    expect(command).toEqual({
      kind: "provision",
      issuer: "https://login.example.test/tenant",
      subjectDigest,
      displayName: "Pilot admin",
      role: "ADMINISTRATOR",
      canManagePilotRoster: true,
      approvalReference: "CHG-1234",
    });
  });

  it("rejects actor keys, correlation IDs, raw subjects and direct-admin input", () => {
    for (const forbiddenOption of [
      "--actor-key",
      "--correlation-id",
      "--subject",
      "--session-token",
      "--next-role",
    ]) {
      expect(() => parseBootstrapCommand(["provision", forbiddenOption, "value"])).toThrow(
        new BootstrapCommandInputError("option_not_allowed"),
      );
    }
  });

  it("accepts revoke only with a binding version and approval reference", () => {
    expect(
      parseBootstrapCommand([
        "revoke",
        "--binding-id",
        "22222222-2222-4222-8222-222222222222",
        "--expected-audit-version",
        "4",
        "--approval-reference",
        "CHG-1235",
      ]),
    ).toEqual({
      kind: "revoke",
      bindingId: "22222222-2222-4222-8222-222222222222",
      expectedAuditVersion: 4,
      approvalReference: "CHG-1235",
    });
  });

  it("rejects unapproved operations and malformed digest input", () => {
    expect(() => parseBootstrapCommand(["sql", "SELECT 1"])).toThrow(
      new BootstrapCommandInputError("operation_not_allowed"),
    );
    expect(() => parseBootstrapCommand([
      "provision",
      "--issuer",
      "https://login.example.test/tenant",
      "--subject-digest",
      "not-a-digest",
      "--display-name",
      "Pilot admin",
      "--role",
      "ADMINISTRATOR",
      "--can-manage-pilot-roster",
      "true",
      "--approval-reference",
      "CHG-1234",
    ])).toThrow(
      new BootstrapCommandInputError("subject_digest_invalid"),
    );
  });

  it("rejects the historical Plant SHOP_FLOOR enum through CLI and programmatic input", () => {
    const shopFloorProvision = [
      "provision",
      "--issuer",
      "https://login.example.test/tenant",
      "--subject-digest",
      subjectDigest,
      "--display-name",
      "Plant operator",
      "--role",
      "SHOP_FLOOR",
      "--can-manage-pilot-roster",
      "false",
      "--approval-reference",
      "CHG-1236",
    ] as const;

    expect(() => parseBootstrapCommand(shopFloorProvision)).toThrow(
      new BootstrapCommandInputError("role_not_allowed"),
    );
    expect(() => validateBootstrapCommand({
      kind: "provision",
      issuer: "https://login.example.test/tenant",
      subjectDigest,
      displayName: "Plant operator",
      role: "SHOP_FLOOR" as never,
      canManagePilotRoster: false,
      approvalReference: "CHG-1236",
    })).toThrow(new BootstrapCommandInputError("role_not_allowed"));
  });
});
