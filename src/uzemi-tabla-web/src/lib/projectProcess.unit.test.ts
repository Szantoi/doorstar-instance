import { describe, expect, it } from "vitest";
import type { ComponentCalculatorProfiles, ComponentSnapshot, ProductionOrderRevision, ProjectDetail } from "../services/production/types";
import { buildProjectProcessView } from "./projectProcess";

const project: ProjectDetail = {
  id: "p1", key: "DSMR-1", name: "Minta", num: "1", kezdes: null, beepites: null, szinTok: null, szinLap: null, status: "QUEUED", unepicTasks: [],
  epics: [{ id: "e1", name: "Ajtólap", quantityLabel: null, disabled: false, steps: [
    { id: "s1", name: "Szabás", station: "Körfűrész", quantity: 2, unitHours: 1, planDate: "2026-08-01", planLocked: true, disabled: false, tasks: [] },
  ] }],
};
const approvalHash = "b".repeat(64);
const revision = {
  id: "revision-1",
  revision: 1,
  status: "APPROVED",
  intakeStage: "TECHNICAL_PREPARATION",
  audit: [{ action: "APPROVED", contentHash: approvalHash }],
} as ProductionOrderRevision;
const componentCalculatorProfiles: ComponentCalculatorProfiles = {
  configurationVersion: "profiles/v1",
  configurationFingerprint: "a".repeat(64),
  snapshotSchemaVersion: "snapshot/v1",
  technicalCatalogVersion: "catalog/v1",
  technicalCatalogFingerprint: "c".repeat(64),
  profiles: [{
    version: "doorstar-calculator/1.0.0",
    fingerprint: "d".repeat(64),
    label: "Doorstar explicit adapter",
    inputMode: "EXPLICIT_REVIEWED_OUTPUT",
    active: true,
    allowsFormulaExecution: false,
    allowsImplicitDefaults: false,
    cutPartDimensions: "FINISHED_AND_CUTTING_REQUIRED",
  }],
};

