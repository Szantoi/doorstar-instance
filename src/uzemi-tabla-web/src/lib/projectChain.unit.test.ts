import { describe, expect, it } from "vitest";
import type {
  OrderRevisionReadiness,
  OrderRevisionReadinessGateKey,
  ProjectWorkflow,
  ProjectWorkflowGateKey,
  ReadinessBlocker,
} from "@/services/production/types";
import { buildProjectChainView, safeProjectWorkspaceHref } from "./projectChain";

const blocker: ReadinessBlocker = {
  code: "component_snapshot_required",
  message: "Ellenőrzött alkatrészsnapshot szükséges.",
  ownerRole: "technical_preparation",
  entity: { kind: "ORDER_REVISION", id: "revision-2", href: "/orders/DSMR-1/revisions/2/components" },
  detail: { missingSnapshotState: "VERIFIED" },
};

const readinessGateKeys: OrderRevisionReadinessGateKey[] = [
  "SURVEY", "POSITION_EVIDENCE", "DOCUMENTS", "MANUFACTURED_ITEMS", "SUPPLEMENTARY_ITEMS",
  "ORDER_REVIEW", "COMPONENT_SNAPSHOT", "OPERATION_PLAN", "PRODUCTION_RELEASE",
];
const workflowGateKeys: ProjectWorkflowGateKey[] = [
  "ORDER", "COMPONENTS", "OPERATIONS", "PLANNING", "WORK_PACKAGE", "PRODUCTION_6_STAGE", "HANDOVER",
];

function fixtures() {
  const readiness: OrderRevisionReadiness = {
    schemaVersion: "doorstar.order-revision-readiness/v1",
    projectKey: "DSMR-1",
    revision: {
      id: "revision-2",
      number: 2,
      isLatest: true,
      latestRevisionNumber: 2,
      status: "APPROVED",
      intakeStage: "TECHNICAL_PREPARATION",
      updatedAt: "2026-07-31T20:00:00.000Z",
      contentHash: { value: "a".repeat(64), schemaVersion: 3, verification: "VERIFIED", auditId: "approval-2" },
    },
    gates: readinessGateKeys.map((key, index) => ({
      key,
      state: index < 6 ? "READY" : index === 6 ? "BLOCKED" : "NOT_AVAILABLE",
      ready: index < 6,
      ownerRole: index === 6 ? "technical_preparation" : "sales",
      detailsHref: index === 6 ? "/orders/DSMR-1/revisions/2/components" : "/orders/DSMR-1",
      blockers: index === 6 ? [blocker] : [],
      allowedActions: [],
      details: { kind: key },
    })),
    blockers: [blocker],
    allowedActions: [],
    nextAction: { kind: "BLOCKED", blockerCode: blocker.code, ownerRole: blocker.ownerRole, href: blocker.entity!.href },
  };
  const workflow: ProjectWorkflow = {
    schemaVersion: "doorstar.project-workflow/v1",
    projectKey: "DSMR-1",
    revision: { id: "revision-2", number: 2, isLatest: true, href: "/orders/DSMR-1" },
    currentGate: "COMPONENTS",
    gates: workflowGateKeys.map((key, index) => ({
      key,
      state: index === 0 ? "READY" : index === 1 ? "BLOCKED" : index === 2 ? "NOT_AVAILABLE" : "CONTRACT_REQUIRED",
      ownerRole: index === 1 ? "technical_preparation" : index < 3 ? "sales" : "production_planner",
      source: { kind: "ORDER_REVISION", id: "revision-2", revision: 2, contentHash: "a".repeat(64), href: "/orders/DSMR-1" },
      blockers: index === 1 ? [blocker] : [],
      allowedActions: [],
      detailsHref: index === 1 ? "/orders/DSMR-1/revisions/2/components" : index < 3 ? "/orders/DSMR-1" : "/projects/DSMR-1",
    })),
    blockers: [blocker],
    allowedActions: [],
    nextAction: { kind: "BLOCKED", blockerCode: blocker.code, ownerRole: blocker.ownerRole, href: blocker.entity!.href },
  };
  return { readiness, workflow };
}

