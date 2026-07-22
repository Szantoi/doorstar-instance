import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useUiStore } from "@/store/uiStore";
import { useToastStore } from "@/store/toastStore";
import { useBoard, useCreateTask, useProjects, useSaveWeekNote, useStations, useUpdateTask } from "@/services/production/hooks";
import { addDays, DAY_NAMES, iso } from "@/lib/dates";
import { BoardCell } from "./BoardCell";
import { OrderChecklist } from "./OrderChecklist";
import { TaskDetailModal } from "./TaskDetailModal";
import type { Task } from "@/services/production/types";

const LEGEND = [
  { label: "Narancs", color: "var(--marker-orange)", text: "= kiosztva, nincs felvéve" },
  { label: "Kék", color: "var(--marker-blue)", text: "= felvett / folyamatban" },
  { label: "Zöld ✓", color: "var(--marker-green)", text: "= kész" },
  { label: "Piros", color: "var(--marker-red)", text: "= probléma" },
];

function cellId(station: string | null, day: number) {
  return `${station ?? "__pool__"}::${day}`;
}

export function BoardPage() {
  const { role, myStation, week } = useUiStore();
  const canManage = role === "vezeto";
  const showToast = useToastStore((s) => s.show);
  const { data: stationsData } = useStations();
  const stations = useMemo(() => stationsData?.stations.map((s) => s.key) ?? [], [stationsData]);

  const { data: board, isLoading } = useBoard(week);
  const { data: projects = [] } = useProjects();
  const createTask = useCreateTask(week);
  const updateTask = useUpdateTask(week);
  const saveNote = useSaveWeekNote(week);

  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  // A minimum drag distance so a plain click (which dnd-kit would otherwise
  // treat as a zero-distance drag, swallowing the card's onClick) opens the
  // task modal instead of silently "dropping" the card back where it was.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const todayIso = iso(new Date());

  const tasksByCell = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of board?.tasks ?? []) {
      const key = cellId(t.station, t.day);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [board]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const [station, dayStr] = String(over.id).split("::");
    const day = Number(dayStr);
    const task = (active.data.current as { task: Task } | undefined)?.task;
    if (!task) return;
    const nextStation = station === "__pool__" ? null : station;
    if (task.station === nextStation && task.day === day) return;

    if (!canManage) {
      // A station operator may only move their own (or unassigned) tasks,
      // and only ever onto their own station's column — never into the
      // pool or another station's row. Mirrors the mock's canDrag/dropTo.
      const mayTouch = task.station === null || task.station === myStation;
      const validTarget = nextStation === myStation;
      if (!mayTouch || !validTarget) {
        showToast(`Csak a saját állomásod (${myStation}) oszlopába helyezhetsz át feladatot.`);
        return;
      }
    }

    updateTask.mutate({ id: task.id, patch: { station: nextStation, day } });
  }

  if (isLoading || !board) {
    return <div style={{ padding: "24px" }}>Betöltés…</div>;
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 28px" }}>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          style={{
            minWidth: "1420px",
            background: "linear-gradient(135deg,#e8e8ea,#b9b9bd 40%,#dcdcde 60%,#a9a9ad)",
            borderRadius: "8px",
            padding: "11px",
            boxShadow: "var(--shadow-frame), inset 0 1px 0 rgba(255,255,255,.7)",
          }}
        >
          <div style={{ background: "var(--surface-board)", border: "1px solid #bdbdb6", display: "flex" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Day header */}
              <div style={{ display: "flex", borderBottom: "3px solid var(--line-strong)" }}>
                <div style={{ width: "84px", flex: "none", borderRight: "3px solid var(--line-strong)" }} />
                {Array.from({ length: 7 }, (_, day) => {
                  const date = addDays(week, day);
                  const isToday = iso(date) === todayIso;
                  return (
                    <div
                      key={day}
                      style={{
                        flex: 1,
                        minWidth: "150px",
                        borderRight: "2px solid var(--line-strong)",
                        padding: "7px 10px 5px",
                        display: "flex",
                        alignItems: "baseline",
                        gap: "10px",
                        background: isToday ? "var(--surface-today)" : undefined,
                      }}
                    >
                      <div style={{ background: "var(--chrome-bg)", color: "#fff", fontWeight: 700, fontSize: "14px", letterSpacing: "1.5px", textTransform: "uppercase", padding: "2px 12px" }}>
                        {DAY_NAMES[day]}
                      </div>
                      <div style={{ fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: "24px", color: "var(--marker-blue)" }}>
                        {date.getMonth() + 1}.{date.getDate()}.
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pool row */}
              <div style={{ display: "flex", borderBottom: "3px solid var(--line-strong)", background: "var(--surface-pool)" }}>
                <div style={{ width: "84px", flex: "none", borderRight: "3px solid var(--line-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontWeight: 700, fontSize: "12px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#8a6d1a", padding: "8px 0" }}>
                    Szabad
                  </div>
                </div>
                {Array.from({ length: 7 }, (_, day) => (
                  <BoardCell
                    key={day}
                    cellId={cellId(null, day)}
                    station={null}
                    day={day}
                    pool
                    tasks={tasksByCell.get(cellId(null, day)) ?? []}
                    canManage={canManage}
                    onOpen={setOpenTask}
                    projects={projects}
                    onQuickAdd={async (title, projectKey) => {
                      try {
                        await createTask.mutateAsync({ title, projectKey, station: null, week, day });
                        return true;
                      } catch {
                        showToast("A feladat mentése nem sikerült. A beírt adatok megmaradtak.");
                        return false;
                      }
                    }}
                  />
                ))}
              </div>

              {/* Station rows */}
              {stations.map((station) => (
                <div key={station} style={{ display: "flex", borderBottom: "2px solid var(--line-strong)" }}>
                  <div style={{ width: "84px", flex: "none", borderRight: "3px solid var(--line-strong)", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-row-head)" }}>
                    <Link
                      to={`/kanban?station=${encodeURIComponent(station)}`}
                      title="Állomás kanban megnyitása"
                      style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                        fontWeight: 600,
                        fontSize: "12.5px",
                        letterSpacing: "1.2px",
                        textTransform: "uppercase",
                        padding: "10px 0",
                        cursor: "pointer",
                        border: "1px solid #9a9a94",
                        background: "#fff",
                        color: "var(--text-ink)",
                        textDecoration: "none",
                      }}
                    >
                      {station}
                    </Link>
                  </div>
                  {Array.from({ length: 7 }, (_, day) => (
                    <BoardCell
                      key={day}
                      cellId={cellId(station, day)}
                      station={station}
                      day={day}
                      tasks={tasksByCell.get(cellId(station, day)) ?? []}
                      canManage={canManage}
                      onOpen={setOpenTask}
                      projects={projects}
                      onQuickAdd={async (title, projectKey) => {
                        try {
                          await createTask.mutateAsync({ title, projectKey, station, week, day });
                          return true;
                        } catch {
                          showToast("A feladat mentése nem sikerült. A beírt adatok megmaradtak.");
                          return false;
                        }
                      }}
                    />
                  ))}
                </div>
              ))}

              {/* Info row */}
              <div style={{ display: "flex" }}>
                <div style={{ width: "84px", flex: "none", borderRight: "3px solid var(--line-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontWeight: 700, fontSize: "12px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#666", padding: "8px 0" }}>
                    Infó
                  </div>
                </div>
                <textarea
                  value={noteDraft ?? board.infoNote}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={() => noteDraft != null && saveNote.mutate(noteDraft)}
                  placeholder="Heti megjegyzések, mint a tábla alján…"
                  style={{ flex: 1, border: "none", outline: "none", resize: "none", background: "transparent", fontFamily: "var(--font-hand)", fontSize: "21px", fontWeight: 600, color: "var(--marker-blue)", padding: "8px 14px", minHeight: "70px", lineHeight: 1.35 }}
                />
              </div>
            </div>

            <OrderChecklist canManage={canManage} />
          </div>
        </div>
      </DndContext>

      <div style={{ marginTop: "10px", fontSize: "13px", color: "var(--text-muted)", display: "flex", gap: "18px", flexWrap: "wrap" }}>
        {LEGEND.map((l) => (
          <span key={l.label}>
            <b style={{ color: l.color }}>{l.label}</b> {l.text}
          </span>
        ))}
        <span>
          ✎ toll a cella sarkában: új feladat · Húzás: áthelyezés · Kattintás a feladatra: munkalap · Kattintás az állomás címkéjére: saját kanban
        </span>
      </div>

      {openTask && (
        <TaskDetailModal
          task={openTask}
          flow={stationsData?.stations.find((s) => s.key === openTask.station)?.defaultWorkflow ?? ["Felvett", "Folyamatban", "Kész"]}
          onClose={() => setOpenTask(null)}
        />
      )}
    </div>
  );
}
