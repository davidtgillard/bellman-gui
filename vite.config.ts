/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));
const compoundGraphPackage = path.resolve(
  workspaceRoot,
  "../cytoscope-compound-graph.git/packages/cytoscape-compound-graph",
);

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  // Compile the sibling package from source. Vite neither watches nor
  // invalidates `file:` installs under node_modules, so `tauri dev` would
  // otherwise keep serving whatever dist was loaded at startup.
  resolve: {
    alias: {
      "@dgillard/cytoscape-compound-graph": path.join(
        compoundGraphPackage,
        "src/index.ts",
      ),
    },
    dedupe: ["@dgillard/cytoscape-compound-graph"],
  },
  optimizeDeps: {
    exclude: ["@dgillard/cytoscape-compound-graph"],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    fs: {
      allow: [workspaceRoot, compoundGraphPackage],
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