describe("server-authoritative project chain adapter", () => {
  it("maps explicit current/completed/blocked/not-available states without inventing authority", () => {
    const { readiness, workflow } = fixtures();
    const view = buildProjectChainView(readiness, workflow, { projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2 });

    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.stages.map((stage) => stage.state)).toEqual([
      "COMPLETED", "CURRENT", "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE",
    ]);
    expect(view.nextAction).toMatchObject({
      title: "Ehhez az exact revízióhoz még nincs alkatrészsnapshot.",
      ownerRole: "Műszaki előkészítő",
      href: "/orders/DSMR-1/revisions/2/components",
    });
  });

  it("keeps a current CONTRACT_REQUIRED planning gate unavailable after a fully ready implemented prefix", () => {
    const { readiness, workflow } = fixtures();
    const planningBlocker: ReadinessBlocker = {
      code: "planning_proposal_authority_not_available",
      message: "A szerver-authoritatív tervjavaslat még nem érhető el.",
      ownerRole: "production_planner",
      entity: null,
      detail: { contract: "PLANNING_PROPOSAL" },
    };
    readiness.gates.forEach((gate) => {
      if (gate.key !== "COMPONENT_SNAPSHOT" && gate.key !== "OPERATION_PLAN") return;
      gate.state = "READY";
      gate.ready = true;
      gate.blockers = [];
    });
    readiness.blockers = [];
    readiness.nextAction = { kind: "COMPLETE", message: "A revízió adatkapui teljesültek." };
    workflow.gates.forEach((gate, index) => {
      gate.state = index < 3 ? "READY" : "CONTRACT_REQUIRED";
      gate.blockers = index === 3 ? [planningBlocker] : [];
    });
    workflow.currentGate = "PLANNING";
    workflow.blockers = [planningBlocker];
    workflow.nextAction = {
      kind: "BLOCKED",
      blockerCode: planningBlocker.code,
      ownerRole: planningBlocker.ownerRole,
      href: null,
    };

    const view = buildProjectChainView(readiness, workflow, { projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2 });

    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.currentGate).toBe("PLANNING");
    expect(view.stages.map((stage) => stage.state)).toEqual([
      "COMPLETED", "COMPLETED", "COMPLETED", "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE",
    ]);
  });

  it("fails closed for a partial contract, mixed revisions and stale authority", () => {
    const { readiness, workflow } = fixtures();
    expect(buildProjectChainView({ ...readiness, gates: readiness.gates.slice(0, -1) }, workflow, {
      projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2,
    }).status).toBe("INVALID");
    expect(buildProjectChainView(readiness, { ...workflow, revision: { ...workflow.revision, id: "revision-1" } }, {
      projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2,
    }).status).toBe("INVALID");
    expect(buildProjectChainView({ ...readiness, revision: { ...readiness.revision, isLatest: false } }, workflow, {
      projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2,
    }).status).toBe("STALE");
  });

  it.each([
    ["kind", "LEGACY_ORDER"],
    ["id", "revision-1"],
    ["revision", 1],
    ["contentHash", "c".repeat(64)],
  ] as const)("fails closed when a workflow gate has mixed source %s lineage", (field, value) => {
    const { readiness, workflow } = fixtures();
    const mixedWorkflow = structuredClone(workflow);
    Object.assign(mixedWorkflow.gates[2].source, { [field]: value });

    expect(buildProjectChainView(readiness, mixedWorkflow, {
      projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2,
    }).status).toBe("INVALID");
  });

  it.each(["COMPONENTS", "OPERATIONS"] as const)(
    "fails closed for an internally consistent but cross-endpoint mixed %s snapshot",
    (mixedGate) => {
      const { readiness, workflow } = fixtures();
      if (mixedGate === "COMPONENTS") {
        workflow.gates[1].state = "READY";
        workflow.gates[1].blockers = [];
        workflow.currentGate = "OPERATIONS";
        workflow.blockers = [];
        workflow.nextAction = { kind: "COMPLETE", message: "A workflow projekció szerint nincs nyitott blocker." };
      } else {
        const operationBlocker: ReadinessBlocker = {
          code: "operation_plan_snapshot_required",
          message: "Más műveletterv-snapshot került a workflow projekcióba.",
          ownerRole: "sales",
          entity: { kind: "ORDER_REVISION", id: "revision-2", href: "/orders/DSMR-1" },
          detail: { snapshotId: "mixed-operation-snapshot" },
        };
        workflow.gates[2].state = "BLOCKED";
        workflow.gates[2].blockers = [operationBlocker];
        workflow.blockers = [workflow.gates[1].blockers[0], operationBlocker];
      }

      expect(buildProjectChainView(readiness, workflow, {
        projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2,
      }).status).toBe("INVALID");
    },
  );

  it("compares mirrored blocker details independently of object property order", () => {
    const { readiness, workflow } = fixtures();
    const readinessBlocker = structuredClone(readiness.gates[6].blockers[0]);
    readinessBlocker.detail = { expectedState: "VERIFIED", audit: { id: "audit-2", current: true } };
    const workflowBlocker = structuredClone(readinessBlocker);
    workflowBlocker.detail = { audit: { current: true, id: "audit-2" }, expectedState: "VERIFIED" };
    readiness.gates[6].blockers = [readinessBlocker];
    readiness.blockers = [readinessBlocker];
    workflow.gates[1].blockers = [workflowBlocker];
    workflow.blockers = [workflowBlocker];

    expect(buildProjectChainView(readiness, workflow, {
      projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2,
    }).status).toBe("READY");
  });

  it.each(["readiness", "workflow"] as const)(
    "fails closed when %s reports empty top-level blockers and COMPLETE over a blocked gate",
    (projection) => {
      const { readiness, workflow } = fixtures();
      const target = projection === "readiness" ? readiness : workflow;
      target.blockers = [];
      target.nextAction = { kind: "COMPLETE", message: "Nincs nyitott blocker." };

      expect(buildProjectChainView(readiness, workflow, {
        projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2,
      }).status).toBe("INVALID");
    },
  );

  it("fails closed for inconsistent current gate, flattened actions or next action", () => {
    const currentGateFixture = fixtures();
    currentGateFixture.workflow.currentGate = "OPERATIONS";
    expect(buildProjectChainView(currentGateFixture.readiness, currentGateFixture.workflow, {
      projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2,
    }).status).toBe("INVALID");

    const actionsFixture = fixtures();
    actionsFixture.workflow.allowedActions = [{
      code: "CREATE_COMPONENT_SNAPSHOT",
      method: "POST",
      href: "/api/production/components",
      ownerRoles: ["technical_preparation"],
      targetEntityId: "revision-2",
    }];
    expect(buildProjectChainView(actionsFixture.readiness, actionsFixture.workflow, {
      projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2,
    }).status).toBe("INVALID");

    const nextActionFixture = fixtures();
    nextActionFixture.workflow.nextAction = { kind: "COMPLETE", message: "Kész." };
    expect(buildProjectChainView(nextActionFixture.readiness, nextActionFixture.workflow, {
      projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2,
    }).status).toBe("INVALID");

    const readinessActionFixture = fixtures();
    readinessActionFixture.readiness.allowedActions = actionsFixture.workflow.allowedActions;
    expect(buildProjectChainView(readinessActionFixture.readiness, readinessActionFixture.workflow, {
      projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2,
    }).status).toBe("INVALID");

    const readinessNextFixture = fixtures();
    readinessNextFixture.readiness.nextAction = { kind: "COMPLETE", message: "Kész." };
    expect(buildProjectChainView(readinessNextFixture.readiness, readinessNextFixture.workflow, {
      projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2,
    }).status).toBe("INVALID");
  });

  it("only permits routes that really exist in the frontend", () => {
    expect(safeProjectWorkspaceHref("/orders/DSMR-1/survey")).toBe("/orders/DSMR-1/survey");
    expect(safeProjectWorkspaceHref("/projects/DSMR-1/work-session")).toBe("/projects/DSMR-1/work-session");
    expect(safeProjectWorkspaceHref("/api/production/production-orders/DSMR-1/review")).toBeNull();
    expect(safeProjectWorkspaceHref("https://example.invalid/authority")).toBeNull();
  });

  it("accepts structured blocker audit details and a null blocked href without creating a link", () => {
    const { readiness, workflow } = fixtures();
    const nullEntityBlocker = {
      ...blocker,
      entity: null,
      detail: { missingFields: ["openingDepthMm"] },
    };
    readiness.blockers = [nullEntityBlocker];
    readiness.gates[6].blockers = [nullEntityBlocker];
    readiness.gates[6].detailsHref = null;
    readiness.nextAction = { kind: "BLOCKED", blockerCode: blocker.code, ownerRole: blocker.ownerRole, href: null };
    workflow.blockers = [nullEntityBlocker];
    workflow.gates[1].blockers = [nullEntityBlocker];
    workflow.nextAction = { kind: "BLOCKED", blockerCode: blocker.code, ownerRole: blocker.ownerRole, href: null };
    workflow.gates[1].detailsHref = null;
    workflow.gates[1].source.href = "/api/production/production-orders/DSMR-1/revisions/2/readiness";

    const view = buildProjectChainView(readiness, workflow, { projectKey: "DSMR-1", revisionId: "revision-2", revisionNumber: 2 });
    expect(view.status).toBe("READY");
    if (view.status === "READY") expect(view.nextAction.href).toBeNull();
  });
});
