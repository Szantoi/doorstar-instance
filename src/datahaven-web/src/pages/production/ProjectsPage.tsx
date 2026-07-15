import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUiStore } from "@/store/uiStore";
import { useCreateProject, useProjects } from "@/services/production/hooks";

export function ProjectsPage() {
  const { role } = useUiStore();
  const canManage = role === "vezeto";
  const { data: projects = [] } = useProjects();
  const createProject = useCreateProject();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [num, setNum] = useState("");

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
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: "15px" }}>
          Még nincs projekthez rendelt feladat.
        </div>
      )}
    </div>
  );
}
