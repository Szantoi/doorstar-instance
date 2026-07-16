import { NavLink, Outlet } from "react-router-dom";
import { useUiStore } from "@/store/uiStore";
import { useStations } from "@/services/production/hooks";
import { weekLabel } from "@/lib/dates";
import { Toast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const NAV_ITEMS = [
  { to: "/", label: "Tábla", end: true },
  { to: "/kanban", label: "Kanban" },
  { to: "/load", label: "Terhelés" },
  { to: "/projects", label: "Projektek" },
];

function navButtonStyle(active: boolean): React.CSSProperties {
  return {
    border: "none",
    background: active ? "var(--chrome-accent)" : "var(--chrome-control)",
    color: active ? "var(--chrome-bg)" : "#eee",
    fontFamily: "var(--font-ui)",
    fontWeight: 600,
    fontSize: "14px",
    padding: "6px 14px",
    borderRadius: "4px",
    cursor: "pointer",
  };
}

export function AppShell() {
  const { role, setRole, myStation, setMyStation, week, prevWeek, nextWeek, goToday } = useUiStore();
  const { data: stationsData } = useStations();
  const stations = stationsData?.stations ?? [];

  return (
    <div
      className="app-root"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-ui)",
        background: "linear-gradient(180deg,#d6d4cd,#c9c7c0)",
        color: "var(--text-ink)",
      }}
    >
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          padding: "10px 18px",
          background: "linear-gradient(180deg, var(--chrome-bg-2), var(--chrome-bg))",
          color: "var(--chrome-fg)",
          flexWrap: "wrap",
          boxShadow: "0 2px 6px rgba(0,0,0,.35)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "17px", letterSpacing: "2px", textTransform: "uppercase" }}>
          Üzemi tábla
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} style={({ isActive }) => navButtonStyle(isActive)}>
              {item.label}
            </NavLink>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={prevWeek} style={{ background: "var(--chrome-control)", color: "#eee", border: "none", borderRadius: "4px", padding: "5px 11px", cursor: "pointer", fontSize: "15px", fontWeight: 600 }}>
            ‹
          </button>
          <div style={{ fontWeight: 600, fontSize: "15px", minWidth: "200px", textAlign: "center" }}>{weekLabel(week)}</div>
          <button onClick={nextWeek} style={{ background: "var(--chrome-control)", color: "#eee", border: "none", borderRadius: "4px", padding: "5px 11px", cursor: "pointer", fontSize: "15px", fontWeight: 600 }}>
            ›
          </button>
          <button onClick={goToday} style={{ background: "var(--chrome-control)", color: "#eee", border: "none", borderRadius: "4px", padding: "5px 10px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
            Ma
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", color: "#bbb" }}>Szerep:</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "vezeto" | "allomas")}
            style={{ background: "var(--chrome-control)", color: "#eee", border: "none", borderRadius: "4px", padding: "5px 8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            <option value="vezeto">Vezető</option>
            <option value="allomas">Állomás</option>
          </select>
          {role === "allomas" && (
            <select
              value={myStation}
              onChange={(e) => setMyStation(e.target.value)}
              style={{ background: "var(--chrome-control)", color: "var(--chrome-accent)", border: "none", borderRadius: "4px", padding: "5px 8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              {stations.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.key}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <Outlet />
      <Toast />
      <ConfirmDialog />
    </div>
  );
}
