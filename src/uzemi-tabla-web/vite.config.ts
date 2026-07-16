import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev server runs on 4611 (port 3461 is reserved for the fleet-wide
// Datahaven agent-management dashboard — see doorstar-instance/CLAUDE.md
// and config/federation.yaml — and must not be reused here).
// /api is proxied to production-service so the browser only ever talks to
// one origin, matching joinerytech-portal's same-origin apiFetch convention.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4611,
    proxy: {
      "/api": {
        target: "http://localhost:4610",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
