import { describe, expect, it } from "vitest";
import { buildDependencyGraph, buildGanttBars, dependencyLabel, type PlanningVisualOperation } from "./planningVisualizationModel";

const operations: PlanningVisualOperation[] = [
  { id: "cut", label: "Szabás", stage: "Szabászat", scheduledStart: "2026-08-03T06:00:00+02:00", scheduledFinish: "2026-08-03T08:00:00+02:00", status: "proposal" },
  { id: "cnc", label: "CNC", stage: "Megmunkálás", scheduledStart: "2026-08-03T08:00:00+02:00", scheduledFinish: "2026-08-03T10:00:00+02:00", status: "proposal" },
];

describe("planning visualization view model", () => {
  it("renders only valid server-provided proposal intervals", () => {
    expect(buildGanttBars([...operations, { ...operations[0], id: "bad", scheduledFinish: "not-a-date" }], 600)).toHaveLength(2);
  });
  it("keeps the four dependency types and audit details visible", () => {
    expect(dependencyLabel({ predecessorId: "cut", successorId: "cnc", type: "SS", lagMinutes: -20, partialReleasePercent: 0.5 })).toBe("SS -20 perc · részleges kiadás 50%");
  });
  it("does not invent graph edges when a referenced operation is missing", () => {
    const graph = buildDependencyGraph(operations, [
      { predecessorId: "cut", successorId: "cnc", type: "FS", lagMinutes: 0 },
      { predecessorId: "cut", successorId: "missing", type: "FF", lagMinutes: 0 },
    ]);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.label).toBe("FS");
  });
});
