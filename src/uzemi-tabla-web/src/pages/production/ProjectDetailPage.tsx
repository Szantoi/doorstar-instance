import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useUiStore } from "@/store/uiStore";
import { useConfirmStore } from "@/store/confirmStore";
import { useToastStore } from "@/store/toastStore";
import { printOnly } from "@/lib/printOnly";
import {
  useApplyEpikTemplate,
  useDeleteEpic,
  useDeleteProject,
  useApplyTemplate,
  useEpikTemplates,
  useProject,
  useSaveEpics,
  useSaveEpikTemplate,
  useScheduleProject,
  useStations,
  useTemplates,
  useUpdateProject,
} from "@/services/production/hooks";
import type { Epic, EpicStep } from "@/services/production/types";
import { ProjectSubSheets } from "./ProjectSubSheets";

let localIdSeq = 0;
function localId() {
  localIdSeq += 1;
  return `local-${localIdSeq}`;
}

function emptyStep(): EpicStep {
  return { id: localId(), name: "", station: null, quantity: null, unitHours: null, planDate: null, planLocked: false, disabled: false };
}

export function ProjectDetailPage() {
  const { key = "" } = useParams();
  const navigate = useNavigate();
  const { role } = useUiStore();
  const showToast = useToastStore((s) => s.show);
  const canManage = role === "vezeto";

  const { data: project } = useProject(key);
  const { data: templates = [] } = useTemplates();
  const { data: stationsData } = useStations();
  const stations = stationsData?.stations.map((s) => s.key) ?? [];

  const { data: epikTemplates = [] } = useEpikTemplates();
  const saveEpics = useSaveEpics(key);
  const scheduleProject = useScheduleProject(key);
  const applyEpikTemplate = useApplyEpikTemplate(key);
  const saveEpikTemplate = useSaveEpikTemplate();
  const updateProject = useUpdateProject(key);
  const deleteEpic = useDeleteEpic(key);
  const deleteProject = useDeleteProject(key);

  const [epics, setEpics] = useState<Epic[]>([]);
  const [templateSel, setTemplateSel] = useState("");
  const [epikTemplateSel, setEpikTemplateSel] = useState("");
  const [dirty, setDirty] = useState(false);
  const [kezdes, setKezdes] = useState("");
  const [beepites, setBeepites] = useState("");
  const [szinTok, setSzinTok] = useState("");
  const [szinLap, setSzinLap] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectNum, setProjectNum] = useState("");

  useEffect(() => {
    if (project) {
      setEpics(project.epics);
      setDirty(false);
      setKezdes(project.kezdes ?? "");
      setBeepites(project.beepites ?? "");
      setSzinTok(project.szinTok ?? "");
      setSzinLap(project.szinLap ?? "");
      setProjectName(project.name);
      setProjectNum(project.num ?? "");
    }
  }, [project]);

  if (!project) return <div style={{ padding: "24px" }}>Betöltés…</div>;

  function updateEpic(index: number, patch: Partial<Epic>) {
    setEpics((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
    setDirty(true);
  }

  function updateStep(epicIndex: number, stepIndex: number, patch: Partial<EpicStep>) {
    setEpics((prev) =>
      prev.map((e, i) =>
        i === epicIndex ? { ...e, steps: e.steps.map((s, si) => (si === stepIndex ? { ...s, ...patch } : s)) } : e
      )
    );
    setDirty(true);
  }

  function addEpic() {
    setEpics((prev) => [...prev, { id: localId(), name: "Új epik", quantityLabel: "", disabled: false, steps: [emptyStep()] }]);
    setDirty(true);
  }

  async function removeEpic(index: number) {
    const epic = epics[index];
    const issuedCount = epic.steps.filter((s) => s.tasks?.length).length;
    const message = issuedCount
      ? `A(z) "${epic.name}" epik ${issuedCount} lépése már ki van adva a táblára. Törlöd az epiket a munkalapról? (a táblán lévő feladatok megmaradnak, de elárvulnak)`
      : `Biztosan törlöd a(z) "${epic.name}" epiket?`;
    if (!(await useConfirmStore.getState().ask(message))) return;
    const nextEpics = epics.filter((_, i) => i !== index);
    if (epic.id.startsWith("local-")) {
      setEpics(nextEpics);
      setDirty(true);
      return;
    }
    // Persist any other edits first. The API reconciles matching IDs in
    // place, so their issued task links stay intact when the cache refetches.
    if (dirty) {
      await saveEpics.mutateAsync(epics);
      setDirty(false);
    }
    await deleteEpic.mutateAsync(epic.id);
    setEpics(nextEpics);
  }

  function addStep(epicIndex: number) {
    setEpics((prev) => prev.map((e, i) => (i === epicIndex ? { ...e, steps: [...e.steps, emptyStep()] } : e)));
    setDirty(true);
  }

  async function removeStep(epicIndex: number, stepIndex: number) {
    const step = epics[epicIndex].steps[stepIndex];
    const message = step.tasks?.length
      ? `A(z) "${step.name}" lépés már ki van adva a táblára. Törlöd a munkalapról? (a táblán lévő feladat megmarad, de elárvul)`
      : `Biztosan törlöd a(z) "${step.name || "lépés"}" sort?`;
    if (!(await useConfirmStore.getState().ask(message))) return;
    setEpics((prev) => prev.map((e, i) => (i === epicIndex ? { ...e, steps: e.steps.filter((_, si) => si !== stepIndex) } : e)));
    setDirty(true);
  }

  function save() {
    saveEpics.mutate(epics, { onSuccess: () => setDirty(false) });
  }

  async function issueSession() {
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

  async function archiveProject() {
    if (!project) return;
    const message = dirty
      ? `A(z) "${project.name}" projekt archiválásakor a nem mentett munkalap-módosítások elvesznek. A projekt és a korábbi táblafeladatok megmaradnak, de a projekt kikerül az aktív listából. Folytatod?`
      : `Archiválod a(z) "${project.name}" projektet? A projekt, a munkalap és a korábbi táblafeladatok megmaradnak, de nem jelenik meg az aktív listában és új feladathoz sem választható.`;
    if (!(await useConfirmStore.getState().ask(message))) return;
    deleteProject.mutate(undefined, { onSuccess: () => navigate("/projects") });
  }

  async function loadTemplate() {
    const template = templates.find((t) => t.name === templateSel);
    if (!template) return;
    if (epics.length > 0) {
      const confirmed = await useConfirmStore
        .getState()
        .ask(`A(z) "${template.name}" sablon betöltése lecseréli a jelenlegi ${epics.length} epiket a munkalapon. Folytatod?`);
      if (!confirmed) return;
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
  }

  return (
    <div className="scrollwrap" style={{ flex: 1, overflow: "auto", padding: "16px 20px 30px" }}>
      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap", maxWidth: "1100px" }}>
        <button onClick={() => navigate("/projects")} style={{ border: "1.5px solid #55534c", background: "transparent", color: "#3d3b36", fontWeight: 700, fontSize: "13px", padding: "5px 12px", cursor: "pointer", borderRadius: "3px" }}>
          ‹ Projektek
        </button>
        <div>
          <label style={{ display: "block", fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: "2px" }}>
            Projekt neve
          </label>
          {canManage ? (
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={() => projectName.trim() && projectName !== project.name && updateProject.mutate({ name: projectName.trim() })}
              style={{ fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: "30px", border: "1px solid var(--line-input)", background: "#fff", padding: "0 5px", maxWidth: "min(420px, 72vw)" }}
            />
          ) : (
            <div style={{ fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: "30px" }}>{project.name}</div>
          )}
        </div>
        <div>
          <label style={{ display: "block", fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: "2px" }}>
            Munkaszám
          </label>
          {canManage ? (
            <input
              value={projectNum}
              onChange={(e) => setProjectNum(e.target.value)}
              onBlur={() => projectNum !== (project.num ?? "") && updateProject.mutate({ num: projectNum.trim() || null })}
              placeholder="—"
              style={{ border: "1px solid var(--line-input)", background: "#fff", padding: "4px 6px", fontSize: "13px", width: "120px" }}
            />
          ) : project.num ? (
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>#{project.num}</div>
          ) : null}
        </div>
        <div style={{ flex: 1 }} />
        {dirty && (
          <button onClick={save} style={{ border: "none", background: "var(--marker-blue)", color: "#fff", fontWeight: 700, fontSize: "13px", padding: "6px 14px", cursor: "pointer", borderRadius: "4px" }}>
            Mentés
          </button>
        )}
        <button onClick={() => printOnly("munkamenet")} style={{ border: "none", background: "var(--chrome-bg)", color: "#fff", fontWeight: 700, fontSize: "13.5px", padding: "7px 16px", cursor: "pointer", borderRadius: "4px", letterSpacing: ".5px" }}>
          Munkamenet nyomtatása
        </button>
        {canManage && (
          <button
            onClick={archiveProject}
            disabled={deleteProject.isPending}
            style={{ border: "1.5px solid #a3483d", background: "#fff", color: "#8f3329", fontWeight: 700, fontSize: "12.5px", padding: "6px 10px", cursor: "pointer", borderRadius: "4px" }}
          >
            {deleteProject.isPending ? "Archiválás…" : "Projekt archiválása"}
          </button>
        )}
      </div>

      <div className="no-print" style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "14px", maxWidth: "1100px", opacity: canManage ? 1 : 0.6 }}>
        {(
          [
            ["Kezdés", kezdes, setKezdes, "kezdes"],
            ["Beépítés", beepites, setBeepites, "beepites"],
            ["Szín (tok oldal)", szinTok, setSzinTok, "szinTok"],
            ["Szín (lap oldal)", szinLap, setSzinLap, "szinLap"],
          ] as const
        ).map(([label, value, setter, field]) => (
          <div key={field}>
            <label style={{ display: "block", fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: "2px" }}>
              {label}
            </label>
            <input
              value={value}
              disabled={!canManage}
              onChange={(e) => setter(e.target.value)}
              onBlur={() => value !== (project[field] ?? "") && updateProject.mutate({ [field]: value || null })}
              style={{ border: "1px solid var(--line-input)", background: "#fff", padding: "4px 6px", fontSize: "13px", width: "160px" }}
            />
          </div>
        ))}
      </div>

      <div className="print-area" style={{ background: "#fff", maxWidth: "1100px", border: "1px solid #c6c4bc", boxShadow: "0 6px 20px rgba(0,0,0,.15)", padding: "26px 32px 34px" }}>
        <div className="munkamenet-block">
        {canManage && (
          <div className="no-print" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", border: "1.5px dashed var(--line-input)", background: "#fafaf4", padding: "8px 12px", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Sablon a táblára:</span>
            <select value={templateSel} onChange={(e) => setTemplateSel(e.target.value)} style={{ border: "1px solid var(--line-input)", background: "#fff", padding: "4px 6px", fontSize: "13px", fontWeight: 600 }}>
              <option value="">— válassz —</option>
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <button onClick={loadTemplate} style={{ border: "1.5px solid var(--line-strong)", background: "#fff", fontWeight: 700, fontSize: "12.5px", padding: "4px 12px", cursor: "pointer", borderRadius: "3px" }}>
              Betölt
            </button>
            <span style={{ color: "#c9c7ba" }}>|</span>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Epik sablonból:</span>
            <select value={epikTemplateSel} onChange={(e) => setEpikTemplateSel(e.target.value)} style={{ border: "1px solid var(--line-input)", background: "#fff", padding: "4px 6px", fontSize: "13px", fontWeight: 600 }}>
              <option value="">— válassz —</option>
              {epikTemplates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => epikTemplateSel && applyEpikTemplate.mutate(epikTemplateSel)}
              style={{ border: "1.5px solid var(--line-strong)", background: "#fff", fontWeight: 700, fontSize: "12.5px", padding: "4px 12px", cursor: "pointer", borderRadius: "3px" }}
            >
              Hozzáad
            </button>
            <button
              onClick={issueSession}
              disabled={scheduleProject.isPending || saveEpics.isPending}
              title="Csak tervezett nappal rendelkező lépések adhatók ki a Táblára."
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
            <button onClick={addEpic} style={{ marginLeft: "auto", border: "1.5px dashed var(--line-strong)", background: "transparent", color: "var(--line-strong)", fontWeight: 700, fontSize: "12.5px", padding: "5px 12px", cursor: "pointer", borderRadius: "3px" }}>
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
                      <input type="checkbox" checked={!!epic.disabled} onChange={(e) => updateEpic(epicIndex, { disabled: e.target.checked })} />
                      Kimarad
                    </label>
                    <button
                      className="no-print"
                      onClick={() => {
                        const name = window.prompt("Sablon neve:", epic.name);
                        if (!name?.trim()) return;
                        saveEpikTemplate.mutate({ name: name.trim(), epic: { ...epic, name: name.trim() } });
                      }}
                      style={{ border: "1px solid var(--line-strong)", background: "#fff", fontWeight: 700, fontSize: "11px", padding: "2px 8px", cursor: "pointer", borderRadius: "3px" }}
                    >
                      Sablonként ment
                    </button>
                    <button onClick={() => addStep(epicIndex)} style={{ border: "1px solid var(--line-strong)", background: "#fff", fontWeight: 700, fontSize: "11px", padding: "2px 8px", cursor: "pointer", borderRadius: "3px" }}>
                      + Task
                    </button>
                    <button onClick={() => removeEpic(epicIndex)} title="Epik törlése" style={{ border: "1px solid #a3483d", background: "#fff", color: "#8f3329", fontWeight: 700, fontSize: "11px", padding: "2px 8px", cursor: "pointer", borderRadius: "3px" }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "30px minmax(160px,1.5fr) minmax(120px,1.1fr) 62px 90px 140px 90px 40px", fontSize: "13px", alignItems: "center", minWidth: "700px" }}>
              <div />
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Lépés</div>
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Állomás</div>
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Menny.</div>
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Egys. idő (ó)</div>
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Tervezett nap</div>
              <div style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Státusz</div>
              <div />
              {epic.steps.map((step, stepIndex) => (
                <div key={step.id} style={{ display: "contents" }}>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "4px 0 4px 10px", color: "var(--text-faint)", fontWeight: 700 }}>{stepIndex + 1}.</div>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "2px 8px" }}>
                    <input
                      value={step.name}
                      disabled={!canManage}
                      onChange={(e) => updateStep(epicIndex, stepIndex, { name: e.target.value })}
                      style={{ width: "100%", fontSize: "12px", border: "1px solid var(--line-softer)", background: "#fff", padding: "2px 3px", fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "2px 8px" }}>
                    <select
                      value={step.station ?? ""}
                      disabled={!canManage}
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
                      disabled={!canManage}
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
                      disabled={!canManage}
                      value={step.unitHours ?? ""}
                      onChange={(e) => updateStep(epicIndex, stepIndex, { unitHours: e.target.value === "" ? null : Number(e.target.value) })}
                      style={{ width: "100%", fontSize: "12px", border: "1px solid var(--line-softer)", background: "#fff", padding: "2px 3px", fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "2px 8px" }}>
                    <input
                      type="date"
                      disabled={!canManage}
                      value={step.planDate ? step.planDate.slice(0, 10) : ""}
                      onChange={(e) => updateStep(epicIndex, stepIndex, { planDate: e.target.value || null, planLocked: true })}
                      style={{ width: "100%", fontSize: "12px", border: "1px solid var(--line-softer)", background: "#fff", padding: "2px 3px", fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "4px 8px", fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: step.tasks?.length ? "var(--marker-blue)" : "var(--text-faint)" }}>
                    {step.tasks?.length ? "kiadva" : "—"}
                  </div>
                  <div style={{ borderBottom: "1px solid var(--line-softer)", padding: "2px 8px" }}>
                    {canManage && (
                      <button onClick={() => removeStep(epicIndex, stepIndex)} title="Törlés" style={{ border: "none", background: "none", color: "#c0c0b8", cursor: "pointer", fontSize: "13px" }}>
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

        {epics.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>Nincs még epik felvéve ehhez a projekthez.</div>}
        </div>

        <div className="subsheets-block">
          <ProjectSubSheets projectKey={key} canManage={canManage} />
        </div>
      </div>
    </div>
  );
}
