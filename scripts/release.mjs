import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readRootPackageJson, getReleasePackageNames, getReleaseDir } from "./release-utils.mjs";

const root = resolve(import.meta.dirname, "..");
const pkg = readRootPackageJson();
const version = pkg.version;
const tag = `v${version}`;
const [extensionPackageName, bridgePackageName] = getReleasePackageNames(version);
const releaseDir = getReleaseDir();
mkdirSync(releaseDir, { recursive: true });

console.log(`\nProxy2LocalAI Release ${tag}\n`);

console.log("构建项目...");
execSync("npm run build", { cwd: root, stdio: "inherit" });

console.log("\n打包扩展...");
const extensionDist = resolve(root, "apps/extension/dist");
const extensionZip = resolve(releaseDir, extensionPackageName);
rmSync(extensionZip, { force: true });
zipDirectory(extensionDist, extensionZip);
console.log(`   -> ${extensionPackageName}`);

console.log("打包 Bridge...");
const bridgeDist = resolve(root, "apps/bridge/dist");
const bridgeTmp = resolve(root, "bridge-pkg");
const bridgeZip = resolve(releaseDir, bridgePackageName);

rmSync(bridgeTmp, { recursive: true, force: true });
rmSync(bridgeZip, { force: true });
mkdirSync(resolve(bridgeTmp, "dist"), { recursive: true });

cpSync(bridgeDist, resolve(bridgeTmp, "dist"), { recursive: true });
writeFileSync(resolve(bridgeTmp, "package.json"), JSON.stringify({
  name: "proxy2localai-bridge",
  version,
  type: "module",
  private: true,
  bin: {
    "proxy2localai-bridge": "./dist/index.js"
  }
}, null, 2));
cpSync(resolve(root, "scripts/start-bridge.cmd"), resolve(bridgeTmp, "start.cmd"));
cpSync(resolve(root, "scripts/start-bridge.ps1"), resolve(bridgeTmp, "start.ps1"));
cpSync(resolve(root, "scripts/start-bridge.sh"), resolve(bridgeTmp, "start.sh"));
cpSync(resolve(root, "scripts/doctor.mjs"), resolve(bridgeTmp, "doctor.mjs"));
cpSync(resolve(root, "scripts/doctor.cmd"), resolve(bridgeTmp, "doctor.cmd"));
cpSync(resolve(root, "scripts/doctor.ps1"), resolve(bridgeTmp, "doctor.ps1"));
cpSync(resolve(root, "scripts/doctor.sh"), resolve(bridgeTmp, "doctor.sh"));

writeFileSync(resolve(bridgeTmp, "README.txt"), [
  `Proxy2LocalAI Bridge ${tag}`,
  "",
  "使用方法：",
  "1. 确保已安装 Node.js >= 20",
  "2. Windows 双击 start.cmd，或运行 start.ps1",
  "3. macOS/Linux 运行 sh start.sh",
  "4. 默认监听 http://127.0.0.1:39399",
  "",
  "自检：",
  "  node doctor.mjs",
  "  Windows 可运行 doctor.cmd 或 doctor.ps1",
  "  macOS/Linux 可运行 sh doctor.sh",
  "",
  "环境变量：",
  "  PROXY2LOCALAI_TOKEN          访问令牌；建议设置为随机字符串",
  "  PROXY2LOCALAI_PORT           监听端口，默认 39399",
  "  PROXY2LOCALAI_DATA_DIR       配置和日志目录",
  "  PROXY2LOCALAI_PROFILES_PATH  profiles.json 路径",
  "  PROXY2LOCALAI_REQUESTS_LOG_PATH requests.log 路径",
  "  PROXY2LOCALAI_ALLOW_DANGEROUS_CLI=true  显式允许危险 CLI 自动化参数",
  ""
].join("\r\n"), "utf8");

zipDirectory(bridgeTmp, bridgeZip);
rmSync(bridgeTmp, { recursive: true, force: true });
console.log(`   -> ${bridgePackageName}`);

console.log("\n生成发布说明...");
const notes = generateReleaseNotes(tag);

console.log("创建 GitHub Release...");
const notesFile = resolve(root, "release-notes.txt");
writeFileSync(notesFile, notes, "utf8");

try {
  execSync(`gh release create ${tag} "${extensionZip}" "${bridgeZip}" --title "${tag}" --notes-file release-notes.txt`, {
    cwd: root,
    stdio: "inherit"
  });
} catch {
  console.log(`   Tag ${tag} 已存在，尝试上传产物...`);
  execSync(`gh release upload ${tag} "${extensionZip}" "${bridgeZip}" --clobber`, {
    cwd: root,
    stdio: "inherit"
  });
}

rmSync(notesFile, { force: true });
rmSync(extensionZip, { force: true });
rmSync(bridgeZip, { force: true });
rmSync(releaseDir, { recursive: true, force: true });

console.log(`\nRelease ${tag} 发布完成。\n`);

function generateReleaseNotes(currentTag) {
  const prevTag = getPreviousTag(currentTag);
  const range = prevTag ? `${prevTag}..HEAD` : "HEAD";
  let log;
  try {
    log = execSync(`git log ${range} --pretty=format:"- %s"`, {
      cwd: root,
      encoding: "utf8"
    }).trim();
  } catch {
    log = "";
  }

  return [
    `## ${currentTag}`,
    "",
    `**构建时间**: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    "",
    "### 变更记录",
    log || "- 初始发布",
    "",
    "### 安装说明",
    "",
    "1. 下载 bridge.zip，解压后按系统运行 start.cmd、start.ps1 或 start.sh",
    "2. 下载 extension.zip，解压后在 Chrome/Edge 扩展管理页加载已解压的扩展程序",
    "3. 在扩展配置页导入或新增代理规则，点击同步即可使用",
    "",
    "### 系统要求",
    "",
    "- Node.js >= 20",
    "- Chrome / Edge 浏览器"
  ].join("\n");
}

function getPreviousTag(currentTag) {
  try {
    return execSync(`git describe --tags --abbrev=0 ${currentTag}^`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

function zipDirectory(sourceDir, zipFile) {
  if (process.platform === "win32") {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipFile}' -Force"`, {
      cwd: root,
      stdio: "inherit"
    });
    return;
  }

  try {
    execSync(`zip -qr '${zipFile}' .`, {
      cwd: sourceDir,
      stdio: "inherit"
    });
  } catch {
    throw new Error("打包失败：macOS/Linux 需要系统可用的 zip 命令");
  }
}
