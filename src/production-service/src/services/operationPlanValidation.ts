import { createHash } from "node:crypto";
import {
  findOperationResource,
  findOperationStandard,
} from "../config/operationAuthority.js";
import type { OperationCandidateInput } from "../domain/operationSchemas.js";

export interface OperationPlanBlocker {
  code: string;
  message: string;
  entityId?: string;
}

export interface ComponentRequirementAuthority {
  id: string;
  lineHash: string;
  requirementKind: "CUT_PART" | "PURCHASED_PART";
}

export interface DocumentVersionAuthority {
  id: string;
  versionId: string | null;
  contentSha256: string | null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function canonicalHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

/** Removes request ordering noise while preserving the full explicit plan. */
export function normalizeOperations(operations: OperationCandidateInput[]) {
  return operations.map((operation) => {
    const componentPairs = operation.sourceComponentRequirementIds.map((id, index) => ({
      id,
      lineHash: operation.sourceComponentLineHashes[index]!,
    })).sort((left, right) => left.id.localeCompare(right.id));
    return {
      ...operation,
      sourceComponentRequirementIds: componentPairs.map((pair) => pair.id),
      sourceComponentLineHashes: componentPairs.map((pair) => pair.lineHash.toLowerCase()),
      toolKeys: [...operation.toolKeys].sort(),
      dependencies: [...operation.dependencies].sort((left, right) => (
        left.predecessorOperationId.localeCompare(right.predecessorOperationId)
      )),
      documentReferences: [...operation.documentReferences].map((reference) => ({
        ...reference,
        versionHash: reference.versionHash.toLowerCase(),
      })).sort((left, right) => (
        `${left.purpose}:${left.documentVersionId}:${left.locator ?? ""}`
          .localeCompare(`${right.purpose}:${right.documentVersionId}:${right.locator ?? ""}`)
      )),
      timeStandardSource: operation.timeStandardSource ? {
        ...operation.timeStandardSource,
        versionHash: operation.timeStandardSource.versionHash.toLowerCase(),
      } : null,
      workInstruction: operation.workInstruction ? {
        ...operation.workInstruction,
        versionHash: operation.workInstruction.versionHash.toLowerCase(),
        contentCoverage: [...operation.workInstruction.contentCoverage].sort(),
      } : null,
      qualityCheckpoints: [...operation.qualityCheckpoints].sort((left, right) => left.key.localeCompare(right.key)),
      sourceEvidence: [...operation.sourceEvidence].map((evidence) => ({
        ...evidence,
        versionHash: evidence.versionHash?.toLowerCase() ?? null,
      })).sort((left, right) => (
        `${left.sourceKind}:${left.documentVersionId ?? ""}:${left.locator}`
          .localeCompare(`${right.sourceKind}:${right.documentVersionId ?? ""}:${right.locator}`)
      )),
    };
  }).sort((left, right) => left.sourceOperationKey.localeCompare(right.sourceOperationKey));
}

function blocker(code: string, message: string, entityId?: string): OperationPlanBlocker {
  return { code, message, ...(entityId ? { entityId } : {}) };
}

function validateDocumentReference(
  reference: { documentVersionId: string; versionHash: string },
  documents: DocumentVersionAuthority[],
  entityId: string,
): OperationPlanBlocker[] {
  const matches = documents.filter((document) => (
    document.id === reference.documentVersionId || document.versionId === reference.documentVersionId
  ));
  if (matches.length === 0) {
    return [blocker("operation_document_not_from_revision", "Referenced document version is not part of the exact order revision.", entityId)];
  }
  if (matches.length > 1) {
    return [blocker("operation_document_version_ambiguous", "Referenced document version identifier is ambiguous.", entityId)];
  }
  const document = matches[0]!;
  if (!document.contentSha256 || document.contentSha256.toLowerCase() !== reference.versionHash.toLowerCase()) {
    return [blocker("operation_document_hash_mismatch", "Referenced document version hash is missing or stale.", entityId)];
  }
  return [];
}

function validateDependencyGraph(operations: OperationCandidateInput[]) {
  const blockers: OperationPlanBlocker[] = [];
  const ids = new Set(operations.map((operation) => operation.id));
  const edges = new Map(operations.map((operation) => [
    operation.id,
    operation.dependencies.map((dependency) => dependency.predecessorOperationId),
  ]));
  for (const operation of operations) {
    for (const dependency of operation.dependencies) {
      if (!ids.has(dependency.predecessorOperationId) || dependency.predecessorOperationId === operation.id) {
        blockers.push(blocker("operation_dependency_invalid", "Dependency predecessor is missing or self-referential.", operation.id));
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const predecessor of edges.get(id) ?? []) {
      if (ids.has(predecessor) && visit(predecessor)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const operation of operations) {
    if (visit(operation.id)) {
      blockers.push(blocker("operation_dependency_cyclic", "Operation dependencies contain a cycle.", operation.id));
      break;
    }
  }
  return blockers;
}

/** Validates only explicit, versioned inputs. It never selects a standard,
 * resource, duration, dependency or review result on the caller's behalf. */
export function validateOperationCandidates(
  operations: OperationCandidateInput[],
  requirements: ComponentRequirementAuthority[],
  documents: DocumentVersionAuthority[],
) {
  const blockers: OperationPlanBlocker[] = [...validateDependencyGraph(operations)];
  const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]));

  for (const operation of operations) {
    const standards = findOperationStandard(operation.standardKey, operation.standardVersion);
    if (standards.length === 0) blockers.push(blocker("operation_standard_missing", "Standard key/version is not active in the current catalog.", operation.id));
    if (standards.length > 1) blockers.push(blocker("operation_standard_ambiguous", "Standard key/version resolves to more than one active standard.", operation.id));
    const standard = standards.length === 1 ? standards[0]! : undefined;
    if (standard && standard.processKind !== operation.processKind) {
      blockers.push(blocker("operation_standard_process_kind_mismatch", "Standard process kind does not match the operation.", operation.id));
    }

    const resources = findOperationResource(operation.resourceKey);
    if (resources.length === 0) blockers.push(blocker("operation_resource_unmapped", "Resource key is not mapped by the current resource authority.", operation.id));
    if (resources.length > 1) blockers.push(blocker("operation_resource_ambiguous", "Resource key has more than one active mapping.", operation.id));
    const resource = resources.length === 1 ? resources[0]! : undefined;
    if (resource && !resource.processKinds.includes(operation.processKind)) {
      blockers.push(blocker("operation_resource_incompatible", "Resource mapping does not allow this process kind.", operation.id));
    }
    if (resource && operation.machineKey && !resource.machineKeys.includes(operation.machineKey)) {
      blockers.push(blocker("operation_machine_unmapped", "Machine key is not part of the selected resource mapping.", operation.id));
    }
    if (resource && operation.toolKeys.some((key) => !resource.toolKeys.includes(key))) {
      blockers.push(blocker("operation_tool_unmapped", "One or more tool keys are not part of the selected resource mapping.", operation.id));
    }

    const referencedRequirements = operation.sourceComponentRequirementIds.map((id, index) => ({
      id,
      lineHash: operation.sourceComponentLineHashes[index]!,
      requirement: requirementById.get(id),
    }));
    for (const source of referencedRequirements) {
      if (!source.requirement) blockers.push(blocker("operation_component_requirement_missing", "Component requirement is not part of the selected snapshot.", operation.id));
      else if (source.requirement.lineHash.toLowerCase() !== source.lineHash.toLowerCase()) {
        blockers.push(blocker("operation_component_line_hash_mismatch", "Component requirement line hash is stale.", operation.id));
      }
    }
    if (standard && !standard.allowsPurchasedPart && referencedRequirements.some((source) => source.requirement?.requirementKind === "PURCHASED_PART")) {
      blockers.push(blocker("operation_purchased_part_technological_forbidden", "This standard cannot apply a technological route to a purchased part.", operation.id));
    }

    if (operation.processKind === "TECHNOLOGICAL" && (
      operation.cycleMinutesPerUnit === null
      || operation.nonTechnologicalMinutes !== null
      || operation.plannedNaturalHoldMinutes !== null
    )) blockers.push(blocker("operation_time_fields_invalid", "Technological operations require cycle time and cannot use non-technological or natural duration fields.", operation.id));
    if (operation.processKind === "NON_TECHNOLOGICAL" && (
      operation.nonTechnologicalMinutes === null
      || operation.cycleMinutesPerUnit !== null
      || operation.plannedNaturalHoldMinutes !== null
    )) blockers.push(blocker("operation_time_fields_invalid", "Non-technological operations require their dedicated duration only.", operation.id));
    if (operation.processKind === "NATURAL" && (
      operation.plannedNaturalHoldMinutes === null
      || operation.cycleMinutesPerUnit !== null
      || operation.nonTechnologicalMinutes !== null
    )) blockers.push(blocker("operation_time_fields_invalid", "Natural processes require a hold duration and no labour-cycle duration.", operation.id));

    if (standard?.requiresTimeStandardSource && !operation.timeStandardSource) {
      blockers.push(blocker("operation_time_standard_source_required", "The selected standard requires an exact time-standard source.", operation.id));
    }
    if (operation.timeStandardSource) {
      if (
        operation.timeStandardSource.standardKey !== operation.standardKey
        || operation.timeStandardSource.standardVersion !== operation.standardVersion
        || operation.timeStandardSource.unit !== operation.quantityUnit
      ) blockers.push(blocker("operation_time_standard_source_mismatch", "Time-standard source does not match the selected standard or quantity unit.", operation.id));
      blockers.push(...validateDocumentReference(operation.timeStandardSource, documents, operation.id));
    }
    if (standard?.requiresWorkInstruction && !operation.workInstruction) {
      blockers.push(blocker("operation_work_instruction_required", "The selected standard requires a versioned work instruction.", operation.id));
    }
    if (operation.workInstruction) blockers.push(...validateDocumentReference(operation.workInstruction, documents, operation.id));
    if (standard?.requiresQualityCheckpoint && !operation.qualityCheckpoints.some((checkpoint) => checkpoint.required)) {
      blockers.push(blocker("operation_quality_checkpoint_required", "At least one mandatory quality checkpoint is required.", operation.id));
    }
    for (const reference of operation.documentReferences) blockers.push(...validateDocumentReference(reference, documents, operation.id));

    if (operation.sourceEvidence.some((evidence) => evidence.reviewState !== "RESOLVED")) {
      blockers.push(blocker("operation_evidence_unresolved", "Every operation evidence row must be audit-resolved before materialization.", operation.id));
    }
    for (const evidence of operation.sourceEvidence) {
      if (evidence.sourceKind === "DOCUMENT" && (!evidence.documentVersionId || !evidence.versionHash)) {
        blockers.push(blocker("operation_evidence_document_required", "Document evidence requires an exact version identifier and hash.", operation.id));
      }
      if (evidence.documentVersionId && evidence.versionHash) {
        blockers.push(...validateDocumentReference({ documentVersionId: evidence.documentVersionId, versionHash: evidence.versionHash }, documents, operation.id));
      }
    }
  }

  return blockers.filter((entry, index, all) => all.findIndex((candidate) => (
    candidate.code === entry.code && candidate.entityId === entry.entityId && candidate.message === entry.message
  )) === index);
}
