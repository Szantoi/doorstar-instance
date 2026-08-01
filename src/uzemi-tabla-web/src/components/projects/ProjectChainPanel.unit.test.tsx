import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type {
  OrderRevisionReadiness,
  OrderRevisionReadinessGateKey,
  ProjectWorkflow,
  ProjectWorkflowGateKey,
  ReadinessBlocker,
} from "@/services/production/types";
import { ProjectChainPanel } from "./ProjectChainPanel";

afterEach(cleanup);

const blocker: ReadinessBlocker = {
  code: "survey_document_link_required",
  message: "A felmérési dokumentumkapcsolat hiányzik.",
  ownerRole: "technical_preparation",
  entity: { kind: "ORDER_REVISION", id: "revision-3", href: "/orders/DSMR-3/survey" },
  detail: { missingFields: ["surveyDocumentLink"] },
};
const readinessKeys: OrderRevisionReadinessGateKey[] = ["SURVEY", "POSITION_EVIDENCE", "DOCUMENTS", "MANUFACTURED_ITEMS", "SUPPLEMENTARY_ITEMS", "ORDER_REVIEW", "COMPONENT_SNAPSHOT", "OPERATION_PLAN", "PRODUCTION_RELEASE"];
const workflowKeys: ProjectWorkflowGateKey[] = ["ORDER", "COMPONENTS", "OPERATIONS", "PLANNING", "WORK_PACKAGE", "PRODUCTION_6_STAGE", "HANDOVER"];

function payloads() {
  const readiness: OrderRevisionReadiness = {
    schemaVersion: "doorstar.order-revision-readiness/v1",
    projectKey: "DSMR-3",
    revision: { id: "revision-3", number: 3, isLatest: true, latestRevisionNumber: 3, status: "DRAFT", intakeStage: "SURVEY_PENDING", updatedAt: "2026-07-31T20:00:00Z", contentHash: { value: "b".repeat(64), schemaVersion: 3, verification: "UNAPPROVED_CURRENT", auditId: null } },
    gates: readinessKeys.map((key, index) => ({ key, state: index === 0 || index === 5 ? "BLOCKED" : "NOT_AVAILABLE", ready: false, ownerRole: "technical_preparation", detailsHref: index === 0 || index === 5 ? "/orders/DSMR-3/survey" : null, blockers: index === 0 || index === 5 ? [blocker] : [], allowedActions: [], details: { kind: key } })),
    blockers: [blocker], allowedActions: [], nextAction: { kind: "BLOCKED", blockerCode: blocker.code, ownerRole: blocker.ownerRole, href: "/orders/DSMR-3/survey" },
  };
  const workflow: ProjectWorkflow = {
    schemaVersion: "doorstar.project-workflow/v1",
    projectKey: "DSMR-3",
    revision: { id: "revision-3", number: 3, isLatest: true, href: "/orders/DSMR-3" },
    currentGate: "ORDER",
    gates: workflowKeys.map((key, index) => ({ key, state: index === 0 ? "BLOCKED" : index < 3 ? "NOT_AVAILABLE" : "CONTRACT_REQUIRED", ownerRole: index < 3 ? "technical_preparation" : "production_planner", source: { kind: "ORDER_REVISION", id: "revision-3", revision: 3, contentHash: "b".repeat(64), href: "/api/production/production-orders/DSMR-3/revisions/3/readiness" }, blockers: index === 0 ? [blocker] : [], allowedActions: [], detailsHref: index === 0 ? "/orders/DSMR-3/survey" : null })),
    blockers: [blocker], allowedActions: [], nextAction: { kind: "BLOCKED", blockerCode: blocker.code, ownerRole: blocker.ownerRole, href: "/orders/DSMR-3/survey" },
  };
  return { readiness, workflow };
}

function panel(state: "UNAVAILABLE" | "PENDING" | "ERROR" | "READY", patch: { readiness?: unknown; workflow?: unknown } = {}) {
  const fixtures = payloads();
  return (
    <MemoryRouter>
      <ProjectChainPanel projectKey="DSMR-3" revisionId="revision-3" revisionNumber={3} state={state} readiness={patch.readiness ?? fixtures.readiness} workflow={patch.workflow ?? fixtures.workflow} />
    </MemoryRouter>
  );
}

describe("ProjectChainPanel", () => {
  it("shows the current server gate, missing fact, role and only a real workspace link", () => {
    render(panel("READY"));

    expect(screen.getByRole("heading", { name: "Hol tart a projekt?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rendelés és felmérés.*Itt tart/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("Minden pozícióhoz exact felmérési dokumentumverziót kell kapcsolni.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Műszaki előkészítő").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Adatgazda munkatér megnyitása/ })).toHaveAttribute("href", "/orders/DSMR-3/survey");
    expect(screen.queryByRole("button", { name: /végleges|kiadás|jóváhagy/i })).not.toBeInTheDocument();
  });

  it("supports keyboard-focusable stage inspection without changing authority", () => {
    render(panel("READY"));
    const operations = screen.getByRole("button", { name: /Műveletterv.*Nem elérhető/i });
    operations.focus();
    expect(document.activeElement).toBe(operations);
    fireEvent.click(operations);
    expect(operations).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Műveletterv" })).toBeInTheDocument();
    expect(screen.getByText("Nincs szerveroldali blokkoló")).toBeInTheDocument();
  });

  it.each([
    ["PENDING", "ellenőrzése folyamatban"],
    ["ERROR", "nem érhető el"],
    ["UNAVAILABLE", "Nincs exact rendelési revízió"],
  ] as const)("keeps %s fail-closed", (state, message) => {
    render(panel(state));
    expect(screen.getByText(new RegExp(message))).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("rejects a partial payload without leaking a cached action", () => {
    const { readiness } = payloads();
    render(panel("READY", { readiness: { ...readiness, nextAction: undefined } }));
    expect(screen.getByRole("alert")).toHaveTextContent("readiness-szerződése hiányos");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
