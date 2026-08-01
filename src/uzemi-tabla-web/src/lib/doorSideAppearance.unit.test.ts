import { describe, expect, it } from "vitest";
import { observeDoorSideAppearance } from "./doorSideAppearance";

describe("observeDoorSideAppearance", () => {
  it("preserves explicitly labelled fixed and adjustable values as role candidates", () => {
    const observation = observeDoorSideAppearance(
      "Fóliás; fix: THERMOFILM Highland Green; mozgó: THERMOFILM Burlington Oak 2",
    );

    expect(observation).toMatchObject({
      finishSystem: "Fóliás",
      fixedRoleSurfaceCandidate: "THERMOFILM Highland Green",
      adjustableRoleSurfaceCandidate: "THERMOFILM Burlington Oak 2",
      interpretation: "EXPLICIT_ROLE_LABELS",
      roleCandidatesDiffer: true,
    });
  });

  it("does not assign an unlabelled legacy value to either side", () => {
    expect(observeDoorSideAppearance("Fóliás Supermatt Kashmir")).toMatchObject({
      fixedRoleSurfaceCandidate: null,
      adjustableRoleSurfaceCandidate: null,
      interpretation: "COLLAPSED_LEGACY",
      roleCandidatesDiffer: null,
    });
  });

  it("keeps a single explicit role label without inventing its opposite or a physical side", () => {
    expect(observeDoorSideAppearance("Festett; fix: NCS S 5040-R80B")).toMatchObject({
      fixedRoleSurfaceCandidate: "NCS S 5040-R80B",
      adjustableRoleSurfaceCandidate: null,
      interpretation: "PARTIAL_ROLE_LABELS",
      roleCandidatesDiffer: null,
    });
  });

  it("recognises the canonical adjustable and inherited mobile aliases", () => {
    expect(observeDoorSideAppearance("állítható borítás: Tölgy")).toMatchObject({
      adjustableRoleSurfaceCandidate: "Tölgy",
      interpretation: "PARTIAL_ROLE_LABELS",
    });
    expect(observeDoorSideAppearance("mobil oldal: RAL 9016")).toMatchObject({
      adjustableRoleSurfaceCandidate: "RAL 9016",
      interpretation: "PARTIAL_ROLE_LABELS",
    });
  });
});
