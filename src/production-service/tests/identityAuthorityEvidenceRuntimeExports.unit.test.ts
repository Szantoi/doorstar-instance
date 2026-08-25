import { describe, expect, it } from "vitest";
import * as evidenceRuntime from "../src/services/identityAuthority/evidence.js";

describe("identity-authority evidence runtime exports", () => {
  it("exposes the high-level composition root plus its non-minting opaque-commit bridge, never a proof, assembler or structural writer", () => {
    expect(Object.keys(evidenceRuntime).sort()).toEqual([
      "consumeDoorstarTrustedIdentityAuthorityIssuanceCommit",
      "createDoorstarIdentityBoundary",
    ]);
    expect(evidenceRuntime).not.toHaveProperty("createVerifiedHumanIdentityProofForTest");
    expect(evidenceRuntime).not.toHaveProperty("createIdentityAuthorityEvidenceAssemblerForTest");
    expect(evidenceRuntime).not.toHaveProperty("persistAcceptedEvidenceAndSession");
    expect(evidenceRuntime).not.toHaveProperty("createTrustedIdentityAuthorityIssuanceCommit");
  });
});
