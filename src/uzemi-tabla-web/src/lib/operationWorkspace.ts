import type {
  ComponentCalculatorProfiles,
  ComponentRequirement,
  ComponentSnapshot,
  ProductionOrderRevision,
} from "@/services/production/types";

export type OperationWorkspaceLoadState = "PENDING" | "READY" | "ERROR";

export interface OperationWorkspaceGateInput {
  revision: ProductionOrderRevision;
  latestRevisionId: string;
  profiles: ComponentCalculatorProfiles | null;
  snapshots: ComponentSnapshot[];
  dependenciesState: OperationWorkspaceLoadState;
}

export interface OperationWorkspaceReadiness {
  approvalHash: string | null;
  currentVerifiedSnapshots: ComponentSnapshot[];
  sourceBlockers: string[];
  sourceReady: boolean;
}

export interface OperationFieldDefinition {
  key: string;
  label: string;
  description: string;
  group: "ROUTE" | "RESOURCE" | "TIME" | "CONTROL";
}

export const operationProcessKindDefinitions = [
  { key: "TECHNOLOGICAL", label: "Megmunkálás" },
  { key: "NON_TECHNOLOGICAL", label: "Mozgatás / ellenőrzés" },
  { key: "NATURAL", label: "Kötés / száradás" },
] as const;

/** Display-only preview of the backend contract still required by DSORD-06.
 * These labels never create defaults, standards, durations or operations. */
export const operationFieldDefinitions: OperationFieldDefinition[] = [
  { key: "sequence", label: "Sorrend és kapcsolatok", description: "Alkatrészhez kötött többes előzmények, be- és kimenetek, valamint összevezetési pontok.", group: "ROUTE" },
  { key: "processKind", label: "Folyamat jellege", description: "Megmunkálás; nem technológiai mozgatás, tárolás vagy ellenőrzés; illetve természeti kötés vagy száradás.", group: "ROUTE" },
  { key: "operationStandard", label: "Művelet és standard", description: "Verziózott megnevezés, standardkulcs és ellenőrzött alkalmazási feltételek.", group: "ROUTE" },
  { key: "inputOutput", label: "Be- és kimenő elemek", description: "Forrásalkatrészek, csatlakozó elemek és létrejövő részegység.", group: "ROUTE" },
  { key: "quantity", label: "Mennyiség és egység", description: "A forráshoz kötött explicit műveleti mennyiség és mértékegység.", group: "ROUTE" },
  { key: "resource", label: "Részleg, gép és szerszám", description: "Ellenőrzött erőforrás-mapping, gép, eszköz és szerszámverzió.", group: "RESOURCE" },
  { key: "setupTime", label: "Beállítási idő / tétel", description: "Egyszeri előkészületi és befejezési idő, nem szorozható fel darabszámmal.", group: "TIME" },
  { key: "cycleTime", label: "Darabidő", description: "Mértékegységhez kötött egységidő, amelyet a mennyiséggel külön kell számolni.", group: "TIME" },
  { key: "nonTechnologicalTime", label: "Mozgatási / ellenőrzési idő", description: "A nem technológiai lépés saját munkaideje, elkülönítve a megmunkálástól.", group: "TIME" },
  { key: "naturalProcessTime", label: "Természeti folyamat ideje", description: "Kötés, száradás vagy más tervezett fizikai-kémiai átalakulás időtartama.", group: "TIME" },
  { key: "timeStandardSource", label: "Időnorma forrása", description: "Verzió, mértékegység és visszakövethető dokumentum- vagy standardhivatkozás.", group: "TIME" },
  { key: "documentReferences", label: "Műszaki dokumentumok", description: "Verziózott rajz-, specifikáció- és technológiai hivatkozások pontos oldallal vagy jelöléssel.", group: "CONTROL" },
  { key: "workInstruction", label: "Munkautasítás", description: "Külön verziózott utasítás: előfeltétel, beállítás, biztonság, végrehajtás, közbeni ellenőrzés és kimenő kezelés.", group: "CONTROL" },
  { key: "qualityCheckpoints", label: "Minőség-ellenőrzési terv", description: "Előírt kritérium, módszer, mérőeszköz és bizonyítékkövetelmény; a tényleges eredmény csak végrehajtáskor jön létre.", group: "CONTROL" },
];

function latestApprovalHash(revision: ProductionOrderRevision) {
  return [...revision.audit]
    .filter((entry) => entry.action === "APPROVED" && entry.contentHash)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
    ?.contentHash ?? null;
}

/** Whether the server supplied every current fingerprint needed to compare a
 * component snapshot with its active calculator and technical-catalog
 * authority. A version label alone is intentionally insufficient. */
export function hasExactComponentSnapshotAuthority(
  profiles: ComponentCalculatorProfiles | null,
) {
  const activeProfiles = profiles?.profiles.filter((profile) => profile.active) ?? [];
  return activeProfiles.length > 0
    && activeProfiles.every((profile) => !!profile.fingerprint)
    && !!profiles?.technicalCatalogVersion
    && !!profiles.technicalCatalogFingerprint;
}

