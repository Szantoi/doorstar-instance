import { describe, expect, it } from "vitest";
import { buildProjectWorkspaceRows, canManageProjectWorkspace, filterProjectWorkspaceRows } from "./projectWorkspace";
import type { ProductionOrderCard, ProjectCard } from "@/services/production/types";

const project = (patch: Partial<ProjectCard> = {}): ProjectCard => ({ key: "dsmr-26148", name: "Minta Projekt", num: "26148", status: "QUEUED", totalTasks: 0, doneTasks: 0, progressPct: 0, ...patch });
const order = (patch: Partial<ProductionOrderCard> = {}): ProductionOrderCard => ({ projectKey: "dsmr-26148", projectName: "Minta Projekt", projectNum: "26148", revision: 1, status: "DRAFT", intakeStage: "SURVEY_PENDING", customerName: "Minta Kft.", expectedDelivery: null, positionCount: 2, updatedAt: "2026-07-30T09:00:00.000Z", ...patch });

describe("project workspace model", () => {
  it("sends a survey-pending draft to the survey instead of the work sheet", () => {
    const [row] = buildProjectWorkspaceRows([project()], [order()]);
    expect(row).toMatchObject({ state: "ATTENTION", stateLabel: "Felmérésre vár", primaryHref: "/orders/dsmr-26148/survey" });
  });

  it("keeps approved projects without tasks visible as planning work", () => {
    const [row] = buildProjectWorkspaceRows([project()], [order({ status: "APPROVED", intakeStage: "TECHNICAL_PREPARATION" })]);
    expect(row).toMatchObject({ state: "PLANNING", primaryHref: "/projects/dsmr-26148", primaryLabel: "Folyamat megnyitása" });
  });

  it("sends technical preparation directly to its dedicated office workspace", () => {
    const [row] = buildProjectWorkspaceRows([project()], [order({ intakeStage: "TECHNICAL_PREPARATION" })]);
    expect(row).toMatchObject({
      state: "ATTENTION",
      primaryHref: "/orders/dsmr-26148/technical-preparation",
      primaryLabel: "Műszaki előkészítés",
    });
  });

  it("keeps the legacy work sheet on its own route", () => {
    const [unstructured] = buildProjectWorkspaceRows([project()], []);
    const [inProduction] = buildProjectWorkspaceRows([project({ totalTasks: 3, doneTasks: 1 })], []);
    expect(unstructured.primaryHref).toBe("/projects/dsmr-26148/work-session");
    expect(inProduction.primaryHref).toBe("/projects/dsmr-26148/work-session");
  });

  it("prioritises a completed work session over the order state", () => {
    const [row] = buildProjectWorkspaceRows([project({ status: "IN_PROGRESS", totalTasks: 4, doneTasks: 4, progressPct: 100 })], [order()]);
    expect(row.state).toBe("READY");
  });

  it("filters by either work number, customer, or operational state", () => {
    const rows = buildProjectWorkspaceRows([project()], [order()]);
    expect(filterProjectWorkspaceRows(rows, "minta kft", "ALL")).toHaveLength(1);
    expect(filterProjectWorkspaceRows(rows, "", "PLANNING")).toHaveLength(0);
  });

  it("allows planning only for the documented planning roles", () => {
    expect(canManageProjectWorkspace("production_planner")).toBe(true);
    expect(canManageProjectWorkspace("technical_preparation")).toBe(false);
  });
});
