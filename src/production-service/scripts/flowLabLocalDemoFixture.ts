import { createHash } from "node:crypto";
import {
  computeFlowLabMaterializationKey,
  computeFlowLabPlanContentHash,
  parseFlowLabPlanArtifact,
  type FlowLabPlanArtifact,
  type ValidatedFlowLabPlanArtifact,
} from "../src/services/flowLabArtifact.js";

export const flowLabLocalDemoConfirmationFlag = "--confirm-flow-lab-local-demo-seed";
export const flowLabLocalDemoSourceSetKey = "UX-DEMO-FLOW-LAB-001";

const uxReferenceConfirmationFlag = "--confirm-ux-reference-seed";
const planHash = "d".repeat(64);

const absentMembers = [
  { name: "operations[].boardProjection.setupMinutes", reason: "The board has no non-quantity-scaled setup field; this synthetic demo keeps setup only in the full plan." },
  { name: "operations[].boardProjection.passiveWaitMinutes", reason: "The board has no passive-wait field; this synthetic demo keeps it only in the full plan." },
  { name: "operations[].boardProjection.requiredWorkers", reason: "The board has no staffing-demand field; this synthetic demo never infers named people." },
  { name: "relativeSchedule[].absoluteDate", reason: "This synthetic demo carries only relative working-minute offsets." },
  { name: "operations[].assignedPeople", reason: "This synthetic demo supplies stations, never named-person assignments." },
] as const;

const families = [
  { key: "PREPARATION", description: "Szintetikus műszaki előkészítés", station: "Műszaki tervezés", duration: 20 },
  { key: "DOOR_LEAF", description: "Szintetikus ajtólap CNC művelet", station: "CNC", duration: 30 },
  { key: "JAMB_CORE", description: "Szintetikus tokmag összeállítás", station: "Asztalos", duration: 25 },
  { key: "CASING", description: "Szintetikus takaróléc fóliázás", station: "Fóliázó", duration: 15 },
] as const;

