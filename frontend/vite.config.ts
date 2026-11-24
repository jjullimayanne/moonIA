/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// On GitHub Pages the app is served from /<repo>/ — set VITE_BASE=/moonIA/ in CI.
const base = process.env.VITE_BASE ?? "/";
const cesiumSource = "node_modules/cesium/Build/Cesium";

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: ["Workers", "ThirdParty", "Assets", "Widgets"].map((d) => ({
        src: `${cesiumSource}/${d}`,
        dest: "cesium",
        rename: { stripBase: 4 }, // node_modules/cesium/Build/Cesium/<dir> → cesium/<dir>
      })),
    }),
  ],
  worker: { format: "es" },
  define: { CESIUM_BASE_URL: JSON.stringify(`${base}cesium`) },
  build: { chunkSizeWarningLimit: 6000 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
