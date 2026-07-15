import type { CSSProperties, ReactNode } from "react";

/** Ported from the design project's components/core/Panel.jsx. */
interface PanelProps {
  title?: ReactNode;
  accent?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Panel({ title, accent, children, style }: PanelProps) {
  return (
    <div
      style={{
        background: "var(--surface-board)",
        border: "var(--border-panel)",
        boxShadow: "var(--shadow-panel)",
        ...style,
      }}
    >
      {title != null && (
        <div
          style={{
            background: accent ? "var(--status-assigned)" : "var(--chrome-bg)",
            color: accent ? "#fff" : "var(--chrome-accent)",
            fontFamily: "var(--font-ui)",
            fontWeight: 700,
            fontSize: "13px",
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            padding: "6px 12px",
          }}
        >
          {title}
        </div>
      )}
      <div style={{ padding: "8px" }}>{children}</div>
    </div>
  );
}
