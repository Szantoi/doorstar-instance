export type MarkerStatus = "assigned" | "inprogress" | "done" | "problem";

/** Ported from the design project's components/core/StatusChip.jsx. */
const CHIP_COLORS: Record<MarkerStatus, string> = {
  assigned: "var(--status-assigned)",
  inprogress: "var(--status-inprogress)",
  done: "var(--status-done)",
  problem: "var(--status-problem)",
};

const CHIP_LABELS: Record<MarkerStatus, string> = {
  assigned: "kiosztva",
  inprogress: "folyamatban",
  done: "kész",
  problem: "probléma",
};

interface StatusChipProps {
  status?: MarkerStatus;
  label?: string;
  count?: number;
}

export function StatusChip({ status = "assigned", label, count }: StatusChipProps) {
  const color = CHIP_COLORS[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: "var(--font-ui)",
        fontSize: "11.5px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".5px",
        color,
      }}
    >
      {count != null ? (
        <span style={{ background: color, color: "#fff", borderRadius: "10px", padding: "1px 8px", fontSize: "12px" }}>
          {count}
        </span>
      ) : (
        <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: color }} />
      )}
      {label ?? CHIP_LABELS[status]}
    </span>
  );
}
