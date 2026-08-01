import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { useUiStore } from "@/store/uiStore";
import { useConfirmStore } from "@/store/confirmStore";
import { useToastStore } from "@/store/toastStore";
import { printOnly } from "@/lib/printOnly";
import { canManageProjectWorkspace } from "@/lib/projectWorkspace";
import {
  useApplyEpikTemplate,
  useDeleteEpic,
  useEpikTemplates,
  useProject,
  useSaveEpics,
  useSaveEpikTemplate,
  useScheduleProject,
  useIssueProjectStep,
  useRevokeProjectStep,
  useKanban,
  useStations,
  useTemplates,
} from "@/services/production/hooks";
import type { Epic, EpicStep, SheetTemplate, Task } from "@/services/production/types";
import { ProjectSubSheets } from "./ProjectSubSheets";
import { TaskDetailModal } from "./TaskDetailModal";

let localIdSeq = 0;
function localId() {
  localIdSeq += 1;
  return `local-${localIdSeq}`;
}

function emptyStep(): EpicStep {
  return { id: localId(), name: "", station: null, quantity: null, unitHours: null, planDate: null, planLocked: false, disabled: false };
}

function uniqueEpicById(epics: Epic[], epicId: string) {
  const matches = epics.filter((epic) => epic.id === epicId);
  return matches.length === 1 ? matches[0] : null;
}

function uniqueStepById(epics: Epic[], stepId: string) {
  const matches = epics.flatMap((epic) => epic.steps).filter((step) => step.id === stepId);
  return matches.length === 1 ? matches[0] : null;
}

function confirmationFingerprint(target: Epic | EpicStep) {
  return JSON.stringify(target);
}

function yieldToQueuedUpdates() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function isEpicResponse(value: unknown): value is Epic {
  if (!value || typeof value !== "object") return false;
  const epic = value as Partial<Epic>;
  return typeof epic.id === "string"
    && typeof epic.name === "string"
    && (epic.quantityLabel === null || typeof epic.quantityLabel === "string")
    && typeof epic.disabled === "boolean"
    && Array.isArray(epic.steps)
    && epic.steps.every((step) => typeof step.id === "string" && typeof step.name === "string");
}

