import { describe, expect, it } from "vitest";
import { resolveLegacyDependencyBounds, validateDependencyGraph } from "../src/services/planning/dependencyBaseline.js";

describe("Doorstar dependency baseline", () => {
  it.each([
    ["FS", { earliestStartMinute: 145, startSource: "dependency" }],
    ["SS", { earliestStartMinute: 105, startSource: "dependency" }],
    ["FF", { earliestFinishMinute: 145, finishSource: "dependency" }],
    ["SF", { earliestFinishMinute: 105, finishSource: "dependency" }],
  ] as const)("applies %s with signed lag", (type, expected) => {
    expect(resolveLegacyDependencyBounds({ type, predecessorStartMinute: 100, predecessorFinishMinute: 140, lagMinutes: 5 })).toMatchObject(expected);
  });

  it("preserves fixed-start, partial-release and fixed-finish precedence", () => {
    expect(resolveLegacyDependencyBounds({ type: "FS", predecessorStartMinute: 100, predecessorFinishMinute: 200, partialReleaseMinute: 150, fixedStartMinute: 120, fixedFinishMinute: 280 })).toEqual({
      earliestStartMinute: 120, earliestFinishMinute: 280, startSource: "fixed_override", finishSource: "fixed_override",
    });
    expect(resolveLegacyDependencyBounds({ type: "FS", predecessorStartMinute: 100, predecessorFinishMinute: 200, partialReleaseMinute: 150 })).toMatchObject({ earliestStartMinute: 150, startSource: "partial_release" });
  });

  it("preserves a later partial release over FS and makes the delay visible", () => {
    expect(resolveLegacyDependencyBounds({
      type: "FS", predecessorStartMinute: 100, predecessorFinishMinute: 200, partialReleaseMinute: 250,
    })).toEqual({
      earliestStartMinute: 250,
      startSource: "partial_release",
      warnings: ["partial_release_delays_fs_start"],
    });
  });

  it("returns a deterministic topological order for a valid network", () => {
    expect(validateDependencyGraph([{ id: "cut" }, { id: "cnc" }, { id: "assembly" }], [
      { predecessorId: "cut", successorId: "cnc", type: "FS" },
      { predecessorId: "cnc", successorId: "assembly", type: "SS", releaseThresholdPercent: 0.5 },
    ])).toEqual({ issues: [], topologicalOrder: ["cut", "cnc", "assembly"] });
  });

  it("rejects unsupported and unsafe dependency data before a scheduling run", () => {
    const edge = { predecessorId: "a", successorId: "missing", type: "XX", lagMinutes: Number.NaN, releaseThresholdPercent: 0 };
    expect(validateDependencyGraph([{ id: "a" }], [edge]).issues.map(({ code }) => code)).toEqual([
      "unknown_successor", "invalid_dependency_type", "invalid_lag", "invalid_release_threshold",
    ]);
  });

  it("blocks circular networks", () => {
    expect(validateDependencyGraph([{ id: "a" }, { id: "b" }], [
      { predecessorId: "a", successorId: "b", type: "FS" },
      { predecessorId: "b", successorId: "a", type: "FS" },
    ])).toEqual({ issues: [{ code: "circular_dependency" }], topologicalOrder: null });
  });
});
