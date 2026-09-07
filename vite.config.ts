import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  optimizeDeps: {
    include: ["topojson-client", "world-atlas/countries-110m.json"],
  },
});