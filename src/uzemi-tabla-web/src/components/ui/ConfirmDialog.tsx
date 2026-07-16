import { Button } from "./Button";
import { useConfirmStore } from "@/store/confirmStore";

export function ConfirmDialog() {
  const { message, respond } = useConfirmStore();
  if (!message) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(20,20,24,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}
      onClick={() => respond(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fcfcf8",
          border: "2px solid var(--line-strong)",
          boxShadow: "var(--shadow-modal)",
          padding: "18px 22px",
          maxWidth: "380px",
          fontFamily: "var(--font-ui)",
        }}
      >
        <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-ink)", marginBottom: "14px", lineHeight: 1.35 }}>{message}</div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={() => respond(false)}>
            Mégse
          </Button>
          <Button variant="primary" onClick={() => respond(true)}>
            Igen
          </Button>
        </div>
      </div>
    </div>
  );
}
