import { describe, expect, it } from "vitest";
import { parseCanonicalUtcInstant } from "../src/services/identityAuthority/contract.js";
import { readExactOwnDataFields, snapshotCanonicalStringArray, snapshotCanonicalUtcInstant, snapshotDenseArray } from "../src/services/identityAuthority/safeSnapshot.js";

describe("identity-authority safe snapshots", () => {
  it("rejects own getters instead of invoking them", () => {
    let reads = 0;
    const candidate = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "forged";
      },
    });

    expect(readExactOwnDataFields(candidate, ["value"])).toBeUndefined();
    expect(reads).toBe(0);
  });

  it("takes a descriptor snapshot of a Proxy without using the get trap", () => {
    let reads = 0;
    const proxy = new Proxy({ permission: "joinerytech.door.edit" }, {
      get(target, property, receiver) {
        reads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    expect(readExactOwnDataFields(proxy, ["permission"])?.get("permission")).toBe("joinerytech.door.edit");
    expect(reads).toBe(0);
  });

  it("copies only a dense canonical string array", () => {
    const source = ["joinerytech.door.edit"];
    const snapshot = snapshotCanonicalStringArray(source, 10);

    expect(snapshot).toEqual(["joinerytech.door.edit"]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    source[0] = "joinerytech.door.admin";
    expect(snapshot).toEqual(["joinerytech.door.edit"]);
    expect(snapshotCanonicalStringArray(["joinerytech.door.edit", ,] as string[], 10)).toBeUndefined();
  });

  it("copies a bounded dense heterogeneous array for nested strict JSON snapshots", () => {
    const source = [{ tenant_id: "11111111-1111-1111-1111-111111111111" }];
    const snapshot = snapshotDenseArray(source, 1);

    expect(snapshot).toEqual(source);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshotDenseArray([,] as unknown[], 1)).toBeUndefined();
  });

  it("re-parses the UTC wire value and rejects forged numeric fields", () => {
    const valid = parseCanonicalUtcInstant("2026-08-25T12:34:56.123456789Z");
    expect(snapshotCanonicalUtcInstant(valid)).toEqual(valid);
    expect(snapshotCanonicalUtcInstant({ ...valid, nanoseconds: 1 })).toBeUndefined();
  });
});
