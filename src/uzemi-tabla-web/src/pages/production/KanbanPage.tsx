import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useUiStore } from "@/store/uiStore";
import { useToastStore } from "@/store/toastStore";
import { useConfirmStore } from "@/store/confirmStore";
import {
  useDeleteWorkflowColumn,
  useKanban,
  useSaveStationWorkflow,
  useStations,
  useUpdateTask,
} from "@/services/production/hooks";
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
  const { week, role, myStation } = useUiStore();
  const showToast = useToastStore((s) => s.show);
  const { data: stationsData } = useStations();
  const stations = stationsData?.stations.map((s) => s.key) ?? [];
  const [searchParams] = useSearchParams();
  const paramStation = searchParams.get("station");
  const [station, setStation] = useState<string>("");

  // Board's per-station link (?station=X) picks the initial tab once the
  // station list has loaded; a later manual tab click always wins after that.
  useEffect(() => {
    if (station || stations.length === 0) return;
    setStation(paramStation && stations.includes(paramStation) ? paramStation : stations[0]);
  }, [station, stations, paramStation]);

  const activeStation = station || stations[0] || "";
  // A station operator may only act on the currently-viewed tab if it's
  // their own — switching tabs to browse another station is fine, acting
  // on it (Felveszem, drag) is not. Mirrors the mock's onPick role checks.
  const canActOnTab = role === "vezeto" || myStation === activeStation;

  const { data: kanban } = useKanban(activeStation);
  const updateTask = useUpdateTask(week);
  const saveWorkflow = useSaveStationWorkflow(activeStation);
  const deleteColumn = useDeleteWorkflowColumn(activeStation);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const canManageColumns = role === "vezeto";

  function addColumn() {
    if (!kanban) return;
    const name = window.prompt("Új oszlop neve:");
    if (!name?.trim()) return;
    const steps = [...kanban.flow];
    steps.splice(Math.max(steps.length - 1, 0), 0, name.trim());
    saveWorkflow.mutate(steps);
  }

  function renameColumn(index: number) {
    if (!kanban) return;
    const name = window.prompt("Oszlop új neve:", kanban.flow[index]);
    if (!name?.trim() || name.trim() === kanban.flow[index]) return;
    const steps = kanban.flow.map((s, i) => (i === index ? name.trim() : s));
    saveWorkflow.mutate(steps);
  }

  async function removeColumn(index: number) {
    if (!kanban) return;
    if (!(await useConfirmStore.getState().ask(`Biztosan törlöd a(z) "${kanban.flow[index]}" oszlopot?`))) return;
    deleteColumn.mutate(index);
  }
  // See BoardPage: a distance threshold keeps a plain click from being
  // swallowed as a zero-distance drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !kanban) return;
    const columnIndex = kanban.columns.findIndex((c) => c.name === over.id);
    if (columnIndex === -1) return;
    const task = (active.data.current as { task: Task & { designatedStation?: string | null } } | undefined)?.task;
    if (!task) return;
    if (task.station === null && task.designatedStation && task.designatedStation !== activeStation) {
      // Free-pool task planned for a different station — dragging it here
      // must not silently reassign it (mirrors the "Felveszem" button rule).
      return;
    }
    if (!canActOnTab) {
      showToast(`Ez nem a te állomásod kanbanja — csak a sajátodon (${myStation}) vehetsz fel feladatot.`);
      return;
    }
    if (columnIndex > 0 && !task.depDone) {
      showToast("Ez a feladat még várakozik: a megelőző lépés nincs kész.");
      return;
    }
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

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="kanban-layout">
          <div className="kanban-sidebar">
            <div style={{ background: "var(--surface-assigned)", border: "2px solid var(--line-strong)", boxShadow: "var(--shadow-panel)" }}>
              <div style={{ background: "var(--marker-orange)", color: "#fff", fontWeight: 700, fontSize: "13px", letterSpacing: "1.2px", textTransform: "uppercase", padding: "6px 12px" }}>
                Kiosztva — még nem kezdte el
              </div>
              <div style={{ padding: "8px", minHeight: "60px" }}>
                {kanban.assigned.map((t) => (
                  <div key={t.id} style={{ border: "1px solid #e3b57a", background: "#fff", marginBottom: "8px", padding: "7px 9px" }}>
                    <DraggableTaskCard task={t} onOpen={setOpenTask} />
                    <button
                      disabled={!canActOnTab}
                      title={!canActOnTab ? `Válts a saját állomásodra (${myStation}) a felvételhez` : undefined}
                      onClick={() => updateTask.mutate({ id: t.id, patch: { acknowledged: true } })}
                      style={{
                        marginTop: "5px",
                        border: "1px solid var(--marker-orange)",
                        background: canActOnTab ? "var(--marker-orange)" : "#ccc",
                        color: canActOnTab ? "#fff" : "#777",
                        fontWeight: 600,
                        fontSize: "12px",
                        padding: "3px 10px",
                        cursor: canActOnTab ? "pointer" : "not-allowed",
                        borderRadius: "3px",
                      }}
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
                Szabad feladatok
              </div>
              <div style={{ padding: "8px", minHeight: "120px" }}>
                {kanban.pool.map((t) => {
                  const foreign = !!t.designatedStation && t.designatedStation !== activeStation;
                  const blocked = foreign || !canActOnTab;
                  const reason = foreign
                    ? `Ez a(z) ${t.designatedStation} állomás feladata`
                    : !canActOnTab
                      ? `Válts a saját állomásodra (${myStation}) a felvételhez`
                      : undefined;
                  return (
                    <div key={t.id} style={{ border: "1px dashed #b9a24a", background: "#fff", marginBottom: "8px", padding: "7px 9px" }}>
                      <DraggableTaskCard task={t} onOpen={setOpenTask} />
                      <button
                        disabled={blocked}
                        title={reason}
                        onClick={() => updateTask.mutate({ id: t.id, patch: { station: activeStation } })}
                        style={{
                          marginTop: "5px",
                          border: "1px solid var(--line-strong)",
                          background: blocked ? "#ccc" : "var(--chrome-bg)",
                          color: blocked ? "#777" : "#fff",
                          fontWeight: 600,
                          fontSize: "12px",
                          padding: "3px 10px",
                          cursor: blocked ? "not-allowed" : "pointer",
                          borderRadius: "3px",
                        }}
                      >
                        {foreign ? `${t.designatedStation} feladata` : "Felveszem"}
                      </button>
                    </div>
                  );
                })}
                {kanban.pool.length === 0 && <div style={{ fontSize: "12.5px", color: "#a9a79e", padding: "6px" }}>Nincs szabad feladat.</div>}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", gap: "12px", alignItems: "flex-start", overflowX: "auto" }}>
            {kanban.columns.map((col, index) => {
              const canDeleteThis = canManageColumns && kanban.flow.length > 2 && index !== 0 && index !== kanban.flow.length - 1;
              return (
                <div key={col.name} style={{ flex: 1, minWidth: "220px", background: "var(--surface-board)", border: "2px solid var(--line-strong)", boxShadow: "var(--shadow-panel)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid var(--line-strong)", padding: "6px 10px", gap: "6px" }}>
                    <div style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "1.2px", textTransform: "uppercase" }}>{col.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {canManageColumns && (
                        <button
                          onClick={() => renameColumn(index)}
                          title="Átnevezés"
                          style={{ border: "none", background: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: "12px", padding: "0 2px" }}
                        >
                          ✎
                        </button>
                      )}
                      {canDeleteThis && (
                        <button
                          onClick={() => removeColumn(index)}
                          title="Oszlop törlése"
                          style={{ border: "none", background: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: "13px", padding: "0 2px" }}
                        >
                          ×
                        </button>
                      )}
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff", background: col.isTerminal ? "var(--marker-green)" : "var(--marker-blue)", borderRadius: "10px", padding: "1px 8px" }}>
                        {col.tasks.length}
                      </div>
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
              );
            })}
            {canManageColumns && (
              <button
                onClick={addColumn}
                style={{
                  flex: "none",
                  alignSelf: "flex-start",
                  border: "1.5px dashed var(--line-strong)",
                  background: "transparent",
                  color: "var(--line-strong)",
                  fontWeight: 700,
                  fontSize: "12.5px",
                  padding: "8px 14px",
                  cursor: "pointer",
                  borderRadius: "3px",
                }}
              >
                + Oszlop
              </button>
            )}
          </div>
        </div>
      </DndContext>

      {openTask && (
        <TaskDetailModal task={openTask} flow={kanban.flow} onClose={() => setOpenTask(null)} />
      )}
    </div>
  );
}
