import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = pkg.version;
const tag = `v${version}`;

console.log(`\nProxy2LocalAI Release ${tag}\n`);

console.log("构建项目...");
execSync("npm run build", { cwd: root, stdio: "inherit" });

console.log("\n打包扩展...");
const extensionDist = resolve(root, "apps/extension/dist");
const extensionZip = resolve(root, "extension.zip");
rmSync(extensionZip, { force: true });
execSync(`powershell -Command "Compress-Archive -Path '${extensionDist}\\*' -DestinationPath '${extensionZip}' -Force"`, { cwd: root });
console.log("   -> extension.zip");

console.log("打包 Bridge...");
const bridgeDist = resolve(root, "apps/bridge/dist");
const bridgeTmp = resolve(root, "bridge-pkg");
const bridgeZip = resolve(root, "bridge.zip");

rmSync(bridgeTmp, { recursive: true, force: true });
rmSync(bridgeZip, { force: true });
mkdirSync(resolve(bridgeTmp, "dist"), { recursive: true });

cpSync(bridgeDist, resolve(bridgeTmp, "dist"), { recursive: true });
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
  "  PROXY2LOCALAI_TOKEN          访问令牌，默认 proxy2localai-local-token",
  "  PROXY2LOCALAI_PORT           监听端口，默认 39399",
  "  PROXY2LOCALAI_DATA_DIR       配置和日志目录",
  "  PROXY2LOCALAI_PROFILES_PATH  profiles.json 路径",
  "  PROXY2LOCALAI_REQUESTS_LOG_PATH requests.log 路径",
  ""
].join("\r\n"), "utf8");

execSync(`powershell -Command "Compress-Archive -Path '${bridgeTmp}\\*' -DestinationPath '${bridgeZip}' -Force"`, { cwd: root });
rmSync(bridgeTmp, { recursive: true, force: true });
console.log("   -> bridge.zip");

console.log("\n生成发布说明...");
const notes = generateReleaseNotes(tag);

console.log("创建 GitHub Release...");
const notesFile = resolve(root, "release-notes.txt");
writeFileSync(notesFile, notes, "utf8");

try {
  execSync(`gh release create ${tag} extension.zip bridge.zip --title "${tag}" --notes-file release-notes.txt`, {
    cwd: root,
    stdio: "inherit"
  });
} catch {
  console.log(`   Tag ${tag} 已存在，尝试上传产物...`);
  execSync(`gh release upload ${tag} extension.zip bridge.zip --clobber`, {
    cwd: root,
    stdio: "inherit"
  });
}

rmSync(notesFile, { force: true });
rmSync(extensionZip, { force: true });
rmSync(bridgeZip, { force: true });

console.log(`\nRelease ${tag} 发布完成。\n`);

function generateReleaseNotes(currentTag) {
  const prevTag = getPreviousTag();
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

function getPreviousTag() {
  try {
    return execSync("git describe --tags --abbrev=0 2>/dev/null", {
      cwd: root,
      encoding: "utf8"
    }).trim();
  } catch {
    return null;
  }
}
