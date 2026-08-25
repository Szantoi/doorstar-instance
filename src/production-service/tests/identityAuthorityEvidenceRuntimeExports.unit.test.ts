import { describe, expect, it } from "vitest";
import * as evidenceRuntime from "../src/services/identityAuthority/evidence.js";

describe("identity-authority evidence runtime exports", () => {
  it("exposes no proof or assembler construction capability from the production module", () => {
    expect(Object.keys(evidenceRuntime)).toEqual([]);
    expect(evidenceRuntime).not.toHaveProperty("createVerifiedHumanIdentityProofForTest");
    expect(evidenceRuntime).not.toHaveProperty("createIdentityAuthorityEvidenceAssemblerForTest");
  });
});
