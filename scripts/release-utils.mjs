import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

export function readRootPackageJson() {
  return JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
}

export function getReleasePackageNames(version) {
  return [
    `proxy2localai-extension-${version}.zip`,
    `proxy2localai-bridge-${version}.zip`
  ];
}

export function getReleaseDir() {
  return join(rootDir, "release");
}
