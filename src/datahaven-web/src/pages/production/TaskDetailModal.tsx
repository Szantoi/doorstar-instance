import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useDeleteTask, useUpdateTask } from "@/services/production/hooks";
import type { Task } from "@/services/production/types";

interface TaskDetailModalProps {
  task: Task;
  flow: string[];
  onClose: () => void;
}

export function TaskDetailModal({ task, flow, onClose }: TaskDetailModalProps) {
  const updateTask = useUpdateTask(task.week);
  const deleteTask = useDeleteTask(task.week);
  const [description, setDescription] = useState(task.description);

  const canPick = !!task.station && task.stepIndex === 0 && !task.acknowledged;
  const canAdvance = !!task.station && !task.isDone;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(20,20,24,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 210 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fcfcf8", border: "2px solid var(--line-strong)", boxShadow: "var(--shadow-modal)", padding: "18px 22px", width: "420px", maxWidth: "90vw", fontFamily: "var(--font-ui)" }}
      >
        <div style={{ fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: "26px", color: `var(--status-${task.status})`, marginBottom: "4px" }}>
          {task.urgent ? "!! " : ""}
          {task.title}
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "14px" }}>
          {task.station ?? "Szabad"} {task.flowLabel ? `· ${task.flowLabel}` : ""} {!task.depDone && "· VÁR AZ ELŐZŐRE"}
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== task.description && updateTask.mutate({ id: task.id, patch: { description } })}
          placeholder="Megjegyzés…"
          style={{ width: "100%", minHeight: "70px", border: "1px solid var(--line-input)", padding: "6px 8px", fontFamily: "var(--font-ui)", fontSize: "13px", marginBottom: "14px" }}
        />

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          {canPick && (
            <Button variant="primary" onClick={() => updateTask.mutate({ id: task.id, patch: { acknowledged: true } })}>
              Felveszem
            </Button>
          )}
          {canAdvance && (
            <Button
              variant="outline"
              onClick={() =>
                updateTask.mutate({
                  id: task.id,
                  patch: { stepIndex: Math.min(task.stepIndex + 1, flow.length - 1), acknowledged: true },
                })
              }
            >
              Következő lépés ({flow[Math.min(task.stepIndex + 1, flow.length - 1)]})
            </Button>
          )}
          <Button
            variant={task.problem ? "primary" : "danger"}
            style={task.problem ? { background: "var(--marker-red)" } : undefined}
            onClick={() => updateTask.mutate({ id: task.id, patch: { problem: !task.problem } })}
          >
            {task.problem ? "Probléma törlése" : "Probléma jelzése"}
          </Button>
        </div>

        <div style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
          <Button
            variant="danger"
            onClick={() => {
              deleteTask.mutate(task.id);
              onClose();
            }}
          >
            Törlés
          </Button>
          <Button variant="outline" onClick={onClose}>
            Bezár
          </Button>
        </div>
      </div>
    </div>
  );
}
