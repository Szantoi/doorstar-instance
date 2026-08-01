import { describe, expect, it } from "vitest";
import { doorStructureContractBlockers, missingDoorStructureContractMessage } from "./doorStructureReadiness";

describe("door structure review readiness", () => {
  it("stays fail-closed for every position until the structured backend contract exists", () => {
    expect(doorStructureContractBlockers(1)).toEqual([missingDoorStructureContractMessage]);
    expect(doorStructureContractBlockers(12)).toEqual([missingDoorStructureContractMessage]);
  });

  it("does not invent a blocker when there is no position to review", () => {
    expect(doorStructureContractBlockers(0)).toEqual([]);
  });
});
