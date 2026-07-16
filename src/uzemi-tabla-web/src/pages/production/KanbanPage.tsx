import { useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useUiStore } from "@/store/uiStore";
import { useKanban, useStations, useUpdateTask } from "@/services/production/hooks";
import { DraggableTaskCard } from "./DraggableTaskCard";
import { TaskDetailModal } from "./TaskDetailModal";
import type { Task } from "@/services/production/types";

function KanbanColumnDrop({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} style={{ padding: "8px", minHeight: "160px", background: isOver ? "var(--surface-today)" : undefined }}>
      {children}
    </div>
  );
}

export function KanbanPage() {
  const { week } = useUiStore();
  const { data: stationsData } = useStations();
  const stations = stationsData?.stations.map((s) => s.key) ?? [];
  const [station, setStation] = useState<string>(stations[0] ?? "");
  const activeStation = station || stations[0] || "";

  const { data: kanban } = useKanban(activeStation, week);
  const updateTask = useUpdateTask(week);
  const [openTask, setOpenTask] = useState<Task | null>(null);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !kanban) return;
    const columnIndex = kanban.columns.findIndex((c) => c.name === over.id);
    if (columnIndex === -1) return;
    const task = (active.data.current as { task: Task } | undefined)?.task;
    if (!task) return;
    updateTask.mutate({ id: task.id, patch: { stepIndex: columnIndex, acknowledged: true, station: activeStation } });
  }

  if (!kanban) return <div style={{ padding: "24px" }}>Betöltés…</div>;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 28px" }}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
        {stations.map((s) => (
          <button
            key={s}
            onClick={() => setStation(s)}
            style={{
              border: "none",
              background: s === activeStation ? "var(--chrome-accent)" : "var(--chrome-control)",
              color: s === activeStation ? "var(--chrome-bg)" : "#eee",
              fontWeight: 600,
              fontSize: "13px",
              padding: "6px 14px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
          <div style={{ width: "230px", flex: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ background: "var(--surface-assigned)", border: "2px solid var(--line-strong)", boxShadow: "var(--shadow-panel)" }}>
              <div style={{ background: "var(--marker-orange)", color: "#fff", fontWeight: 700, fontSize: "13px", letterSpacing: "1.2px", textTransform: "uppercase", padding: "6px 12px" }}>
                Kiosztva — még nem kezdte el
              </div>
              <div style={{ padding: "8px", minHeight: "60px" }}>
                {kanban.assigned.map((t) => (
                  <div key={t.id} style={{ border: "1px solid #e3b57a", background: "#fff", marginBottom: "8px", padding: "7px 9px" }}>
                    <DraggableTaskCard task={t} onOpen={setOpenTask} />
                    <button
                      onClick={() => updateTask.mutate({ id: t.id, patch: { acknowledged: true } })}
                      style={{ marginTop: "5px", border: "1px solid var(--marker-orange)", background: "var(--marker-orange)", color: "#fff", fontWeight: 600, fontSize: "12px", padding: "3px 10px", cursor: "pointer", borderRadius: "3px" }}
                    >
                      Felveszem
                    </button>
                  </div>
                ))}
                {kanban.assigned.length === 0 && <div style={{ fontSize: "12.5px", color: "#a9a79e", padding: "6px" }}>Nincs el nem kezdett kiosztott feladat.</div>}
              </div>
            </div>

            <div style={{ background: "var(--surface-pool)", border: "2px solid var(--line-strong)", boxShadow: "var(--shadow-panel)" }}>
              <div style={{ background: "var(--chrome-bg)", color: "var(--chrome-accent)", fontWeight: 700, fontSize: "13px", letterSpacing: "1.2px", textTransform: "uppercase", padding: "6px 12px" }}>
                Szabad feladatok a héten
              </div>
              <div style={{ padding: "8px", minHeight: "120px" }}>
                {kanban.pool.map((t) => (
                  <div key={t.id} style={{ border: "1px dashed #b9a24a", background: "#fff", marginBottom: "8px", padding: "7px 9px" }}>
                    <DraggableTaskCard task={t} onOpen={setOpenTask} />
                    <button
                      onClick={() => updateTask.mutate({ id: t.id, patch: { station: activeStation } })}
                      style={{ marginTop: "5px", border: "1px solid var(--line-strong)", background: "var(--chrome-bg)", color: "#fff", fontWeight: 600, fontSize: "12px", padding: "3px 10px", cursor: "pointer", borderRadius: "3px" }}
                    >
                      Felveszem
                    </button>
                  </div>
                ))}
                {kanban.pool.length === 0 && <div style={{ fontSize: "12.5px", color: "#a9a79e", padding: "6px" }}>Nincs szabad feladat ezen a héten.</div>}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", gap: "12px", alignItems: "flex-start", overflowX: "auto" }}>
            {kanban.columns.map((col) => (
              <div key={col.name} style={{ flex: 1, minWidth: "220px", background: "var(--surface-board)", border: "2px solid var(--line-strong)", boxShadow: "var(--shadow-panel)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid var(--line-strong)", padding: "6px 10px" }}>
                  <div style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "1.2px", textTransform: "uppercase" }}>{col.name}</div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff", background: col.isTerminal ? "var(--marker-green)" : "var(--marker-blue)", borderRadius: "10px", padding: "1px 8px" }}>
                    {col.tasks.length}
                  </div>
                </div>
                <KanbanColumnDrop id={col.name}>
                  {col.tasks.map((t) => (
                    <div key={t.id} style={{ marginBottom: "6px" }}>
                      <DraggableTaskCard task={t} onOpen={setOpenTask} />
                    </div>
                  ))}
                </KanbanColumnDrop>
              </div>
            ))}
          </div>
        </div>
      </DndContext>

      {openTask && (
        <TaskDetailModal task={openTask} flow={kanban.flow} onClose={() => setOpenTask(null)} />
      )}
    </div>
  );
}
