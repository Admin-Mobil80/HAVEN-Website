import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The built app is served by the same Express server as /mcp and /api (one origin, no CORS).
// In dev, Vite proxies those paths to the local server on :3000.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0 },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:3000", "/mcp": "http://127.0.0.1:3000" },
  },
});