describe("project process view", () => {
  it("keeps missing calculation authority visible", () => {
    const view = buildProjectProcessView(project, revision);
    expect(view.gates.find((gate) => gate.key === "COMPONENTS")?.state).toBe("CONTRACT_REQUIRED");
    expect(view.lanes[0].rows[0].state).toBe("PLANNED");
    expect(view.sourceWarning).toContain("normaidő");
  });

  it("uses the authoritative component snapshot projection when it is available", () => {
    const sources = {
      componentSnapshotsState: "READY" as const,
      componentSnapshots: [],
      componentCalculatorProfilesState: "READY" as const,
      componentCalculatorProfiles,
    };
    const waiting = buildProjectProcessView(project, revision, sources);
    expect(waiting.gates.find((gate) => gate.key === "COMPONENTS")).toMatchObject({
      state: "WAITING",
      authority: "SERVER_RECORD",
    });

    const snapshot = {
      id: "snapshot-1",
      orderRevisionId: "revision-1",
      state: "VERIFIED",
      calculatorProfileVersion: "doorstar-calculator/1.0.0",
      calculatorProfileFingerprint: "d".repeat(64),
      snapshotSchemaVersion: "snapshot/v1",
      orderContentHash: approvalHash,
      technicalCatalogVersion: "catalog/v1",
      technicalCatalogFingerprint: "c".repeat(64),
      requirements: [{ id: "component-1" }, { id: "component-2" }],
    } as ComponentSnapshot;
    const verified = buildProjectProcessView(project, revision, { ...sources, componentSnapshots: [snapshot] });
    expect(verified.gates.find((gate) => gate.key === "COMPONENTS")).toMatchObject({
      state: "DONE",
      source: "doorstar-calculator/1.0.0",
    });
    expect(verified.gates.find((gate) => gate.key === "OPERATIONS")).toMatchObject({
      state: "CONTRACT_REQUIRED",
      authority: "CONTRACT_REQUIRED",
    });
    expect(verified.gates.find((gate) => gate.key === "OPERATIONS")?.detail).toContain("összevetési segédadat");
  });

  it("keeps the cockpit and exact operation input closed without current fingerprints", () => {
    const profilesWithoutAuthority: ComponentCalculatorProfiles = {
      ...componentCalculatorProfiles,
      technicalCatalogFingerprint: undefined,
      profiles: componentCalculatorProfiles.profiles.map((profile) => ({
        ...profile,
        fingerprint: undefined,
      })),
    };
    const blocked = buildProjectProcessView(project, revision, {
      componentSnapshotsState: "READY",
      componentSnapshots: [{
        id: "snapshot-1",
        orderRevisionId: "revision-1",
        state: "VERIFIED",
        calculatorProfileVersion: "doorstar-calculator/1.0.0",
        calculatorProfileFingerprint: "d".repeat(64),
        snapshotSchemaVersion: "snapshot/v1",
        orderContentHash: approvalHash,
        technicalCatalogVersion: "catalog/v1",
        technicalCatalogFingerprint: "c".repeat(64),
        requirements: [],
      } as unknown as ComponentSnapshot],
      componentCalculatorProfilesState: "READY",
      componentCalculatorProfiles: profilesWithoutAuthority,
    });

    expect(blocked.gates.find((gate) => gate.key === "COMPONENTS")).toMatchObject({
      state: "BLOCKED",
      authority: "SERVER_RECORD",
    });
    expect(blocked.gates.find((gate) => gate.key === "COMPONENTS")?.detail).toContain("verziólenyomata nem érhető el");
    expect(blocked.gates.find((gate) => gate.key === "OPERATIONS")?.state).toBe("BLOCKED");
  });

  it("detects an unsafe issue before order approval", () => {
    const draft = { ...revision, status: "DRAFT" } as ProductionOrderRevision;
    const issuedProject = structuredClone(project);
    issuedProject.epics[0].steps[0].tasks = [{ id: "t1", status: "assigned", isDone: false } as never];
    expect(buildProjectProcessView(issuedProject, draft).gates.find((gate) => gate.key === "ISSUE")?.state).toBe("BLOCKED");
    expect(buildProjectProcessView(issuedProject, draft).gates.find((gate) => gate.key === "PRODUCTION")?.state).toBe("BLOCKED");
  });

  it("shows and counts each direct project task exactly once without converting its schedule", () => {
    const projectWithDirectTasks = structuredClone(project);
    projectWithDirectTasks.epics[0].steps.push({
      id: "blocked-step",
      name: "Állomás nélküli kézi sor",
      station: null,
      quantity: null,
      unitHours: null,
      planDate: null,
      planLocked: false,
      disabled: false,
      tasks: [],
    });
    projectWithDirectTasks.unepicTasks = [
      {
        id: "direct-1",
        projectId: project.id,
        epicStepId: null,
        epicName: null,
        title: "Helyszíni javítás",
        station: "Összeszerelés",
        week: "2026-08-03",
        day: 0,
        stepIndex: 1,
        acknowledged: true,
        urgent: false,
        problem: false,
        dueDate: "2026-08-02T00:00:00.000Z",
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
      },
      {
        id: "direct-2",
        projectId: project.id,
        epicStepId: null,
        epicName: null,
        title: "Csomagellenőrzés",
        station: "Csomagolás",
        week: "2026-08-03",
        day: 4,
        stepIndex: 2,
        acknowledged: true,
        urgent: false,
        problem: false,
        dueDate: null,
        description: "",
        quantity: null,
        unitHours: null,
        dependsOnId: null,
        createdAt: "2026-07-31T08:00:00.000Z",
        updatedAt: "2026-07-31T10:00:00.000Z",
        status: "done",
        isDone: true,
        flowLabel: "Kész",
        depDone: true,
        dependsOnTitle: null,
        projectNum: "1",
      },
      {
        id: "direct-problem",
        projectId: project.id,
        epicStepId: null,
        epicName: null,
        title: "Eltérésvizsgálat",
        station: null,
        week: "legacy-week-value",
        day: 9,
        stepIndex: 3,
        acknowledged: false,
        urgent: true,
        problem: true,
        dueDate: null,
        description: "",
        quantity: 1,
        unitHours: 0.25,
        dependsOnId: null,
        createdAt: "2026-07-31T08:00:00.000Z",
        updatedAt: "2026-07-31T11:00:00.000Z",
        status: "problem",
        isDone: false,
        flowLabel: "Probléma",
        depDone: true,
        dependsOnTitle: null,
        projectNum: "1",
      },
    ];

    const view = buildProjectProcessView(projectWithDirectTasks, revision);
    const directLane = view.lanes.find((lane) => lane.name === "(epik nélkül)");
    const firstDirectRow = directLane?.rows[0];

    expect(directLane).toMatchObject({ done: 1, total: 3 });
    expect(firstDirectRow).toMatchObject({
      id: "direct-1",
      sourceKind: "DIRECT_TASK",
      week: "2026-08-03",
      day: 0,
      status: "inprogress",
      problem: false,
      quantity: 3,
      unitHours: 0.5,
      state: "IN_PROGRESS",
    });
    expect(firstDirectRow && "planDate" in firstDirectRow).toBe(false);
    expect(view.lanes.flatMap((lane) => lane.rows).filter((row) => row.id === "direct-1")).toHaveLength(1);
    expect(directLane?.rows.find((row) => row.id === "direct-problem")).toMatchObject({
      sourceKind: "DIRECT_TASK",
      week: "legacy-week-value",
      day: 9,
      status: "problem",
      problem: true,
      state: "BLOCKED",
    });
    expect(view.lanes[0].rows.find((row) => row.id === "blocked-step")?.state).toBe("BLOCKED");
    expect(view.gates.find((gate) => gate.key === "ISSUE")?.detail).toContain("3 örökölt feladat");
    expect(view.gates.find((gate) => gate.key === "PRODUCTION")?.detail).toContain("1 / 3 legacy feladat kész");
    expect(view.gates.find((gate) => gate.key === "PLANNING")?.detail).toContain("3 közvetlen üzemi feladat hét/nap adata nem tervjavaslat");
  });
});
