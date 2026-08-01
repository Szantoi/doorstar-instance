import { ApiError } from "@/services/apiClient";

type ComponentSnapshotErrorContext = "create" | "review";

const errorLabels: Record<string, string> = {
  invalid_request: "A snapshot-kérés mezői nem felelnek meg a szerződésnek.",
  component_catalog_value_invalid: "Egy anyag- vagy felületkulcs már nem érvényes az aktuális katalógusban.",
  role_not_permitted: "A kiválasztott szerepkör nem végezheti el ezt a snapshot-műveletet.",
  order_revision_not_found: "A rendelési revízió már nem érhető el.",
  component_snapshot_not_found: "A kiválasztott snapshot már nem érhető el.",
  component_snapshot_review_final: "A snapshot döntése időközben véglegessé vált.",
  component_snapshot_requires_latest_revision: "Időközben újabb rendelési revízió készült.",
  component_snapshot_requires_approved_revision: "A rendelési revízió már nem jóváhagyott.",
  approved_order_audit_required: "A jóváhagyási audit nem érhető el.",
  content_hash_schema_version_unsupported: "A jóváhagyási hash sémaverziója nem támogatott.",
  approved_order_content_changed: "A jóváhagyott rendelési tartalom időközben megváltozott.",
  approved_order_hash_mismatch: "A rendelési hash már nem egyezik a jóváhagyással.",
  component_snapshot_content_changed: "A snapshot tartalma vagy lineage-e már nem egyezik az ellenőrzött állapottal.",
  component_calculator_profile_not_active: "A kiválasztott kalkulátorprofil már nem aktív.",
  component_source_not_from_revision: "Egy forrásrekord nem ehhez a rendelési revízióhoz tartozik.",
  component_source_not_verified: "Egy külön gyártott tétel vagy tartozék már nem ellenőrzött.",
  component_source_evidence_unresolved: "A revízió forrástételeinek evidence-auditja még hiányos.",
  component_snapshot_profile_conflict: "Ehhez a profilverzióhoz már más tartalmú, megváltoztathatatlan snapshot tartozik.",
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Details is deliberately optional and shape-tolerant: the same stable 409
 * code may carry either one source row's evidence summary or an aggregate
 * revision summary. Unknown future fields never replace the safe base text. */
function sourceEvidenceSummary(details: unknown) {
  const value = record(details);
  if (!value) return "";

  const manufactured = record(value.manufacturedItems);
  const supplementary = record(value.supplementaryItems);
  if (manufactured || supplementary) {
    const manufacturedUnresolved = nonNegativeInteger(manufactured?.unresolved);
    const supplementaryUnresolved = nonNegativeInteger(supplementary?.unresolved);
    const parts = [
      manufacturedUnresolved != null && manufacturedUnresolved > 0
        ? `${manufacturedUnresolved} külön gyártott tétel`
        : null,
      supplementaryUnresolved != null && supplementaryUnresolved > 0
        ? `${supplementaryUnresolved} tartozék`
        : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? ` Lezáratlan forrástételek: ${parts.join(", ")}.` : "";
  }

  const unresolvedEvidence = nonNegativeInteger(value.unresolvedEvidence);
  if (unresolvedEvidence != null && unresolvedEvidence > 0) {
    const rejectedEvidence = nonNegativeInteger(value.rejectedEvidence);
    const sourceLabel = value.sourceKind === "MANUFACTURED_ITEM"
      ? "külön gyártott forrásnál"
      : value.sourceKind === "SUPPLEMENTARY_ITEM"
        ? "tartozékforrásnál"
        : "forrásnál";
    return ` Az érintett ${sourceLabel} ${unresolvedEvidence} evidence-sor nincs teljesen feloldva.${rejectedEvidence != null && rejectedEvidence > 0 ? ` Ebből ${rejectedEvidence} elutasított.` : ""}`;
  }
  return "";
}

export function componentSnapshotErrorMessage(error: unknown, context: ComponentSnapshotErrorContext) {
  const fallback = context === "create"
    ? "A snapshot nem materializálható. A helyi sorok megmaradtak."
    : "A döntés nem menthető. Frissítsd a snapshot állapotát, majd próbáld újra.";
  if (!(error instanceof ApiError)) return fallback;

  const payload = record(error.details);
  const code = typeof payload?.error === "string" ? payload.error : "";
  const base = errorLabels[code] ?? (
    context === "create"
      ? "A backend elutasította a snapshotot. Frissítsd az adatkaput, majd ellenőrizd újra a sorokat."
      : fallback
  );
  return code === "component_source_evidence_unresolved"
    ? `${base}${sourceEvidenceSummary(payload?.details)}`
    : base;
}
