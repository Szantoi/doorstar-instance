import type { ButtonHTMLAttributes } from "react";

/** Ported from the design project's components/core/Button.jsx. */
export type ButtonVariant = "outline" | "primary" | "chrome" | "active" | "danger";

const BASE: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: ".5px",
};

const VARIANTS: Record<ButtonVariant, React.CSSProperties> = {
  outline: {
    border: "1.5px solid var(--line-strong)",
    background: "#fff",
    color: "var(--text-ink)",
    fontSize: "12.5px",
    padding: "4px 12px",
    borderRadius: "var(--radius-chip)",
  },
  primary: {
    border: "none",
    background: "var(--marker-blue)",
    color: "#fff",
    fontSize: "13px",
    padding: "6px 14px",
    borderRadius: "var(--radius-btn)",
  },
  chrome: {
    border: "none",
    background: "var(--chrome-control)",
    color: "#ddd",
    fontSize: "14px",
    fontWeight: 600,
    padding: "6px 14px",
    borderRadius: "var(--radius-btn)",
  },
  active: {
    border: "none",
    background: "var(--chrome-accent)",
    color: "var(--chrome-bg)",
    fontSize: "14px",
    fontWeight: 600,
    padding: "6px 14px",
    borderRadius: "var(--radius-btn)",
  },
  danger: {
    border: "1px solid var(--line-input)",
    background: "#fff",
    color: "var(--text-muted)",
    fontSize: "11px",
    padding: "2px 8px",
    borderRadius: "var(--radius-chip)",
  },
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "outline", style, children, ...rest }: ButtonProps) {
  return (
    <button style={{ ...BASE, ...VARIANTS[variant], ...style }} {...rest}>
      {children}
    </button>
  );
}
