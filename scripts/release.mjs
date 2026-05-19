import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = pkg.version;
const tag = `v${version}`;

console.log(`\n🚀 Proxy2LocalAI Release ${tag}\n`);

// --- Step 1: Build ---
console.log("📦 构建项目...");
execSync("npm run build", { cwd: root, stdio: "inherit" });

// --- Step 2: Package extension.zip ---
console.log("\n📦 打包扩展...");
const extensionDist = resolve(root, "apps/extension/dist");
const extensionZip = resolve(root, "extension.zip");
rmSync(extensionZip, { force: true });
execSync(`powershell -Command "Compress-Archive -Path '${extensionDist}\\*' -DestinationPath '${extensionZip}' -Force"`, { cwd: root });
console.log("   -> extension.zip");

// --- Step 3: Package bridge.zip ---
console.log("📦 打包 Bridge...");
const bridgeDist = resolve(root, "apps/bridge/dist");
const bridgeTmp = resolve(root, "bridge-pkg");
const bridgeZip = resolve(root, "bridge.zip");

rmSync(bridgeTmp, { recursive: true, force: true });
rmSync(bridgeZip, { force: true });
mkdirSync(resolve(bridgeTmp, "dist"), { recursive: true });

cpSync(bridgeDist, resolve(bridgeTmp, "dist"), { recursive: true });

writeFileSync(resolve(bridgeTmp, "start.bat"), [
  "@echo off",
  `node "%~dp0dist\\index.js" %*`,
  "pause",
  ""
].join("\r\n"), "utf8");

writeFileSync(resolve(bridgeTmp, "README.txt"), [
  `Proxy2LocalAI Bridge ${tag}`,
  "",
  "使用方法：",
  "1. 确保已安装 Node.js >= 18",
  "2. 双击 start.bat 启动桥接服务",
  "3. 默认监听 http://127.0.0.1:39399",
  "",
  "环境变量：",
  "  PROXY2LOCALAI_TOKEN  - 访问令牌（默认 proxy2localai-local-token）",
  "  PROXY2LOCALAI_PORT   - 监听端口（默认 39399）",
  ""
].join("\r\n"), "utf8");

execSync(`powershell -Command "Compress-Archive -Path '${bridgeTmp}\\*' -DestinationPath '${bridgeZip}' -Force"`, { cwd: root });
rmSync(bridgeTmp, { recursive: true, force: true });
console.log("   -> bridge.zip");

// --- Step 4: Generate release notes ---
console.log("\n📝 生成发布说明...");
const notes = generateReleaseNotes(tag);

// --- Step 5: Create GitHub Release ---
console.log("🚀 创建 GitHub Release...");
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

// Cleanup
rmSync(notesFile, { force: true });
rmSync(extensionZip, { force: true });
rmSync(bridgeZip, { force: true });

console.log(`\n✅ Release ${tag} 发布完成！\n`);

// --- Helpers ---

function generateReleaseNotes(currentTag) {
  const prevTag = getPreviousTag();
  const range = prevTag ? `${prevTag}..HEAD` : "HEAD";
  let log;
  try {
    log = execSync(`git log ${range} --pretty=format:"- %s`, {
      cwd: root,
      encoding: "utf8"
    }).trim();
  } catch {
    log = "";
  }

  const lines = [
    `## ${currentTag}`,
    "",
    `**构建时间**: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    "",
    "### 变更记录",
    log || "- 初始发布",
    "",
    "### 安装说明",
    "",
    "1. 下载 **bridge.zip**，解压后双击 `start.bat` 启动本地桥接服务",
    "2. 下载 **extension.zip**，解压后在 Chrome/Edge 扩展管理页「加载已解压的扩展程序」",
    "3. 在扩展配置页添加代理规则，点击同步即可使用",
    "",
    "### 系统要求",
    "",
    "- Node.js >= 18",
    "- Chrome / Edge 浏览器"
  ];
  return lines.join("\n");
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
