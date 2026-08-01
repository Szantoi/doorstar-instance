import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ProjectDetail, Task } from "@/services/production/types";
import { ProjectProcessOverview } from "./ProjectProcessOverview";

afterEach(cleanup);

function directTask(overrides: Partial<Task>): Task {
  return {
    id: "direct-1",
    projectId: "project-1",
    epicStepId: null,
    epicName: null,
    title: "Helyszíni javítás",
    station: "Összeszerelés",
    week: "2026-08-03",
    day: 0,
    stepIndex: 0,
    acknowledged: true,
    urgent: false,
    problem: false,
    dueDate: null,
    description: "",
    quantity: 3,
    unitHours: 0.5,
    dependsOnId: null,
    createdAt: "2026-07-31T08:00:00.000Z",
    updatedAt: "2026-07-31T09:00:00.000Z",
    status: "inprogress",
    isDone: false,
    flowLabel: "Folyamatban",
    depDone: true,
    dependsOnTitle: null,
    projectNum: "1",
    ...overrides,
  };
}

const project: ProjectDetail = {
  id: "project-1",
  key: "DSMR-1",
  name: "Minta projekt",
  num: "1",
  kezdes: null,
  beepites: null,
  szinTok: null,
  szinLap: null,
  status: "QUEUED",
  epics: [{
    id: "epic-1",
    name: "Ajtólap",
    quantityLabel: null,
    disabled: false,
    steps: [{
      id: "step-1",
      name: "Szabás",
      station: "Szabászat",
      quantity: 2,
      unitHours: 1,
      planDate: "2026-08-04T00:00:00.000Z",
      planLocked: false,
      disabled: false,
      tasks: [],
    }],
  }],
  unepicTasks: [
    directTask({}),
    directTask({
      id: "direct-invalid-day",
      title: "Eltérésvizsgálat",
      station: null,
      week: "legacy-week-value",
      day: 9,
      problem: true,
      status: "problem",
      flowLabel: "Probléma",
    }),
  ],
};

function renderOverview() {
  return render(
    <MemoryRouter>
      <ProjectProcessOverview project={project} revision={null} />
    </MemoryRouter>,
  );
}

describe("ProjectProcessOverview direct task lane", () => {
  it("exposes a keyboard-focusable, expandable read-only direct Task projection", () => {
    renderOverview();

    expect(screen.getByRole("heading", { name: "(epik nélkül)" })).toBeTruthy();
    const row = screen.getByRole("button", { name: /Helyszíni javítás.*2026-08-03.*HÉTFŐ.*day=0/i });
    expect(row.tagName).toBe("BUTTON");
    expect(row.tabIndex).toBe(0);
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(row.getAttribute("aria-controls")).toBe("project-operation-detail");

    row.focus();
    expect(document.activeElement).toBe(row);
    fireEvent.click(row);

    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("project-operation-detail")).toBeTruthy();
    expect(screen.getByText("Közvetlen legacy üzemi feladat")).toBeTruthy();
    expect(screen.getByText("Read-only Task projekció")).toBeTruthy();
    expect(screen.getByText("inprogress")).toBeTruthy();
    expect(screen.getByText(/Nem OperationPlan, nem PlanningProposal és nem igazolt IssuedWorkPackage/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Üzemi tábla megnyitása/ }).getAttribute("href")).toBe("/board");
    expect(screen.queryByRole("link", { name: /Műveleti segédadat szerkesztése/ })).toBeNull();
  });

  it("keeps an invalid backend day index raw and distinguishes EpicStep authority", () => {
    renderOverview();

    const invalidDayRow = screen.getByRole("button", { name: /Eltérésvizsgálat.*legacy-week-value.*day=9/i });
    fireEvent.click(invalidDayRow);
    expect(screen.getAllByText("legacy-week-value · day=9")).toHaveLength(2);

    const epicStepRow = screen.getByRole("button", { name: /Szabás/ });
    fireEvent.click(epicStepRow);
    expect(screen.getByText(/örökölt munkalap egyik EpicStep rekordjából/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Műveleti segédadat szerkesztése/ }).getAttribute("href")).toBe("/projects/DSMR-1/work-session");
  });
});
