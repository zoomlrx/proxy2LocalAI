import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "apps/**/*.spec.ts"
    ]
  },
  resolve: {
    alias: {
      "@proxy2localai/shared": path.resolve(rootDir, "packages/shared/src/index.ts")
    }
  }
});
