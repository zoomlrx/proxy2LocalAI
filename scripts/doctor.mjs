const DEFAULT_BASE_URL = "http://127.0.0.1:39399";
const DEFAULT_TOKEN = "proxy2localai-local-token";

const baseUrl = process.env.PROXY2LOCALAI_BRIDGE_URL
  ?? process.env.BRIDGE_URL
  ?? DEFAULT_BASE_URL;
const token = process.env.PROXY2LOCALAI_TOKEN
  ?? process.env.web2LocalAgent_TOKEN
  ?? DEFAULT_TOKEN;

function statusIcon(status) {
  if (status === "ok") {
    return "OK";
  }
  if (status === "warning") {
    return "WARN";
  }
  return "ERR";
}

async function main() {
  const doctorUrl = new URL("/doctor", baseUrl);
  const response = await fetch(doctorUrl, {
    headers: {
      "x-proxy2localai-token": token
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bridge 自检请求失败：${response.status} ${text}`);
  }

  const report = await response.json();
  console.log(`Proxy2LocalAI Doctor - ${report.service}`);
  console.log(`Bridge: ${baseUrl}`);
  console.log(`Profiles: ${report.summary.enabledProfileCount}/${report.summary.profileCount} enabled`);
  console.log("");

  for (const check of report.checks) {
    console.log(`[${statusIcon(check.status)}] ${check.label}: ${check.message}`);
  }

  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
