import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/ui",
  plugins: [react()],
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:7777",
    },
  },
});
