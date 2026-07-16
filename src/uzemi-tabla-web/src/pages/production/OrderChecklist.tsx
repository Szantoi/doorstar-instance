import { useState } from "react";
import { useAddOrder, useDeleteOrder, useOrders, useUpdateOrder } from "@/services/production/hooks";

export function OrderChecklist({ canManage }: { canManage: boolean }) {
  const { data: orders = [] } = useOrders();
  const addOrder = useAddOrder();
  const updateOrder = useUpdateOrder();
  const deleteOrder = useDeleteOrder();
  const [draft, setDraft] = useState("");

  function submit() {
    const label = draft.trim();
    if (!label) return;
    addOrder.mutate(label);
    setDraft("");
  }

  return (
    <div
      style={{
        width: "216px",
        flex: "none",
        borderLeft: "3px solid var(--line-strong)",
        background: "var(--surface-board)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ borderBottom: "3px solid var(--line-strong)", padding: "7px 10px 5px" }}>
        <div
          style={{
            background: "var(--chrome-bg)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "14px",
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            padding: "2px 12px",
            display: "inline-block",
          }}
        >
          Lista
        </div>
      </div>
      <div style={{ flex: 1, padding: "10px 12px", overflow: "auto" }}>
        {orders.map((o, i) => (
          <div key={o.id} style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "4px" }}>
            <div
              onClick={() => updateOrder.mutate({ id: o.id, patch: { done: !o.done } })}
              style={{
                fontFamily: "var(--font-hand)",
                fontWeight: 700,
                fontSize: "19px",
                color: o.done ? "var(--marker-green)" : "var(--marker-blue)",
                opacity: o.done ? 0.75 : 1,
                cursor: "pointer",
                flex: 1,
              }}
            >
              {i + 1}. {o.label} {o.done && <span>✓</span>}
            </div>
            {canManage && (
              <button
                onClick={() => deleteOrder.mutate(o.id)}
                title="Törlés"
                style={{ border: "none", background: "none", color: "#c0c0b8", cursor: "pointer", fontSize: "12px", padding: "0 2px" }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {canManage && (
          <div style={{ display: "flex", gap: "4px", marginTop: "10px" }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Új megrendelés…"
              style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                borderBottom: "1px dashed var(--line-input)",
                background: "transparent",
                outline: "none",
                fontFamily: "var(--font-hand)",
                fontSize: "19px",
                fontWeight: 600,
                color: "var(--marker-blue)",
                padding: "2px 4px",
              }}
            />
            <button onClick={submit} style={{ border: "1px solid var(--line-input)", background: "#fff", borderRadius: "3px", cursor: "pointer", fontWeight: 700, padding: "0 8px" }}>
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
