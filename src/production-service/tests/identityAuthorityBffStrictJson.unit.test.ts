import { describe, expect, it } from "vitest";
import {
  parseDoorstarFullDepthStrictJsonObject,
  parseDoorstarFullDepthStrictJsonObjectWithMetadata,
} from "../src/services/identityAuthority/bff/strictJson.js";

describe("Doorstar M2B full-depth strict JSON", () => {
  it("rejects duplicate decoded keys at nested depth, including escaped aliases", () => {
    expect(() => parseDoorstarFullDepthStrictJsonObject('{"tenant":{"a":1,"\\u0061":2}}'))
      .toThrow("doorstar_bff_json_duplicate_key");
  });

  it("retains root primitive lexemes so numeric contracts can reject parser normalization", () => {
    const parsed = parseDoorstarFullDepthStrictJsonObjectWithMetadata('{"iat":1e3,"nested":{"value":1}}');

    expect(parsed.value).toEqual({ iat: 1_000, nested: { value: 1 } });
    expect(parsed.rootPrimitiveLexemes.get("iat")).toBe("1e3");
  });

  it("rejects invalid UTF-8 and bounded-depth overflow before JSON.parse output is trusted", () => {
    expect(() => parseDoorstarFullDepthStrictJsonObject(new Uint8Array([0xC3, 0x28])))
      .toThrow("doorstar_bff_json_utf8_invalid");
    expect(() => parseDoorstarFullDepthStrictJsonObject('{"a":{"b":{"c":1}}}', { maximumDepth: 2 }))
      .toThrow("doorstar_bff_json_depth_exceeded");
  });
});
