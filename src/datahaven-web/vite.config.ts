import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev server runs on 3461 ("Datahaven Web" per doorstar-instance/CLAUDE.md).
// /api is proxied to production-service so the browser only ever talks to
// one origin, matching joinerytech-portal's same-origin apiFetch convention.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3461,
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
