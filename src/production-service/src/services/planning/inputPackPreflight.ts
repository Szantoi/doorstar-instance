/**
 * Validates the versioned Doorstar Planning input pack before it is handed to
 * the platform contract review. This is deliberately a local, non-mutating
 * compatibility check: it never maps a Doorstar display label to a resource,
 * imports standards, creates a reservation or calls a scheduler.
 */
import {
  preflightDoorstarCalendarConfig,
  type CapacityPolicy,
  type ResourceCalendarCandidate,
} from "./calendarConfigPreflight.js";
import { resolveLegacyDependencyBounds, type DependencyBoundInput } from "./dependencyBaseline.js";
import { calculateLegacyPlanningBaseline, type LegacyPlanningInput } from "./legacyPlanningBaseline.js";

type ExpectedRecord = Record<string, unknown>;

interface CompatibilityVector<TInput> {
  input: TInput;
  expected: ExpectedRecord;
}

interface SourceFingerprint {
  fileName: string;
  sha256: string;
}

interface OperationStandardSample {
  sourceRow: number;
  sourceTaskKey: string;
  unitSeconds: number;
  workforce: number;
  dependencyType: string;
  partialReleaseThreshold: number;
}

export interface DoorstarPlanningInputPack {
  schemaVersion: string;
  sourceProvenance: {
    unitTimeCatalogue: SourceFingerprint;
    legacyWorkflowWorkbook: SourceFingerprint;
  };
  legacyCalculationVectors: readonly CompatibilityVector<LegacyPlanningInput>[];
  dependencyCompatibilityVectors: readonly CompatibilityVector<DependencyBoundInput>[];
  operationStandardSamples: readonly OperationStandardSample[];
  calendarDraft: {
    capacityPolicy: CapacityPolicy;
    resources: readonly ResourceCalendarCandidate[];
  };
  /** Approval rules are owned by the future C# tenant-policy service. */
  approvalWorkflow: "platform_tenant_policy_required";
}

export type InputPackIssueCode =
  | "unsupported_schema_version"
  | "invalid_source_fingerprint"
  | "invalid_legacy_calculation_vector"
  | "invalid_dependency_vector"
  | "invalid_standard_sample"
  | "duplicate_standard_source_key"
  | "invalid_calendar_draft"
  | "invalid_approval_workflow_owner"
  | "calendar_approval_required"
  | "contract_reviewer_required";

export interface InputPackIssue {
  code: InputPackIssueCode;
  severity: "error" | "action_required";
  detail: string;
}

export interface InputPackPreflightResult {
  readyForPlatformContractReview: boolean;
  issues: InputPackIssue[];
}

const SHA256 = /^[A-F0-9]{64}$/;
const DEPENDENCY_TYPES = new Set(["FS", "SS", "FF", "SF"]);
const SUPPORTED_SCHEMA_VERSIONS = new Set(["1.0", "2.0.0"]);

function matchesExpected(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && actual.length === expected.length
      && expected.every((value, index) => matchesExpected(actual[index], value));
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    return Object.entries(expected).every(([key, value]) => matchesExpected((actual as Record<string, unknown>)[key], value));
  }
  return Object.is(actual, expected);
}

function hasValidFingerprint(fingerprint: SourceFingerprint): boolean {
  return typeof fingerprint.fileName === "string"
    && fingerprint.fileName.trim().length > 0
    && SHA256.test(fingerprint.sha256);
}

function isValidStandardSample(sample: OperationStandardSample): boolean {
  return Number.isInteger(sample.sourceRow)
    && sample.sourceRow > 0
    && typeof sample.sourceTaskKey === "string"
    && sample.sourceTaskKey.trim().length > 0
    && Number.isFinite(sample.unitSeconds)
    && sample.unitSeconds > 0
    && Number.isFinite(sample.workforce)
    && sample.workforce > 0
    && DEPENDENCY_TYPES.has(sample.dependencyType)
    && Number.isFinite(sample.partialReleaseThreshold)
    && sample.partialReleaseThreshold > 0
    && sample.partialReleaseThreshold <= 1;
}

