import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/apiClient";
import { componentSnapshotErrorMessage } from "./componentSnapshotErrors";

describe("component snapshot API errors", () => {
  it("summarizes aggregate unresolved source items without depending on extra fields", () => {
    const error = new ApiError(409, "conflict", {
      error: "component_source_evidence_unresolved",
      details: {
        manufacturedItems: { total: 4, ready: 2, unresolved: 2 },
        supplementaryItems: { total: 3, ready: 2, unresolved: 1 },
        futureField: { ignored: true },
      },
    });

    expect(componentSnapshotErrorMessage(error, "create")).toBe(
      "A revízió forrástételeinek evidence-auditja még hiányos. Lezáratlan forrástételek: 2 külön gyártott tétel, 1 tartozék.",
    );
  });

  it("accepts the row-level evidence summary variant", () => {
    const error = new ApiError(409, "conflict", {
      error: "component_source_evidence_unresolved",
      details: {
        sourceKind: "MANUFACTURED_ITEM",
        sourceId: "manufactured-1",
        totalEvidence: 3,
        resolvedEvidence: 1,
        unresolvedEvidence: 2,
        rejectedEvidence: 1,
      },
    });

    expect(componentSnapshotErrorMessage(error, "review")).toContain(
      "Az érintett külön gyártott forrásnál 2 evidence-sor nincs teljesen feloldva. Ebből 1 elutasított.",
    );
  });

  it("keeps a safe generic message for unknown details shapes", () => {
    const error = new ApiError(409, "conflict", {
      error: "component_source_evidence_unresolved",
      details: { schemaVersion: "future" },
    });
    expect(componentSnapshotErrorMessage(error, "create")).toBe(
      "A revízió forrástételeinek evidence-auditja még hiányos.",
    );
    expect(componentSnapshotErrorMessage(new Error("network"), "review")).toContain("A döntés nem menthető.");
  });
});