function compareOrdinal(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * This is intentionally a small, synthetic UX-only artifact. It is neither a
 * Flow Lab golden fixture nor a production plan, and it never uses 26133 or a
 * real Doorstar project binding.
 */
export function createFlowLabLocalDemoArtifact(): ValidatedFlowLabPlanArtifact {
  const pins = {
    catalogRevision: "synthetic-local-demo/v1",
    catalogHash: "c".repeat(64),
    planHash,
    engineIdentity: "doorstar.flow-lab.synthetic-local-demo/v1",
  };
  const operations: FlowLabPlanArtifact["operations"] = [];
  const relativeSchedule: FlowLabPlanArtifact["relativeSchedule"] = [];
  const dependencies: FlowLabPlanArtifact["dependencies"] = [];
  let elapsedMinute = 0;

  for (const [index, family] of families.entries()) {
    const workKey = `${flowLabLocalDemoSourceSetKey}/${family.key}/WORK`;
    const gateKey = `${flowLabLocalDemoSourceSetKey}/${family.key}/GATE`;
    const workStart = elapsedMinute;
    const workFinish = workStart + family.duration;
    operations.push({
      correlationKey: workKey,
      familyKey: family.key,
      operationKey: "WORK",
      description: family.description,
      operationType: "ActiveWork",
      station: family.station,
      department: null,
      quantity: { value: 1, unit: "db", resolved: true },
      time: {
        setupMinutes: 5,
        cycleMinutesPerUnit: family.duration - 5,
        passiveWaitMinutes: 0,
        activeMinutes: family.duration,
        elapsedMinutes: family.duration,
        requiredWorkers: 1,
        workloadPersonMinutes: family.duration,
      },
      boardProjection: { quantity: 1, unitHours: (family.duration - 5) / 60 },
    });
    operations.push({
      correlationKey: gateKey,
      familyKey: family.key,
      operationKey: "GATE",
      description: `${family.description} — összegző kapu`,
      operationType: "Summary",
      station: null,
      department: null,
      quantity: { value: 1, unit: "db", resolved: true },
      time: {
        setupMinutes: 0,
        cycleMinutesPerUnit: 0,
        passiveWaitMinutes: 0,
        activeMinutes: 0,
        elapsedMinutes: 0,
        requiredWorkers: 0,
        workloadPersonMinutes: 0,
      },
      boardProjection: { quantity: 0, unitHours: 0 },
    });
    relativeSchedule.push(
      { correlationKey: workKey, startElapsedMinute: workStart, finishElapsedMinute: workFinish },
      { correlationKey: gateKey, startElapsedMinute: workFinish, finishElapsedMinute: workFinish },
    );
    dependencies.push({ successor: gateKey, predecessor: workKey, type: "FS", lagMinutes: 0, partialRelease: null });
    if (index > 0) {
      const previousGate = `${flowLabLocalDemoSourceSetKey}/${families[index - 1]!.key}/GATE`;
      dependencies.push({ successor: workKey, predecessor: previousGate, type: "FS", lagMinutes: 0, partialRelease: null });
    }
    elapsedMinute = workFinish;
  }

  operations.sort((left, right) => compareOrdinal(left.correlationKey, right.correlationKey));
  dependencies.sort((left, right) => compareOrdinal(left.successor, right.successor)
    || compareOrdinal(left.predecessor, right.predecessor)
    || compareOrdinal(left.type, right.type));
  relativeSchedule.sort((left, right) => left.startElapsedMinute - right.startElapsedMinute
    || left.finishElapsedMinute - right.finishElapsedMinute
    || compareOrdinal(left.correlationKey, right.correlationKey));

  const base = {
    schemaVersion: "doorstar.flow-lab.plan-materialization/v1" as const,
    sourceSetKey: flowLabLocalDemoSourceSetKey,
    pins,
    operations,
    dependencies,
    relativeSchedule,
    unresolved: [],
    absentMembers: [...absentMembers],
    findings: [{ code: "SYNTHETIC_LOCAL_DEMO", severity: "Information" as const, count: 1 }],
    productionAuthority: false as const,
  } satisfies Omit<FlowLabPlanArtifact, "materializationKey" | "contentHash">;
  const materializationKey = computeFlowLabMaterializationKey(base);
  const withoutContent = { ...base, materializationKey };
  const artifact: FlowLabPlanArtifact = {
    schemaVersion: withoutContent.schemaVersion,
    sourceSetKey: withoutContent.sourceSetKey,
    materializationKey: withoutContent.materializationKey,
    contentHash: computeFlowLabPlanContentHash(withoutContent),
    pins: withoutContent.pins,
    operations: withoutContent.operations,
    dependencies: withoutContent.dependencies,
    relativeSchedule: withoutContent.relativeSchedule,
    unresolved: withoutContent.unresolved,
    absentMembers: withoutContent.absentMembers,
    findings: withoutContent.findings,
    productionAuthority: withoutContent.productionAuthority,
  };
  const fileName = `doorstar-flow-lab-plan-materialization.${artifact.sourceSetKey}.${artifact.pins.planHash}.v1.json`;
  const rawBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  const fileSha256 = createHash("sha256").update(rawBytes).digest("hex");
  return parseFlowLabPlanArtifact({
    fileName,
    rawBytes,
    sidecarBytes: Buffer.from(`${fileSha256}  ${fileName}\n`, "ascii"),
  });
}

/** Refuses hidden positional switches before any DB module can load. */
export function requireFlowLabLocalDemoSeedConfirmation(arguments_: readonly string[]) {
  const expected = new Set([uxReferenceConfirmationFlag, flowLabLocalDemoConfirmationFlag]);
  if (arguments_.length !== expected.size || new Set(arguments_).size !== expected.size || arguments_.some((argument) => !expected.has(argument))) {
    throw new Error(`Explicit confirmations required: ${uxReferenceConfirmationFlag} ${flowLabLocalDemoConfirmationFlag}`);
  }
}
