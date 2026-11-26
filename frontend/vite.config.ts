import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Local dev: Vite on 5173 proxies /api to FastAPI on 8000, so API_URL stays empty.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } },
  },
});
