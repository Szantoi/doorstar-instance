import { describe, expect, it } from "vitest";
import { preflightDoorstarStandardImport, type DoorstarStandardCandidate } from "../src/services/planning/standardImportPreflight.js";

const validCandidate: DoorstarStandardCandidate = {
  sourceStandardKey: "MUNK-0042-17",
  operationType: "CNC megmunkálás",
  minutesPerUnit: 12.5,
  workforce: 1,
  resourceKey: "CNC",
  unit: "piece",
  sourceRevision: "Egység_idő.xlsx:Feladat_Egység_idő!A17",
  qualifiers: [
    { key: "product", value: "beltéri ajtó" },
    { key: "finish", value: "fóliázott" },
  ],
};

describe("preflightDoorstarStandardImport", () => {
  it("keeps a fully identified standard ready for the future platform adapter", () => {
    expect(preflightDoorstarStandardImport([validCandidate])).toEqual({
      ready: [validCandidate],
      quarantined: [],
    });
  });

  it("quarantines incomplete mapping instead of guessing a unit or resource", () => {
    const incomplete = { ...validCandidate, resourceKey: " ", unit: null, minutesPerUnit: 0 };

    expect(preflightDoorstarStandardImport([incomplete]).quarantined).toEqual([
      {
        candidate: incomplete,
        reasons: ["invalid_minutes_per_unit", "missing_resource_mapping", "missing_unit"],
      },
    ]);
  });

  it("allows equal labels with distinct source identities and qualifiers", () => {
    const secondSandingStandard = {
      ...validCandidate,
      sourceStandardKey: "MUNK-0042-18",
      operationType: "Csiszolás",
      qualifiers: [{ key: "component", value: "tok" }],
    };
    const firstSandingStandard = {
      ...validCandidate,
      sourceStandardKey: "MUNK-0042-19",
      operationType: "Csiszolás",
      qualifiers: [{ key: "component", value: "ajtólap" }],
    };

    expect(preflightDoorstarStandardImport([firstSandingStandard, secondSandingStandard]).ready).toHaveLength(2);
  });

  it("quarantines duplicate source identity regardless of qualifier order", () => {
    const duplicate = { ...validCandidate, qualifiers: [...(validCandidate.qualifiers ?? [])].reverse() };
    const result = preflightDoorstarStandardImport([validCandidate, duplicate]);

    expect(result.ready).toEqual([]);
    expect(result.quarantined.map(({ reasons }) => reasons)).toEqual([
      ["duplicate_source_identity"],
      ["duplicate_source_identity"],
    ]);
  });

  it("quarantines blank qualifier parts so they cannot weaken a source identity", () => {
    const invalidQualifier = { ...validCandidate, qualifiers: [{ key: "finish", value: "" }] };

    expect(preflightDoorstarStandardImport([invalidQualifier]).quarantined[0]?.reasons).toEqual(["invalid_qualifier"]);
  });
});
