import { useEffect, useState } from "react";
import { useSaveSheet, useSheet } from "@/services/production/hooks";
import { printOnly } from "@/lib/printOnly";
import { SheetTable, type SheetColumn } from "./SheetTable";
import type { CuttingRow, HardwareRow, QuantitiesSheet, QuantityBreakRow, QuantityRow, HardwareSheet, CuttingSheet } from "@/services/production/types";

const HW_FIELD_LABEL: React.CSSProperties = {
  fontSize: "10.5px",
  fontWeight: 700,
  color: "var(--text-faint)",
  textTransform: "uppercase",
};
const HW_HAND_INPUT: React.CSSProperties = {
  fontFamily: "var(--font-hand)",
  fontSize: "20px",
  fontWeight: 700,
  color: "var(--marker-blue)",
  border: "none",
  borderBottom: "1px solid var(--line-input)",
  background: "transparent",
  width: "100%",
  lineHeight: 1.2,
};
const HW_PLAIN_INPUT: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  border: "none",
  borderBottom: "1px solid var(--line-input)",
  background: "transparent",
  width: "100%",
};

function emptyHardwareRow(i: number): HardwareRow {
  return { i, nyitas: "", pant: "", lap: "", tok: "", uveg: "", zar: "", kilincs: "", cnc: "", megj: "" };
}

const QUANTITY_COLUMNS: SheetColumn<QuantityRow>[] = [
  { key: "name", label: "Alkatrész" },
  { key: "felulet", label: "Felület" },
  { key: "db", label: "Db", width: "100px" },
];

const QUANTITY_BREAK_COLUMNS: SheetColumn<QuantityBreakRow>[] = [
  { key: "label", label: "Bontás" },
  { key: "vsz", label: "Vízszintes", width: "110px" },
  { key: "fugg", label: "Függőleges", width: "110px" },
];

const CUTTING_COLUMNS: SheetColumn<CuttingRow>[] = [
  { key: "i", label: "#", width: "50px", type: "number" },
  { key: "sz", label: "Szélesség (mm)" },
  { key: "h", label: "Hosszúság (mm)" },
  { key: "db", label: "Db", width: "80px", type: "number" },
  { key: "anyag", label: "Anyag" },
  { key: "megj", label: "Megjegyzés" },
];

const SUB_TABS = [
  { id: "quantities", label: "Mennyiségek" },
  { id: "cutting", label: "Szabászat" },
  { id: "hardware", label: "Vasalat" },
] as const;

type SubTabId = (typeof SUB_TABS)[number]["id"];

function QuantitiesTab({ projectKey, canManage }: { projectKey: string; canManage: boolean }) {
  const { data } = useSheet<QuantitiesSheet>(projectKey, "QUANTITIES");
  const saveSheet = useSaveSheet<QuantitiesSheet>(projectKey, "QUANTITIES");
  const sheet = data ?? { menny: [], mennyBreak: [] };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)", marginBottom: "8px" }}>
          Mennyiségek
        </div>
        <SheetTable
          columns={QUANTITY_COLUMNS}
          rows={sheet.menny}
          emptyRow={() => ({ name: "", felulet: "", db: "" })}
          canManage={canManage}
          saving={saveSheet.isPending}
          onSave={(menny) => saveSheet.mutate({ ...sheet, menny })}
        />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)", marginBottom: "8px" }}>
          Mennyiség bontás
        </div>
        <SheetTable
          columns={QUANTITY_BREAK_COLUMNS}
          rows={sheet.mennyBreak}
          emptyRow={() => ({ label: "", vsz: "", fugg: "" })}
          canManage={canManage}
          saving={saveSheet.isPending}
          onSave={(mennyBreak) => saveSheet.mutate({ ...sheet, mennyBreak })}
        />
      </div>
    </div>
  );
}

function CuttingTab({ projectKey, canManage }: { projectKey: string; canManage: boolean }) {
  const { data } = useSheet<CuttingSheet>(projectKey, "CUTTING");
  const saveSheet = useSaveSheet<CuttingSheet>(projectKey, "CUTTING");
  const rows = data?.rows ?? [];

  return (
    <div>
      <SheetTable
        columns={CUTTING_COLUMNS}
        rows={rows}
        emptyRow={() => ({ i: rows.length + 1, sz: "", h: "", db: 1, anyag: "", megj: "" })}
        canManage={canManage}
        saving={saveSheet.isPending}
        onSave={(next) => saveSheet.mutate({ rows: next })}
      />
      <div style={{ fontSize: "12.5px", color: "var(--text-faint)", marginTop: "10px" }}>
        Méretek cm-ben, a kiíró Excelből átvéve. Tok mag + borító lap tételek a teljes szabásjegyzékben.
      </div>
    </div>
  );
}

/** Gyártólap/Vasalat — a per-door card grid (2 columns), matching the
 * paper "gyártólap" form this screen is modeled on: nyitás/pánt as the card
 * header, Lap/Tok/Üveg in handwriting (the measurements a fitter reads
 * off), Zár/Kilincs/CNC as plain hardware spec, and a red-highlighted
 * megjegyzés for anything unusual about that door. Kept as its own
 * card-based editor rather than the generic SheetTable since the source
 * form's layout is fundamentally 2D (per-door groups), not a flat table. */
