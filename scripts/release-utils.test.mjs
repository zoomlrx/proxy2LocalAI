import { strict as assert } from "node:assert";
import { getReleasePackageNames, readRootPackageJson } from "./release-utils.mjs";

const pkg = readRootPackageJson();
assert.ok(pkg.version, "package.json should have a version");

const names = getReleasePackageNames(pkg.version);
assert.deepEqual(names, [
  `proxy2localai-extension-${pkg.version}.zip`,
  `proxy2localai-bridge-${pkg.version}.zip`
]);

console.log("release-utils test passed");
