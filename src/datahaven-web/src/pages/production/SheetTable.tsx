import { useEffect, useState } from "react";

export interface SheetColumn<T> {
  key: keyof T;
  label: string;
  width?: string;
  type?: "text" | "number";
}

interface SheetTableProps<T> {
  columns: SheetColumn<T>[];
  rows: T[];
  emptyRow: () => T;
  canManage: boolean;
  onSave: (rows: T[]) => void;
  saving?: boolean;
}

/** Generic editable grid for the munkalap's free-form sub-sheets (quantities,
 * cutting list, hardware). Local-state edit + explicit save, same pattern as
 * ProjectDetailPage's epic/step grid — see that file's comment for why. */
export function SheetTable<T extends Record<string, unknown>>({
  columns,
  rows: initialRows,
  emptyRow,
  canManage,
  onSave,
  saving,
}: SheetTableProps<T>) {
  const [rows, setRows] = useState<T[]>(initialRows);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setRows(initialRows);
    setDirty(false);
  }, [initialRows]);

  function updateCell(index: number, key: keyof T, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
    setDirty(true);
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
    setDirty(true);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                style={{ textAlign: "left", padding: "3px 8px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".5px", width: col.width }}
              >
                {col.label}
              </th>
            ))}
            {canManage && <th style={{ width: "30px" }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((col) => (
                <td key={String(col.key)} style={{ borderBottom: "1px solid var(--line-softer)", padding: "2px 8px" }}>
                  <input
                    type={col.type ?? "text"}
                    disabled={!canManage}
                    value={String(row[col.key] ?? "")}
                    onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
                    style={{ width: "100%", fontSize: "12px", border: "1px solid var(--line-softer)", background: "#fff", padding: "2px 3px", fontWeight: 600 }}
                  />
                </td>
              ))}
              {canManage && (
                <td style={{ borderBottom: "1px solid var(--line-softer)", padding: "2px 8px" }}>
                  <button onClick={() => removeRow(rowIndex)} title="Törlés" style={{ border: "none", background: "none", color: "#c0c0b8", cursor: "pointer", fontSize: "13px" }}>
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {canManage && (
        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          <button onClick={addRow} style={{ border: "1.5px dashed var(--line-strong)", background: "transparent", color: "var(--line-strong)", fontWeight: 700, fontSize: "12.5px", padding: "4px 12px", cursor: "pointer", borderRadius: "3px" }}>
            + Sor
          </button>
          {dirty && (
            <button
              onClick={() => {
                onSave(rows);
                setDirty(false);
              }}
              disabled={saving}
              style={{ border: "none", background: "var(--marker-blue)", color: "#fff", fontWeight: 700, fontSize: "12.5px", padding: "4px 14px", cursor: "pointer", borderRadius: "3px" }}
            >
              Mentés
            </button>
          )}
        </div>
      )}
    </div>
  );
}
