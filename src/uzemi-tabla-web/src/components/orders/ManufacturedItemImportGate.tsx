import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { canApplyManufacturedItemImport } from "@/lib/roles";
import { useApplyManufacturedItemCandidates } from "@/services/production/hooks";
import type { ImportCandidate, ImportRunEvidence } from "@/services/production/types";
import { useUiStore } from "@/store/uiStore";

interface Props {
  importRunId: string;
  sourceFingerprint: string;
  candidates: ImportCandidate[];
  targetRevisions: ImportRunEvidence["targetRevisions"];
}

function candidateLabel(candidate: ImportCandidate) {
  const code = typeof candidate.normalizedPayload.code === "string" ? candidate.normalizedPayload.code : null;
  const name = typeof candidate.normalizedPayload.name === "string" ? candidate.normalizedPayload.name : null;
  return [code, name].filter(Boolean).join(" · ") || candidate.workNumber || candidate.id;
}

/** Explicit human gate for importing only selected READY records. There is no
 * select-all control and the server revalidates the stored payload. */
export function ManufacturedItemImportGate({ importRunId, sourceFingerprint, candidates, targetRevisions }: Props) {
  const role = useUiStore((state) => state.role);
  const canApply = canApplyManufacturedItemImport(role);
  const mutation = useApplyManufacturedItemCandidates(importRunId);
  const readyCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.status === "READY" && candidate.recordType === "ManufacturedItemImportPreview"),
    [candidates],
  );
  const draftRevisions = useMemo(
    () => targetRevisions.filter((revision) => revision.status === "DRAFT"),
    [targetRevisions],
  );
  const [revisionId, setRevisionId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!draftRevisions.some((revision) => revision.id === revisionId)) {
      setRevisionId(draftRevisions[0]?.id ?? "");
    }
  }, [draftRevisions, revisionId]);

  function toggleCandidate(candidateId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!revisionId || selectedIds.size === 0 || confirmation !== "BETÖLTÖM") return;
    await mutation.mutateAsync({
      orderRevisionId: revisionId,
      sourceFingerprint,
      candidateIds: [...selectedIds],
    });
    setSelectedIds(new Set());
    setConfirmation("");
  }

  return <section className="import-apply-panel" aria-labelledby="import-apply-title">
    <header>
      <div><span>Emberi kapu</span><h2 id="import-apply-title">Gyártási tételek betöltése</h2><p>Csak a külön kijelölt READY falpanel- és bútorfront-jelöltek kerülnek a kapcsolt teszt-DRAFT-ba.</p></div>
      <b>doorstar_test</b>
    </header>
    {!canApply ? <p className="import-apply-message">A bizonyíték olvasható, de betöltést csak műszaki előkészítő vagy jóváhagyó végezhet.</p>
      : draftRevisions.length === 0 ? <p className="import-apply-message import-apply-warning">Nincs ehhez az importfutáshoz kapcsolt, szerkeszthető DRAFT revízió.</p>
      : readyCandidates.length === 0 ? <p className="import-apply-message">Nincs további betölthető gyártási tétel. Az alkalmazott tételek lent, a bizonyítéklistában láthatók.</p>
      : <form onSubmit={submit}>
        <label className="import-apply-target">Cél DRAFT
          <select value={revisionId} onChange={(event) => setRevisionId(event.target.value)}>
            {draftRevisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.order.project.key} · R{String(revision.revision).padStart(2, "0")} · {revision.intakeStage}</option>)}
          </select>
        </label>
        <fieldset disabled={mutation.isPending}>
          <legend>Betöltendő tételek — egyenként jelöld ki</legend>
          {readyCandidates.map((candidate) => <label key={candidate.id}>
            <input type="checkbox" checked={selectedIds.has(candidate.id)} onChange={() => toggleCandidate(candidate.id)} />
            <span><strong>{candidateLabel(candidate)}</strong><small>{candidate.workNumber ?? "munkaszám nélkül"} · {candidate.relativePath}</small></span>
          </label>)}
        </fieldset>
        <div className="import-apply-confirmation">
          <label>Megerősítés
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Írd be: BETÖLTÖM" autoComplete="off" />
          </label>
          <button type="submit" disabled={mutation.isPending || selectedIds.size === 0 || confirmation !== "BETÖLTÖM"}>{mutation.isPending ? "Betöltés…" : `${selectedIds.size} tétel betöltése`}</button>
        </div>
        <p className="import-apply-safety">A művelet nem hagyja el a tesztsémát, nem hagy jóvá tételt és nem hoz létre gyártási feladatot.</p>
        {mutation.isError && <p className="import-apply-result import-apply-error">A betöltés nem hajtható végre. A forrás, a DRAFT vagy valamelyik jelölt állapota megváltozhatott.</p>}
      </form>}
    {mutation.data && <p className="import-apply-result import-apply-success">Betöltve: {mutation.data.createdCount} új tétel, {mutation.data.existingCount} már korábban alkalmazott. <Link to={`/orders/${encodeURIComponent(mutation.data.projectKey)}`}>Rendelés megnyitása →</Link></p>}
  </section>;
}
