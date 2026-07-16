import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUiStore } from "@/store/uiStore";
import { useCreateProject, useEpikRollup, useProjects } from "@/services/production/hooks";
import type { EpikRollupRow } from "@/services/production/types";

const SHORT_DAY_NAMES = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

function ProjectEpikRows({ projectKey, onOpenEpik }: { projectKey: string; onOpenEpik: (row: EpikRollupRow) => void }) {
  const { data } = useEpikRollup(projectKey);
  const rows = data?.epikRows ?? [];
  if (rows.length === 0) return null;

  return (
    <div style={{ marginTop: "4px" }}>
      {rows.map((row) => {
        const color = row.done === row.total ? "var(--marker-green)" : "var(--marker-blue)";
        return (
          <div
            key={row.name}
            onClick={() => onOpenEpik(row)}
            style={{ padding: "5px 2px", cursor: "pointer", borderRadius: "3px", borderBottom: "1px solid var(--line-softer)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: "19px", color, lineHeight: 1.15 }}>{row.name}</div>
              <div style={{ fontSize: "12px", color, fontWeight: 700, whiteSpace: "nowrap" }}>
                {row.done} / {row.total}
              </div>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-faint)", fontWeight: 600 }}>
              {row.next
                ? `Következő: ${row.next.title} · ${SHORT_DAY_NAMES[row.next.day] ?? ""} · ${row.next.station ?? "szabad"}`
                : "Minden lépés kész"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EpikOverviewModal({ row, onClose }: { row: EpikRollupRow; onClose: () => void }) {
  const navigate = useNavigate();
  const setWeek = useUiStore((s) => s.setWeek);
  const pct = row.total ? Math.round((row.done / row.total) * 100) : 0;

  function openStep(week: string) {
    setWeek(week);
    navigate("/");
    onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(20,20,24,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 16px", overflow: "auto", zIndex: 220 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fcfcf8", border: "2px solid var(--line-strong)", boxShadow: "var(--shadow-modal)", width: "440px", maxWidth: "94vw", fontFamily: "var(--font-ui)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--chrome-bg)", padding: "8px 14px" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "13px", letterSpacing: "0.5px" }}>Epik áttekintés</span>
          <button onClick={onClose} style={{ border: "none", background: "none", color: "#fff", fontSize: "20px", cursor: "pointer", lineHeight: 1 }}>
            ×
          </button>
        </div>
        <div style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "8px" }}>
            <div style={{ fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: "26px" }}>{row.name}</div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)" }}>
              {row.done} / {row.total} kész
            </div>
          </div>
          <div style={{ height: "10px", background: "#eceade", border: "1px solid #c9c7ba", marginBottom: "14px" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "var(--marker-green)" : "var(--marker-blue)" }} />
          </div>
          <div style={{ maxHeight: "50vh", overflow: "auto" }}>
            {row.steps.map((step) => (
              <div
                key={step.id}
                onClick={() => openStep(step.week)}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 2px", cursor: "pointer", borderBottom: "1px solid var(--line-softer)" }}
              >
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: `var(--status-${step.status})`, flex: "none" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{step.title || "(névtelen)"}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>
                    {SHORT_DAY_NAMES[step.day] ?? ""} · {step.station ?? "szabad"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const { role } = useUiStore();
  const canManage = role === "vezeto";
  const { data: projects = [] } = useProjects();
  const createProject = useCreateProject();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [num, setNum] = useState("");
  const [selectedEpik, setSelectedEpik] = useState<EpikRollupRow | null>(null);

  function submit() {
    if (!name.trim()) return;
    const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    createProject.mutate(
      { key, name: name.trim(), num: num.trim() || undefined },
      { onSuccess: () => navigate(`/projects/${key}`) }
    );
    setAdding(false);
    setName("");
    setNum("");
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px 30px" }}>
      {canManage && (
        <div style={{ marginBottom: "16px" }}>
          {adding ? (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Megrendelő / projekt neve" style={{ border: "1px solid var(--line-input)", padding: "5px 8px", fontSize: "13px" }} />
              <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="Munkaszám" style={{ border: "1px solid var(--line-input)", padding: "5px 8px", fontSize: "13px", width: "110px" }} />
              <button onClick={submit} style={{ border: "none", background: "var(--marker-blue)", color: "#fff", fontWeight: 700, fontSize: "13px", padding: "6px 14px", cursor: "pointer", borderRadius: "4px" }}>
                Létrehoz
              </button>
              <button onClick={() => setAdding(false)} style={{ border: "1px solid var(--line-input)", background: "#fff", fontSize: "13px", padding: "6px 12px", cursor: "pointer", borderRadius: "4px" }}>
                Mégse
              </button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{ border: "none", background: "var(--marker-blue)", color: "#fff", fontWeight: 700, fontSize: "13.5px", padding: "7px 16px", cursor: "pointer", borderRadius: "4px", letterSpacing: ".5px" }}>
              + Új projekt
            </button>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "16px", maxWidth: "1500px" }}>
        {projects.map((p) => (
          <div key={p.key} style={{ background: "var(--surface-board)", border: "2px solid var(--line-strong)", boxShadow: "var(--shadow-panel)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "2px solid var(--line-strong)", padding: "8px 14px" }}>
              <div style={{ fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: "26px" }}>{p.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)" }}>
                  {p.doneTasks}/{p.totalTasks} kész
                </div>
                <button
                  onClick={() => navigate(`/projects/${p.key}`)}
                  style={{ border: "1.5px solid var(--line-strong)", background: "#fff", fontWeight: 700, fontSize: "12.5px", padding: "3px 10px", cursor: "pointer" }}
                >
                  Munkalap ›
                </button>
              </div>
            </div>
            <div style={{ padding: "12px 14px" }}>
              <div style={{ height: "10px", background: "#eceade", border: "1px solid #c9c7ba" }}>
                <div style={{ height: "100%", width: `${p.progressPct}%`, background: "var(--marker-blue)" }} />
              </div>
              {p.num && <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>Munkaszám: {p.num}</div>}
              <ProjectEpikRows projectKey={p.key} onOpenEpik={setSelectedEpik} />
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: "15px" }}>
          Még nincs projekthez rendelt feladat.
        </div>
      )}

      {selectedEpik && <EpikOverviewModal row={selectedEpik} onClose={() => setSelectedEpik(null)} />}
    </div>
  );
}
