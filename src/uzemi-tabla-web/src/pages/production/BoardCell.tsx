import { useDroppable } from "@dnd-kit/core";
import { useState } from "react";
import type { Task } from "@/services/production/types";
import { DraggableTaskCard } from "./DraggableTaskCard";

interface BoardCellProps {
  cellId: string;
  station: string | null;
  day: number;
  tasks: Task[];
  canManage: boolean;
  onOpen: (task: Task) => void;
  onQuickAdd: (title: string) => void;
  pool?: boolean;
}

export function BoardCell({ cellId, tasks, canManage, onOpen, onQuickAdd, pool }: BoardCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function submit() {
    const title = draft.trim();
    if (title) onQuickAdd(title);
    setDraft("");
    setAdding(false);
  }

  return (
    <div
      ref={setNodeRef}
      onDoubleClick={() => canManage && !adding && setAdding(true)}
      style={{
        flex: 1,
        minWidth: "150px",
        borderRight: "2px solid var(--line-strong)",
        padding: pool ? "6px 8px 24px" : "6px 8px 24px",
        minHeight: pool ? "64px" : "92px",
        position: "relative",
        background: isOver ? "var(--surface-today)" : undefined,
      }}
    >
      {tasks.length > 1 && (
        <div
          title="Feladatok száma ezen a napon"
          style={{
            position: "absolute",
            top: "4px",
            right: "4px",
            minWidth: "18px",
            height: "18px",
            borderRadius: "50%",
            background: "var(--chrome-bg)",
            color: "#fff",
            fontSize: "11px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
            boxShadow: "1px 1px 2px rgba(0,0,0,.3)",
          }}
        >
          {tasks.length}
        </div>
      )}
      {tasks.map((t) => (
        <DraggableTaskCard key={t.id} task={t} onOpen={onOpen} />
      ))}
      {adding ? (
        <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            onBlur={submit}
            placeholder="Új feladat…"
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              borderBottom: "1px dashed var(--line-input)",
              background: "transparent",
              outline: "none",
              fontFamily: "var(--font-hand)",
              fontSize: "19px",
              fontWeight: 600,
              color: "var(--marker-blue)",
            }}
          />
        </div>
      ) : (
        canManage && (
          <button
            onClick={() => setAdding(true)}
            title="Új feladat felírása"
            style={{
              position: "absolute",
              bottom: "3px",
              right: "3px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "16px",
              color: "#c9c7ba",
              padding: "2px 5px",
              lineHeight: 1,
              transform: "rotate(90deg)",
            }}
          >
            ✎
          </button>
        )
      )}
    </div>
  );
}
