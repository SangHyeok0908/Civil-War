import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/web",
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8080" } },
});
