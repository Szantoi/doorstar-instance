import { useEffect } from "react";
import { useToastStore } from "@/store/toastStore";

/** Global feedback banner — mirrors the design mock's toast()/hasToast, used
 * for permission denials and action results that don't warrant a modal. */
export function Toast() {
  const { message, clear } = useToastStore();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(clear, 3200);
    return () => clearTimeout(timer);
  }, [message, clear]);

  if (!message) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: "22px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--chrome-bg)",
        color: "#fff",
        padding: "10px 18px",
        borderRadius: "4px",
        fontFamily: "var(--font-ui)",
        fontWeight: 600,
        fontSize: "13.5px",
        maxWidth: "440px",
        textAlign: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,.35)",
        zIndex: 300,
      }}
    >
      {message}
    </div>
  );
}
