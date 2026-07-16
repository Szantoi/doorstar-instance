import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useUiStore } from "@/store/uiStore";
import {
  useApplyTemplate,
  useProject,
  useSaveEpics,
  useScheduleProject,
  useStations,
  useTemplates,
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
  const canManage = role === "vezeto";

  const { data: project } = useProject(key);
  const { data: templates = [] } = useTemplates();
  const { data: stationsData } = useStations();
  const stations = stationsData?.stations.map((s) => s.key) ?? [];

  const saveEpics = useSaveEpics(key);
  const scheduleProject = useScheduleProject(key);
  const applyTemplate = useApplyTemplate(key);

  const [epics, setEpics] = useState<Epic[]>([]);
  const [templateSel, setTemplateSel] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (project) {
      setEpics(project.epics);
      setDirty(false);
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

  function removeEpic(index: number) {
    setEpics((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  function addStep(epicIndex: number) {
    setEpics((prev) => prev.map((e, i) => (i === epicIndex ? { ...e, steps: [...e.steps, emptyStep()] } : e)));
    setDirty(true);
  }

  function removeStep(epicIndex: number, stepIndex: number) {
    setEpics((prev) => prev.map((e, i) => (i === epicIndex ? { ...e, steps: e.steps.filter((_, si) => si !== stepIndex) } : e)));
    setDirty(true);
  }

  function save() {
    saveEpics.mutate(epics, { onSuccess: () => setDirty(false) });
  }

  function loadTemplate() {
    const template = templates.find((t) => t.name === templateSel);
    if (!template) return;
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
        <div style={{ fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: "30px" }}>{project.name}</div>
        {project.num && <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>#{project.num}</div>}
        <div style={{ flex: 1 }} />
        {dirty && (
          <button onClick={save} style={{ border: "none", background: "var(--marker-blue)", color: "#fff", fontWeight: 700, fontSize: "13px", padding: "6px 14px", cursor: "pointer", borderRadius: "4px" }}>
            Mentés
          </button>
        )}
        <button onClick={() => window.print()} style={{ border: "none", background: "var(--chrome-bg)", color: "#fff", fontWeight: 700, fontSize: "13.5px", padding: "7px 16px", cursor: "pointer", borderRadius: "4px", letterSpacing: ".5px" }}>
          Nyomtatás
        </button>
      </div>

      <div className="print-area" style={{ background: "#fff", maxWidth: "1100px", border: "1px solid #c6c4bc", boxShadow: "0 6px 20px rgba(0,0,0,.15)", padding: "26px 32px 34px" }}>
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
            <button
              onClick={() => scheduleProject.mutate(undefined)}
              style={{ border: "none", background: "var(--marker-blue)", color: "#fff", fontWeight: 700, fontSize: "13px", padding: "6px 14px", cursor: "pointer", borderRadius: "4px", letterSpacing: ".5px" }}
            >
              Munkamenet kiadása (mai naptól)
            </button>
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
          <div key={epic.id} style={{ border: "1.5px solid var(--line-strong)", marginBottom: "10px" }}>
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
                    <button onClick={() => addStep(epicIndex)} style={{ border: "1px solid var(--line-strong)", background: "#fff", fontWeight: 700, fontSize: "11px", padding: "2px 8px", cursor: "pointer", borderRadius: "3px" }}>
                      + Task
                    </button>
                    <button onClick={() => removeEpic(epicIndex)} title="Epik törlése" style={{ border: "none", background: "none", color: "#c0c0b8", cursor: "pointer", fontSize: "15px", padding: "0 3px" }}>
                      ×
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "30px 1.5fr 1.1fr 62px 90px 140px 90px 40px", fontSize: "13px", alignItems: "center" }}>
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
        ))}

        {epics.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>Nincs még epik felvéve ehhez a projekthez.</div>}

        <ProjectSubSheets projectKey={key} canManage={canManage} />
      </div>
    </div>
  );
}
