import { useState } from "react";
import { useSaveSheet, useSheet } from "@/services/production/hooks";
import { SheetTable, type SheetColumn } from "./SheetTable";
import type { CuttingRow, HardwareRow, QuantitiesSheet, QuantityBreakRow, QuantityRow, HardwareSheet, CuttingSheet } from "@/services/production/types";

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

const HARDWARE_COLUMNS: SheetColumn<HardwareRow>[] = [
  { key: "i", label: "#", width: "50px", type: "number" },
  { key: "nyitas", label: "Nyitásirány" },
  { key: "pant", label: "Pánt" },
  { key: "lap", label: "Lap (mm)" },
  { key: "tok", label: "Tok (mm)" },
  { key: "uveg", label: "Üveg (mm)" },
  { key: "zar", label: "Zár" },
  { key: "kilincs", label: "Kilincs" },
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
    <SheetTable
      columns={CUTTING_COLUMNS}
      rows={rows}
      emptyRow={() => ({ i: rows.length + 1, sz: "", h: "", db: 1, anyag: "", megj: "" })}
      canManage={canManage}
      saving={saveSheet.isPending}
      onSave={(next) => saveSheet.mutate({ rows: next })}
    />
  );
}

function HardwareTab({ projectKey, canManage }: { projectKey: string; canManage: boolean }) {
  const { data } = useSheet<HardwareSheet>(projectKey, "HARDWARE");
  const saveSheet = useSaveSheet<HardwareSheet>(projectKey, "HARDWARE");
  const rows = data?.rows ?? [];

  return (
    <SheetTable
      columns={HARDWARE_COLUMNS}
      rows={rows}
      emptyRow={() => ({ i: rows.length + 1, nyitas: "", pant: "", lap: "", tok: "", uveg: "", zar: "", kilincs: "", megj: "" })}
      canManage={canManage}
      saving={saveSheet.isPending}
      onSave={(next) => saveSheet.mutate({ rows: next })}
    />
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
      </div>
      {tab === "quantities" && <QuantitiesTab projectKey={projectKey} canManage={canManage} />}
      {tab === "cutting" && <CuttingTab projectKey={projectKey} canManage={canManage} />}
      {tab === "hardware" && <HardwareTab projectKey={projectKey} canManage={canManage} />}
    </div>
  );
}
