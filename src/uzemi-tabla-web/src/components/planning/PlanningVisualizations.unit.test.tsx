import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DependencyGanttTimeline } from "./DependencyGanttTimeline";
import { WorkflowDependencyGraph } from "./WorkflowDependencyGraph";
import type { PlanningVisualOperation } from "./planningVisualizationModel";

const operations: PlanningVisualOperation[] = [
  { id: "cut", label: "Szabás", stage: "Szabászat", scheduledStart: "2026-08-03T06:00:00+02:00", scheduledFinish: "2026-08-03T08:00:00+02:00", status: "proposal" },
  { id: "cnc", label: "CNC", stage: "Megmunkálás", scheduledStart: "2026-08-03T08:00:00+02:00", scheduledFinish: "2026-08-03T10:00:00+02:00", status: "warning" },
];

describe("Planning visualizations", () => {
  it("renders an accessible Gantt graphic from proposal intervals", () => {
    render(<DependencyGanttTimeline operations={operations} />);
    expect(screen.getByRole("img", { name: "Tervezési Gantt idősáv" })).toBeTruthy();
    expect(screen.getByText("Szabás")).toBeTruthy();
  });

  it("renders graph nodes and the explicit dependency label", () => {
    render(<WorkflowDependencyGraph operations={operations} dependencies={[{ predecessorId: "cut", successorId: "cnc", type: "FS", lagMinutes: 15 }]} />);
    expect(screen.getByRole("img", { name: "Munkafolyamat-függőségi háló" })).toBeTruthy();
    expect(screen.getAllByText("FS +15 perc")).toHaveLength(2);
  });
});