/**
 * Produces review evidence for the immutable input pack. Errors prevent a
 * platform contract review; action-required items are named human approvals
 * deliberately kept outside this code path.
 */
export function preflightDoorstarPlanningInputPack(pack: DoorstarPlanningInputPack): InputPackPreflightResult {
  const issues: InputPackIssue[] = [];
  if (!SUPPORTED_SCHEMA_VERSIONS.has(pack.schemaVersion)) {
    issues.push({ code: "unsupported_schema_version", severity: "error", detail: "Supported input-pack schema versions are 1.0 and 2.0.0." });
  }

  const fingerprints: Array<[string, SourceFingerprint]> = [
    ["unitTimeCatalogue", pack.sourceProvenance.unitTimeCatalogue],
    ["legacyWorkflowWorkbook", pack.sourceProvenance.legacyWorkflowWorkbook],
  ];
  for (const [name, fingerprint] of fingerprints) {
    if (!hasValidFingerprint(fingerprint)) {
      issues.push({ code: "invalid_source_fingerprint", severity: "error", detail: `${name} needs a non-empty file name and uppercase SHA-256 fingerprint.` });
    }
  }

  for (const [index, vector] of pack.legacyCalculationVectors.entries()) {
    try {
      if (!matchesExpected(calculateLegacyPlanningBaseline(vector.input), vector.expected)) {
        issues.push({ code: "invalid_legacy_calculation_vector", severity: "error", detail: `Legacy calculation vector ${index} does not match the reference calculation.` });
      }
    } catch {
      issues.push({ code: "invalid_legacy_calculation_vector", severity: "error", detail: `Legacy calculation vector ${index} is not executable.` });
    }
  }

  for (const [index, vector] of pack.dependencyCompatibilityVectors.entries()) {
    try {
      if (!matchesExpected(resolveLegacyDependencyBounds(vector.input), vector.expected)) {
        issues.push({ code: "invalid_dependency_vector", severity: "error", detail: `Dependency vector ${index} does not match the reference precedence rules.` });
      }
    } catch {
      issues.push({ code: "invalid_dependency_vector", severity: "error", detail: `Dependency vector ${index} is not executable.` });
    }
  }

  const sourceKeys = new Set<string>();
  for (const sample of pack.operationStandardSamples) {
    if (!isValidStandardSample(sample)) {
      issues.push({ code: "invalid_standard_sample", severity: "error", detail: `Standard sample ${sample.sourceTaskKey || "(blank)"} has an invalid source, norm or dependency field.` });
    }
    if (sourceKeys.has(sample.sourceTaskKey)) {
      issues.push({ code: "duplicate_standard_source_key", severity: "error", detail: `Standard sample ${sample.sourceTaskKey} is duplicated.` });
    }
    sourceKeys.add(sample.sourceTaskKey);
  }

  const calendar = preflightDoorstarCalendarConfig(pack.calendarDraft.resources, pack.calendarDraft.capacityPolicy);
  if (calendar.quarantined.length > 0) {
    issues.push({ code: "invalid_calendar_draft", severity: "error", detail: "Calendar draft contains quarantined resource records." });
  }
  if (pack.approvalWorkflow !== "platform_tenant_policy_required") {
    issues.push({ code: "invalid_approval_workflow_owner", severity: "error", detail: "Approval workflow must be owned by the C# tenant-policy service, not a Doorstar adapter default." });
  }
  issues.push({ code: "calendar_approval_required", severity: "action_required", detail: "The C# tenant policy must determine the calendar approval workflow before import or reservation." });
  issues.push({ code: "contract_reviewer_required", severity: "action_required", detail: "The C# tenant policy must determine the Planning OpenAPI review workflow before release." });

  return {
    readyForPlatformContractReview: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}
