export interface DoorSideAppearanceObservation {
  sourceValue: string | null;
  finishSystem: string | null;
  fixedRoleSurfaceCandidate: string | null;
  adjustableRoleSurfaceCandidate: string | null;
  interpretation: "EMPTY" | "EXPLICIT_ROLE_LABELS" | "PARTIAL_ROLE_LABELS" | "COLLAPSED_LEGACY";
  roleCandidatesDiffer: boolean | null;
}

function explicitPart(source: string, label: RegExp) {
  return source.match(label)?.[1]?.trim() || null;
}

const fixedRoleLabel = /(?:^|;)\s*fix(?:\s+(?:oldal|borítás))?\s*:\s*([^;]+)/i;
const adjustableRoleLabel = /(?:^|;)\s*(?:mozg[oó]|mobil|[aá]ll[ií]that[oó])(?:\s+(?:oldal|borítás))?\s*:\s*([^;]+)/i;
const anyRoleLabel = /(?:^|;)\s*(?:fix|mozg[oó]|mobil|[aá]ll[ií]that[oó])(?:\s+(?:oldal|borítás))?\s*:/i;

/** Conservatively reads the labelled legacy summary produced by the current
 * import. A `fix:` or `mozgó:` fragment is only a source-side-role label: it
 * does not prove casing presence and is not mapped to SIDE_A or SIDE_B.
 * Unlabelled source text stays collapsed. */
export function observeDoorSideAppearance(surface: string | null): DoorSideAppearanceObservation {
  const source = surface?.trim() || null;
  if (!source) {
    return {
      sourceValue: null,
      finishSystem: null,
      fixedRoleSurfaceCandidate: null,
      adjustableRoleSurfaceCandidate: null,
      interpretation: "EMPTY",
      roleCandidatesDiffer: null,
    };
  }

  const fixedRoleSurfaceCandidate = explicitPart(source, fixedRoleLabel);
  const adjustableRoleSurfaceCandidate = explicitPart(source, adjustableRoleLabel);
  const firstLabelIndex = source.search(anyRoleLabel);
  const finishSystem = firstLabelIndex > 0
    ? source.slice(0, firstLabelIndex).replace(/;\s*$/, "").trim() || null
    : null;

  if (fixedRoleSurfaceCandidate || adjustableRoleSurfaceCandidate) {
    return {
      sourceValue: source,
      finishSystem,
      fixedRoleSurfaceCandidate,
      adjustableRoleSurfaceCandidate,
      interpretation: fixedRoleSurfaceCandidate && adjustableRoleSurfaceCandidate
        ? "EXPLICIT_ROLE_LABELS"
        : "PARTIAL_ROLE_LABELS",
      roleCandidatesDiffer: fixedRoleSurfaceCandidate && adjustableRoleSurfaceCandidate
        ? fixedRoleSurfaceCandidate.localeCompare(adjustableRoleSurfaceCandidate, "hu", { sensitivity: "base" }) !== 0
        : null,
    };
  }

  return {
    sourceValue: source,
    finishSystem,
    fixedRoleSurfaceCandidate: null,
    adjustableRoleSurfaceCandidate: null,
    interpretation: "COLLAPSED_LEGACY",
    roleCandidatesDiffer: null,
  };
}
