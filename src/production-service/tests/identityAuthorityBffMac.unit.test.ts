import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createDoorstarMacService,
  doorstarMacSpecifications,
  encodeDoorstarMacPreimage,
  type DoorstarMacKeyName,
} from "../src/services/identityAuthority/bff/mac.js";

describe("Doorstar M2B MAC boundary", () => {
  it("uses a deployment-held named key and verifies the resulting versioned MAC", async () => {
    const provider = keyProvider({ currentVersion: 2, keys: { 2: "current-key" } });
    const service = createDoorstarMacService(provider);

    const signed = await service.signCurrent(input());
    expect(signed.keyVersion).toBe(2);
    expect(Buffer.from(signed.mac)).toHaveLength(32);
    expect(await service.verify({ ...input(), ...signed })).toBe("valid");
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls.every((call) => call.keyName === "doorstar-session-verifier" && call.keyVersion === 2)).toBe(true);
  });

  it("keeps domain and field boundaries separate", async () => {
    const left = encodeDoorstarMacPreimage({
      specification: doorstarMacSpecifications.sessionVerifier,
      fields: [
        { kind: "utf8", value: "ab" },
        { kind: "utf8", value: "c" },
      ],
    });
    const right = encodeDoorstarMacPreimage({
      specification: doorstarMacSpecifications.sessionVerifier,
      fields: [
        { kind: "utf8", value: "a" },
        { kind: "utf8", value: "bc" },
      ],
    });
    const differentDomain = encodeDoorstarMacPreimage({
      specification: doorstarMacSpecifications.sessionCsrf,
      fields: input().fields,
    });

    expect(Buffer.compare(Buffer.from(left), Buffer.from(right))).not.toBe(0);
    expect(Buffer.compare(Buffer.from(left), Buffer.from(differentDomain))).not.toBe(0);
  });

  it("rejects a valid MAC replayed in a different domain or with a changed field", async () => {
    const service = createDoorstarMacService(keyProvider({ currentVersion: 1, keys: { 1: "key-one" } }));
    const signed = await service.signCurrent(input());

    expect(await service.verify({
      ...signed,
      specification: doorstarMacSpecifications.sessionCsrf,
      fields: input().fields,
    })).toBe("invalid");
    expect(await service.verify({
      ...signed,
      specification: doorstarMacSpecifications.sessionVerifier,
      fields: [{ kind: "utf8", value: "selector-changed" }, ...input().fields.slice(1)],
    })).toBe("invalid");
  });

  it("distinguishes an unavailable previous key from a bad MAC without exposing key bytes", async () => {
    const provider = keyProvider({
      currentVersion: 2,
      keys: { 1: "previous-key", 2: "current-key" },
    });
    const service = createDoorstarMacService(provider);
    const previous = await service.derive({
      ...input(),
      keyVersion: 1,
    });
    if (previous === undefined) throw new Error("expected previous key");

    expect(await service.verify({ ...input(), keyVersion: 1, mac: previous })).toBe("valid");
    provider.keys.delete(1);
    expect(await service.verify({ ...input(), keyVersion: 1, mac: previous })).toBe("unknown_key");

    const malformed = new Uint8Array(31);
    expect(await service.verify({ ...input(), keyVersion: 2, mac: malformed })).toBe("invalid");
  });

  it("rejects a provider-retained key older than the one explicit previous version", async () => {
    const provider = keyProvider({
      currentVersion: 3,
      keys: { 1: "retained-old-key", 2: "previous-key", 3: "current-key" },
    });
    const service = createDoorstarMacService(provider);
    const retainedOldMac = createHmac("sha256", Buffer.from("retained-old-key", "utf8"))
      .update(encodeDoorstarMacPreimage(input()))
      .digest();

    expect(await service.verify({ ...input(), keyVersion: 1, mac: retainedOldMac })).toBe("unknown_key");
    expect(await service.derive({ ...input(), keyVersion: 1 })).toBeUndefined();
    expect(await service.derive({ ...input(), keyVersion: 2 })).toHaveLength(32);
  });

  it.each([
    [{ kind: "utf8", value: "" }],
    [{ kind: "utf8", value: "nul\0value" }],
    [{ kind: "decimal", value: -1 }],
    [{ kind: "decimal", value: 1.5 }],
    [{ kind: "bytes", value: new Uint8Array() }],
  ] as const)("fails closed for malformed MAC field %#", (field) => {
    expect(() => encodeDoorstarMacPreimage({
      specification: doorstarMacSpecifications.sessionVerifier,
      fields: [field],
    })).toThrow("doorstar_mac_input_invalid");
  });
});

function input() {
  return {
    specification: doorstarMacSpecifications.sessionVerifier,
    fields: [
      { kind: "utf8" as const, value: "session-selector" },
      { kind: "decimal" as const, value: 7n },
      { kind: "bytes" as const, value: Buffer.from("opaque-verifier", "utf8") },
    ],
  };
}

function keyProvider(input: {
  readonly currentVersion: number;
  readonly keys: Record<number, string>;
}) {
  const keys = new Map(Object.entries(input.keys).map(([version, value]) => [Number(version), Buffer.from(value, "utf8")]));
  const calls: Array<{ keyName: DoorstarMacKeyName; keyVersion: number; preimage: Uint8Array }> = [];
  return {
    calls,
    keys,
    async currentKeyVersion(_keyName: DoorstarMacKeyName): Promise<number> {
      return input.currentVersion;
    },
    async signHmacSha256(request: {
      readonly keyName: DoorstarMacKeyName;
      readonly keyVersion: number;
      readonly preimage: Uint8Array;
    }): Promise<Uint8Array | null> {
      calls.push(request);
      const key = keys.get(request.keyVersion);
      return key === undefined
        ? null
        : createHmac("sha256", key).update(request.preimage).digest();
    },
  };
}
