import { useState } from "react";
import { useUiStore } from "@/store/uiStore";
import { useLoad, useSetCapacity } from "@/services/production/hooks";
import { addDays, DAY_NAMES, iso } from "@/lib/dates";

function cellStyle(hours: number, capacity: number): { bg: string; border: string } {
  if (hours > capacity) return { bg: "var(--load-over)", border: "2px solid var(--marker-red)" };
  if (hours > capacity * 0.75) return { bg: "var(--load-warn)", border: "1px solid #dcc084" };
  return { bg: "var(--load-ok)", border: "1px solid #b8ccb0" };
}

export function LoadPage() {
  const { week } = useUiStore();
  const { data: report } = useLoad(week);
  const setCapacity = useSetCapacity(week);
  const [capacityDraft, setCapacityDraft] = useState<number | null>(null);

  if (!report) return <div style={{ padding: "24px" }}>Betöltés…</div>;

  const capacity = capacityDraft ?? report.hoursPerDay;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, fontSize: "16px", letterSpacing: "1px", textTransform: "uppercase", color: "#3d3b36" }}>
          Részlegek terhelése
        </div>
        <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
          Kapacitás:
          <input
            type="number"
            min={1}
            max={24}
            value={capacity}
            onChange={(e) => setCapacityDraft(Number(e.target.value))}
            onBlur={() => capacityDraft != null && setCapacity.mutate(capacityDraft)}
            style={{ width: "52px", border: "1px solid var(--line-input)", background: "#fff", padding: "3px 5px", fontSize: "13px", fontWeight: 700, textAlign: "center" }}
          />
          ó / nap / részleg
        </label>
        <div style={{ display: "flex", gap: "12px", fontSize: "12.5px", color: "var(--text-muted)", flexWrap: "wrap" }}>
          <span><span style={{ display: "inline-block", width: "11px", height: "11px", background: "var(--load-ok)", border: "1px solid #b8ccb0", verticalAlign: "-1px" }} /> rendben</span>
          <span><span style={{ display: "inline-block", width: "11px", height: "11px", background: "var(--load-warn)", border: "1px solid #dcc084", verticalAlign: "-1px" }} /> 75% felett</span>
          <span><span style={{ display: "inline-block", width: "11px", height: "11px", background: "var(--load-over)", border: "2px solid var(--marker-red)", verticalAlign: "-1px" }} /> túlterhelt</span>
        </div>
      </div>

      <div style={{ minWidth: "1200px", maxWidth: "1500px", background: "var(--surface-board)", border: "2px solid var(--line-strong)", boxShadow: "var(--shadow-panel)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "120px repeat(7,1fr) 170px", borderBottom: "2px solid var(--line-strong)" }}>
          <div style={{ padding: "6px 10px", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Részleg</div>
          {Array.from({ length: 7 }, (_, day) => {
            const date = addDays(week, day);
            const isToday = iso(date) === iso(new Date());
            return (
              <div key={day} style={{ padding: "6px 8px", borderLeft: "1px solid var(--line-soft)", background: isToday ? "var(--surface-today)" : undefined, display: "flex", alignItems: "baseline", gap: "6px" }}>
                <span style={{ fontWeight: 700, fontSize: "12.5px", textTransform: "uppercase" }}>{DAY_NAMES[day]}</span>
                <span style={{ fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: "18px", color: "var(--marker-blue)" }}>{date.getMonth() + 1}.{date.getDate()}.</span>
              </div>
            );
          })}
          <div style={{ padding: "6px 10px", borderLeft: "2px solid var(--line-strong)", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>
            Heti kihasználtság
          </div>
        </div>

        {report.stations.map((row) => (
          <div key={row.station} style={{ display: "grid", gridTemplateColumns: "120px repeat(7,1fr) 170px", borderBottom: "1px solid var(--line-soft)" }}>
            <div style={{ padding: "8px 10px", fontWeight: 700, fontSize: "13px" }}>{row.station}</div>
            {row.cells.map((cell) => {
              const { bg, border } = cellStyle(cell.hours, report.hoursPerDay);
              return (
                <div key={cell.day} style={{ borderLeft: "1px solid var(--line-soft)", padding: "6px 8px", background: bg, border, minHeight: "44px" }}>
                  <div style={{ fontWeight: 700, fontSize: "14px" }}>{cell.hours.toFixed(1)} ó</div>
                  <div style={{ fontSize: "10.5px", color: "var(--text-muted)", fontWeight: 600 }}>{cell.taskCount} feladat</div>
                </div>
              );
            })}
            <div style={{ borderLeft: "2px solid var(--line-strong)", padding: "6px 10px", display: "flex", flexDirection: "column", gap: "3px", justifyContent: "center" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700 }}>
                <span>{row.totalHours.toFixed(1)} ó</span>
                <span style={{ color: row.utilizationPct > 100 ? "var(--marker-red)" : "var(--text-ink)" }}>{row.utilizationPct}%</span>
              </div>
              <div style={{ height: "8px", background: "#eceade", border: "1px solid #c9c7ba" }}>
                <div style={{ height: "100%", width: `${Math.min(row.utilizationPct, 100)}%`, background: row.utilizationPct > 100 ? "var(--marker-red)" : "var(--marker-blue)" }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {report.bottlenecks.length > 0 && (
        <div style={{ marginTop: "14px", maxWidth: "1500px", border: "2px solid var(--marker-red)", background: "#fdf1f1", padding: "10px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--marker-red)", marginBottom: "5px" }}>
            Szűk keresztmetszetek ezen a héten
          </div>
          {report.bottlenecks.map((b) => (
            <div key={b} style={{ fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: "21px", color: "var(--marker-red)", lineHeight: 1.25 }}>
              {b}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "10px", fontSize: "13px", color: "var(--text-muted)", maxWidth: "1500px" }}>
        Az óraszám a task mennyiség × egység idő értékéből számolódik; ahol ez nincs megadva, 1 óra a becslés. A kész feladatok nem terhelik a részleget.
      </div>
    </div>
  );
}
