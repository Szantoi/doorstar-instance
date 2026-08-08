import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = resolve(serviceRoot, "openapi/production-service.openapi.json");

describe("OpenAPI contract endpoint", () => {
  it("serves the checked-in OpenAPI 3.1 source of truth without a database dependency", async () => {
    const expected = JSON.parse(readFileSync(specPath, "utf8"));

    const response = await request(createApp())
      .get("/openapi.json")
      .expect("content-type", /application\/json/)
      .expect(200);

    expect(response.body).toEqual(expected);
    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.info.title).toBe("Doorstar Production Service API");
    expect(
      response.body.components.schemas.ComponentSnapshotCreateConflictError
        .allOf[1].properties.error.enum,
    ).toEqual(expect.arrayContaining([
      "component_position_evidence_unresolved",
      "component_source_evidence_unresolved",
      "component_source_not_verified",
      "component_snapshot_profile_conflict",
    ]));
    expect(
      response.body.components.schemas.ComponentSnapshotConflictDetails.oneOf,
    ).toHaveLength(6);
    expect(
      response.body.components.schemas.ComponentSnapshotConflictDetails.oneOf,
    ).toEqual(expect.arrayContaining([
      { $ref: "#/components/schemas/PositionEvidenceGateDetails" },
    ]));
    expect(
      response.body.components.schemas.PositionEvidenceConflictError
        .allOf[1].properties.error.enum,
    ).toEqual([
      "revision_version_conflict",
      "evidence_document_not_from_revision",
      "position_evidence_review_final",
    ]);
    expect(
      response.body.components.schemas.OrderRevisionGateConflictError
        .allOf[1].properties.error.enum,
    ).toEqual(expect.arrayContaining([
      "position_evidence_unresolved",
      "reviewed_order_content_changed",
      "approved_order_content_changed",
    ]));
    expect(
      response.body.components.schemas.OrderRevisionAudit.properties
        .contentHashSchemaVersion.enum,
    ).toEqual([1, 2, 3]);
    expect(
      response.body.components.schemas.IntakeStageConflictError
        .allOf[1].properties.error.enum,
    ).toEqual([
      "invalid_intake_stage_transition",
      "sales_documents_missing",
      "survey_data_incomplete",
    ]);
    expect(
      response.body.components.schemas.IntakeStageConflictError
        .allOf[1].properties.details,
    ).toEqual({ $ref: "#/components/schemas/SurveyCompletionGateDetails" });
    expect(
      response.body.components.schemas.SurveyPositionMissingFields
        .properties.fields.items.enum,
    ).toEqual(expect.arrayContaining([
      "openingDepthMm",
      "doorTypeKey",
      "wallSolutionKey",
      "glassKey",
    ]));
    expect(
      response.body.components.schemas.OrderDraftMutationConflictError
        .allOf[1].properties.error.enum,
    ).toEqual([
      "duplicate_order_position_id",
      "order_position_not_from_revision",
      "position_evidence_must_be_retained",
    ]);
    expect(
      response.body.components.schemas.SupplementaryReviewConflictError
        .allOf[1].properties.error.enum,
    ).toEqual(expect.arrayContaining([
      "supplementary_item_requires_draft",
      "supplementary_item_review_final",
      "supplementary_item_document_not_from_revision",
      "source_review_item_must_be_rejected",
    ]));
    expect(
      response.body.components.schemas.SourceEvidenceReviewerRole.enum,
    ).toEqual([
      "technical_preparation",
      "order_approver",
      "administrator",
      "vezeto",
      null,
    ]);
    expect(
      response.body.components.schemas.OperationPlanBlockerCode.enum,
    ).toEqual(expect.arrayContaining([
      "operation_revision_stale",
      "operation_component_snapshot_not_current",
      "operation_standard_missing",
      "operation_resource_unmapped",
      "operation_dependency_invalid",
      "operation_dependency_cyclic",
      "operation_evidence_unresolved",
      "operation_snapshot_state_conflict",
      "operation_review_separation_required",
      "operation_concurrency_conflict",
    ]));
    expect(
      response.body.components.schemas.OperationPlanSnapshotReview.required,
    ).toEqual(["state", "resolution", "expectedOutputHash"]);
    expect(
      response.body.components.schemas.OperationPlanSnapshotCreate.properties.confirmation.const,
    ).toBe("CREATE_OPERATION_PLAN_SNAPSHOT");
    expect(
      response.body.paths["/api/production/production-orders/{projectKey}/revisions/{revision}/readiness"]
        .get.responses["200"].content["application/json"].schema,
    ).toEqual({ $ref: "#/components/schemas/OrderRevisionReadiness" });
    expect(
      response.body.paths["/api/production/projects/{projectKey}/workflow"]
        .get.responses["200"].content["application/json"].schema,
    ).toEqual({ $ref: "#/components/schemas/ProjectWorkflow" });
    expect(response.body.components.schemas.ReadinessGateKey.enum).toEqual([
      "SURVEY", "POSITION_EVIDENCE", "DOCUMENTS", "MANUFACTURED_ITEMS",
      "SUPPLEMENTARY_ITEMS", "ORDER_REVIEW", "COMPONENT_SNAPSHOT",
      "OPERATION_PLAN", "PRODUCTION_RELEASE",
    ]);
    expect(response.body.components.schemas.ReadinessGateDetails.oneOf).toEqual(expect.arrayContaining([
      { $ref: "#/components/schemas/DocumentReadinessDetails" },
      { $ref: "#/components/schemas/SnapshotReadinessDetails" },
      { $ref: "#/components/schemas/ProductionReleaseReadinessDetails" },
    ]));
    expect(response.body.components.schemas.ReadinessAllowedAction.properties.ownerRoles.items)
      .toEqual({ $ref: "#/components/schemas/CanonicalDoorstarRole" });
    for (const status of ["400", "403", "404", "409"]) {
      expect(
        response.body.paths["/api/production/production-orders/{projectKey}/revisions/{revision}/readiness"]
          .get.responses[status],
      ).toEqual({ $ref: "#/components/responses/ReadModelError" });
    }
    expect(
      response.body.paths["/api/production/tasks/{id}"].patch.responses["409"]
        .content["application/json"].schema.oneOf,
    ).toEqual([
      { $ref: "#/components/schemas/IssuedTaskProjectLockedError" },
      { $ref: "#/components/schemas/LegacyProductionIssueConflictError" },
    ]);
    expect(
      response.body.components.responses.IssueSessionConflict
        .content["application/json"].schema.oneOf,
    ).toEqual([
      { $ref: "#/components/schemas/MissingPlanDatesError" },
      { $ref: "#/components/schemas/LegacyProductionIssueConflictError" },
    ]);
    expect(
      response.body.components.responses.IssueStepConflict
        .content["application/json"].schema.oneOf,
    ).toEqual([
      { $ref: "#/components/schemas/MissingPlanDateError" },
      { $ref: "#/components/schemas/PredecessorNotIssuedError" },
      { $ref: "#/components/schemas/LegacyProductionIssueConflictError" },
    ]);
    expect(response.body.components.schemas.IssuedTaskProjectLockedError.properties.error.const)
      .toBe("issued_task_project_locked");
    expect(response.body.components.schemas.MissingPlanDatesError.properties.error.const)
      .toBe("missing_plan_dates");
    expect(response.body.components.schemas.MissingPlanDateError.properties.error.const)
      .toBe("missing_plan_date");
    expect(response.body.components.schemas.PredecessorNotIssuedError.properties.error.const)
      .toBe("predecessor_not_issued");
    expect(response.body.components.schemas.LegacyProductionIssueConflictError.properties.error.const)
      .toBe("legacy_production_issue_blocked");
    expect(response.body.components.schemas.LegacyProductionBlockerCode.enum).toEqual([
      "approved_revision_required",
      "approved_order_audit_required",
      "approved_order_content_changed",
      "explicit_order_revision_lineage_required",
      "current_verified_component_snapshot_required",
      "explicit_component_snapshot_lineage_required",
      "current_verified_operation_plan_required",
      "planning_proposal_required",
      "issued_work_package_required",
      "exact_document_lineage_required",
      "legacy_lineage_concurrency_conflict",
    ]);
    expect(response.body.components.schemas.IssueStepResult).toMatchObject({
      required: ["outcome", "taskId"],
      properties: {
        outcome: { const: "already_issued" },
        taskId: { type: "string" },
      },
      additionalProperties: false,
    });
    expect(response.body.components.schemas.IssueSessionResult).toMatchObject({
      required: ["createdCount", "skippedExisting", "missingPlanDates"],
      properties: {
        createdCount: { const: 0 },
        skippedExisting: { type: "integer", minimum: 0 },
        missingPlanDates: { type: "array", maxItems: 0 },
      },
      additionalProperties: false,
    });
    expect(response.body.components.schemas.FlowLabPlanSnapshot.required).toContain("evidence");
    expect(response.body.components.schemas.FlowLabPlanSnapshot.properties.evidence)
      .toEqual({ $ref: "#/components/schemas/FlowLabArtifactEvidence" });
    expect(response.body.components.schemas.FlowLabReadiness.properties.blockers)
      .toEqual({ type: "array", items: { $ref: "#/components/schemas/FlowLabReadinessBlocker" } });
    expect(response.body.components.schemas.FlowLabReadinessBlocker).toMatchObject({
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        entityId: { type: "string" },
      },
      additionalProperties: false,
    });
    expect(response.body.components.schemas.FlowLabArtifactEvidence).toMatchObject({
      type: "object",
      required: ["findings", "unresolved", "absentMembers", "productionAuthority"],
      properties: {
        findings: { type: "array", items: { $ref: "#/components/schemas/FlowLabFinding" } },
        unresolved: { type: "array", items: { $ref: "#/components/schemas/FlowLabUnresolved" } },
        absentMembers: { type: "array", items: { $ref: "#/components/schemas/FlowLabAbsentMember" } },
        productionAuthority: { const: false },
      },
      additionalProperties: false,
    });
    expect(response.body.components.schemas.FlowLabPlanSnapshot.required).toEqual(expect.arrayContaining([
      "generatorProfileFingerprint",
      "resourceMappingFingerprint",
      "orderContentHash",
      "componentOutputHash",
      "createdByPrincipal",
      "reviewResolution",
      "reviewedByRole",
      "reviewedByPrincipal",
      "reviewedAt",
    ]));
    expect(response.body.components.schemas.FlowLabDeviationRecord.properties.pins)
      .toEqual({ $ref: "#/components/schemas/FlowLabDeviationPins" });
    expect(response.body.components.schemas.FlowLabDeviationPins).toMatchObject({
      required: ["sourceSetKey", "materializationKey", "catalogRevision", "catalogHash", "planHash", "engineIdentity"],
      additionalProperties: false,
    });
  });
});
