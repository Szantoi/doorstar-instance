import { useDroppable } from "@dnd-kit/core";
import { useRef, useState } from "react";
import type { ProjectCard, Task } from "@/services/production/types";
import { DraggableTaskCard } from "./DraggableTaskCard";

interface BoardCellProps {
  cellId: string;
  station: string | null;
  day: number;
  tasks: Task[];
  canManage: boolean;
  onOpen: (task: Task) => void;
  onQuickAdd: (title: string, projectKey?: string) => Promise<boolean>;
  projects: ProjectCard[];
  pool?: boolean;
}

export function BoardCell({ cellId, tasks, canManage, onOpen, onQuickAdd, projects, pool }: BoardCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function submit() {
    const title = draft.trim();
    if (!title || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const created = await onQuickAdd(title, projectKey || undefined);
      if (created) cancel();
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  function cancel() {
    setDraft("");
    setProjectKey("");
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
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px", padding: "5px", border: "1px dashed var(--line-input)", background: "#fffef8" }}>
          <input
            autoFocus
            value={draft}
            disabled={isSubmitting}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
              if (e.key === "Escape") cancel();
            }}
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
          <select
            value={projectKey}
            disabled={isSubmitting}
            onChange={(e) => setProjectKey(e.target.value)}
            aria-label="Feladat projektje"
            style={{ minWidth: 0, border: "1px solid var(--line-input)", background: "#fff", color: "var(--text-ink)", fontSize: "12px", padding: "3px 4px" }}
          >
            <option value="">Szabad feladat — nincs projekt</option>
            {projects.map((project) => (
              <option key={project.key} value={project.key}>
                {project.num ? `${project.num} — ` : ""}{project.name}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: "4px" }}>
            <button type="button" disabled={isSubmitting} onClick={() => void submit()} style={{ border: "none", background: isSubmitting ? "#9fb8c5" : "var(--marker-blue)", color: "#fff", fontWeight: 700, fontSize: "11px", padding: "3px 8px", cursor: isSubmitting ? "wait" : "pointer" }}>{isSubmitting ? "Mentés…" : "Felírom"}</button>
            <button type="button" disabled={isSubmitting} onClick={cancel} style={{ border: "1px solid var(--line-input)", background: "#fff", color: "var(--text-muted)", fontSize: "11px", padding: "3px 8px", cursor: isSubmitting ? "wait" : "pointer" }}>Mégse</button>
          </div>
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
