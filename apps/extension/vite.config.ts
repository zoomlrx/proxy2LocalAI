import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@web2LocalAgent/shared": path.resolve(rootDir, "packages/shared/src/index.ts")
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(import.meta.dirname, "popup.html"),
        options: path.resolve(import.meta.dirname, "options.html"),
        background: path.resolve(import.meta.dirname, "src/background.ts")
      },
      output: {
        entryFileNames(chunk) {
          return chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js";
        }
      }
    }
  }
});
