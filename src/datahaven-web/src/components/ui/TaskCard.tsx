import { forwardRef } from "react";
import type { MarkerStatus } from "./StatusChip";

/** Ported from the design project's components/core/TaskCard.jsx. Purely
 * presentational — drag wiring (dnd-kit useDraggable) happens at the call
 * site so this stays reusable in both the board grid and kanban columns. */
const CARD_COLORS: Record<MarkerStatus, string> = {
  assigned: "var(--status-assigned)",
  inprogress: "var(--status-inprogress)",
  done: "var(--status-done)",
  problem: "var(--status-problem)",
};

interface TaskCardProps {
  title: string;
  status?: MarkerStatus;
  meta?: string;
  urgent?: boolean;
  seed?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const TaskCard = forwardRef<HTMLDivElement, TaskCardProps>(function TaskCard(
  { title, status = "assigned", meta, urgent, seed = 0, onClick, style },
  ref
) {
  const rot = (((seed * 37) % 100) / 100) * 1.6 - 0.8;
  return (
    <div
      ref={ref}
      onClick={onClick}
      style={{
        fontFamily: "var(--font-hand)",
        fontWeight: 700,
        fontSize: "var(--hand-size-card)",
        lineHeight: 1.12,
        color: CARD_COLORS[status],
        cursor: onClick ? "pointer" : "default",
        padding: "3px 4px 4px",
        transform: `rotate(${rot.toFixed(2)}deg)`,
        textDecoration: urgent ? "underline" : "none",
        textDecorationThickness: "2px",
        opacity: status === "done" ? 0.75 : 1,
        ...style,
      }}
    >
      <div>
        {urgent ? "!! " : ""}
        {title}
        {status === "done" && <span style={{ color: "var(--marker-green)" }}> ✓</span>}
      </div>
      {meta && (
        <div style={{ fontFamily: "var(--font-ui)", fontSize: "10.5px", color: "var(--text-faint)", fontWeight: 600, letterSpacing: ".3px" }}>
          {meta}
        </div>
      )}
    </div>
  );
});