export function ProjectWorkSessionPage() {
  const { key = "" } = useParams();
  const navigate = useNavigate();
  const { role } = useUiStore();
  const showToast = useToastStore((s) => s.show);
  const canManage = canManageProjectWorkspace(role);

  const projectQuery = useProject(key);
  const project = projectQuery.data;
  const { data: templates = [] } = useTemplates();
  const { data: stationsData } = useStations();
  const stations = stationsData?.stations.map((s) => s.key) ?? [];

  const { data: epikTemplates = [] } = useEpikTemplates();
  const saveEpics = useSaveEpics(key);
  const scheduleProject = useScheduleProject(key);
  const issueProjectStep = useIssueProjectStep(key);
  const revokeProjectStep = useRevokeProjectStep(key);
  const applyEpikTemplate = useApplyEpikTemplate(key);
  const saveEpikTemplate = useSaveEpikTemplate();
  const deleteEpic = useDeleteEpic(key);

  const [epics, setEpics] = useState<Epic[]>([]);
  const [templateSel, setTemplateSel] = useState("");
  const [epikTemplateSel, setEpikTemplateSel] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [reconciliationBlocked, setReconciliationBlocked] = useState(false);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const initializedProjectKey = useRef<string | null>(null);
  const editingEnabledRef = useRef(false);
  const epicsRef = useRef<Epic[]>([]);
  const dirtyRef = useRef(false);
  const templatesRef = useRef<SheetTemplate[]>([]);
  const { data: taskKanban } = useKanban(openTask?.station ?? "");
  const { allowNextNavigation } = useUnsavedChangesGuard(dirty);
  // The current backend has no immutable IssuedWorkPackage authority yet.
  // Keep legacy issue commands visible but fail closed until that contract exists.
  const releaseAuthorityAvailable = false;
  // A full worksheet PUT can race with external Task/epic/step changes. Keep
  // every legacy worksheet write closed until the backend exposes an immutable
  // worksheet revision with If-Match (or an equivalent compare-and-swap token).
  const worksheetWriteAuthorityAvailable = false;

  const mutationPending = saveEpics.isPending
    || scheduleProject.isPending
    || issueProjectStep.isPending
    || revokeProjectStep.isPending
    || applyEpikTemplate.isPending
    || saveEpikTemplate.isPending
    || deleteEpic.isPending;
  const editingLocked = projectQuery.isFetching || projectQuery.isError || mutationPending || saveState === "saving" || reconciliationBlocked;
  const editingEnabled = worksheetWriteAuthorityAvailable && canManage && !editingLocked;
  editingEnabledRef.current = editingEnabled;
  epicsRef.current = epics;
  dirtyRef.current = dirty;
  templatesRef.current = templates;

  useEffect(() => {
    if (!project) return;
    const projectChanged = initializedProjectKey.current !== project.key;
    if (!projectChanged && reconciliationBlocked) {
      const localEpics = epicsRef.current;
      const localIds = new Set(localEpics.map((epic) => epic.id));
      const serverOnlyEpics = project.epics.filter((epic) => !localIds.has(epic.id));
      if (serverOnlyEpics.length > 0) {
        setEpics([...localEpics, ...serverOnlyEpics]);
        setReconciliationBlocked(false);
        setSaveState(dirtyRef.current ? "idle" : "saved");
        setStatusMessage(dirtyRef.current
          ? "A szerveren létrejött epik egyeztetve; a helyi módosításokkal együtt mentésre vár."
          : "A szerveren létrejött epik egyeztetve.");
      }
      return;
    }
    // Same-project cache refreshes must never replace an unsaved local draft.
    if (projectChanged || !dirty) {
      setEpics(project.epics);
      initializedProjectKey.current = project.key;
      if (projectChanged) {
        setDirty(false);
        setSaveState("idle");
        setStatusMessage(null);
        setReconciliationBlocked(false);
      }
    }
  }, [project, reconciliationBlocked]);

  if (projectQuery.isLoading && !project) {
    return <main className="project-detail-page"><div role="status" style={{ padding: "24px" }}>Az örökölt munkalap betöltése…</div></main>;
  }
  if (projectQuery.isError && !project) {
    return <main className="project-detail-page"><div role="alert" style={{ padding: "24px" }}>Az örökölt munkalap nem érhető el. Próbáld újra később.</div></main>;
  }
  if (!project) {
    return <main className="project-detail-page"><div role="alert" style={{ padding: "24px" }}>A projekt munkalapja nem található.</div></main>;
  }

  function updateEpic(index: number, patch: Partial<Epic>) {
    if (!editingEnabledRef.current) return;
    setEpics((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
    setDirty(true);
    setSaveState("idle");
    setStatusMessage(null);
  }

  function updateStep(epicIndex: number, stepIndex: number, patch: Partial<EpicStep>) {
    if (!editingEnabledRef.current) return;
    setEpics((prev) =>
      prev.map((e, i) =>
        i === epicIndex ? { ...e, steps: e.steps.map((s, si) => (si === stepIndex ? { ...s, ...patch } : s)) } : e
      )
    );
    setDirty(true);
    setSaveState("idle");
    setStatusMessage(null);
  }

  function addEpic() {
    if (!editingEnabledRef.current) return;
    setEpics((prev) => [...prev, { id: localId(), name: "Új epik", quantityLabel: "", disabled: false, steps: [emptyStep()] }]);
    setDirty(true);
    setSaveState("idle");
    setStatusMessage(null);
  }

  async function removeEpic(epicId: string) {
    if (!editingEnabledRef.current) return;
    const epic = uniqueEpicById(epicsRef.current, epicId);
    if (!epic) return;
    const confirmedFingerprint = confirmationFingerprint(epic);
    const issuedCount = epic.steps.filter((s) => s.tasks?.length).length;
    const message = issuedCount
      ? `A(z) "${epic.name}" epik ${issuedCount} lépése már ki van adva a táblára. Törlöd az epiket a munkalapról? (a táblán lévő feladatok megmaradnak, de elárvulnak)`
      : `Biztosan törlöd a(z) "${epic.name}" epiket?`;
    if (!(await useConfirmStore.getState().ask(message)) || !editingEnabledRef.current) return;
    const currentEpic = uniqueEpicById(epicsRef.current, epicId);
    if (!currentEpic || confirmationFingerprint(currentEpic) !== confirmedFingerprint) {
      setSaveState("error");
      setStatusMessage("Az epik tartalma vagy feladatállapota a megerősítés közben megváltozott. A törlés nem indult el.");
      return;
    }
    const currentEpics = epicsRef.current;
    if (currentEpic.id.startsWith("local-")) {
      const nextEpics = currentEpics.filter((item) => item.id !== epicId);
      setEpics(nextEpics);
      setDirty(true);
      setSaveState("idle");
      setStatusMessage(null);
      return;
    }
    // Persist any other edits first. The API reconciles matching IDs in
    // place, so their issued task links stay intact when the cache refetches.
    let reconciledEpics = currentEpics;
    let editsWereSaved = false;
    try {
      if (dirtyRef.current) {
        reconciledEpics = await saveEpics.mutateAsync(currentEpics);
        setEpics(reconciledEpics);
        setDirty(false);
        editsWereSaved = true;
      }
      await deleteEpic.mutateAsync(epicId);
      setEpics(reconciledEpics.filter((item) => item.id !== epicId));
      setSaveState("saved");
      setStatusMessage("Az epik törlése mentve.");
    } catch {
      setEpics(reconciledEpics);
      setDirty(!editsWereSaved && dirtyRef.current);
      setSaveState("error");
      setStatusMessage(editsWereSaved
        ? "A munkalap módosításai mentve, de az epik törlése nem sikerült. Próbáld újra."
        : "Az epik törlése nem sikerült. A helyi módosítások megmaradtak; próbáld újra.");
    }
  }

  function addStep(epicIndex: number) {
    if (!editingEnabledRef.current) return;
    setEpics((prev) => prev.map((e, i) => (i === epicIndex ? { ...e, steps: [...e.steps, emptyStep()] } : e)));
    setDirty(true);
    setSaveState("idle");
    setStatusMessage(null);
  }

  function moveStep(epicIndex: number, stepIndex: number, direction: -1 | 1) {
    if (!editingEnabledRef.current) return;
    const targetIndex = stepIndex + direction;
    if (targetIndex < 0 || targetIndex >= epics[epicIndex].steps.length || epics[epicIndex].steps.some((step) => step.tasks?.length)) return;
    setEpics((previous) => previous.map((epic, index) => {
      if (index !== epicIndex) return epic;
      const steps = [...epic.steps];
      [steps[stepIndex], steps[targetIndex]] = [steps[targetIndex], steps[stepIndex]];
      return { ...epic, steps };
    }));
    setDirty(true);
    setSaveState("idle");
    setStatusMessage(null);
  }

  async function issueSingleStep(step: EpicStep) {
    if (!editingEnabledRef.current) return;
    if (!releaseAuthorityAvailable) {
      showToast("Az üzemi kiadás zárolt: előbb verziózott alkatrész-, műveleti és kiadási csomag szükséges.");
      return;
    }
    if (dirty) {
      await saveEpics.mutateAsync(epics);
      setDirty(false);
    }
    try {
      await issueProjectStep.mutateAsync(step.id);
    } catch {
      showToast("A lépés nem adható ki: kell tervezett nap és kiadott előző lépés.");
    }
  }

  async function revokeSingleStep(stepId: string) {
    if (!editingEnabledRef.current) return;
    const step = uniqueStepById(epicsRef.current, stepId);
    if (!step) return;
    const task = step.tasks?.[0];
    if (!task) return;
    const confirmedFingerprint = confirmationFingerprint(step);
    const message = task.acknowledged || task.stepIndex > 0
      ? `A(z) „${step.name}” feladatot már felvették vagy elkezdték. Biztosan visszavonod?`
      : `Visszavonod a(z) „${step.name}” feladatot a tábláról?`;
    if (!(await useConfirmStore.getState().ask(message)) || !editingEnabledRef.current) return;
    const currentStep = uniqueStepById(epicsRef.current, stepId);
    const currentTasks = currentStep?.tasks?.filter((item) => item.id === task.id) ?? [];
    if (!currentStep || currentTasks.length !== 1 || confirmationFingerprint(currentStep) !== confirmedFingerprint) {
      setSaveState("error");
      setStatusMessage("A kiadott lépés időközben megváltozott. A visszavonás nem indult el.");
      return;
    }
    try {
      await revokeProjectStep.mutateAsync(stepId);
    } catch {
      showToast("A lépés nem vonható vissza: kész vagy későbbi kiadott lépés függ tőle.");
    }
  }

  async function removeStep(epicId: string, stepId: string) {
    if (!editingEnabledRef.current) return;
    const epic = uniqueEpicById(epicsRef.current, epicId);
    const stepMatches = epic?.steps.filter((item) => item.id === stepId) ?? [];
    const step = stepMatches.length === 1 ? stepMatches[0] : null;
    if (!epic || !step) return;
    const confirmedFingerprint = confirmationFingerprint(step);
    const message = step.tasks?.length
      ? `A(z) "${step.name}" lépés már ki van adva a táblára. Törlöd a munkalapról? (a táblán lévő feladat megmarad, de elárvul)`
      : `Biztosan törlöd a(z) "${step.name || "lépés"}" sort?`;
    if (!(await useConfirmStore.getState().ask(message)) || !editingEnabledRef.current) return;
    const currentEpic = uniqueEpicById(epicsRef.current, epicId);
    const currentStepMatches = currentEpic?.steps.filter((item) => item.id === stepId) ?? [];
    if (!currentEpic || currentStepMatches.length !== 1 || confirmationFingerprint(currentStepMatches[0]) !== confirmedFingerprint) {
      setSaveState("error");
      setStatusMessage("A lépés tartalma vagy kiadási állapota a megerősítés közben megváltozott. A törlés nem indult el.");
      return;
    }
    setEpics((previous) => previous.map((item) => item.id === epicId
      ? { ...item, steps: item.steps.filter((candidate) => candidate.id !== stepId) }
      : item));
    setDirty(true);
    setSaveState("idle");
    setStatusMessage(null);
  }

  async function save() {
    if (!editingEnabledRef.current || !dirty) return;
    setSaveState("saving");
    setStatusMessage(null);
    try {
      const savedEpics = await saveEpics.mutateAsync(epics);
      setEpics(savedEpics);
      setDirty(false);
      setSaveState("saved");
      setStatusMessage("A munkalap mentve.");
    } catch {
      setDirty(true);
      setSaveState("error");
      setStatusMessage("A munkalap mentése nem sikerült. A helyi módosítások megmaradtak; ne frissítsd az oldalt, amíg újra nem próbáltad.");
    }
  }

  async function returnToProject() {
    if (dirty) {
      const accepted = await useConfirmStore.getState().ask("A munkalapon nem mentett módosítások vannak. Mentés nélkül visszalépsz a projekt áttekintéséhez?");
      if (!accepted) return;
      allowNextNavigation();
    }
    navigate(`/projects/${encodeURIComponent(key)}`);
  }

  async function issueSession() {
    if (!editingEnabledRef.current) return;
    if (!releaseAuthorityAvailable) {
      showToast("A munkamenet nem adható ki, amíg nincs szerver-authoritative kiadási csomag.");
      return;
    }
    const missingSteps = epics.flatMap((epic) =>
      epic.disabled
        ? []
        : epic.steps
            .filter((step) => !step.disabled && !step.tasks?.length && !step.planDate)
            .map((step) => `${epic.name} · ${step.name || "névtelen lépés"}`)
    );
    if (missingSteps.length) {
      showToast(`Nem adható ki: nincs tervezett napja (${missingSteps.slice(0, 2).join(", ")}${missingSteps.length > 2 ? "…" : ""}).`);
      return;
    }

    try {
      if (dirty) {
        await saveEpics.mutateAsync(epics);
        setDirty(false);
      }
      await scheduleProject.mutateAsync();
    } catch {
      showToast("A munkamenet kiadása nem sikerült. Ellenőrizd a lépések tervezett napját.");
    }
  }

  async function loadTemplate() {
    if (!editingEnabledRef.current) return;
    const template = templates.find((t) => t.name === templateSel);
    if (!template) return;
    const confirmedEpics = epicsRef.current;
    if (confirmedEpics.length > 0) {
      const confirmed = await useConfirmStore
        .getState()
        .ask(`A(z) "${template.name}" sablon betöltése lecseréli a jelenlegi ${confirmedEpics.length} epiket a munkalapon. Folytatod?`);
      if (!confirmed || !editingEnabledRef.current) return;
      if (epicsRef.current !== confirmedEpics) {
        setSaveState("error");
        setStatusMessage("A munkalap a megerősítés közben megváltozott. A sablon betöltése nem indult el.");
        return;
      }
      const currentTemplateMatches = templatesRef.current.filter((candidate) => candidate.name === template.name);
      if (currentTemplateMatches.length !== 1 || JSON.stringify(currentTemplateMatches[0]) !== JSON.stringify(template)) {
        setSaveState("error");
        setStatusMessage("A kiválasztott sablon a megerősítés közben megváltozott. A betöltés nem indult el.");
        return;
      }
    }
    setEpics(
      template.epics.map((e) => ({
        id: localId(),
        name: e.name,
        quantityLabel: e.quantityLabel ?? "",
        disabled: false,
        steps: e.steps.map((s) => ({ id: localId(), name: s.name, station: s.station ?? null, quantity: null, unitHours: null, planDate: null, planLocked: false, disabled: false })),
      }))
    );
    setDirty(true);
    setSaveState("idle");
    setStatusMessage(null);
  }

  async function applySelectedEpikTemplate() {
    if (!editingEnabledRef.current || !epikTemplateSel) return;
    const selectedTemplateName = epikTemplateSel;
    setStatusMessage(null);
    try {
      const createdEpic = await applyEpikTemplate.mutateAsync(selectedTemplateName);
      if (!isEpicResponse(createdEpic) || epicsRef.current.some((epic) => epic.id === createdEpic.id)) {
        setReconciliationBlocked(true);
        setSaveState("error");
        setStatusMessage("Az epik létrejött, de a szerverválasz nem egyeztethető biztonságosan a helyi munkalappal. Mentés nem indítható; frissítsd újra az adatokat.");
        return;
      }
      setEpics((current) => current.some((epic) => epic.id === createdEpic.id) ? current : [...current, createdEpic]);
      setSaveState(dirtyRef.current ? "idle" : "saved");
      setStatusMessage(dirtyRef.current
        ? "Az epik sablon hozzáadva; a korábbi helyi módosításokkal együtt mentésre vár."
        : "Az epik sablon hozzáadva.");
    } catch {
      setSaveState("error");
      setStatusMessage(dirtyRef.current
        ? "Az epik sablon hozzáadása nem sikerült. A helyi módosítások megmaradtak; próbáld újra."
        : "Az epik sablon hozzáadása nem sikerült. Próbáld újra.");
    }
  }

  async function saveEpicAsTemplate(epicId: string) {
    if (!editingEnabledRef.current) return;
    const epic = uniqueEpicById(epicsRef.current, epicId);
    if (!epic) return;
    const capturedFingerprint = confirmationFingerprint(epic);
    const name = window.prompt("Sablon neve:", epic.name);
    if (!name?.trim()) return;
    await yieldToQueuedUpdates();
    if (!editingEnabledRef.current) return;
    const currentEpic = uniqueEpicById(epicsRef.current, epicId);
    if (!currentEpic || confirmationFingerprint(currentEpic) !== capturedFingerprint) {
      setSaveState("error");
      setStatusMessage("Az epik a névadás közben megváltozott vagy már nem érhető el. A sablon mentése nem indult el.");
      return;
    }
    setStatusMessage(null);
    try {
      await saveEpikTemplate.mutateAsync({ name: name.trim(), epic: { ...currentEpic, name: name.trim() } });
      setSaveState("saved");
      setStatusMessage("Az epik sablon mentve.");
    } catch {
      setSaveState("error");
      setStatusMessage("Az epik sablon mentése nem sikerült. Próbáld újra.");
    }
  }

  return (
    <main className="project-detail-page project-work-session-page">
    <div className="project-detail-content">
      <header className="no-print project-work-session-hero">
        <button onClick={() => void returnToProject()}>
          ‹ Projekt áttekintése
        </button>
        <div>
          <span>Örökölt munkalap</span>
          <h1>{project.name}</h1>
          <p>{project.num ? `#${project.num} · ` : ""}Epikek, kézi lépések és mennyiségi segédlapok csak olvasható megtekintése.</p>
        </div>
        <div className="project-work-session-actions">
          {canManage && (
            <button className="order-button order-button-primary" onClick={() => void save()} disabled={!editingEnabled || !dirty}>
              {saveState === "saving" ? "Mentés…" : "Mentés"}
            </button>
          )}
          <button className="order-button order-button-secondary" onClick={() => printOnly("munkamenet")}>
            Nyomtatás
          </button>
        </div>
      </header>
      <div className="no-print project-work-session-notice">
        <strong>Nem kiadási forrás</strong>
        <span>Ez a korábbi munkalap külön szerkesztőfelület. Az üzemi kiadás zárolt, amíg nincs jóváhagyott rendeléshez, alkatrész-snapshothoz és tervverzióhoz kötött kiadási csomag.</span>
      </div>
      <div role="status" className="no-print project-work-session-notice">
        <strong>Szerkesztés zárolva</strong>
        <span>Az örökölt munkalap csak megtekinthető. A szerkesztés és mentés a biztonságos szerveroldali verzió- és ütközésvédelem bevezetéséig nem érhető el.</span>
      </div>
      {projectQuery.isFetching && !projectQuery.isLoading && (
        <div role="status" className="no-print project-work-session-notice">
          <strong>Adatok frissítése…</strong>
          <span>A munkalap megtekinthető, a szerkesztés és minden művelet a frissítés végéig zárolt.</span>
        </div>
      )}
      {projectQuery.isError && (
        <div role="alert" className="no-print project-work-session-notice">
          <strong>A háttérfrissítés nem sikerült</strong>
          <span>A látható munkalap csak megtekinthető. A helyi piszkozat megmaradt; újabb sikeres lekérdezésig nem indítható művelet.</span>
        </div>
      )}
      {mutationPending && saveState !== "error" && (
        <div role="status" className="no-print project-work-session-notice">
          <strong>Művelet folyamatban…</strong>
          <span>A szerkesztés a művelet befejezéséig zárolt.</span>
        </div>
      )}
      {statusMessage && (
        <div role={saveState === "error" ? "alert" : "status"} className="no-print project-work-session-notice">
          <strong>{saveState === "error" ? "A művelet nem sikerült" : "Munkalap állapota"}</strong>
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="print-area" style={{ background: "#fff", maxWidth: "1100px", border: "1px solid #c6c4bc", boxShadow: "0 6px 20px rgba(0,0,0,.15)", padding: "26px 32px 34px" }}>
        <div className="munkamenet-block">
        {canManage && (
          <div className="no-print" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", border: "1.5px dashed var(--line-input)", background: "#fafaf4", padding: "8px 12px", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Sablon a táblára:</span>
            <select value={templateSel} disabled={!editingEnabled} onChange={(e) => setTemplateSel(e.target.value)} style={{ border: "1px solid var(--line-input)", background: "#fff", padding: "4px 6px", fontSize: "13px", fontWeight: 600 }}>
              <option value="">— válassz —</option>
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <button onClick={() => void loadTemplate()} disabled={!editingEnabled} style={{ border: "1.5px solid var(--line-strong)", background: "#fff", fontWeight: 700, fontSize: "12.5px", padding: "4px 12px", cursor: "pointer", borderRadius: "3px" }}>
              Betölt
            </button>
            <span style={{ color: "#c9c7ba" }}>|</span>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Epik sablonból:</span>
            <select value={epikTemplateSel} disabled={!editingEnabled} onChange={(e) => setEpikTemplateSel(e.target.value)} style={{ border: "1px solid var(--line-input)", background: "#fff", padding: "4px 6px", fontSize: "13px", fontWeight: 600 }}>
              <option value="">— válassz —</option>
              {epikTemplates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => void applySelectedEpikTemplate()}
              disabled={!editingEnabled || !epikTemplateSel}
              style={{ border: "1.5px solid var(--line-strong)", background: "#fff", fontWeight: 700, fontSize: "12.5px", padding: "4px 12px", cursor: "pointer", borderRadius: "3px" }}
            >
              Hozzáad
            </button>
            <button
              onClick={issueSession}
              disabled={!editingEnabled || !releaseAuthorityAvailable}
              title="A kiadáshoz jóváhagyott, verziózott alkatrész-, műveleti-, terv- és kiadási csomag szükséges."
              style={{ border: "none", background: "var(--marker-blue)", color: "#fff", fontWeight: 700, fontSize: "13px", padding: "6px 14px", cursor: "pointer", borderRadius: "4px", letterSpacing: ".5px", opacity: scheduleProject.isPending || saveEpics.isPending ? 0.65 : 1 }}
            >
              {scheduleProject.isPending || saveEpics.isPending ? "Kiadás…" : "Munkamenet kiadása"}
            </button>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Csak tervezett nappal rendelkező lépések adhatók ki.</span>
            {scheduleProject.data && (
              <span style={{ fontSize: "12px", color: "var(--marker-green)", fontWeight: 700 }}>
                {scheduleProject.data.createdCount} feladat kiadva
              </span>
            )}
            <button onClick={addEpic} disabled={!editingEnabled} style={{ marginLeft: "auto", border: "1.5px dashed var(--line-strong)", background: "transparent", color: "var(--line-strong)", fontWeight: 700, fontSize: "12.5px", padding: "5px 12px", cursor: "pointer", borderRadius: "3px" }}>
              + Epik
            </button>
          </div>
        )}

        {epics.map((epic, epicIndex) => (
          <div key={epic.id} style={{ border: "1.5px solid var(--line-strong)", marginBottom: "10px", opacity: epic.disabled ? 0.5 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", background: "var(--surface-sheet-head)", borderBottom: "1.5px solid var(--line-strong)", padding: "5px 12px", flexWrap: "wrap" }}>
              {canManage ? (
                <input
                  value={epic.name}
                  disabled={!editingEnabled}
                  onChange={(e) => updateEpic(epicIndex, { name: e.target.value })}
                  style={{ fontWeight: 700, fontSize: "14.5px", border: "none", background: "transparent", outline: "none" }}
                />
              ) : (
                <div style={{ fontWeight: 700, fontSize: "14.5px" }}>{epic.name}</div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "12.5px", color: "var(--text-muted)", fontWeight: 600 }}>{epic.quantityLabel}</span>
                {canManage && (
                  <>
                    <label className="no-print" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", cursor: "pointer" }}>
                      <input type="checkbox" checked={!!epic.disabled} disabled={!editingEnabled} onChange={(e) => updateEpic(epicIndex, { disabled: e.target.checked })} />
                      Kimarad
                    </label>
                    <button
                      className="no-print"
                      onClick={() => void saveEpicAsTemplate(epic.id)}
                      disabled={!editingEnabled}
                      style={{ border: "1px solid var(--line-strong)", background: "#fff", fontWeight: 700, fontSize: "11px", padding: "2px 8px", cursor: "pointer", borderRadius: "3px" }}
                    >
                      Sablonként ment
                    </button>
                    <button onClick={() => addStep(epicIndex)} disabled={!editingEnabled} style={{ border: "1px solid var(--line-strong)", background: "#fff", fontWeight: 700, fontSize: "11px", padding: "2px 8px", cursor: "pointer", borderRadius: "3px" }}>
                      + Task
                    </button>
                    <button onClick={() => void removeEpic(epic.id)} disabled={!editingEnabled} title="Epik törlése" style={{ border: "1px solid #a3483d", background: "#fff", color: "#8f3329", fontWeight: 700, fontSize: "11px", padding: "2px 8px", cursor: "pointer", borderRadius: "3px" }}>
                      Epik törlése
                    </button>
                  </>
                )}
              </div>
            </div>

            {!canManage && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", padding: "9px 12px" }}>
                {epic.steps.map((step) => {
                  const issued = !!step.tasks?.length;
                  return (
                    <div
                      key={step.id}
                      style={{
                        border: `1.5px solid ${issued ? "var(--marker-blue)" : "#9a9a94"}`,
                        background: issued ? "var(--marker-blue)" : "#fff",
                        color: issued ? "#fff" : "var(--text-ink)",
                        padding: "5px 12px",
                        fontSize: "12.5px",
                        fontWeight: 600,
                        borderRadius: "3px",
                        textAlign: "center",
                      }}
                    >
                      {step.name || "—"}
                      <span style={{ display: "block", fontSize: "9.5px", fontWeight: 600, opacity: 0.7, letterSpacing: "0.3px" }}>
                        {step.station || "—"}
                      </span>
                    </div>
                  );
                })}
                {epic.steps.length === 0 && <div style={{ fontSize: "12.5px", color: "var(--text-faint)" }}>Nincs lépés ebben az epikben.</div>}
              </div>
            )}

            {canManage && (
            <div className="h-scroll">
            <div style={{ display: "grid", gridTemplateColumns: "56px minmax(160px,1.5fr) minmax(120px,1.1fr) 62px 90px 140px 90px 158px", fontSize: "13px", alignItems: "center", minWidth: "860px" }}>
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Művelet</div>
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Lépés</div>
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Állomás</div>
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Menny.</div>
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Egys. idő (ó)</div>
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Tervezett nap</div>
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Státusz</div>
              <div />
              {epic.steps.map((step, stepIndex) => (
                <div key={step.id} style={{ display: "contents" }}>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "4px 0 4px 10px", color: "var(--text-faint)", fontWeight: 700, display: "flex", alignItems: "center", gap: "3px" }}>
                    {stepIndex + 1}.
                    <span className="no-print" style={{ display: "inline-flex", flexDirection: "column" }}>
                      <button disabled={!editingEnabled || stepIndex === 0 || epic.steps.some((item) => item.tasks?.length)} onClick={() => moveStep(epicIndex, stepIndex, -1)} title="Előrébb" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontSize: "10px" }}>▲</button>
                      <button disabled={!editingEnabled || stepIndex === epic.steps.length - 1 || epic.steps.some((item) => item.tasks?.length)} onClick={() => moveStep(epicIndex, stepIndex, 1)} title="Hátrébb" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontSize: "10px" }}>▼</button>
                    </span>
                  </div>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "2px 8px" }}>
                    <input
                      value={step.name}
                      disabled={!editingEnabled}
                      onChange={(e) => updateStep(epicIndex, stepIndex, { name: e.target.value })}
                      style={{ width: "100%", fontSize: "12px", border: "1px solid var(--line-softer)", background: "#fff", padding: "2px 3px", fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "2px 8px" }}>
                    <select
                      value={step.station ?? ""}
                      disabled={!editingEnabled}
                      onChange={(e) => updateStep(epicIndex, stepIndex, { station: e.target.value || null })}
                      style={{ width: "100%", fontSize: "12px", border: "1px solid var(--line-softer)", background: "#fff", padding: "2px 3px", fontWeight: 600 }}
                    >
                      <option value="">— állomás —</option>
                      {stations.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "2px 8px" }}>
                    <input
                      type="number"
                      min={0}
                      disabled={!editingEnabled}
                      value={step.quantity ?? ""}
                      onChange={(e) => updateStep(epicIndex, stepIndex, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                      style={{ width: "100%", fontSize: "12px", border: "1px solid var(--line-softer)", background: "#fff", padding: "2px 3px", fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "2px 8px" }}>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      disabled={!editingEnabled}
                      value={step.unitHours ?? ""}
                      onChange={(e) => updateStep(epicIndex, stepIndex, { unitHours: e.target.value === "" ? null : Number(e.target.value) })}
                      style={{ width: "100%", fontSize: "12px", border: "1px solid var(--line-softer)", background: "#fff", padding: "2px 3px", fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "2px 8px" }}>
                    <input
                      type="date"
                      disabled={!editingEnabled}
                      value={step.planDate ? step.planDate.slice(0, 10) : ""}
                      onChange={(e) => updateStep(epicIndex, stepIndex, { planDate: e.target.value || null, planLocked: true })}
                      style={{ width: "100%", fontSize: "12px", border: "1px solid var(--line-softer)", background: "#fff", padding: "2px 3px", fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "4px 8px", fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: step.tasks?.length ? "var(--marker-blue)" : "var(--text-faint)" }}>
                    {step.tasks?.length ? "kiadva" : "—"}
                  </div>
                  <div className="no-print" style={{ borderBottom: "1px solid var(--line-softer)", padding: "2px 5px", display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                    {step.tasks?.[0] ? (
                      <>
                        <button onClick={() => worksheetWriteAuthorityAvailable && setOpenTask(step.tasks![0])} disabled={!worksheetWriteAuthorityAvailable} title="A feladat szerkeszthető részletezője a munkalap ütközésvédelméig zárolt." style={{ border: "1px solid var(--marker-blue)", background: "#fff", color: "var(--marker-blue)", fontWeight: 700, fontSize: "10px", padding: "2px 5px", cursor: "pointer", borderRadius: "3px" }}>Munkalap</button>
                        <button onClick={() => void revokeSingleStep(step.id)} disabled={!editingEnabled} style={{ border: "1px solid #a3483d", background: "#fff", color: "#8f3329", fontWeight: 700, fontSize: "10px", padding: "2px 5px", cursor: "pointer", borderRadius: "3px" }}>Visszavon</button>
                      </>
                    ) : (
                      <button onClick={() => void issueSingleStep(step)} disabled={!editingEnabled || !releaseAuthorityAvailable || !step.planDate} title={!releaseAuthorityAvailable ? "A szerver-authoritative kiadási csomag még hiányzik." : !step.planDate ? "Előbb adj meg tervezett napot." : undefined} style={{ border: "1px solid var(--marker-blue)", background: "var(--marker-blue)", color: "#fff", fontWeight: 700, fontSize: "10px", padding: "2px 5px", cursor: "pointer", borderRadius: "3px" }}>Kiadás</button>
                    )}
                    {canManage && (
                      <button onClick={() => void removeStep(epic.id, step.id)} disabled={!editingEnabled} title="Törlés" style={{ border: "none", background: "none", color: "#c0c0b8", cursor: "pointer", fontSize: "13px" }}>
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </div>
            )}
          </div>
        ))}

        {(project.unepicTasks?.length ?? 0) > 0 && (
          <div style={{ border: "1.5px dashed var(--line-strong)", marginBottom: "10px", background: "#fafaf4" }}>
            <div style={{ padding: "5px 12px", fontWeight: 700, fontSize: "14px", background: "var(--surface-sheet-head)", borderBottom: "1px dashed var(--line-strong)" }}>
              (epik nélkül)
            </div>
            <div className="no-print" style={{ padding: "8px 12px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {project.unepicTasks.map((task) => (
                <button key={task.id} onClick={() => worksheetWriteAuthorityAvailable && setOpenTask(task)} disabled={!worksheetWriteAuthorityAvailable} title="A feladat szerkeszthető részletezője a munkalap ütközésvédelméig zárolt." style={{ border: "1px solid var(--marker-blue)", background: "#fff", color: "var(--text-ink)", padding: "4px 8px", cursor: "pointer", borderRadius: "3px", fontWeight: 600, fontSize: "12px" }}>
                  {task.title} <span style={{ color: "var(--text-muted)" }}>· {task.station ?? "szabad"}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {epics.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>Nincs még epik felvéve ehhez a projekthez.</div>}
        </div>

        <div className="subsheets-block">
          <ProjectSubSheets projectKey={key} canManage={editingEnabled} />
        </div>
      </div>
      {openTask && <TaskDetailModal task={openTask} flow={taskKanban?.flow ?? ["Felvett", "Folyamatban", "Kész"]} onClose={() => setOpenTask(null)} />}
    </div>
    </main>
  );
}
