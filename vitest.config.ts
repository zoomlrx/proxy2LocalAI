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
      "apps/**/*.test.ts"
    ]
  },
  resolve: {
    alias: {
      "@web2LocalAgent/shared": path.resolve(rootDir, "packages/shared/src/index.ts")
    }
  }
});
