import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { TaskCard } from "@/components/ui/TaskCard";
import type { Task } from "@/services/production/types";
import { DAY_NAMES } from "@/lib/dates";

function cardMeta(task: Task, showDay: boolean): string {
  const parts: string[] = [];
  if (showDay) parts.push(DAY_NAMES[task.day]);
  if (!task.isDone && !task.depDone) parts.unshift("VÁR AZ ELŐZŐRE");
  if (task.problem && !task.isDone) parts.push("PROBLÉMA");
  if (task.dueDate) parts.push(`hi: ${task.dueDate.slice(5).replace("-", ".")}`);
  if (task.flowLabel) parts.push(task.flowLabel);
  return parts.join(" · ");
}

interface DraggableTaskCardProps {
  task: Task;
  showDay?: boolean;
  onOpen: (task: Task) => void;
}

export function DraggableTaskCard({ task, showDay = false, onOpen }: DraggableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, data: { task } });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1, touchAction: "none" }}
    >
      <TaskCard
        title={task.title}
        status={task.status}
        urgent={task.urgent}
        meta={cardMeta(task, showDay)}
        seed={hashSeed(task.id)}
        onClick={() => onOpen(task)}
      />
    </div>
  );
}

function hashSeed(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}
