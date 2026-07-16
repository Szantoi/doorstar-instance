import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  useAddComment,
  useAddImage,
  useDeleteImage,
  useDeleteTask,
  useStations,
  useTask,
  useUpdateTask,
} from "@/services/production/hooks";
import { useUiStore } from "@/store/uiStore";
import { useToastStore } from "@/store/toastStore";
import { useConfirmStore } from "@/store/confirmStore";
import { compressImageFile } from "@/lib/imageCompress";
import { DAY_NAMES } from "@/lib/dates";
import type { Task } from "@/services/production/types";

interface TaskDetailModalProps {
  task: Task;
  flow: string[];
  onClose: () => void;
}

function formatTimestamp(isoString: string): string {
  const d = new Date(isoString);
  return `${d.toLocaleDateString("hu-HU")} ${d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatDuration(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours >= 1) return `${hours.toFixed(1)} óra`;
  return `${Math.max(1, Math.round(ms / 60_000))} perc`;
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: "6px",
};

const FIELD_LABEL: React.CSSProperties = {
  fontSize: "10.5px",
  fontWeight: 700,
  letterSpacing: "0.5px",
  textTransform: "uppercase",
  color: "var(--text-faint)",
  display: "block",
  marginBottom: "2px",
};

const FIELD_INPUT: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--line-input)",
  background: "#fff",
  padding: "4px 6px",
  fontFamily: "var(--font-ui)",
  fontSize: "13px",
};

export function TaskDetailModal({ task, flow, onClose }: TaskDetailModalProps) {
  const { role, myStation } = useUiStore();
  const showToast = useToastStore((s) => s.show);
  const { data: stationsData } = useStations();
  const stations = stationsData?.stations.map((s) => s.key) ?? [];
  const updateTask = useUpdateTask(task.week);
  const deleteTask = useDeleteTask(task.week);
  const { data: detail } = useTask(task.id);
  const addComment = useAddComment(task.id);
  const addImage = useAddImage(task.id);
  const deleteImage = useDeleteImage(task.id);
  const [description, setDescription] = useState(task.description);
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [commentDraft, setCommentDraft] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);

  function submitComment() {
    const text = commentDraft.trim();
    if (!text) return;
    addComment.mutate(text);
    setCommentDraft("");
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setImageError(null);
      const dataUrl = await compressImageFile(file);
      addImage.mutate(dataUrl);
    } catch {
      setImageError("Kép feldolgozása sikertelen.");
    }
  }

  function jumpToStep(index: number) {
    if (!canTouch) return;
    if (index > 0 && !task.depDone) {
      showToast("Ez a feladat még várakozik: a megelőző lépés nincs kész.");
      return;
    }
    const patch: Partial<Task> = { stepIndex: index, acknowledged: true };
    if (task.station === null) patch.station = myStation;
    updateTask.mutate({ id: task.id, patch });
  }

  // Manager can touch any task; a station operator only their own
  // station's work (or an unassigned one) — mirrors the mock's canTouchSel.
  const canTouch = role === "vezeto" || task.station === null || task.station === myStation;
  const touchTitle = !canTouch ? `Csak a saját állomásod (${myStation}) feladatait kezelheted` : undefined;
  // The mock's selLocked is manager-only regardless of station — full
  // metadata editing (title/day/station/priority/due date) is a dispatcher
  // action, distinct from a station operator picking up/advancing their own work.
  const canEditFields = role === "vezeto";
  const showPick = task.stepIndex === 0 && !task.acknowledged;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(20,20,24,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 210 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fcfcf8",
          border: "2px solid var(--line-strong)",
          boxShadow: "var(--shadow-modal)",
          padding: "18px 22px",
          width: "460px",
          maxWidth: "90vw",
          maxHeight: "88vh",
          overflow: "auto",
          fontFamily: "var(--font-ui)",
        }}
      >
        <div style={{ fontFamily: "var(--font-hand)", fontWeight: 700, fontSize: "26px", color: `var(--status-${task.status})`, marginBottom: "4px" }}>
          {task.urgent ? "!! " : ""}
          {title}
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "10px" }}>
          {detail?.project && `${detail.project.name}${detail.project.num ? ` ${detail.project.num}` : ""} · `}
          {task.epicName && `${task.epicName} · `}
          {detail?.epicStep?.quantity != null && `${detail.epicStep.quantity} db · `}
          {detail?.epicStep?.unitHours != null && `${detail.epicStep.unitHours} ó/db`}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            marginBottom: "12px",
            opacity: canEditFields ? 1 : 0.6,
          }}
        >
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={FIELD_LABEL}>Feladat</label>
            <input
              value={title}
              disabled={!canEditFields}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== task.title && updateTask.mutate({ id: task.id, patch: { title } })}
              style={FIELD_INPUT}
            />
          </div>
          <div>
            <label style={FIELD_LABEL}>Nap</label>
            <select
              value={task.day}
              disabled={!canEditFields}
              onChange={(e) => updateTask.mutate({ id: task.id, patch: { day: Number(e.target.value) } })}
              style={FIELD_INPUT}
            >
              {DAY_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={FIELD_LABEL}>Állomás</label>
            <select
              value={task.station ?? ""}
              disabled={!canEditFields}
              onChange={(e) => updateTask.mutate({ id: task.id, patch: { station: e.target.value || null } })}
              style={FIELD_INPUT}
            >
              <option value="">Szabad</option>
              {stations.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={FIELD_LABEL}>Prioritás</label>
            <select
              value={task.urgent ? "1" : "0"}
              disabled={!canEditFields}
              onChange={(e) => updateTask.mutate({ id: task.id, patch: { urgent: e.target.value === "1" } })}
              style={FIELD_INPUT}
            >
              <option value="0">Normál</option>
              <option value="1">Sürgős</option>
            </select>
          </div>
          <div>
            <label style={FIELD_LABEL}>Határidő</label>
            <input
              type="date"
              value={dueDate}
              disabled={!canEditFields}
              onChange={(e) => setDueDate(e.target.value)}
              onBlur={() => dueDate !== (task.dueDate ?? "") && updateTask.mutate({ id: task.id, patch: { dueDate: dueDate || null } })}
              style={FIELD_INPUT}
            />
          </div>
        </div>

        {task.dependsOnId && (
          <div
            style={{
              border: `1.5px solid ${task.depDone ? "var(--marker-green)" : "var(--marker-orange)"}`,
              background: task.depDone ? "var(--surface-pool)" : "var(--surface-assigned)",
              padding: "6px 10px",
              fontSize: "12.5px",
              marginBottom: "12px",
            }}
          >
            <strong>{task.dependsOnTitle ?? "Előző lépés"}</strong>
            {" — "}
            {task.depDone ? (
              <span style={{ color: "var(--marker-green)" }}>Kész — elkezdhető</span>
            ) : (
              <span style={{ color: "var(--marker-orange)" }}>Még nincs kész — nem kezdhető el</span>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
          {flow.map((name, i) => {
            const currentIndex = Math.min(task.stepIndex, flow.length - 1);
            const isCurrent = currentIndex === i;
            const isTerminal = i === flow.length - 1;
            const blocked = i > 0 && !task.depDone;
            return (
              <button
                key={name}
                disabled={!canTouch || blocked}
                title={!canTouch ? touchTitle : blocked ? "A megelőző lépés még nincs kész" : undefined}
                onClick={() => jumpToStep(i)}
                style={{
                  border: "2px solid var(--line-strong)",
                  borderRadius: "4px",
                  padding: "5px 12px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  letterSpacing: "0.3px",
                  cursor: !canTouch || blocked ? "not-allowed" : "pointer",
                  opacity: !canTouch || blocked ? 0.55 : 1,
                  background: isCurrent ? (isTerminal ? "var(--marker-green)" : i === 0 ? "var(--marker-orange)" : "var(--marker-blue)") : "#fff",
                  color: isCurrent ? "#fff" : "var(--text-ink)",
                  borderColor: isCurrent ? "transparent" : "var(--line-strong)",
                }}
              >
                {name}
              </button>
            );
          })}
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== task.description && updateTask.mutate({ id: task.id, patch: { description } })}
          placeholder="Megjegyzés…"
          style={{ width: "100%", minHeight: "70px", border: "1px solid var(--line-input)", padding: "6px 8px", fontFamily: "var(--font-ui)", fontSize: "13px", marginBottom: "14px" }}
        />

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          {showPick && (
            <Button
              variant="primary"
              disabled={!canTouch}
              title={touchTitle}
              onClick={() => {
                if (!canTouch) return;
                const patch: Partial<Task> = { acknowledged: true };
                if (task.station === null) patch.station = myStation;
                updateTask.mutate({ id: task.id, patch });
              }}
            >
              {task.station === null ? `Felveszem — ${myStation}` : "Felveszem"}
            </Button>
          )}
          <Button
            variant={task.problem ? "primary" : "danger"}
            disabled={!canTouch}
            title={touchTitle}
            style={task.problem ? { background: "var(--marker-red)" } : undefined}
            onClick={() => canTouch && updateTask.mutate({ id: task.id, patch: { problem: !task.problem } })}
          >
            {task.problem ? "Probléma törlése" : "Probléma jelzése"}
          </Button>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <div style={SECTION_LABEL}>Fényképek</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "6px" }}>
            {(detail?.images ?? []).map((img) => (
              <div key={img.id} style={{ position: "relative" }}>
                <img
                  src={img.url}
                  alt=""
                  style={{ width: "64px", height: "64px", objectFit: "cover", border: "1px solid var(--line-input)", display: "block" }}
                />
                <button
                  onClick={() => deleteImage.mutate(img.id)}
                  title="Törlés"
                  style={{
                    position: "absolute",
                    top: "-6px",
                    right: "-6px",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    border: "1px solid var(--line-strong)",
                    background: "#fff",
                    color: "var(--marker-red)",
                    fontSize: "11px",
                    lineHeight: "16px",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <label
              style={{
                width: "64px",
                height: "64px",
                border: "1px dashed var(--line-input)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                color: "var(--text-muted)",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              + Kép
              <input type="file" accept="image/*" onChange={handleImageSelect} style={{ display: "none" }} />
            </label>
          </div>
          {imageError && <div style={{ fontSize: "11.5px", color: "var(--marker-red)" }}>{imageError}</div>}
        </div>

        <div style={{ marginBottom: "14px" }}>
          <div style={SECTION_LABEL}>Hozzászólások</div>
          <div style={{ maxHeight: "120px", overflow: "auto", marginBottom: "6px" }}>
            {(detail?.comments ?? []).map((c) => (
              <div key={c.id} style={{ fontSize: "12.5px", marginBottom: "6px", lineHeight: 1.4 }}>
                <span style={{ color: "var(--text-faint)", marginRight: "6px" }}>{formatTimestamp(c.createdAt)}</span>
                {c.text}
              </div>
            ))}
            {detail && detail.comments.length === 0 && (
              <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>Még nincs hozzászólás.</div>
            )}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
              placeholder="Új hozzászólás…"
              style={{ flex: 1, border: "1px solid var(--line-input)", padding: "5px 7px", fontFamily: "var(--font-ui)", fontSize: "13px" }}
            />
            <Button variant="outline" onClick={submitComment}>
              Küld
            </Button>
          </div>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <div style={SECTION_LABEL}>Előzmények</div>
          <div style={{ maxHeight: "140px", overflow: "auto" }}>
            {(detail?.audit ?? []).map((entry, i) => {
              const isNewest = i === 0;
              const older = detail!.audit[i + 1];
              const durationLabel = isNewest
                ? `eddig: ${formatDuration(Date.now() - new Date(entry.at).getTime())}`
                : older
                  ? formatDuration(new Date(entry.at).getTime() - new Date(older.at).getTime())
                  : null;
              return (
                <div key={entry.id} style={{ fontSize: "12.5px", marginBottom: "5px", display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <span>
                    <span style={{ color: "var(--text-faint)", marginRight: "6px" }}>{formatTimestamp(entry.at)}</span>
                    {entry.label}
                  </span>
                  {durationLabel && (
                    <span style={{ color: "var(--text-faint)", whiteSpace: "nowrap" }}>{durationLabel}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
          <Button
            variant="danger"
            onClick={async () => {
              if (!(await useConfirmStore.getState().ask(`Biztosan törlöd a(z) "${task.title}" feladatot?`))) return;
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
