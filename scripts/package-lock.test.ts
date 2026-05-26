import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

interface PackageLock {
  packages?: Record<string, {
    optionalDependencies?: Record<string, string>;
  }>;
}

describe("package-lock 跨平台可选依赖", () => {
  test("包含 GitHub Ubuntu runner 所需的 Rollup native 包", () => {
    const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8")) as PackageLock;
    const rollup = lockfile.packages?.["node_modules/rollup"];

    expect(rollup?.optionalDependencies).toHaveProperty("@rollup/rollup-linux-x64-gnu");
    expect(lockfile.packages).toHaveProperty("node_modules/@rollup/rollup-linux-x64-gnu");
  });
});