/** Shared exact-snapshot predicate for the project cockpit and Operation
 * Workspace. Keeping it in one place prevents the two authority gates from
 * disagreeing about whether a verified component input is still current. */
export function matchesExactCurrentComponentSnapshot(
  snapshot: ComponentSnapshot,
  revision: ProductionOrderRevision,
  profiles: ComponentCalculatorProfiles | null,
) {
  if (!hasExactComponentSnapshotAuthority(profiles)) return false;
  const activeProfile = profiles?.profiles.find((profile) => (
    profile.active && profile.version === snapshot.calculatorProfileVersion
  ));
  const approvalHash = latestApprovalHash(revision);
  return !!activeProfile?.fingerprint
    && !!approvalHash
    && snapshot.orderRevisionId === revision.id
    && snapshot.orderContentHash === approvalHash
    && snapshot.snapshotSchemaVersion === profiles?.snapshotSchemaVersion
    && snapshot.calculatorProfileFingerprint === activeProfile.fingerprint
    && snapshot.technicalCatalogVersion === profiles?.technicalCatalogVersion
    && snapshot.technicalCatalogFingerprint === profiles.technicalCatalogFingerprint;
}

/** Finds only immutable component inputs that still match the exact order
 * approval, active calculator profile and current snapshot schema. */
export function buildOperationWorkspaceReadiness(
  input: OperationWorkspaceGateInput,
): OperationWorkspaceReadiness {
  const sourceBlockers: string[] = [];
  const approvalHash = latestApprovalHash(input.revision);
  const activeProfiles = input.profiles?.profiles.filter((profile) => profile.active) ?? [];
  const fingerprintAuthorityReady = hasExactComponentSnapshotAuthority(input.profiles);
  const currentVerifiedSnapshots = input.snapshots
    .filter((snapshot) => (
      snapshot.state === "VERIFIED"
      && matchesExactCurrentComponentSnapshot(snapshot, input.revision, input.profiles)
    ))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  if (input.dependenciesState === "PENDING") {
    sourceBlockers.push("A kalkulátorprofil és az alkatrészsnapshot még betöltés alatt áll.");
  }
  if (input.dependenciesState === "ERROR") {
    sourceBlockers.push("A kalkulátorprofil vagy az alkatrészsnapshot nem érhető el; a kapu fail-closed marad.");
  }
  if (input.revision.id !== input.latestRevisionId) {
    sourceBlockers.push("Csak a legfrissebb rendelési revízióból készülhet műveleti terv.");
  }
  if (input.revision.status !== "APPROVED") {
    sourceBlockers.push("A rendelési revízió még nincs jóváhagyva.");
  }
  if (!approvalHash || !/^[a-f0-9]{64}$/i.test(approvalHash)) {
    sourceBlockers.push("A jóváhagyási tartalom-hash nem érhető el.");
  }
  if (input.dependenciesState === "READY" && activeProfiles.length === 0) {
    sourceBlockers.push("Nincs aktív, szerverről betöltött kalkulátorprofil.");
  }
  if (input.dependenciesState === "READY" && activeProfiles.length > 0 && !fingerprintAuthorityReady) {
    sourceBlockers.push("A szerver nem adta át az aktív kalkulátorprofil és a műszaki katalógus aktuális verziólenyomatát; a kapu zárva marad.");
  }
  if (input.dependenciesState === "READY" && currentVerifiedSnapshots.length === 0) {
    sourceBlockers.push("Nincs az aktuális rendelési hashhez, sémához, profilhoz és verziólenyomathoz tartozó VERIFIED alkatrészsnapshot.");
  }

  return {
    approvalHash,
    currentVerifiedSnapshots,
    sourceBlockers,
    sourceReady: sourceBlockers.length === 0,
  };
}

export interface ComponentRequirementGroup {
  key: string;
  label: string;
  requirements: ComponentRequirement[];
}

const requirementGroupLabel: Record<ComponentRequirement["requirementKind"], string> = {
  CUT_PART: "Gyártandó alkatrészek",
  PURCHASED_PART: "Vásárolt alkatrészek",
};

/** Stable grouping for the source browser. It does not infer a door-part
 * hierarchy from names, materials or the woodworking corpus. */
export function groupComponentRequirements(
  requirements: ComponentRequirement[],
): ComponentRequirementGroup[] {
  const groups = new Map<ComponentRequirement["requirementKind"], ComponentRequirement[]>();
  requirements.forEach((requirement) => {
    const current = groups.get(requirement.requirementKind) ?? [];
    current.push(requirement);
    groups.set(requirement.requirementKind, current);
  });
  return (["CUT_PART", "PURCHASED_PART"] as const)
    .filter((key) => groups.has(key))
    .map((key) => ({
      key,
      label: requirementGroupLabel[key],
      requirements: groups.get(key) ?? [],
    }));
}