function HardwareTab({ projectKey, canManage }: { projectKey: string; canManage: boolean }) {
  const { data } = useSheet<HardwareSheet>(projectKey, "HARDWARE");
  const saveSheet = useSaveSheet<HardwareSheet>(projectKey, "HARDWARE");
  const [rows, setRows] = useState<HardwareRow[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setRows(data?.rows ?? []);
    setDirty(false);
  }, [data]);

  function updateRow(index: number, patch: Partial<HardwareRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  function addRow() {
    setRows((prev) => [...prev, emptyHardwareRow(prev.length + 1)]);
    setDirty(true);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  function save() {
    saveSheet.mutate({ rows }, { onSuccess: () => setDirty(false) });
  }

  return (
    <div>
      {canManage && (
        <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "10px" }}>
          <button
            onClick={addRow}
            style={{ border: "1.5px dashed var(--line-strong)", background: "transparent", color: "var(--line-strong)", fontWeight: 700, fontSize: "12.5px", padding: "5px 12px", cursor: "pointer", borderRadius: "3px" }}
          >
            + Ajtó
          </button>
          {dirty && (
            <button
              onClick={save}
              disabled={saveSheet.isPending}
              style={{ border: "none", background: "var(--marker-blue)", color: "#fff", fontWeight: 700, fontSize: "13px", padding: "6px 14px", cursor: "pointer", borderRadius: "4px" }}
            >
              {saveSheet.isPending ? "Mentés…" : "Mentés"}
            </button>
          )}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {rows.map((row, index) => (
          <div key={index} style={{ border: "1.5px solid var(--line-strong)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", background: "var(--surface-sheet-head)", borderBottom: "1.5px solid var(--line-strong)", padding: "4px 10px" }}>
              <div style={{ fontWeight: 700, fontSize: "13.5px", display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                <span style={{ flex: "none" }}>Ajtó {row.i} —</span>
                <input
                  disabled={!canManage}
                  value={row.nyitas}
                  onChange={(e) => updateRow(index, { nyitas: e.target.value })}
                  placeholder="nyitásirány"
                  style={HW_PLAIN_INPUT}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: "none" }}>
                <input
                  disabled={!canManage}
                  value={row.pant}
                  onChange={(e) => updateRow(index, { pant: e.target.value })}
                  placeholder="pánt"
                  style={{ ...HW_PLAIN_INPUT, width: "90px", color: "#55534c", textAlign: "right" }}
                />
                {canManage && (
                  <button onClick={() => removeRow(index)} title="Törlés" style={{ border: "none", background: "none", color: "#c0c0b8", cursor: "pointer", fontSize: "14px" }}>
                    ×
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "4px 10px", padding: "8px 10px" }}>
              <div>
                <div style={HW_FIELD_LABEL}>Lap</div>
                <input disabled={!canManage} value={row.lap} onChange={(e) => updateRow(index, { lap: e.target.value })} style={HW_HAND_INPUT} />
              </div>
              <div>
                <div style={HW_FIELD_LABEL}>Tok</div>
                <input disabled={!canManage} value={row.tok} onChange={(e) => updateRow(index, { tok: e.target.value })} style={HW_HAND_INPUT} />
              </div>
              <div>
                <div style={HW_FIELD_LABEL}>Üveg</div>
                <input disabled={!canManage} value={row.uveg} onChange={(e) => updateRow(index, { uveg: e.target.value })} style={{ ...HW_HAND_INPUT, color: "var(--text-ink)" }} />
              </div>
              <div>
                <div style={HW_FIELD_LABEL}>Zár</div>
                <input disabled={!canManage} value={row.zar} onChange={(e) => updateRow(index, { zar: e.target.value })} style={HW_PLAIN_INPUT} />
              </div>
              <div>
                <div style={HW_FIELD_LABEL}>Kilincs</div>
                <input disabled={!canManage} value={row.kilincs} onChange={(e) => updateRow(index, { kilincs: e.target.value })} style={HW_PLAIN_INPUT} />
              </div>
              <div>
                <div style={HW_FIELD_LABEL}>CNC</div>
                <input disabled={!canManage} value={row.cnc} onChange={(e) => updateRow(index, { cnc: e.target.value })} style={HW_PLAIN_INPUT} />
              </div>
            </div>
            {(row.megj || canManage) && (
              <div style={{ borderTop: "1px dashed var(--line-input)", padding: "4px 10px" }}>
                <input
                  disabled={!canManage}
                  value={row.megj}
                  onChange={(e) => updateRow(index, { megj: e.target.value })}
                  placeholder="megjegyzés"
                  style={{ fontFamily: "var(--font-hand)", fontSize: "18px", fontWeight: 600, color: "var(--marker-red)", border: "none", background: "transparent", width: "100%" }}
                />
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>Nincs még felvéve vasalat-sor.</div>}
      </div>
    </div>
  );
}

export function ProjectSubSheets({ projectKey, canManage }: { projectKey: string; canManage: boolean }) {
  const [tab, setTab] = useState<SubTabId>("quantities");

  return (
    <div style={{ border: "1.5px solid var(--line-strong)", background: "#fff", padding: "14px 16px", marginTop: "14px" }}>
      <div className="no-print" style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              border: "1px solid var(--line-strong)",
              background: tab === t.id ? "var(--chrome-bg)" : "#fff",
              color: tab === t.id ? "#fff" : "var(--text-ink)",
              fontWeight: 700,
              fontSize: "12.5px",
              padding: "5px 12px",
              cursor: "pointer",
              borderRadius: "3px",
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => printOnly("subsheet")}
          style={{
            marginLeft: "auto",
            border: "none",
            background: "var(--chrome-bg)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "12.5px",
            padding: "5px 12px",
            cursor: "pointer",
            borderRadius: "3px",
            letterSpacing: ".3px",
          }}
        >
          Nyomtatás
        </button>
      </div>
      {tab === "quantities" && <QuantitiesTab projectKey={projectKey} canManage={canManage} />}
      {tab === "cutting" && <CuttingTab projectKey={projectKey} canManage={canManage} />}
      {tab === "hardware" && <HardwareTab projectKey={projectKey} canManage={canManage} />}
    </div>
  );
}
